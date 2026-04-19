import { Hono } from "hono";
import { getActiveSessions } from "../services/session-tracker";
import { extractSubagents } from "../services/subagent-enricher";
import { sql } from "../db/connection";
import { clearSessionAttention } from "../services/session-tracker";

type BroadcastFn = (topic: string, data: unknown) => void;

export function createSessionsRouter(broadcast: BroadcastFn) {
  const router = new Hono();

  router.get("/", async (c) => {
    const hours = Math.min(Math.max(Number(c.req.query("hours")) || 4, 0), 168);
    const sessions = await getActiveSessions(hours);

    const enriched = await Promise.all(
      sessions.map(async (session) => ({
        ...session,
        subagents: await extractSubagents(session.id),
      })),
    );

    return c.json(enriched);
  });

  router.get("/:id/events", async (c) => {
    const sessionId = c.req.param("id");
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 100, 1), 1000);
    const events = await sql`
      SELECT id, event_type, tool_name, tool_input, tool_response, created_at
      FROM events
      WHERE session_id = ${sessionId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return c.json(events);
  });

  router.post("/:id/dismiss-attention", async (c) => {
    const sessionId = c.req.param("id");
    const result = await clearSessionAttention(sessionId);
    if (result.changed) {
      broadcast("sessions", {
        type: "session_attention_changed",
        data: {
          id: sessionId,
          needs_attention: false,
          attention_since: null,
        },
      });
    }
    return c.json({ changed: result.changed });
  });

  return router;
}
