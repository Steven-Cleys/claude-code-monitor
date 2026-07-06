import { sql } from "../db/connection";
import { readTranscriptFile, extractMetadata } from "./transcript-reader";
import type { SubagentMetadata, TranscriptLine } from "../types/transcript";
import type { BroadcastFn } from "../types/broadcast";

// Per-agent lock so the eager SubagentStop path and the lazy transcripts
// GET path don't race each other into a duplicate extract + broadcast pair
// for the same agent. Both callers always target the same file, so skipping
// a concurrent second caller is safe: either it's the same write in-flight,
// or the first caller already persisted what the second was about to.
const inFlight = new Set<string>();

// Read a subagent's transcript, extract model/token/tool-call metadata,
// persist it, and broadcast the update so the UI sidebar reflects it
// without a manual refresh.
//
// Called from two paths:
//   - hooks.ts on SubagentStop (eager — so badges appear as soon as a
//     subagent finishes, not only when its transcript is opened)
//   - transcripts.ts GET /:agentId (lazy fallback for older agents whose
//     SubagentStop fired before this code shipped, or if eager extraction
//     failed)
//
// Returns null if the transcript file is missing/empty, or if another
// caller is already persisting the same agent.
export async function persistSubagentMetadata(
  agentId: string,
  sessionId: string,
  filePath: string,
  broadcast: BroadcastFn,
  // Callers that already read the transcript pass it in to avoid a second
  // full-file read + parse of the same path.
  preloadedMessages?: TranscriptLine[],
): Promise<SubagentMetadata | null> {
  if (inFlight.has(agentId)) return null;
  inFlight.add(agentId);

  try {
    const messages = preloadedMessages ?? (await readTranscriptFile(filePath));
    if (messages.length === 0) return null;

    const extracted = extractMetadata(messages, agentId, sessionId);

    await sql`
      INSERT INTO subagent_metadata (
        agent_id, session_id, model, total_input_tokens, total_output_tokens,
        cache_read_tokens, cache_creation_tokens, tool_call_count, transcript_path, extracted_at
      )
      VALUES (
        ${agentId}, ${sessionId}, ${extracted.model}, ${extracted.total_input_tokens},
        ${extracted.total_output_tokens}, ${extracted.cache_read_tokens},
        ${extracted.cache_creation_tokens}, ${extracted.tool_call_count}, ${filePath}, NOW()
      )
      ON CONFLICT (agent_id) DO UPDATE SET
        session_id = EXCLUDED.session_id,
        model = EXCLUDED.model,
        total_input_tokens = EXCLUDED.total_input_tokens,
        total_output_tokens = EXCLUDED.total_output_tokens,
        cache_read_tokens = EXCLUDED.cache_read_tokens,
        cache_creation_tokens = EXCLUDED.cache_creation_tokens,
        tool_call_count = EXCLUDED.tool_call_count,
        transcript_path = EXCLUDED.transcript_path,
        extracted_at = NOW()
    `;

    const metadata: SubagentMetadata = {
      ...extracted,
      transcript_path: filePath,
      extracted_at: new Date().toISOString(),
    };

    // The broadcast carries the summary slice only — ids travel alongside it.
    const { agent_id, session_id, ...summary } = extracted;
    broadcast("sessions", {
      type: "subagent_metadata_updated",
      data: {
        session_id: sessionId,
        agent_id: agentId,
        metadata: summary,
      },
    });

    return metadata;
  } finally {
    inFlight.delete(agentId);
  }
}
