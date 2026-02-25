<script setup lang="ts">
import type { Session } from "../types/events";
import { shortId, timeSince, statusColor } from "../utils/format";

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
  </div>
</template>
