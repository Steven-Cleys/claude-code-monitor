import { Hono } from "hono";
import { z } from "zod";
import { storeEvent } from "../services/event-store";
import {
  setSessionAttention,
  clearSessionAttention,
  broadcastAttentionChanged,
} from "../services/session-tracker";
import { SESSION_END_EVENTS } from "../constants";
import { stopWatching, isWatching } from "../services/transcript-watcher";
import { hostPathToContainerPath } from "../services/transcript-reader";
import { persistSubagentMetadata } from "../services/subagent-metadata";
import { refreshSessionTitle } from "../services/session-title";
import {
  shouldTriggerAttention,
  shouldClearAttention,
} from "../services/attention-logic";
import type { BroadcastFn } from "../types/broadcast";

const hookPayloadSchema = z.object({
  session_id: z.string().min(1).max(256),
  hook_event_name: z.string().min(1).max(128),
  cwd: z.string().optional(),
  model: z.string().optional(),
  tool_name: z.string().optional(),
  tool_input: z.record(z.string(), z.unknown()).optional(),
  tool_response: z.record(z.string(), z.unknown()).optional(),
  // Subagent lifecycle fields (top-level in SubagentStart / SubagentStop
  // payloads — NOT nested under tool_input). Declared optional so other
  // event types still validate.
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
  agent_transcript_path: z.string().optional(),
  // Top-level on Notification events (permission_prompt / idle_prompt / auth_success).
  notification_type: z.string().optional(),
}).passthrough();

export function createHooksRouter(broadcast: BroadcastFn) {
  const router = new Hono();

  router.post("/", async (c) => {
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

    // Attention-needed tracking — flip the session flag + broadcast so the UI
    // can float blocked sessions to the top of the list. Guarded by the
    // "changed" return so we don't re-broadcast or re-notify on duplicates.
    // The clear path additionally checks the upserted row first: almost every
    // event clears attention, so this skips a per-event UPDATE round-trip
    // when the flag isn't set.
    if (shouldTriggerAttention(payload)) {
      const result = await setSessionAttention(payload.session_id);
      if (result.changed) {
        broadcastAttentionChanged(broadcast, payload.session_id, true, result.attention_since);
      }
    } else if (session.session?.needs_attention && shouldClearAttention(payload)) {
      const result = await clearSessionAttention(payload.session_id);
      if (result.changed) {
        broadcastAttentionChanged(broadcast, payload.session_id, false, null);
      }
    }

    // Status flips to 'ended' inside the upsert itself — no extra UPDATE here.
    if (SESSION_END_EVENTS.includes(payload.hook_event_name)) {
      broadcast("sessions", {
        type: "session_status_changed",
        data: { id: payload.session_id, status: "ended" },
      });
    }

    // Refresh the session's AI-generated title at turn boundaries — the
    // "ai-title" record lives in the session transcript, not in any hook
    // payload. Fire-and-forget: the hook response must not wait on file I/O.
    if (
      (payload.hook_event_name === "UserPromptSubmit" || payload.hook_event_name === "Stop") &&
      payload.cwd
    ) {
      refreshSessionTitle(payload.session_id, payload.cwd, broadcast).catch((err) =>
        console.error("Failed to refresh session title:", err),
      );
    }

    // Stop transcript watcher and eagerly extract metadata when a subagent
    // completes, so the sidebar gets its model/token/tool-call badges without
    // the user needing to open the transcript first.
    if (payload.hook_event_name === "SubagentStop") {
      if (payload.agent_id && isWatching(payload.agent_id)) {
        stopWatching(payload.agent_id, broadcast);
      }

      if (payload.agent_id && payload.agent_transcript_path) {
        const containerPath = hostPathToContainerPath(payload.agent_transcript_path);
        if (containerPath) {
          // Fire-and-forget: the hook response must not wait on file I/O + DB write.
          persistSubagentMetadata(
            payload.agent_id,
            payload.session_id,
            containerPath,
            broadcast,
          ).catch((err) => console.error("Failed to persist subagent metadata:", err));
        } else {
          console.warn(
            `SubagentStop: path ${payload.agent_transcript_path} is not under .claude/projects/, skipping metadata extraction`,
          );
        }
      } else {
        console.warn("SubagentStop missing agent_id or agent_transcript_path — metadata not extracted");
      }
    }

    return c.json({ id: event.id }, 201);
  });

  return router;
}
