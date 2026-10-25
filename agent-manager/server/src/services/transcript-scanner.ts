import { statSync } from "fs";
import { sql } from "../db/connection";
import { readTranscriptFile, computeSessionTotals, type SessionTotals } from "./transcript-reader";
import { TRANSCRIPT_SCAN_INTERVAL_MS } from "../constants";
import type { BroadcastFn } from "../types/broadcast";

interface ScanState {
  size: number;
  mtimeMs: number;
  written: SessionTotals;
}

// In-memory only — after a restart the first scan re-reads and re-writes each
// active session once, which is harmless (full-file recompute is idempotent).
const scanStates = new Map<string, ScanState>();

export function hasChanged(previous: SessionTotals | undefined, next: SessionTotals): boolean {
  if (!previous) return true;
  return (
    previous.model !== next.model ||
    previous.tokens.input !== next.tokens.input ||
    previous.tokens.output !== next.tokens.output ||
    previous.tokens.cache_read !== next.tokens.cache_read ||
    previous.tokens.cache_creation !== next.tokens.cache_creation
  );
}

export async function scanSession(
  sessionId: string,
  transcriptPath: string,
  broadcast: BroadcastFn,
): Promise<void> {
  let size: number;
  let mtimeMs: number;
  try {
    ({ size, mtimeMs } = statSync(transcriptPath));
  } catch {
    return; // transcript not (yet) on disk — nothing to enrich
  }

  const state = scanStates.get(sessionId);
  if (state && state.size === size && state.mtimeMs === mtimeMs) return;

  const messages = await readTranscriptFile(transcriptPath);
  const totals = computeSessionTotals(messages);

  if (hasChanged(state?.written, totals)) {
    const [updated] = await sql`
      UPDATE sessions SET
        input_tokens = ${totals.tokens.input},
        output_tokens = ${totals.tokens.output},
        cache_read_tokens = ${totals.tokens.cache_read},
        cache_creation_tokens = ${totals.tokens.cache_creation},
        tokens_updated_at = NOW(),
        model = COALESCE(${totals.model}, sessions.model)
      WHERE id = ${sessionId}
      RETURNING id
    `;
    if (!updated) return; // session row gone — don't cache, don't broadcast

    broadcast("sessions", {
      type: "session_metrics",
      data: { id: sessionId, tokens: totals.tokens },
    });
    if (totals.model && totals.model !== state?.written.model) {
      broadcast("sessions", {
        type: "session_enriched",
        data: { id: sessionId, model: totals.model },
      });
    }
  }

  scanStates.set(sessionId, { size, mtimeMs, written: totals });
}

async function scanActiveSessions(broadcast: BroadcastFn) {
  const rows = await sql`
    SELECT id, transcript_path FROM sessions
    WHERE status = 'active' AND transcript_path IS NOT NULL
  `;
  for (const row of rows) {
    await scanSession(row.id, row.transcript_path, broadcast);
  }
}

export function startTranscriptScanner(broadcast: BroadcastFn) {
  const timer = setInterval(() => {
    scanActiveSessions(broadcast).catch((err) => console.error("Transcript scan error:", err));
  }, TRANSCRIPT_SCAN_INTERVAL_MS);

  return () => clearInterval(timer);
}
