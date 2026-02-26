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
      if (key) return `<span class="text-blue-400">${key}</span>:`;
      if (str) return `<span class="text-emerald-300">${str}</span>`;
      if (bool) return `<span class="text-purple-400">${match}</span>`;
      if (nil) return `<span class="text-gray-500">${match}</span>`;
      if (num) return `<span class="text-amber-300">${match}</span>`;
      return match;
    },
  );
}
</script>

<template>
  <div class="mx-2 my-1 rounded border border-gray-700 bg-gray-900/80">
    <div class="flex items-center justify-between px-3 py-2 border-b border-gray-800">
      <div class="flex items-center gap-3 text-xs font-mono">
        <span class="text-gray-400">{{ formatTime(event.created_at) }}</span>
        <span class="text-blue-400">{{ shortId(event.session_id) }}</span>
        <span class="text-gray-200">{{ event.tool_name ?? event.event_type }}</span>
      </div>
      <button
        class="text-xs text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded hover:bg-gray-800"
        @click="emit('close')"
      >
        Close
      </button>
    </div>
    <div class="p-3 space-y-3">
      <div v-if="event.tool_input">
        <div class="text-xs text-gray-500 uppercase font-semibold mb-1">Tool Input</div>
        <pre
          class="text-xs font-mono bg-gray-950 rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap"
          v-html="syntaxHighlight(event.tool_input)"
        />
      </div>
      <div v-if="event.tool_response">
        <div class="text-xs text-gray-500 uppercase font-semibold mb-1">Tool Response</div>
        <pre
          class="text-xs font-mono bg-gray-950 rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap"
          v-html="syntaxHighlight(event.tool_response)"
        />
      </div>
      <div v-if="!event.tool_input && !event.tool_response" class="text-xs text-gray-500 italic">
        No tool input or response data available.
      </div>
    </div>
  </div>
</template>
