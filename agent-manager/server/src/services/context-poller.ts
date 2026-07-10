import { CONTEXT_POLL_INTERVAL_MS, CONTEXT_TAIL_BYTES } from "../constants";
import { sql } from "../db/connection";
import { parseTranscriptLine } from "./transcript-reader";
import { buildContextTimeline, resolveTranscriptFileForSession, type ContextPoint } from "./xray";
import type { BroadcastFn } from "../types/broadcast";

// Newest assistant usage in a transcript tail chunk. The chunk may start
// mid-line (tail cut) — parseTranscriptLine drops the partial line.
export function latestContextPoint(tailText: string): ContextPoint | null {
  const messages = tailText
    .split("\n")
    .map(parseTranscriptLine)
    .filter((m) => m !== null);
  return buildContextTimeline(messages).points.at(-1) ?? null;
}

export interface SessionContext {
  tokens: number;
  ts: string;
}

export async function readSessionContext(
  sessionId: string,
  cwd: string | null,
): Promise<SessionContext | null> {
  const filePath = await resolveTranscriptFileForSession(sessionId, cwd);
  if (!filePath) return null;

  const file = Bun.file(filePath);
  let size: number;
  try {
    size = file.size;
    if (size === 0) return null;
    const start = Math.max(0, size - CONTEXT_TAIL_BYTES);
    const tail = await file.slice(start, size).text();
    const point = latestContextPoint(tail);
    return point ? { tokens: point.context, ts: point.ts } : null;
  } catch {
    return null;
  }
}

export function startContextPoller(broadcast: BroadcastFn, intervalMs = CONTEXT_POLL_INTERVAL_MS) {
  const timer = setInterval(async () => {
    try {
      const active = await sql`
        SELECT id, cwd FROM sessions WHERE status = 'active'
      `;
      for (const session of active) {
        const context = await readSessionContext(session.id as string, session.cwd as string | null);
        if (!context) continue;
        broadcast("sessions", {
          type: "session_context",
          data: { id: session.id, context },
        });
      }
    } catch (err) {
      console.error("Context poll error:", err);
    }
  }, intervalMs);

  return () => clearInterval(timer);
}
