export interface TranscriptLine {
  type: "user" | "assistant" | "progress";
  message?: {
    role?: "user" | "assistant";
    content?: string | ContentBlock[];
    model?: string;
    id?: string;
    stop_reason?: string;
    usage?: TokenUsage;
  };
  timestamp: string;
  agentId?: string;
  slug?: string;
  sessionId?: string;
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

export interface TranscriptResponse {
  messages: TranscriptLine[];
  metadata: SubagentMetadata | null;
  isLive: boolean;
}
