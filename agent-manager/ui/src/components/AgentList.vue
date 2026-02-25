<script setup lang="ts">
import type { Session } from "../types/events";
import AgentCard from "./AgentCard.vue";

defineProps<{
  sessions: Session[];
  selectedId: string | null;
}>();

const emit = defineEmits<{
  select: [id: string | null];
}>();

function handleSelect(id: string) {
  emit("select", id);
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <button
      v-if="selectedId"
      class="text-xs text-blue-400 hover:text-blue-300 text-left mb-1"
      @click="emit('select', null)"
    >
      Clear filter
    </button>
    <AgentCard
      v-for="session in sessions"
      :key="session.id"
      :session="session"
      :selected="session.id === selectedId"
      @select="handleSelect"
    />
    <div v-if="sessions.length === 0" class="text-gray-500 text-sm text-center py-4">
      No sessions found
    </div>
  </div>
</template>
