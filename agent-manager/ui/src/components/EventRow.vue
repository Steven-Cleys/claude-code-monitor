<script setup lang="ts">
import type { TimelineEvent as TEvent } from "../types/events";
import TimelineEvent from "./TimelineEvent.vue";
import EventDetail from "./EventDetail.vue";

defineProps<{
  event: TEvent;
  expanded: boolean;
}>();

const emit = defineEmits<{
  toggleDetail: [];
}>();
</script>

<template>
  <div>
    <TimelineEvent :event="event" :expanded="expanded" @toggle-detail="emit('toggleDetail')" />
    <EventDetail v-if="expanded" :event="event" @close="emit('toggleDetail')" />
  </div>
</template>
