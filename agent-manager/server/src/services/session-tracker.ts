import { sql } from "../db/connection";
import { IDLE_TIMEOUT_MS, SESSION_TRACKER_INTERVAL_MS } from "../constants";
import type { BroadcastFn } from "../types/broadcast";

export function startSessionTracker(broadcast: BroadcastFn, intervalMs = SESSION_TRACKER_INTERVAL_MS) {
  const timer = setInterval(async () => {
    const idleThreshold = new Date(Date.now() - IDLE_TIMEOUT_MS);

    const idled = await sql`
      UPDATE sessions
      SET status = 'idle'
      WHERE status = 'active'
        AND last_seen < ${idleThreshold}
      RETURNING id, status, last_seen
    `;

    for (const session of idled) {
      broadcast("sessions", {
        type: "session_status_changed",
        data: { id: session.id, status: "idle", last_seen: session.last_seen },
      });
    }
  }, intervalMs);

  return () => clearInterval(timer);
}

/**
 * Flip a session into the attention-needed state. Idempotent — returns
 * `{ changed: false }` if the session was already flagged, which lets callers
 * skip the broadcast.
 */
export async function setSessionAttention(sessionId: string) {
  const [row] = await sql`
    UPDATE sessions
    SET needs_attention = TRUE,
        attention_since = NOW()
    WHERE id = ${sessionId} AND needs_attention = FALSE
    RETURNING id, attention_since
  `;
  if (!row) return { changed: false as const };
  return {
    changed: true as const,
    attention_since: row.attention_since as string,
  };
}

/**
 * Clear the attention-needed state. Idempotent — returns `{ changed: false }`
 * if the session was not flagged.
 */
export async function clearSessionAttention(sessionId: string) {
  const [row] = await sql`
    UPDATE sessions
    SET needs_attention = FALSE,
        attention_since = NULL
    WHERE id = ${sessionId} AND needs_attention = TRUE
    RETURNING id
  `;
  return { changed: Boolean(row) };
}

// Single place that knows the shape of the session_attention_changed message —
// it used to be hand-assembled at three call sites that could drift apart.
export function broadcastAttentionChanged(
  broadcast: BroadcastFn,
  sessionId: string,
  needsAttention: boolean,
  attentionSince: string | null,
) {
  broadcast("sessions", {
    type: "session_attention_changed",
    data: {
      id: sessionId,
      needs_attention: needsAttention,
      attention_since: attentionSince,
    },
  });
}

export async function getActiveSessions(sinceHours = 4) {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  return sql`
    SELECT s.*,
      (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) as event_count,
      (SELECT e.tool_name FROM events e WHERE e.session_id = s.id ORDER BY e.created_at DESC LIMIT 1) as last_tool
    FROM sessions s
    WHERE s.last_seen > ${since}
    ORDER BY s.needs_attention DESC,
             s.attention_since DESC NULLS LAST,
             s.last_seen DESC
  `;
}
