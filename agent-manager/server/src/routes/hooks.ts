import { Hono } from "hono";
import { z } from "zod";
import { storeEvent } from "../services/event-store";
import { markSessionEnded } from "../services/session-tracker";
import { SESSION_END_EVENTS } from "../constants";

const hookPayloadSchema = z.object({
  session_id: z.string().min(1).max(256),
  hook_event_name: z.string().min(1).max(128),
  cwd: z.string().optional(),
  model: z.string().optional(),
  tool_name: z.string().optional(),
  tool_input: z.record(z.string(), z.unknown()).optional(),
  tool_response: z.record(z.string(), z.unknown()).optional(),
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

    broadcast("events", {
      type: "new_event",
      data: event,
    });

    if (SESSION_END_EVENTS.includes(payload.hook_event_name)) {
      await markSessionEnded(payload.session_id);
      broadcast("sessions", {
        type: "session_status_changed",
        data: { id: payload.session_id, status: "ended" },
      });
    }

    return c.json({ id: event.id }, 201);
  });

  return router;
}
