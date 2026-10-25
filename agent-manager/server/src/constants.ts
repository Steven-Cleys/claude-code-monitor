export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const SESSION_TRACKER_INTERVAL_MS = 30_000;
export const CONTEXT_POLL_INTERVAL_MS = 20_000;
export const TRANSCRIPT_SCAN_INTERVAL_MS = 10_000;
// Enough tail to catch the last assistant message even with large tool
// results interleaved; a full transcript read would be MBs.
export const CONTEXT_TAIL_BYTES = 256 * 1024;

// SessionEnd is the only true terminal event. Stop/StopFailure are TURN
// boundaries — Claude finished replying and is waiting on the user.
export const SESSION_END_EVENTS = ["SessionEnd"] as const;
export const TURN_END_EVENTS = ["Stop", "StopFailure"] as const;
// Events that can arrive on a session that is NOT actively working —
// idle_prompt notifications and late/phantom SubagentStops — and therefore
// must not resurrect an idle session to 'active'.
export const PASSIVE_EVENTS = ["Notification", "SubagentStop"] as const;
export const COST_POLL_INTERVAL_MS = 30_000;
// Claude Code exports log events every few seconds and the collector batches
// for 10s, so a few minutes covers events that land after midnight.
export const COST_LATE_EVENT_MARGIN_MS = 5 * 60 * 1000;
