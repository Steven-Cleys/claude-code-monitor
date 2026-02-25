<script setup lang="ts">
import type { TimelineEvent as TEvent } from "../types/events";

defineProps<{
  event: TEvent;
}>();

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function shortSessionId(id: string) {
  return id.slice(0, 8);
}

function eventIcon(eventType: string) {
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

function toolDetail(event: TEvent): string {
  if (!event.tool_input) return "";
  const input = event.tool_input;
  if (input.command) return String(input.command).slice(0, 60);
  if (input.file_path) return String(input.file_path);
  if (input.pattern) return String(input.pattern);
  if (input.query) return String(input.query).slice(0, 60);
  return "";
}
</script>

<template>
  <div class="flex items-start gap-3 py-1.5 px-2 hover:bg-gray-800/50 rounded text-sm font-mono">
    <span class="text-gray-500 shrink-0 w-16">{{ formatTime(event.created_at) }}</span>
    <span class="shrink-0 w-4 text-center">{{ eventIcon(event.event_type) }}</span>
    <span class="text-blue-400 shrink-0 w-16">{{ shortSessionId(event.session_id) }}</span>
    <span class="text-gray-200 shrink-0 w-24">{{ event.tool_name ?? event.event_type }}</span>
    <span class="text-gray-500 truncate">{{ toolDetail(event) }}</span>
  </div>
</template>
