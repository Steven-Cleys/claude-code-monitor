<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import type { TimelineEvent as TEvent } from "../types/events";
import TimelineEvent from "./TimelineEvent.vue";
import EventDetail from "./EventDetail.vue";

const props = defineProps<{
  events: TEvent[];
  expandedEventId: number | null;
}>();

const emit = defineEmits<{
  toggleDetail: [id: number];
}>();

const container = ref<HTMLElement | null>(null);

watch(
  () => props.events.length,
  async () => {
    if (container.value) {
      await nextTick();
      container.value.scrollTop = 0;
    }
  },
);
</script>

<template>
  <div ref="container" class="overflow-y-auto h-full custom-scrollbar px-2 py-1">
    <TransitionGroup name="event-stream">
      <template v-for="event in events" :key="event.id">
        <TimelineEvent
          :event="event"
          :expanded="expandedEventId === event.id"
          @toggle-detail="emit('toggleDetail', event.id)"
        />
        <EventDetail
          v-if="expandedEventId === event.id"
          :event="event"
          @close="emit('toggleDetail', event.id)"
        />
      </template>
    </TransitionGroup>
    <div v-if="events.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-12 h-12 rounded-full border border-ink-border flex items-center justify-center mb-4">
        <div class="w-3 h-3 rounded-full bg-ghost/30 animate-pulse-glow"></div>
      </div>
      <span class="text-ghost text-xs tracking-wide">No events yet.</span>
      <span class="text-ghost/50 text-[0.65rem] mt-1">Waiting for hook data...</span>
    </div>
  </div>
</template>

<style scoped>
.event-stream-enter-active {
  transition: all 0.25s ease-out;
}
.event-stream-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.event-stream-move {
  transition: transform 0.2s ease;
}
</style>
