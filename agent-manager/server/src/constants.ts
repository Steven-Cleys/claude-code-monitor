export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const SESSION_TRACKER_INTERVAL_MS = 30_000;
export const LOKI_POLL_INTERVAL_MS = 15_000;
export const PROMETHEUS_POLL_INTERVAL_MS = 30_000;

export const SESSION_END_EVENTS = ["Stop", "StopFailure", "SessionEnd"] as const;

export const LOKI_QUERY = '{service_name="claude-code"} | json';
export const PROMETHEUS_TOKEN_QUERY =
  "sum by (session_id, token_type) (claude_code_token_usage_tokens_total)";
