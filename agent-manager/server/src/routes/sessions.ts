import { Hono } from "hono";
import { getActiveSessions } from "../services/session-tracker";
import { extractSubagents } from "../services/subagent-enricher";
import { sql } from "../db/connection";

const router = new Hono();

router.get("/", async (c) => {
  const hours = Number(c.req.query("hours") ?? 4);
  const sessions = await getActiveSessions(hours);

  const enriched = await Promise.all(
    sessions.map(async (session) => ({
      ...session,
      subagents: await extractSubagents(session.id),
    }))
  );

  return c.json(enriched);
});

router.get("/:id/events", async (c) => {
  const sessionId = c.req.param("id");
  const limit = Number(c.req.query("limit") ?? 100);
  const events = await sql`
    SELECT id, event_type, tool_name, tool_input, tool_response, created_at
    FROM events
    WHERE session_id = ${sessionId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return c.json(events);
});

export { router as sessionsRouter };
