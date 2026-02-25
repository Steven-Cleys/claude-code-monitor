import { Hono } from "hono";
import { storeEvent } from "../services/event-store";
import { markSessionEnded } from "../services/session-tracker";
import { SESSION_END_EVENTS } from "../constants";

type BroadcastFn = (topic: string, data: unknown) => void;

export function createHooksRouter(broadcast: BroadcastFn) {
  const router = new Hono();

  router.post("/", async (c) => {
    const payload = await c.req.json();

    if (!payload.session_id || !payload.hook_event_name) {
      return c.json({ error: "Missing session_id or hook_event_name" }, 400);
    }

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
