export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const SESSION_TRACKER_INTERVAL_MS = 30_000;
export const LOKI_POLL_INTERVAL_MS = 15_000;
export const PROMETHEUS_POLL_INTERVAL_MS = 30_000;
export const CONTEXT_POLL_INTERVAL_MS = 20_000;
// Enough tail to catch the last assistant message even with large tool
// results interleaved; a full transcript read would be MBs.
export const CONTEXT_TAIL_BYTES = 256 * 1024;

// SessionEnd is the only true terminal event. Stop/StopFailure are TURN
// boundaries — Claude finished replying and is waiting on the user.
export const SESSION_END_EVENTS = ["SessionEnd"] as const;
export const TURN_END_EVENTS = ["Stop", "StopFailure"] as const;

export const LOKI_QUERY = '{service_name="claude-code"} | json';
export const PROMETHEUS_TOKEN_QUERY =
  "sum by (session_id, type) (claude_code_token_usage_tokens_total)";
