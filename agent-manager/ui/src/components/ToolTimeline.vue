<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import type { TimelineEvent, WsMessage } from "../types/events";
import { useToolTimeline } from "../composables/useToolTimeline";
import { getToolVisual } from "../utils/tool-config";
import { formatTime } from "../utils/format";
import type { ToolTimelineNode } from "../composables/useToolTimeline";

const props = defineProps<{
  events: TimelineEvent[];
  messages: WsMessage[];
  selectedSessionId: string | null;
  hoursFilter: number;
  collapsed?: boolean;
}>();

const emit = defineEmits<{
  "scroll-to-event": [eventId: number];
  "toggle-collapse": [];
}>();

const eventsRef = computed(() => props.events);
const messagesRef = computed(() => props.messages);
const sessionRef = computed(() => props.selectedSessionId);
const hoursFilterRef = computed(() => props.hoursFilter);

const {
  filteredNodes,
  knownToolTypes,
  toolCounts,
  activeToolFilters,
  showCounts,
  toggleToolFilter,
  clearToolFilters,
  toggleCounts,
} = useToolTimeline(eventsRef, messagesRef, sessionRef, hoursFilterRef);

// Scrolling
const scrollContainer = ref<HTMLElement | null>(null);
const isAtEnd = ref(true);

function handleScroll() {
  const el = scrollContainer.value;
  if (!el) return;
  isAtEnd.value = el.scrollLeft >= el.scrollWidth - el.clientWidth - 40;
}

function scrollToNow() {
  const el = scrollContainer.value;
  if (!el) return;
  el.scrollLeft = el.scrollWidth;
  isAtEnd.value = true;
}

watch(
  () => filteredNodes.value.length,
  () => {
    if (isAtEnd.value) {
      nextTick(() => scrollToNow());
    }
  },
);

// Tooltip
const tooltip = ref<{
  visible: boolean;
  node: ToolTimelineNode | null;
  x: number;
  y: number;
}>({ visible: false, node: null, x: 0, y: 0 });

function showTooltip(event: MouseEvent, node: ToolTimelineNode) {
  tooltip.value = { visible: true, node, x: event.clientX, y: event.clientY };
}

function moveTooltip(event: MouseEvent) {
  if (tooltip.value.visible) {
    tooltip.value.x = event.clientX;
    tooltip.value.y = event.clientY;
  }
}

function hideTooltip() {
  tooltip.value.visible = false;
}

// Gap detection — gap if > 5 seconds between nodes
function hasGapBefore(index: number): boolean {
  if (index === 0) return false;
  const prev = filteredNodes.value[index - 1];
  const curr = filteredNodes.value[index];
  const diff = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
  return diff > 5000;
}

// Timestamp display
function shouldShowTime(index: number): boolean {
  if (index === 0) return true;
  if (hasGapBefore(index)) return true;
  if (index % 10 === 0) return true;
  return false;
}

function isAgentNode(node: ToolTimelineNode): boolean {
  return node.toolName === "Agent";
}

function nodeColor(node: ToolTimelineNode): string {
  return getToolVisual(node.toolName).color;
}
</script>

<template>
  <div v-if="filteredNodes.length > 0" class="pcb-container px-5 py-4 border-b border-ink-border">
    <!-- Header row -->
    <div class="flex items-center gap-2 mb-2 flex-wrap">
      <div class="pcb-header-dot"></div>
      <span class="text-[0.6rem] uppercase tracking-[0.2em] text-[#4ade80]/70 font-semibold font-[family-name:var(--font-mono)]">
        Tool Timeline
      </span>
      <span class="pcb-chip">{{ filteredNodes.length }}</span>

      <!-- # toggle button -->
      <button
        v-if="!collapsed"
        class="text-[0.55rem] font-[family-name:var(--font-mono)] px-1.5 py-0.5 border transition-colors"
        :class="showCounts
          ? 'border-[#22c55e] text-[#22c55e] bg-[#0d2018]'
          : 'border-[#1a3020] text-[#4ade80]/40 hover:border-[#22c55e]/50 hover:text-[#4ade80]/70'"
        @click="toggleCounts"
      >
        #
      </button>

      <!-- Clear filters button -->
      <button
        v-if="!collapsed && activeToolFilters.size > 0"
        class="text-[0.55rem] font-[family-name:var(--font-mono)] px-1.5 py-0.5 border border-[#1a3020] text-[#4ade80]/60 hover:border-[#22c55e]/50 hover:text-[#4ade80]/80 transition-colors"
        @click="clearToolFilters"
      >
        clear
      </button>

      <!-- Collapse toggle -->
      <button
        class="ml-auto text-[#4ade80]/60 hover:text-[#4ade80] transition-colors p-0.5"
        :title="collapsed ? 'Expand' : 'Collapse'"
        @click="emit('toggle-collapse')"
      >
        <svg
          class="w-3 h-3 transition-transform duration-200"
          :class="{ '-rotate-90': collapsed }"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M3 4.5l3 3 3-3" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>

    <!-- Filter chips row -->
    <div v-show="!collapsed" class="flex items-center gap-1 flex-wrap mb-3">
      <button
        v-for="toolName in knownToolTypes"
        :key="toolName"
        class="text-[0.5rem] font-[family-name:var(--font-mono)] px-1.5 py-0.5 border transition-all"
        :class="activeToolFilters.has(toolName)
          ? 'opacity-100'
          : 'opacity-50 hover:opacity-75'"
        :style="{
          borderColor: activeToolFilters.has(toolName)
            ? getToolVisual(toolName).color
            : '#1a3020',
          color: getToolVisual(toolName).color,
          backgroundColor: activeToolFilters.has(toolName) ? '#0d2018' : 'transparent',
        }"
        @click="toggleToolFilter(toolName)"
      >
        <span v-if="getToolVisual(toolName).emoji" class="mr-0.5">{{ getToolVisual(toolName).emoji }}</span>{{ toolName }}
        <span v-if="toolCounts.get(toolName)" class="ml-0.5 opacity-60">
          {{ toolCounts.get(toolName) }}
        </span>
      </button>
    </div>

    <!-- Scrollable strip -->
    <div v-show="!collapsed" class="relative">
      <div
        ref="scrollContainer"
        class="overflow-x-auto pcb-substrate rounded-sm py-3 px-2"
        @scroll="handleScroll"
      >
        <div class="flex items-end gap-0" style="min-width: max-content">
          <template v-for="(node, index) in filteredNodes" :key="node.eventId">
            <!-- Gap indicator (dashed line) -->
            <div
              v-if="hasGapBefore(index)"
              class="flex-shrink-0 self-center mx-1"
              style="width: 20px; height: 1px; background: repeating-linear-gradient(to right, #1e3a22 0px, #1e3a22 3px, transparent 3px, transparent 6px);"
            ></div>

            <!-- Node column -->
            <div
              class="flex flex-col items-center cursor-pointer flex-shrink-0"
              style="width: 28px;"
              @mouseenter="showTooltip($event, node)"
              @mousemove="moveTooltip($event)"
              @mouseleave="hideTooltip"
              @click="emit('scroll-to-event', node.eventId)"
            >
              <!-- Running count -->
              <span
                v-if="showCounts"
                class="text-[0.45rem] font-[family-name:var(--font-mono)] mb-0.5"
                :style="{ color: nodeColor(node) + '88' }"
              >
                {{ node.runningCount }}
              </span>

              <!-- Circle node -->
              <div
                class="rounded-full flex items-center justify-center flex-shrink-0 transition-transform hover:scale-110"
                :class="isAgentNode(node) ? 'pcb-node-agent' : ''"
                :style="{
                  width: isAgentNode(node) ? '26px' : '22px',
                  height: isAgentNode(node) ? '26px' : '22px',
                  backgroundColor: nodeColor(node) + '22',
                  border: '1.5px solid ' + nodeColor(node),
                  boxShadow: isAgentNode(node)
                    ? '0 0 10px ' + nodeColor(node) + '66'
                    : '0 0 4px ' + nodeColor(node) + '33',
                  fontSize: '0.65rem',
                  lineHeight: 1,
                }"
              >
                <span v-if="node.visual.emoji">{{ node.visual.emoji }}</span>
                <span
                  v-else
                  class="font-[family-name:var(--font-mono)] font-bold"
                  :style="{ color: nodeColor(node), fontSize: node.visual.letter.length > 1 ? '0.4rem' : '0.55rem' }"
                >
                  {{ node.visual.letter }}
                </span>
              </div>

              <!-- Timestamp -->
              <span
                v-if="shouldShowTime(index)"
                class="text-[0.4rem] font-[family-name:var(--font-mono)] mt-0.5 whitespace-nowrap"
                style="color: #4ade8044;"
              >
                {{ formatTime(node.timestamp) }}
              </span>
              <div v-else style="height: 10px;"></div>
            </div>
          </template>
        </div>
      </div>

      <!-- Scroll to now button -->
      <button
        v-if="!isAtEnd && filteredNodes.length > 20"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-[0.55rem] font-[family-name:var(--font-mono)] px-2 py-1 border border-[#22c55e]/50 text-[#4ade80] bg-[#0a120e] hover:bg-[#0d2018] transition-colors z-10"
        @click="scrollToNow"
      >
        → now
      </button>
    </div>
  </div>

  <!-- Tooltip (teleported to body) -->
  <Teleport to="body">
    <div
      v-if="tooltip.visible && tooltip.node"
      class="fixed z-50 pointer-events-none"
      :style="{ left: tooltip.x + 14 + 'px', top: tooltip.y - 10 + 'px' }"
    >
      <div class="pcb-tooltip px-3 py-2 text-[0.65rem] font-[family-name:var(--font-mono)]" style="min-width: 180px">
        <div
          class="font-semibold mb-1.5 flex items-center gap-1"
          :style="{
            color: nodeColor(tooltip.node),
            textShadow: '0 0 8px ' + nodeColor(tooltip.node) + '88',
          }"
        >
          <span v-if="tooltip.node.visual.emoji">{{ tooltip.node.visual.emoji }}</span>
          {{ tooltip.node.toolName }}
        </div>

        <div
          v-if="tooltip.node.detail"
          class="mb-1.5 truncate"
          style="color: #bbf7d0; max-width: 220px;"
          :title="tooltip.node.detail"
        >
          {{ tooltip.node.detail.slice(0, 40) }}{{ tooltip.node.detail.length > 40 ? '…' : '' }}
        </div>

        <div class="flex items-center justify-between gap-4" style="color: #4ade8066">
          <span>Time</span>
          <span style="color: #bbf7d0">{{ formatTime(tooltip.node.timestamp) }}</span>
        </div>
        <div class="flex items-center justify-between gap-4 mt-0.5" style="color: #4ade8066">
          <span>Session</span>
          <span style="color: #bbf7d0">{{ tooltip.node.sessionId.slice(0, 8) }}</span>
        </div>
        <div class="flex items-center justify-between gap-4 mt-0.5" style="color: #4ade8066">
          <span>Call #</span>
          <span style="color: #bbf7d0">{{ tooltip.node.runningCount }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pcb-container {
  background-color: #0a120e;
}

.pcb-substrate {
  background-color: #0d1a10;
  background-image: radial-gradient(circle, #1a3020 1px, transparent 1px);
  background-size: 12px 12px;
}

.pcb-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  height: 14px;
  font-size: 0.5rem;
  background-color: #0d2018;
  border: 1px solid #1a3020;
  color: #4ade80;
  font-family: var(--font-mono);
  letter-spacing: 0.05em;
}

.pcb-header-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}

.pcb-tooltip {
  background-color: #0a150d;
  border: 1px solid #1a3a22;
  box-shadow: 0 0 12px #00ff0018, 0 4px 16px rgba(0, 0, 0, 0.6);
}

.pcb-node-agent {
  animation: agent-pulse 2s ease-in-out infinite;
}

@keyframes agent-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}
</style>
