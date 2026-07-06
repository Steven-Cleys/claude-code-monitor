import type { TimelineEvent } from "../types/events";

export function shortId(id: string) {
  return id.slice(0, 8);
}

export function timeSince(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function formatTime(date: string | Date) {
  return new Date(date).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Map a full model id (e.g. claude-haiku-4-5-20251001) to a short tier label.
// Falls back to the hyphen-separated family segments so future model families
// don't silently get mislabeled.
export function modelTier(model: string | null | undefined): string {
  if (!model) return "unknown";
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("haiku")) return "haiku";
  return model.split("-").slice(1, 3).join("-") || model;
}

// Single registry for per-event-type presentation. Icon, text color, and
// accent border used to live in three separate switches that had already
// drifted apart — add new event types here, in one place.
const EVENT_TYPE_META: Record<string, { icon: string; color?: string; border?: string }> = {
  PreToolUse: { icon: "▶", color: "text-cyan-glow", border: "border-l-cyan-glow/40" },
  PostToolUse: { icon: "✓", color: "text-signal-green", border: "border-l-signal-green/40" },
  PostToolUseFailure: { icon: "✗", color: "text-signal-red", border: "border-l-signal-red/40" },
  Stop: { icon: "○", color: "text-ghost-light" },
  SessionEnd: { icon: "○", color: "text-ghost-light" },
  StopFailure: { icon: "⨂", color: "text-signal-red" },
  SessionStart: { icon: "●", color: "text-amber-glow", border: "border-l-amber-glow/40" },
  Notification: { icon: "◆", color: "text-purple-400", border: "border-l-purple-400/40" },
  PreCompact: { icon: "▽", color: "text-amber-glow" },
  PostCompact: { icon: "△", color: "text-amber-glow" },
  PermissionRequest: { icon: "⚡", color: "text-purple-400" },
  PermissionDenied: { icon: "⊘", color: "text-signal-red" },
  TaskCreated: { icon: "□", color: "text-cyan-glow" },
  TaskCompleted: { icon: "■", color: "text-cyan-glow" },
  TeammateIdle: { icon: "⏸", color: "text-yellow-400" },
};

export function eventIcon(eventType: string): string {
  return EVENT_TYPE_META[eventType]?.icon ?? "•";
}

export function eventTypeColor(eventType: string): string {
  return EVENT_TYPE_META[eventType]?.color ?? "text-ghost-light";
}

export function eventAccentBorder(eventType: string): string {
  return EVENT_TYPE_META[eventType]?.border ?? "border-l-ink-border";
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatCost(dollars: number): string {
  if (dollars < 0.01) return "<$0.01";
  return `$${dollars.toFixed(2)}`;
}

// Pick the most interesting field from a tool's input for a one-line summary.
export function toolInputSummary(input: Record<string, unknown>): string {
  if (input.command) return String(input.command).slice(0, 60);
  if (input.file_path) return String(input.file_path);
  if (input.pattern) return `"${input.pattern}"`;
  if (input.query) return `"${String(input.query).slice(0, 60)}"`;
  if (input.prompt) return `${String(input.prompt).slice(0, 60)}...`;
  if (input.description) return String(input.description).slice(0, 60);
  const firstVal = Object.values(input)[0];
  if (typeof firstVal === "string") return firstVal.slice(0, 60);
  return "";
}

export function toolDetail(event: TimelineEvent): string {
  if (!event.tool_input) return "";
  return toolInputSummary(event.tool_input);
}
