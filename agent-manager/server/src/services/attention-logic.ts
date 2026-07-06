import { SESSION_END_EVENTS } from "../constants";

const ATTENTION_TRIGGER_TYPES = new Set<string>([
  "permission_prompt",
  "idle_prompt",
]);

// Terminal events clear attention (composed from the shared list so a new
// terminal event type can't end a session while its badge stays lit), plus
// tool activity, which proves the session is no longer blocked on a prompt.
const ATTENTION_CLEAR_EVENTS = new Set<string>([
  ...SESSION_END_EVENTS,
  "PreToolUse",
  "PostToolUse",
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
