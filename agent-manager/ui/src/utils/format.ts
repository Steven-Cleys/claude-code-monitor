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

export function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function statusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-green-400";
    case "idle":
      return "bg-yellow-400";
    default:
      return "bg-gray-400";
  }
}

export function eventIcon(eventType: string) {
  switch (eventType) {
    case "PreToolUse":
      return "\u25B6";
    case "PostToolUse":
      return "\u2713";
    case "PostToolUseFailure":
      return "\u2717";
    case "Stop":
    case "SessionEnd":
      return "\u25CB";
    case "SessionStart":
      return "\u25CF";
    case "Notification":
      return "\u25C6";
    default:
      return "\u2022";
  }
}

export function toolDetail(event: TimelineEvent): string {
  if (!event.tool_input) return "";
  const input = event.tool_input;
  if (input.command) return String(input.command).slice(0, 60);
  if (input.file_path) return String(input.file_path);
  if (input.pattern) return String(input.pattern);
  if (input.query) return String(input.query).slice(0, 60);
  return "";
}
