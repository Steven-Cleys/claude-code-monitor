<script setup lang="ts">
import type { TimelineEvent } from "../types/events";
import { formatTime, shortId } from "../utils/format";

defineProps<{
  event: TimelineEvent;
}>();

const emit = defineEmits<{
  close: [];
}>();

function syntaxHighlight(obj: unknown): string {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(
    /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|(true|false)|(\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match, key, str, bool, nil, num) => {
      if (key) return `<span class="json-key">${key}</span>:`;
      if (str) return `<span class="json-string">${str}</span>`;
      if (bool) return `<span class="json-bool">${match}</span>`;
      if (nil) return `<span class="json-null">${match}</span>`;
      if (num) return `<span class="json-num">${match}</span>`;
      return match;
    },
  );
}
</script>

<template>
  <div class="mx-3 my-1 rounded border border-ink-border-light bg-ink-light/90 backdrop-blur-sm animate-slide-up overflow-hidden">
    <!-- Detail header -->
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-ink-border bg-ink-mid/50">
      <div class="flex items-center gap-3 text-xs">
        <span class="text-ghost tabular-nums">{{ formatTime(event.created_at) }}</span>
        <span class="w-px h-3 bg-ink-border"></span>
        <span class="text-cyan-glow tracking-wider">{{ shortId(event.session_id) }}</span>
        <span class="w-px h-3 bg-ink-border"></span>
        <span class="text-gray-200 font-medium">{{ event.tool_name ?? event.event_type }}</span>
      </div>
      <button
        class="text-[0.65rem] uppercase tracking-wider text-ghost hover:text-amber-glow px-2 py-0.5 rounded hover:bg-ink-surface transition-all duration-150"
        @click="emit('close')"
      >
        Close
      </button>
    </div>

    <!-- Detail body -->
    <div class="p-4 space-y-4">
      <div v-if="event.tool_input">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-0.5 h-3 bg-cyan-glow/60 rounded-full"></div>
          <span class="text-[0.6rem] uppercase tracking-[0.15em] text-cyan-glow/80 font-semibold">Input</span>
        </div>
        <pre
          class="text-xs bg-ink/80 rounded border border-ink-border p-3 overflow-auto max-h-72 whitespace-pre-wrap leading-relaxed json-viewer custom-scrollbar"
          v-html="syntaxHighlight(event.tool_input)"
        />
      </div>

      <div v-if="event.tool_response">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-0.5 h-3 bg-signal-green/60 rounded-full"></div>
          <span class="text-[0.6rem] uppercase tracking-[0.15em] text-signal-green/80 font-semibold">Response</span>
        </div>
        <pre
          class="text-xs bg-ink/80 rounded border border-ink-border p-3 overflow-auto max-h-72 whitespace-pre-wrap leading-relaxed json-viewer custom-scrollbar"
          v-html="syntaxHighlight(event.tool_response)"
        />
      </div>

      <div v-if="!event.tool_input && !event.tool_response" class="text-xs text-ghost/60 italic py-4 text-center">
        No tool input or response data available.
      </div>
    </div>
  </div>
</template>

<style scoped>
.json-viewer :deep(.json-key) {
  color: #38bdf8;
}
.json-viewer :deep(.json-string) {
  color: #22c55e;
}
.json-viewer :deep(.json-bool) {
  color: #a78bfa;
}
.json-viewer :deep(.json-null) {
  color: #4a5580;
}
.json-viewer :deep(.json-num) {
  color: #f0a030;
}
</style>
