import { sql } from "../db/connection";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

type BroadcastFn = (topic: string, data: unknown) => void;

export function startSessionTracker(broadcast: BroadcastFn, intervalMs = 30_000) {
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

export async function markSessionEnded(sessionId: string) {
  await sql`
    UPDATE sessions SET status = 'ended', last_seen = NOW()
    WHERE id = ${sessionId}
  `;
}

export async function getActiveSessions(sinceHours = 4) {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  return sql`
    SELECT s.*,
      (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) as event_count,
      (SELECT e.tool_name FROM events e WHERE e.session_id = s.id ORDER BY e.created_at DESC LIMIT 1) as last_tool
    FROM sessions s
    WHERE s.last_seen > ${since}
    ORDER BY s.last_seen DESC
  `;
}
