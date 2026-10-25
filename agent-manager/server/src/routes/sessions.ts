import { Hono } from "hono";
import {
  listRecentSessions,
  clearSessionAttention,
  broadcastAttentionChanged,
} from "../services/session-tracker";
import { extractSubagents } from "../services/subagents";
import { readSessionContext } from "../services/context-poller";
import { buildTurnLedger } from "../services/turns";
import { sql } from "../db/connection";
import { clampQueryInt } from "./query";
import type { BroadcastFn } from "../types/broadcast";

export function createSessionsRouter(broadcast: BroadcastFn) {
  const router = new Hono();

  router.get("/", async (c) => {
    const hours = clampQueryInt(c.req.query("hours"), 4, 0, 168);
    const sessions = await listRecentSessions(hours);

    const enriched = await Promise.all(
      sessions.map(async (session) => ({
        ...session,
        subagents: await extractSubagents(session.id),
        context: await readSessionContext(session.transcript_path as string | null),
      })),
    );

    return c.json(enriched);
  });

  router.get("/:id/events", async (c) => {
    const sessionId = c.req.param("id");
    const limit = clampQueryInt(c.req.query("limit"), 100, 1, 5000);
    const events = await sql`
      SELECT id, session_id, event_type, tool_name, tool_input,
             payload->>'agent_id' as agent_id, created_at
      FROM events
      WHERE session_id = ${sessionId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return c.json(events);
  });

  router.get("/:id/turns", async (c) => {
    const result = await buildTurnLedger(c.req.param("id"));
    if (!result) return c.json({ error: "Session not found" }, 404);
    return c.json(result);
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
