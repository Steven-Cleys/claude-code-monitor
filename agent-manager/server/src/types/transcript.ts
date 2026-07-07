export interface TranscriptLine {
  type: "user" | "assistant" | "progress" | "ai-title";
  // Only on "ai-title" records — Claude Code's generated session title,
  // re-emitted as the conversation topic evolves (last one wins).
  aiTitle?: string;
  message?: {
    role?: "user" | "assistant";
    content?: string | ContentBlock[];
    model?: string;
    id?: string;
    stop_reason?: string;
    usage?: TokenUsage;
  };
  timestamp: string;
  uuid?: string;
}

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking";
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: unknown;
  content?: string;
  tool_use_id?: string;
  is_error?: boolean;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface SubagentMetadata {
  agent_id: string;
  session_id: string;
  model: string | null;
  total_input_tokens: number;
  total_output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  tool_call_count: number;
  transcript_path: string | null;
  extracted_at: string;
}

// The per-agent slice of SubagentMetadata that rides on sidebar rows and the
// subagent_metadata_updated broadcast (ids/paths travel separately).
export type SubagentMetadataSummary = Pick<
  SubagentMetadata,
  | "model"
  | "total_input_tokens"
  | "total_output_tokens"
  | "cache_read_tokens"
  | "cache_creation_tokens"
  | "tool_call_count"
>;

export interface TranscriptResponse {
  messages: TranscriptLine[];
  metadata: SubagentMetadata | null;
  isLive: boolean;
}
