import { Hono } from "hono";
import { sql } from "../db/connection";
import {
  readTranscriptFile,
  subagentTranscriptPath,
  hostPathToContainerPath,
  extractMetadata,
} from "../services/transcript-reader";
import { persistSubagentMetadata } from "../services/subagent-metadata";
import { registerTranscriptPath, startWatching } from "../services/transcript-watcher";
import type { SubagentMetadata, TranscriptResponse } from "../types/transcript";
import type { BroadcastFn } from "../types/broadcast";

export function createTranscriptsRouter(broadcast: BroadcastFn) {
  const router = new Hono();

  router.get("/session/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");

    const [session] = await sql`
      SELECT id, transcript_path, status FROM sessions WHERE id = ${sessionId} LIMIT 1
    `;

    if (!session?.transcript_path) {
      return c.json({ error: "Session not found or missing transcript path" }, 404);
    }

    const filePath = session.transcript_path as string;
    const messages = await readTranscriptFile(filePath);
    const isLive = session.status !== "ended";

    if (messages.length === 0 && !isLive) {
      return c.json({ error: "Transcript file not found or empty" }, 404);
    }

    // Build a lightweight metadata payload mirroring the subagent shape so the
    // UI header can render model + token counts uniformly. Not persisted —
    // session-level stats already live on the sessions row.
    const extracted = extractMetadata(messages, sessionId, sessionId);
    const metadata: SubagentMetadata = {
      ...extracted,
      transcript_path: filePath,
      extracted_at: new Date().toISOString(),
    };

    if (isLive) {
      registerTranscriptPath(sessionId, filePath);
      startWatching(sessionId, broadcast);
    }

    const response: TranscriptResponse = { messages, metadata, isLive };
    return c.json(response);
  });

  router.get("/:agentId", async (c) => {
    const agentId = c.req.param("agentId");

    // 1. Try to find transcript path from SubagentStop event payload
    const [stopEvent] = await sql`
      SELECT payload->>'agent_transcript_path' as transcript_path,
             session_id
      FROM events
      WHERE event_type = 'SubagentStop'
        AND payload->>'agent_id' = ${agentId}
      LIMIT 1
    `;

    // 2. If no stop event, find from SubagentStart + the session's transcript path
    let filePath: string | null = null;
    let sessionId: string | null = null;
    let isLive = false;

    if (stopEvent?.transcript_path) {
      filePath = hostPathToContainerPath(stopEvent.transcript_path);
      sessionId = stopEvent.session_id;
      if (!filePath) {
        return c.json(
          { error: `Transcript path ${stopEvent.transcript_path} is not under .claude/projects/` },
          404,
        );
      }
    } else {
      // Subagent may still be running — derive path
      const [startEvent] = await sql`
        SELECT e.session_id, s.transcript_path
        FROM events e
        JOIN sessions s ON s.id = e.session_id
        WHERE e.event_type = 'SubagentStart'
          AND e.payload->>'agent_id' = ${agentId}
        LIMIT 1
      `;

      if (!startEvent?.transcript_path) {
        return c.json({ error: "Agent not found" }, 404);
      }

      sessionId = startEvent.session_id as string;
      filePath = subagentTranscriptPath(startEvent.transcript_path as string, agentId);
      isLive = true;
      if (!filePath) {
        return c.json({ error: "Agent id does not map to a transcript path" }, 404);
      }
    }

    // 3. Read transcript
    const messages = await readTranscriptFile(filePath);
    if (messages.length === 0 && !isLive) {
      return c.json({ error: "Transcript file not found or empty" }, 404);
    }

    // 4. Extract and persist metadata (shared with the eager SubagentStop path)
    let metadata: SubagentMetadata | null = null;
    if (messages.length > 0 && sessionId) {
      metadata = await persistSubagentMetadata(agentId, sessionId, filePath, broadcast, messages);
    }

    // 5. Start watcher for live subagents
    if (isLive && filePath) {
      registerTranscriptPath(agentId, filePath);
      startWatching(agentId, broadcast);
    }

    const response: TranscriptResponse = { messages, metadata, isLive };
    return c.json(response);
  });

  return router;
}
