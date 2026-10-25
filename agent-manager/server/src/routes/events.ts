import { Hono } from "hono";
import { sql } from "../db/connection";
import { clampQueryInt } from "./query";

const router = new Hono();

router.get("/", async (c) => {
  const sinceParam = c.req.query("since");
  const limit = clampQueryInt(c.req.query("limit"), 100, 1, 2000);
  const since = sinceParam
    ? new Date(sinceParam)
    : new Date(Date.now() - 4 * 60 * 60 * 1000);
  if (sinceParam && isNaN(since.getTime())) {
    return c.json({ error: "Invalid 'since' parameter" }, 400);
  }

  const events = await sql`
    SELECT e.id, e.session_id, e.event_type, e.tool_name, e.tool_input,
           e.payload->>'agent_id' as agent_id, e.created_at
    FROM events e
    WHERE e.created_at > ${since}
    ORDER BY e.created_at DESC
    LIMIT ${limit}
  `;
  return c.json(events);
});

// Lists leave tool_response out (it can be megabytes per range), so the UI
// loads it here when an event is expanded.
router.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  // events.id is a Postgres integer, so a larger id would fail the query.
  if (!Number.isInteger(id) || id > 2147483647) return c.json({ error: "Invalid event id" }, 400);
  const [event] = await sql`SELECT id, tool_response FROM events WHERE id = ${id}`;
  if (!event) return c.json({ error: "Event not found" }, 404);
  return c.json(event);
});

export { router as eventsRouter };
