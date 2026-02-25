<script setup lang="ts">
import { useWebSocket } from "./composables/useWebSocket";
import { useAgents } from "./composables/useAgents";
import AgentList from "./components/AgentList.vue";
import Timeline from "./components/Timeline.vue";

const { connected, messages } = useWebSocket();
const {
  sortedSessions,
  filteredEvents,
  selectedSessionId,
  hoursFilter,
  fetchSessions,
  fetchEvents,
} = useAgents(messages);

function refresh() {
  fetchSessions();
  fetchEvents();
}
</script>

<template>
  <div class="h-screen flex flex-col bg-gray-950 text-gray-100">
    <header class="flex items-center justify-between px-4 py-3 border-b border-gray-800">
      <div class="flex items-center gap-3">
        <h1 class="text-lg font-semibold">Agent Manager</h1>
        <span
          class="w-2 h-2 rounded-full"
          :class="connected ? 'bg-green-400' : 'bg-red-400'"
          :title="connected ? 'Connected' : 'Disconnected'"
        />
      </div>
      <div class="flex items-center gap-3">
        <select
          v-model="hoursFilter"
          class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
          @change="refresh"
        >
          <option :value="1">Last 1h</option>
          <option :value="4">Last 4h</option>
          <option :value="12">Last 12h</option>
          <option :value="24">Last 24h</option>
        </select>
        <button
          class="px-3 py-1 text-sm bg-gray-800 border border-gray-700 rounded hover:bg-gray-700"
          @click="refresh"
        >
          Refresh
        </button>
      </div>
    </header>
    <main class="flex flex-1 overflow-hidden">
      <aside class="w-72 border-r border-gray-800 p-3 overflow-y-auto shrink-0">
        <h2 class="text-xs font-semibold uppercase text-gray-500 mb-3">Agents</h2>
        <AgentList
          :sessions="sortedSessions"
          :selected-id="selectedSessionId"
          @select="(id) => (selectedSessionId = id)"
        />
      </aside>
      <section class="flex-1 flex flex-col overflow-hidden">
        <div class="px-4 py-2 border-b border-gray-800">
          <h2 class="text-xs font-semibold uppercase text-gray-500">Timeline</h2>
        </div>
        <Timeline :events="filteredEvents" />
      </section>
    </main>
  </div>
</template>
