<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { useWebSocket } from "./composables/useWebSocket";
import { useAgents } from "./composables/useAgents";
import { useTurns } from "./composables/useTurns";
import AgentList from "./components/AgentList.vue";
import TranscriptModal from "./components/transcript/TranscriptModal.vue";
import type { InspectTarget, Session, Subagent } from "./types/events";
import Timeline from "./components/Timeline.vue";
import TimelineFilters from "./components/TimelineFilters.vue";
import StatusBar from "./components/StatusBar.vue";
import SwimLaneChart from "./components/SwimLaneChart.vue";
import { formatCost } from "./utils/format";

const {
  sessions,
  sortedSessions,
  processMessage,
  filteredEvents,
  selectedSessionId,
  hoursFilter,
  fetchSessions,
  fetchEvents,
  fetchSelectedEvents,
  totalCost,
  attentionCount,
  searchQuery,
  activeEventTypes,
  knownEventTypes,
  toggleEventType,
  clearFilters,
  expandedEventId,
  toggleEventDetail,
  activeSubagentFilter,
  filterBySubagent,
  clearSubagentFilter,
} = useAgents();

const { connected } = useWebSocket(processMessage, refresh);

const { turns } = useTurns(selectedSessionId, filteredEvents);
const selectedSessionModel = computed(() =>
  selectedSessionId.value
    ? sessions.value.get(selectedSessionId.value)?.model ?? null
    : null,
);

const sidebarCollapsed = ref(false);

function usePersistedFlag(key: string) {
  const state = ref(
    typeof localStorage !== "undefined" &&
      localStorage.getItem(key) === "true",
  );
  watch(state, (v) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, v ? "true" : "false");
    }
  });
  return state;
}

const subagentTimelineCollapsed = usePersistedFlag("panel.subagentTimeline.collapsed");
const eventStreamCollapsed = usePersistedFlag("panel.eventStream.collapsed");

const inspectedTarget = ref<InspectTarget | null>(null);

function handleInspectAgent(subagent: Subagent) {
  if (!subagent.agent_id) return;
  inspectedTarget.value = { kind: "subagent", subagent };
}

function handleInspectSession(session: Session) {
  inspectedTarget.value = { kind: "session", session };
}

// Desktop alerts — opt-in toggle, persisted in localStorage.
const desktopAlertsEnabled = usePersistedFlag("attention.desktop_enabled");

async function toggleDesktopAlerts() {
  if (desktopAlertsEnabled.value) {
    desktopAlertsEnabled.value = false;
    return;
  }

  if (typeof Notification === "undefined") {
    console.warn("Browser does not support notifications");
    return;
  }

  if (Notification.permission !== "granted") {
    const result = await Notification.requestPermission();
    if (result !== "granted") return;
  }
  desktopAlertsEnabled.value = true;
}

// Fire a browser Notification for each session that flips to needs_attention.
// Watching a joined-id string means the callback only runs on actual attention
// transitions, and the watcher's initial value doubles as the "already flagged
// at page load" seed.
const flaggedSessionIds = computed(() =>
  sortedSessions.value
    .filter((s) => s.needs_attention)
    .map((s) => s.id)
    .sort()
    .join(","),
);

watch(flaggedSessionIds, (current, previous) => {
  if (
    !desktopAlertsEnabled.value ||
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  const previouslyFlagged = new Set(previous ? previous.split(",") : []);
  for (const id of current ? current.split(",") : []) {
    if (previouslyFlagged.has(id)) continue;
    new Notification("Claude is waiting", {
      body: sessions.value.get(id)?.cwd ?? "Claude Code session needs your attention",
      tag: id,
    });
  }
});

const sessionCount = computed(() => sortedSessions.value.length);
const activeSessionCount = computed(
  () => sortedSessions.value.filter((s) => s.status === "active").length,
);

function refresh() {
  fetchSessions();
  fetchEvents();
  fetchSelectedEvents();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (inspectedTarget.value) {
      inspectedTarget.value = null;
    } else if (expandedEventId.value !== null) {
      expandedEventId.value = null;
    }
  }
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div class="h-screen flex flex-col bg-ink text-gray-300 font-[family-name:var(--font-mono)] scanlines noise-overlay">
    <!-- Top command bar -->
    <header class="relative z-10 flex items-center justify-between px-5 py-3 border-b border-ink-border bg-ink-light/80 backdrop-blur-sm">
      <div class="flex items-center gap-4">
        <button
          class="flex items-center gap-2 group"
          @click="sidebarCollapsed = !sidebarCollapsed"
          title="Toggle sessions panel"
        >
          <svg
            class="w-4 h-4 text-ghost transition-transform duration-200"
            :class="{ 'rotate-180': sidebarCollapsed }"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M2 4h12M2 8h8M2 12h10" stroke-linecap="round" />
          </svg>
        </button>

        <div class="flex items-center gap-2.5">
          <div class="w-1.5 h-6 bg-amber-glow rounded-full opacity-80"></div>
          <h1 class="font-[family-name:var(--font-display)] text-lg font-semibold text-gray-100 tracking-tight">
            Mission Control
          </h1>
        </div>

        <div class="flex items-center gap-2 ml-3">
          <span
            class="w-2 h-2 rounded-full transition-all duration-500"
            :class="connected ? 'status-active animate-pulse-glow' : 'status-ended'"
          />
          <span class="text-xs tracking-wide" :class="connected ? 'text-signal-green' : 'text-ghost'">
            {{ connected ? 'LIVE' : 'OFFLINE' }}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <button
          class="flex items-center gap-1.5 px-2 py-0.5 rounded border transition-colors"
          :class="desktopAlertsEnabled
            ? 'border-amber-glow/50 bg-amber-glow/10 text-amber-glow'
            : 'border-ink-border bg-ink-mid text-ghost hover:border-amber-muted hover:text-amber-glow'"
          :title="desktopAlertsEnabled ? 'Desktop alerts ON (click to disable)' : 'Desktop alerts OFF (click to enable)'"
          @click="toggleDesktopAlerts"
        >
          <span class="text-sm leading-none">{{ desktopAlertsEnabled ? '🔔' : '🔕' }}</span>
          <span class="text-[0.6rem] uppercase tracking-wider">Alerts</span>
        </button>

        <div
          v-if="attentionCount > 0"
          class="flex items-center gap-1.5 px-2 py-0.5 rounded border border-amber-glow/50 bg-amber-glow/10 animate-pulse"
          :title="`${attentionCount} session(s) waiting for input`"
        >
          <span class="text-amber-glow text-sm leading-none">⚠</span>
          <span class="text-xs font-semibold text-amber-glow">{{ attentionCount }}</span>
        </div>

        <div v-if="totalCost.usd > 0" class="flex items-center gap-2">
          <span class="text-[0.65rem] uppercase tracking-widest text-ghost">Cost</span>
          <span
            class="text-sm font-semibold text-amber-glow"
            :title="totalCost.estimated ? 'Includes sessions estimated from tokens' : 'Reported by Claude Code'"
          >{{ totalCost.estimated ? "≈" : "" }}{{ formatCost(totalCost.usd) }}</span>
        </div>

        <div class="h-4 w-px bg-ink-border"></div>

        <select
          v-model="hoursFilter"
          aria-label="Time range filter"
          class="bg-ink-mid border border-ink-border rounded px-2.5 py-1 text-xs text-ghost-light focus:border-amber-muted focus:outline-none transition-colors cursor-pointer"
          @change="refresh"
        >
          <option :value="1">1h</option>
          <option :value="4">4h</option>
          <option :value="12">12h</option>
          <option :value="24">24h</option>
        </select>

        <button
          class="px-3 py-1 text-xs border border-ink-border rounded bg-ink-mid text-ghost-light hover:border-amber-muted hover:text-amber-glow transition-all duration-200"
          @click="refresh"
        >
          REFRESH
        </button>
      </div>
    </header>

    <!-- Main content area -->
    <main class="flex flex-1 overflow-hidden relative">
      <!-- Sessions sidebar -->
      <aside
        class="border-r border-ink-border bg-ink-light sidebar-gradient overflow-y-auto custom-scrollbar shrink-0 transition-all duration-300 ease-in-out"
        :class="sidebarCollapsed ? 'w-0 opacity-0 border-r-0' : 'w-80 opacity-100'"
      >
        <div class="p-4" :class="sidebarCollapsed ? 'invisible' : 'visible'">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <span class="text-[0.6rem] uppercase tracking-[0.2em] text-ghost font-semibold">Sessions</span>
              <span class="chip bg-ink-surface text-ghost-light">{{ sessionCount }}</span>
            </div>
            <div v-if="activeSessionCount > 0" class="flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full status-active"></span>
              <span class="text-[0.6rem] text-signal-green">{{ activeSessionCount }} active</span>
            </div>
          </div>
          <AgentList
            :sessions="sortedSessions"
            :selected-id="selectedSessionId"
            :active-subagent-filter="activeSubagentFilter?.name ?? null"
            @select="(id) => { selectedSessionId = id; clearSubagentFilter(); }"
            @filter-by-agent="filterBySubagent"
            @inspect-agent="handleInspectAgent"
            @inspect-session="handleInspectSession"
          />
        </div>
      </aside>

      <!-- Event stream (hero area) -->
      <section class="flex-1 flex flex-col overflow-hidden grid-bg">
        <TimelineFilters
          :search-query="searchQuery"
          :active-event-types="activeEventTypes"
          :known-event-types="knownEventTypes"
          :result-count="filteredEvents.length"
          :subagent-filter-name="activeSubagentFilter?.name ?? null"
          :collapsed="eventStreamCollapsed"
          @update:search-query="searchQuery = $event"
          @toggle-type="toggleEventType"
          @clear-filters="clearFilters"
          @clear-subagent-filter="clearSubagentFilter"
          @toggle-collapse="eventStreamCollapsed = !eventStreamCollapsed"
        />
        <!--
          Cap the swim lane to 18rem so a session with many subagents leaves
          the timeline room. Timeline gets `min-h-0 flex-1` so it actually
          claims the remaining height inside the flex column.
        -->
        <div
          class="shrink-0 overflow-y-auto custom-scrollbar"
          :class="subagentTimelineCollapsed ? '' : 'max-h-72'"
        >
          <SwimLaneChart
            :sessions="sortedSessions"
            :selected-session-id="selectedSessionId"
            :collapsed="subagentTimelineCollapsed"
            @toggle-collapse="subagentTimelineCollapsed = !subagentTimelineCollapsed"
          />
        </div>
        <div v-show="!eventStreamCollapsed" class="flex-1 min-h-0">
          <Timeline
            :key="selectedSessionId ?? 'all'"
            :events="filteredEvents"
            :expanded-event-id="expandedEventId"
            :turns="selectedSessionId ? turns : undefined"
            :session-model="selectedSessionModel"
            @toggle-detail="toggleEventDetail"
          />
        </div>
      </section>
    </main>

    <!-- Bottom status bar -->
    <StatusBar
      :connected="connected"
      :session-count="sessionCount"
      :event-count="filteredEvents.length"
      :active-count="activeSessionCount"
    />

    <!-- Transcript Modal -->
    <TranscriptModal
      v-if="inspectedTarget"
      :target="inspectedTarget"
      @close="inspectedTarget = null"
    />
  </div>
</template>
