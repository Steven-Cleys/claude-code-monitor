import { Hono } from "hono";
import { sql } from "../db/connection";
import {
  readTranscriptFile,
  extractMetadata,
  resolveTranscriptPath,
  hostPathToContainerPath,
} from "../services/transcript-reader";
import { registerTranscriptPath, startWatching } from "../services/transcript-watcher";
import type { SubagentMetadata, TranscriptResponse } from "../types/transcript";

type BroadcastFn = (topic: string, data: unknown) => void;

export function createTranscriptsRouter(broadcast: BroadcastFn) {
  const router = new Hono();

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

    // 2. If no stop event, find from SubagentStart + session CWD
    let filePath: string | null = null;
    let sessionId: string | null = null;
    let isLive = false;

    if (stopEvent?.transcript_path) {
      filePath = hostPathToContainerPath(stopEvent.transcript_path);
      sessionId = stopEvent.session_id;
    } else {
      // Subagent may still be running — derive path
      const [startEvent] = await sql`
        SELECT e.session_id, s.cwd
        FROM events e
        JOIN sessions s ON s.id = e.session_id
        WHERE e.event_type = 'SubagentStart'
          AND e.payload->>'agent_id' = ${agentId}
        LIMIT 1
      `;

      if (!startEvent?.cwd) {
        return c.json({ error: "Agent not found" }, 404);
      }

      sessionId = startEvent.session_id as string;
      filePath = resolveTranscriptPath(agentId, sessionId, startEvent.cwd as string);
      isLive = true;
    }

    // 3. Read transcript
    const messages = await readTranscriptFile(filePath);
    if (messages.length === 0 && !isLive) {
      return c.json({ error: "Transcript file not found or empty" }, 404);
    }

    // 4. Extract and persist metadata
    let metadata: SubagentMetadata | null = null;
    if (messages.length > 0 && sessionId) {
      const extracted = extractMetadata(messages, agentId, sessionId);
      await sql`
        INSERT INTO subagent_metadata (agent_id, session_id, model, total_input_tokens, total_output_tokens,
          cache_read_tokens, cache_creation_tokens, tool_call_count, transcript_path, extracted_at)
        VALUES (${agentId}, ${sessionId}, ${extracted.model}, ${extracted.total_input_tokens},
          ${extracted.total_output_tokens}, ${extracted.cache_read_tokens}, ${extracted.cache_creation_tokens},
          ${extracted.tool_call_count}, ${filePath}, NOW())
        ON CONFLICT (agent_id) DO UPDATE SET
          model = EXCLUDED.model,
          total_input_tokens = EXCLUDED.total_input_tokens,
          total_output_tokens = EXCLUDED.total_output_tokens,
          cache_read_tokens = EXCLUDED.cache_read_tokens,
          cache_creation_tokens = EXCLUDED.cache_creation_tokens,
          tool_call_count = EXCLUDED.tool_call_count,
          extracted_at = NOW()
      `;

      metadata = {
        ...extracted,
        transcript_path: filePath,
        extracted_at: new Date().toISOString(),
      };
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
