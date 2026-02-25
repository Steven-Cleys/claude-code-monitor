import { Hono } from "hono";
import { storeEvent } from "../services/event-store";

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

    return c.json({ id: event.id }, 201);
  });

  return router;
}
