import { Hono } from "hono";
import {
  getActiveSessions,
  clearSessionAttention,
  broadcastAttentionChanged,
} from "../services/session-tracker";
import { extractSubagents } from "../services/subagent-enricher";
import { sql } from "../db/connection";
import { clampQueryInt } from "./query";
import type { BroadcastFn } from "../types/broadcast";

export function createSessionsRouter(broadcast: BroadcastFn) {
  const router = new Hono();

  router.get("/", async (c) => {
    const hours = clampQueryInt(c.req.query("hours"), 4, 0, 168);
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
    const limit = clampQueryInt(c.req.query("limit"), 100, 1, 1000);
    const events = await sql`
      SELECT id, event_type, tool_name, tool_input, tool_response,
             payload->>'agent_id' as agent_id, created_at
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
      broadcastAttentionChanged(broadcast, sessionId, false, null);
    }
    return c.json({ changed: result.changed });
  });

  return router;
}
