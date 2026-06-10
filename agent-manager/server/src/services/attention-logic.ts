const ATTENTION_TRIGGER_TYPES = new Set<string>([
  "permission_prompt",
  "idle_prompt",
]);

const ATTENTION_CLEAR_EVENTS = new Set<string>([
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "StopFailure",
  "SessionEnd",
]);

export function shouldTriggerAttention(payload: {
  hook_event_name: string;
  notification_type?: unknown;
}): boolean {
  if (payload.hook_event_name !== "Notification") return false;
  if (typeof payload.notification_type !== "string") return false;
  return ATTENTION_TRIGGER_TYPES.has(payload.notification_type);
}

export function shouldClearAttention(payload: {
  hook_event_name: string;
}): boolean {
  return ATTENTION_CLEAR_EVENTS.has(payload.hook_event_name);
}
