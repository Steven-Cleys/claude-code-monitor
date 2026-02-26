<script setup lang="ts">
import type { Session } from "../types/events";
import { shortId, timeSince, statusColor, formatTokenCount, formatCost } from "../utils/format";
import { calculateCost } from "../utils/pricing";

defineProps<{
  session: Session;
  selected: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
}>();
</script>

<template>
  <div
    class="rounded-lg border p-3 cursor-pointer transition-colors"
    :class="
      selected
        ? 'border-blue-500 bg-blue-950/30'
        : 'border-gray-700 bg-gray-900 hover:border-gray-500'
    "
    @click="emit('select', session.id)"
  >
    <div class="flex items-center gap-2 mb-2">
      <span class="w-2.5 h-2.5 rounded-full" :class="statusColor(session.status)" />
      <span class="font-mono text-sm text-gray-200">{{ shortId(session.id) }}</span>
      <span class="text-xs text-gray-500 ml-auto">{{ timeSince(session.last_seen) }}</span>
    </div>
    <div v-if="session.model" class="text-xs text-gray-400 mb-1">{{ session.model }}</div>
    <div v-if="session.cwd" class="text-xs text-gray-500 truncate mb-1">{{ session.cwd }}</div>
    <div v-if="session.last_tool" class="text-xs text-gray-400">
      Last: <span class="text-gray-300">{{ session.last_tool }}</span>
    </div>
    <div v-if="session.event_count" class="text-xs text-gray-500 mt-1">
      {{ session.event_count }} events
    </div>
    <div
      v-if="session.tokens && (session.tokens.input || session.tokens.output || session.tokens.cache_read)"
      class="flex items-center gap-1.5 mt-1.5 flex-wrap"
    >
      <span v-if="session.tokens.input" class="text-xs px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-400">
        IN {{ formatTokenCount(session.tokens.input) }}
      </span>
      <span v-if="session.tokens.output" class="text-xs px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400">
        OUT {{ formatTokenCount(session.tokens.output) }}
      </span>
      <span v-if="session.tokens.cache_read" class="text-xs px-1.5 py-0.5 rounded bg-sky-900/40 text-sky-400">
        CR {{ formatTokenCount(session.tokens.cache_read) }}
      </span>
      <span class="text-xs text-gray-300 font-semibold ml-auto">
        {{ formatCost(calculateCost(session.tokens, session.model)) }}
      </span>
    </div>
  </div>
</template>
