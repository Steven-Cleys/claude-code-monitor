<script setup lang="ts">
import { ref } from "vue";
import type { Subagent } from "../types/events";

defineProps<{
  subagents: Subagent[];
  activeFilter: string | null;
}>();

const emit = defineEmits<{
  filterByAgent: [name: string];
  inspectAgent: [subagent: Subagent];
}>();

const collapsed = ref(false);

function statusDotClass(status: string): string {
  return status === "running"
    ? "bg-signal-green animate-pulse-glow"
    : "bg-ghost/60";
}

function statusLabel(status: string): string {
  return status === "running" ? "RUNNING" : "DONE";
}
</script>

<template>
  <div v-if="subagents.length > 0" class="mt-2 pt-2 border-t border-ink-border/60">
    <!-- Header with toggle -->
    <button
      class="flex items-center gap-1.5 w-full text-left mb-1.5 group"
      @click.stop="collapsed = !collapsed"
    >
      <svg
        class="w-2.5 h-2.5 text-ghost transition-transform duration-200"
        :class="{ '-rotate-90': collapsed }"
        viewBox="0 0 10 10"
        fill="currentColor"
      >
        <path d="M2 3l3 3.5L8 3z" />
      </svg>
      <span class="text-[0.6rem] uppercase tracking-[0.15em] text-ghost font-semibold">
        Agents
      </span>
      <span class="chip bg-ink-surface text-ghost-light text-[0.55rem]">{{ subagents.length }}</span>
    </button>

    <!-- Subagent nodes -->
    <div
      v-if="!collapsed"
      class="ml-2 border-l border-ink-border/40 pl-2.5 space-y-1"
    >
      <div
        v-for="agent in subagents"
        :key="agent.name"
        class="flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer transition-all duration-150 group/node"
        :class="
          activeFilter === agent.name
            ? 'bg-indigo-500/10 border border-indigo-500/30'
            : 'hover:bg-ink-surface/60 border border-transparent'
        "
        @click.stop="emit('filterByAgent', agent.name)"
      >
        <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="statusDotClass(agent.status)" />
        <span class="text-[0.65rem] font-mono text-indigo-300 truncate">{{ agent.name }}</span>
        <span
          v-if="agent.metadata?.model"
          class="text-[0.5rem] px-1 rounded bg-indigo-900/30 text-purple-300 border border-indigo-700/30 shrink-0"
        >
          {{ agent.metadata.model?.includes('opus') ? 'opus' : agent.metadata.model?.includes('sonnet') ? 'sonnet' : 'haiku' }}
        </span>
        <span
          class="text-[0.5rem] uppercase tracking-wider ml-auto shrink-0"
          :class="agent.status === 'running' ? 'text-signal-green' : 'text-ghost/50'"
        >
          {{ statusLabel(agent.status) }}
        </span>
        <button
          class="shrink-0 p-0.5 rounded text-ghost/40 hover:text-purple-300 hover:bg-purple-500/10 transition-colors"
          title="View transcript"
          @click.stop="emit('inspectAgent', agent)"
        >
          <svg class="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 3h12M2 6h10M2 9h8M2 12h6" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
