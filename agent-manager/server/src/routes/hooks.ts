import { Hono } from "hono";
import { z } from "zod";
import { storeEvent } from "../services/event-store";
import {
  setSessionAttention,
  clearSessionAttention,
  broadcastAttentionChanged,
} from "../services/session-tracker";
import { SESSION_END_EVENTS, SUBAGENT_METADATA_DELAY_MS, TURN_END_EVENTS } from "../constants";
import { stopWatching, isWatching } from "../services/transcript-watcher";
import { hostPathToContainerPath } from "../services/transcript-reader";
import { scanSession } from "../services/transcript-scanner";
import { persistSubagentMetadata } from "../services/subagent-metadata";
import { refreshSessionTitle } from "../services/session-title";
import {
  shouldTriggerAttention,
  shouldClearAttention,
} from "../services/attention-logic";
import type { BroadcastFn } from "../types/broadcast";

export const hookPayloadSchema = z.object({
  session_id: z.string().min(1).max(256),
  hook_event_name: z.string().min(1).max(128),
  cwd: z.string().optional(),
  model: z.string().optional(),
  transcript_path: z.string().optional(),
  tool_name: z.string().optional(),
  tool_input: z.record(z.string(), z.unknown()).optional(),
  tool_response: z.unknown().optional(),
  // Subagent lifecycle fields (top-level in SubagentStart / SubagentStop
  // payloads — NOT nested under tool_input). Declared optional so other
  // event types still validate.
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
  agent_transcript_path: z.string().optional(),
  // Top-level on Notification events (permission_prompt / idle_prompt / auth_success).
  notification_type: z.string().optional(),
}).passthrough();

type HookPayload = z.infer<typeof hookPayloadSchema>;
type StoredSession = Awaited<ReturnType<typeof storeEvent>>["session"];

// Flip the session flag and broadcast so the UI can float blocked sessions to
// the top of the list. Guarded by the "changed" return so we don't re-broadcast
// or re-notify on duplicates. The clear path checks the upserted row first:
// almost every event clears attention, so this skips a per-event UPDATE
// round-trip when the flag isn't set.
async function updateAttention(payload: HookPayload, session: StoredSession, broadcast: BroadcastFn) {
  if (shouldTriggerAttention(payload)) {
    const result = await setSessionAttention(payload.session_id);
    if (result.changed) {
      broadcastAttentionChanged(broadcast, payload.session_id, true, result.attention_since);
    }
  } else if (session.session.needs_attention && shouldClearAttention(payload)) {
    const result = await clearSessionAttention(payload.session_id);
    if (result.changed) {
      broadcastAttentionChanged(broadcast, payload.session_id, false, null);
    }
  }
}

function onLifecycle(payload: HookPayload, session: StoredSession, broadcast: BroadcastFn) {
  // Status transitions happen inside the upsert; broadcast the row's actual
  // post-upsert status (Stop → idle, SessionEnd → ended, SessionStart → active
  // on resume). Non-lifecycle events flip idle sessions back to active in the
  // upsert too, but the UI already infers that from new_event.
  if (!session.isNew) {
    broadcast("sessions", {
      type: "session_status_changed",
      data: { id: payload.session_id, status: session.session.status },
    });
  }

  if (payload.hook_event_name === "SessionStart") return;

  // Final token/model read at turn and session boundaries: the interval
  // scanner only covers 'active' sessions, and these events flip the session
  // to idle/ended, so without this a turn's last tokens would never land.
  // Fire-and-forget: the hook response must not wait on file I/O.
  const scanPath = payload.transcript_path && hostPathToContainerPath(payload.transcript_path);
  if (scanPath) {
    scanSession(payload.session_id, scanPath, broadcast).catch((err) =>
      console.error("Failed to scan transcript at turn end:", err),
    );
  }

  if (payload.hook_event_name === "SessionEnd") {
    stopWatching(payload.session_id, broadcast);
  }
}

// Stop the transcript watcher and extract metadata when a subagent completes,
// so the sidebar gets its model/token/tool-call badges without the user
// needing to open the transcript first.
function onSubagentStop(payload: HookPayload, broadcast: BroadcastFn) {
  if (payload.agent_id && isWatching(payload.agent_id)) {
    stopWatching(payload.agent_id, broadcast);
  }

  if (!payload.agent_id || !payload.agent_transcript_path) {
    console.warn("SubagentStop missing agent_id or agent_transcript_path, metadata not extracted");
    return;
  }

  const containerPath = hostPathToContainerPath(payload.agent_transcript_path);
  if (!containerPath) {
    console.warn(
      `SubagentStop: path ${payload.agent_transcript_path} is not under .claude/projects/, skipping metadata extraction`,
    );
    return;
  }

  // Fire-and-forget: the hook response must not wait on file I/O + DB write.
  const { agent_id, session_id } = payload;
  setTimeout(() => {
    persistSubagentMetadata(agent_id, session_id, containerPath, broadcast).catch((err) =>
      console.error("Failed to persist subagent metadata:", err),
    );
  }, SUBAGENT_METADATA_DELAY_MS);
}

export function createHooksRouter(broadcast: BroadcastFn) {
  const router = new Hono();

  router.post("/", async (c) => {
    // A cross-site page can POST text/plain without a CORS preflight.
    if (!c.req.header("Content-Type")?.startsWith("application/json")) {
      return c.json({ error: "Content-Type must be application/json" }, 415);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const result = hookPayloadSchema.safeParse(body);

    if (!result.success) {
      return c.json({ error: "Invalid payload", details: result.error.flatten() }, 400);
    }

    const payload = result.data;
    const eventName = payload.hook_event_name;

    const { event, session } = await storeEvent(payload);

    if (session.isNew) {
      const { is_new, ...sessionData } = session.session;
      broadcast("sessions", {
        type: "session_created",
        data: sessionData,
      });
    }

    broadcast("events", {
      type: "new_event",
      data: event,
    });

    await updateAttention(payload, session, broadcast);

    if (SESSION_END_EVENTS.has(eventName) || TURN_END_EVENTS.has(eventName) || eventName === "SessionStart") {
      onLifecycle(payload, session, broadcast);
    }

    // The "ai-title" record lives in the session transcript, not in any hook
    // payload. Fire-and-forget: the hook response must not wait on file I/O.
    const titlePath = payload.transcript_path && hostPathToContainerPath(payload.transcript_path);
    if ((eventName === "UserPromptSubmit" || eventName === "Stop") && titlePath) {
      refreshSessionTitle(payload.session_id, titlePath, broadcast).catch((err) =>
        console.error("Failed to refresh session title:", err),
      );
    }

    if (eventName === "SubagentStop") {
      onSubagentStop(payload, broadcast);
    }

    return c.json({ id: event.id }, 201);
  });

  return router;
}
