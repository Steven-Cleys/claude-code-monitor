import { sql } from "../db/connection";
import {
  extractSessionTitleFromFile,
  resolveSessionTranscriptPath,
} from "./transcript-reader";
import type { BroadcastFn } from "../types/broadcast";

// Per-session lock — UserPromptSubmit and Stop can land close together and
// both trigger a refresh; the second read of the same file adds nothing.
const inFlight = new Set<string>();

// Claude Code writes its generated session title into the transcript as
// "ai-title" records (re-emitted as the topic evolves). Read the latest one,
// persist it on the session row, and broadcast only when it actually changed.
export async function refreshSessionTitle(
  sessionId: string,
  cwd: string,
  broadcast: BroadcastFn,
): Promise<void> {
  if (inFlight.has(sessionId)) return;
  inFlight.add(sessionId);

  try {
    const filePath = resolveSessionTranscriptPath(sessionId, cwd);
    if (!filePath) return;
    const title = await extractSessionTitleFromFile(filePath);
    if (!title) return;

    const [row] = await sql`
      UPDATE sessions
      SET title = ${title}
      WHERE id = ${sessionId} AND title IS DISTINCT FROM ${title}
      RETURNING id
    `;
    if (!row) return;

    broadcast("sessions", {
      type: "session_title_changed",
      data: { id: sessionId, title },
    });
  } finally {
    inFlight.delete(sessionId);
  }
}
