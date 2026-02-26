<script setup lang="ts">
import type { Session } from "../types/events";
import AgentCard from "./AgentCard.vue";

const props = defineProps<{
  sessions: Session[];
  selectedId: string | null;
}>();

const emit = defineEmits<{
  select: [id: string | null];
}>();

function handleSelect(id: string) {
  emit("select", props.selectedId === id ? null : id);
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <button
      v-if="selectedId"
      class="text-[0.65rem] uppercase tracking-wider text-amber-glow/70 hover:text-amber-glow text-left mb-1 transition-colors"
      @click="emit('select', null)"
    >
      Clear filter
    </button>
    <TransitionGroup name="agent-list">
      <AgentCard
        v-for="(session, index) in sessions"
        :key="session.id"
        :session="session"
        :selected="session.id === selectedId"
        :style="{ animationDelay: `${index * 50}ms` }"
        class="animate-slide-in"
        @select="handleSelect"
      />
    </TransitionGroup>
    <div v-if="sessions.length === 0" class="text-ghost text-xs text-center py-8 tracking-wide">
      No sessions found.
      <br />
      <span class="text-ghost/60">Waiting for agent activity...</span>
    </div>
  </div>
</template>

<style scoped>
.agent-list-enter-active {
  transition: all 0.3s ease-out;
}
.agent-list-leave-active {
  transition: all 0.2s ease-in;
}
.agent-list-enter-from {
  opacity: 0;
  transform: translateX(-12px);
}
.agent-list-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}
.agent-list-move {
  transition: transform 0.3s ease;
}
</style>
