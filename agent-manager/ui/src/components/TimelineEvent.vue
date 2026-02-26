<script setup lang="ts">
import type { TimelineEvent as TEvent } from "../types/events";
import { formatTime, shortId, eventIcon, toolDetail } from "../utils/format";

defineProps<{
  event: TEvent;
  expanded: boolean;
}>();

const emit = defineEmits<{
  toggleDetail: [];
}>();
</script>

<template>
  <div
    class="flex items-start gap-3 py-1.5 px-2 rounded text-sm font-mono cursor-pointer transition-colors"
    :class="expanded ? 'bg-gray-800/70' : 'hover:bg-gray-800/50'"
    @click="emit('toggleDetail')"
  >
    <span class="text-gray-500 shrink-0 w-16">{{ formatTime(event.created_at) }}</span>
    <span class="shrink-0 w-4 text-center">{{ eventIcon(event.event_type) }}</span>
    <span class="text-blue-400 shrink-0 w-16">{{ shortId(event.session_id) }}</span>
    <span class="text-gray-200 shrink-0 w-24">{{ event.tool_name ?? event.event_type }}</span>
    <span class="text-gray-500 truncate flex-1">{{ toolDetail(event) }}</span>
    <span class="text-gray-600 shrink-0 w-4 text-center">{{ expanded ? '▾' : '▸' }}</span>
  </div>
</template>
