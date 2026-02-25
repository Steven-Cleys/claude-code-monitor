export interface Session {
  id: string;
  model: string | null;
  cwd: string | null;
  permission_mode: string | null;
  status: "active" | "idle" | "ended";
  first_seen: string;
  last_seen: string;
  event_count?: number;
  last_tool?: string | null;
  tokens?: Record<string, number>;
}

export interface TimelineEvent {
  id: number;
  session_id: string;
  event_type: string;
  tool_name: string | null;
  tool_input: Record<string, unknown> | null;
  tool_response: Record<string, unknown> | null;
  created_at: string;
}

export type WsMessage =
  | { type: "new_event"; data: TimelineEvent }
  | { type: "session_created"; data: Session }
  | { type: "session_status_changed"; data: { id: string; status: string } }
  | { type: "session_enriched"; data: { id: string; model?: string } }
  | { type: "session_metrics"; data: { id: string; tokens: Record<string, number> } };
