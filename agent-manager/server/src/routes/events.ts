import { Hono } from "hono";
import { sql } from "../db/connection";

const router = new Hono();

router.get("/", async (c) => {
  const sinceParam = c.req.query("since");
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 100, 1), 1000);
  if (sinceParam && isNaN(since.getTime())) {
    return c.json({ error: "Invalid 'since' parameter" }, 400);
  }
  const since = sinceParam
    ? new Date(sinceParam)
    : new Date(Date.now() - 4 * 60 * 60 * 1000);

  const events = await sql`
    SELECT e.id, e.session_id, e.event_type, e.tool_name, e.tool_input, e.tool_response, e.created_at
    FROM events e
    WHERE e.created_at > ${since}
    ORDER BY e.created_at DESC
    LIMIT ${limit}
  `;
  return c.json(events);
});

export { router as eventsRouter };
