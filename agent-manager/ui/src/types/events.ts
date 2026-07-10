export interface Session {
  id: string;
  title?: string | null;
  model: string | null;
  cwd: string | null;
  permission_mode: string | null;
  status: "active" | "idle" | "ended";
  first_seen: string;
  last_seen: string;
  needs_attention: boolean;
  attention_since: string | null;
  event_count?: number;
  last_tool?: string | null;
  tokens?: Record<string, number>;
  subagents?: Subagent[];
  context?: SessionContext | null;
}

export interface SessionContext {
  tokens: number;
  ts: string;
}

export interface TimelineEvent {
  id: number;
  session_id: string;
  event_type: string;
  tool_name: string | null;
  tool_input: Record<string, unknown> | null;
  tool_response: Record<string, unknown> | null;
  created_at: string;
  // Top-level payload field on SubagentStart/SubagentStop (NOT in tool_input);
  // selected as its own column in every event query, null for other events.
  agent_id?: string | null;
}

export interface Subagent {
  name: string;
  description: string;
  subagent_type: string | null;
  agent_type: string | null;
  agent_id: string | null;
  status: "running" | "completed";
  dispatched_at: string;
  completed_at: string | null;
  permission_mode: string | null;
  last_message: string | null;
  run_in_background: boolean;
  metadata?: SubagentMetadata | null;
}

export interface SubagentMetadata {
  model: string | null;
  total_input_tokens: number;
  total_output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  tool_call_count: number;
}

export interface TranscriptLine {
  type: "user" | "assistant" | "progress";
  uuid?: string;
  message?: {
    role?: "user" | "assistant";
    content?: string | ContentBlock[];
    model?: string;
    id?: string;
    stop_reason?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
    };
  };
  timestamp: string;
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

export interface Turn {
  index: number;
  prompt: string;
  start: string;
  end: string;
  duration_ms: number;
  tool_calls: number;
  failures: number;
  files_touched: string[];
  tokens: {
    input: number;
    output: number;
    cache_read: number;
    cache_creation: number;
  };
  agents: {
    count: number;
    tool_calls: number;
    tokens: {
      input: number;
      output: number;
      cache_read: number;
      cache_creation: number;
    };
  };
}

export type InspectTarget =
  | { kind: "subagent"; subagent: Subagent }
  | { kind: "session"; session: Session };

export type WsMessage =
  | { type: "new_event"; data: TimelineEvent }
  | { type: "session_created"; data: Session }
  | { type: "session_status_changed"; data: { id: string; status: Session["status"]; last_seen?: string } }
  | { type: "session_enriched"; data: { id: string; model?: string } }
  | { type: "session_metrics"; data: { id: string; tokens: Record<string, number> } }
  | { type: "session_context"; data: { id: string; context: SessionContext } }
  | { type: "session_attention_changed"; data: { id: string; needs_attention: boolean; attention_since: string | null } }
  | { type: "session_title_changed"; data: { id: string; title: string } }
  | { type: "subagent_metadata_updated"; data: { session_id: string; agent_id: string; metadata: SubagentMetadata } }
  | { type: "transcript_line"; agentId: string; data: TranscriptLine }
  | { type: "transcript_complete"; agentId: string };
