import { Hono } from "hono";
import { storeEvent } from "../services/event-store";
import { markSessionEnded } from "../services/session-tracker";

type BroadcastFn = (topic: string, data: unknown) => void;

export function createHooksRouter(broadcast: BroadcastFn) {
  const router = new Hono();

  router.post("/", async (c) => {
    const payload = await c.req.json();

    if (!payload.session_id || !payload.hook_event_name) {
      return c.json({ error: "Missing session_id or hook_event_name" }, 400);
    }

    const event = await storeEvent(payload);

    broadcast("events", {
      type: "new_event",
      data: event,
    });

    if (payload.hook_event_name === "Stop" || payload.hook_event_name === "SessionEnd") {
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
