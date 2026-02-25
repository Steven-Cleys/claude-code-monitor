<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import type { TimelineEvent as TEvent } from "../types/events";
import TimelineEvent from "./TimelineEvent.vue";

const props = defineProps<{
  events: TEvent[];
}>();

const container = ref<HTMLElement | null>(null);
const autoScroll = ref(true);

watch(
  () => props.events.length,
  async () => {
    if (autoScroll.value && container.value) {
      await nextTick();
      container.value.scrollTop = 0;
    }
  },
);
</script>

<template>
  <div ref="container" class="overflow-y-auto h-full">
    <TimelineEvent v-for="event in events" :key="event.id" :event="event" />
    <div v-if="events.length === 0" class="text-gray-500 text-sm text-center py-8">
      No events yet. Waiting for hook data...
    </div>
  </div>
</template>
