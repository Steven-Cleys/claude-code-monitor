<script setup lang="ts">
import type { TimelineEvent as TEvent } from "../types/events";
import { formatTime, shortId, eventIcon, eventTypeColor, eventAccentBorder, toolDetail } from "../utils/format";
import { getSessionColor } from "../composables/useSessionColors";

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
    class="flex items-start gap-3 py-1.5 px-3 mx-1 my-0.5 rounded text-xs cursor-pointer transition-all duration-150 border-l-2"
    :class="[
      expanded ? 'bg-ink-surface/80 border-l-amber-glow/60' : `hover:bg-ink-mid/60 ${eventAccentBorder(event.event_type)}`,
    ]"
    @click="emit('toggleDetail')"
  >
    <!-- Timestamp -->
    <span class="text-ghost shrink-0 w-16 tabular-nums">{{ formatTime(event.created_at) }}</span>

    <!-- Event icon -->
    <span class="shrink-0 w-4 text-center" :class="eventTypeColor(event.event_type)">
      {{ eventIcon(event.event_type) }}
    </span>

    <!-- Session ID -->
    <span class="shrink-0 w-16 tracking-wider" :style="{ color: getSessionColor(event.session_id) }">{{ shortId(event.session_id) }}</span>

    <!-- Tool name / event type -->
    <span class="text-gray-200 shrink-0 w-28 truncate font-medium">{{ event.tool_name ?? event.event_type }}</span>

    <!-- Tool detail -->
    <span class="text-ghost truncate flex-1">{{ toolDetail(event) }}</span>

    <!-- Expand indicator -->
    <span
      class="shrink-0 w-4 text-center transition-transform duration-200"
      :class="expanded ? 'text-amber-glow rotate-90' : 'text-ghost/40'"
    >
      {{ expanded ? '\u25BE' : '\u25B8' }}
    </span>
  </div>
</template>
