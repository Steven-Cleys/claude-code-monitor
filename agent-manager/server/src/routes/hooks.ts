import { Hono } from "hono";
import { z } from "zod";
import { storeEvent } from "../services/event-store";
import { markSessionEnded } from "../services/session-tracker";
import { SESSION_END_EVENTS } from "../constants";
import { stopWatching, isWatching } from "../services/transcript-watcher";
import { hostPathToContainerPath } from "../services/transcript-reader";
import { persistSubagentMetadata } from "../services/subagent-metadata";

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
}).passthrough();

type BroadcastFn = (topic: string, data: unknown) => void;

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

    // Forward the top-level agent_id on the broadcast so the UI can wire
    // subagents to their real ID on SubagentStart/SubagentStop — it's not
    // in `tool_input` for those lifecycle events (tool_input is null).
    const eventBroadcast = payload.agent_id
      ? { ...event, agent_id: payload.agent_id }
      : event;

    broadcast("events", {
      type: "new_event",
      data: eventBroadcast,
    });

    if (SESSION_END_EVENTS.includes(payload.hook_event_name)) {
      await markSessionEnded(payload.session_id);
      broadcast("sessions", {
        type: "session_status_changed",
        data: { id: payload.session_id, status: "ended" },
      });
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
