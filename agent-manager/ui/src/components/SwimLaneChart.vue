<script setup lang="ts">
import { ref, toRef } from "vue";
import type { Session } from "../types/events";
import type { ChartBar } from "../composables/useChartData";
import { useChartData } from "../composables/useChartData";

const props = defineProps<{
  sessions: Session[];
  selectedSessionId: string | null;
  collapsed?: boolean;
}>();

const emit = defineEmits<{
  "toggle-collapse": [];
}>();

const chartData = useChartData(toRef(props, "sessions"), toRef(props, "selectedSessionId"));

const tooltip = ref<{
  visible: boolean;
  bar: ChartBar | null;
  x: number;
  y: number;
}>({ visible: false, bar: null, x: 0, y: 0 });

function showTooltip(event: MouseEvent, bar: ChartBar) {
  tooltip.value = { visible: true, bar, x: event.clientX, y: event.clientY };
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

const LABEL_WIDTH = 148;
const ROW_HEIGHT = 24;
const ROW_GAP = 6;
const TRACE_HEIGHT = 3;
const NODE_SIZE = 6;
</script>

<template>
  <div v-if="chartData" class="pcb-container px-5 py-4 border-b border-ink-border">
    <!-- Section header -->
    <div class="flex items-center gap-2 mb-3">
      <!-- PCB connector dot -->
      <div class="pcb-header-dot"></div>
      <span class="text-[0.6rem] uppercase tracking-[0.2em] text-[#4ade80]/70 font-semibold font-[family-name:var(--font-mono)]">
        Subagent Timeline
      </span>
      <span class="pcb-chip">{{ chartData.bars.length }}</span>

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

    <!-- Chart body -->
    <div v-show="!collapsed" class="flex">
      <!-- Label column -->
      <div
        class="shrink-0 flex flex-col justify-start"
        :style="{ width: LABEL_WIDTH + 'px' }"
      >
        <!-- Time axis spacer -->
        <div :style="{ height: '20px' }"></div>
        <!-- Labels -->
        <div
          v-for="bar in chartData.bars"
          :key="'label-' + bar.name"
          class="flex items-center overflow-hidden"
          :style="{ height: ROW_HEIGHT + 'px', marginBottom: ROW_GAP + 'px' }"
        >
          <span
            class="text-[0.6rem] truncate font-[family-name:var(--font-mono)]"
            :style="{ color: bar.color, textShadow: '0 0 8px ' + bar.color + '88' }"
            :title="bar.name"
          >
            {{ bar.name }}
          </span>
        </div>
      </div>

      <!-- Chart area (PCB substrate) -->
      <div class="flex-1 min-w-0 pcb-substrate rounded-sm overflow-hidden">
        <!-- Time axis -->
        <div class="relative border-b pcb-axis-border" :style="{ height: '20px' }">
          <div
            v-for="(tick, i) in chartData.ticks"
            :key="'tlabel-' + i"
            class="absolute text-[0.5rem] font-[family-name:var(--font-mono)] -translate-x-1/2"
            :style="{ left: tick.pct + '%', top: '3px', color: '#22c55e66' }"
          >
            {{ tick.label }}
          </div>
          <!-- Tick marks -->
          <div
            v-for="(tick, i) in chartData.ticks"
            :key="'tick-' + i"
            class="absolute bottom-0"
            :style="{ left: tick.pct + '%', width: '1px', height: '5px', backgroundColor: '#22c55e44' }"
          ></div>
        </div>

        <!-- Swim lane rows -->
        <div class="relative px-0" :style="{ paddingTop: '2px' }">
          <div
            v-for="bar in chartData.bars"
            :key="'row-' + bar.name"
            class="relative"
            :style="{ height: ROW_HEIGHT + 'px', marginBottom: ROW_GAP + 'px' }"
          >
            <!-- Vertical grid lines (dotted) -->
            <div
              v-for="(tick, i) in chartData.ticks"
              :key="'vgrid-' + i"
              class="absolute inset-y-0 pcb-vgrid"
              :style="{ left: tick.pct + '%' }"
            ></div>

            <!-- Dashed connector line from left edge to bar start (trace route) -->
            <div
              class="absolute pcb-connector-line"
              :style="{
                left: '0%',
                width: bar.startPct + '%',
                top: '50%',
                transform: 'translateY(-50%)',
              }"
            ></div>

            <!-- The PCB trace bar -->
            <div
              class="absolute cursor-pointer pcb-trace"
              :class="bar.status === 'running' ? 'trace-running' : ''"
              :style="{
                left: bar.startPct + '%',
                width: Math.max(bar.widthPct, 0.5) + '%',
                top: '50%',
                transform: 'translateY(-50%)',
                height: TRACE_HEIGHT + 'px',
                backgroundColor: bar.color,
                boxShadow: '0 0 6px ' + bar.color + '99',
                minWidth: '4px',
              }"
              @mouseenter="showTooltip($event, bar)"
              @mousemove="moveTooltip($event)"
              @mouseleave="hideTooltip"
            >
            </div>

            <!-- Start solder pad (filled circle) -->
            <div
              class="absolute pcb-node-start"
              :style="{
                left: 'calc(' + bar.startPct + '% - ' + (NODE_SIZE / 2) + 'px)',
                top: '50%',
                transform: 'translateY(-50%)',
                width: NODE_SIZE + 'px',
                height: NODE_SIZE + 'px',
                backgroundColor: bar.color,
                boxShadow: '0 0 5px ' + bar.color,
              }"
            ></div>

            <!-- End node: open circle (completed) or pulsing filled (running) -->
            <div
              class="absolute"
              :class="bar.status === 'running' ? 'pcb-node-running' : 'pcb-node-end'"
              :style="{
                left: 'calc(' + (bar.startPct + bar.widthPct) + '% - ' + (NODE_SIZE / 2) + 'px)',
                top: '50%',
                transform: 'translateY(-50%)',
                width: NODE_SIZE + 'px',
                height: NODE_SIZE + 'px',
                borderColor: bar.color,
                backgroundColor: bar.status === 'running' ? bar.color : 'transparent',
                boxShadow: bar.status === 'running' ? '0 0 8px ' + bar.color : 'none',
              }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tooltip -->
    <Teleport to="body">
      <div
        v-if="tooltip.visible && tooltip.bar"
        class="fixed z-50 pointer-events-none"
        :style="{ left: tooltip.x + 14 + 'px', top: tooltip.y - 10 + 'px' }"
      >
        <div class="pcb-tooltip px-3 py-2 text-[0.65rem] font-[family-name:var(--font-mono)]" style="min-width: 170px">
          <div class="font-semibold mb-1.5" :style="{ color: tooltip.bar.color, textShadow: '0 0 8px ' + tooltip.bar.color + '88' }">
            {{ tooltip.bar.name }}
          </div>
          <div class="flex items-center justify-between gap-4" style="color: #4ade8066">
            <span>Duration</span>
            <span style="color: #bbf7d0">{{ tooltip.bar.duration }}</span>
          </div>
          <div class="flex items-center justify-between gap-4 mt-0.5" style="color: #4ade8066">
            <span>Status</span>
            <span :style="{ color: tooltip.bar.status === 'running' ? '#22c55e' : '#86efac' }">
              {{ tooltip.bar.status }}
            </span>
          </div>
          <div
            v-if="tooltip.bar.subagent.subagent_type"
            class="flex items-center justify-between gap-4 mt-0.5"
            style="color: #4ade8066"
          >
            <span>Type</span>
            <span style="color: #bbf7d0">{{ tooltip.bar.subagent.subagent_type }}</span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* PCB dark substrate background with dotted copper-layer grid */
.pcb-container {
  background-color: #0a120e;
}

.pcb-substrate {
  background-color: #0d1a10;
  background-image: radial-gradient(circle, #1a3020 1px, transparent 1px);
  background-size: 12px 12px;
}

.pcb-axis-border {
  border-color: #1a3020;
}

.pcb-vgrid {
  width: 1px;
  background: repeating-linear-gradient(
    to bottom,
    #1a3020 0px,
    #1a3020 2px,
    transparent 2px,
    transparent 6px
  );
}

/* Dashed trace route line from label edge to bar start */
.pcb-connector-line {
  height: 1px;
  background: repeating-linear-gradient(
    to right,
    #1e3a22 0px,
    #1e3a22 4px,
    transparent 4px,
    transparent 8px
  );
}

/* PCB trace bar — flat, no border-radius */
.pcb-trace {
  border-radius: 0;
  transition: height 0.15s ease;
}

.pcb-trace:hover {
  height: 5px !important;
}

/* Start pad: filled circle (solder pad) */
.pcb-node-start {
  border-radius: 50%;
  pointer-events: none;
}

/* End node: open ring for completed */
.pcb-node-end {
  border-radius: 50%;
  border-width: 1.5px;
  border-style: solid;
  pointer-events: none;
}

/* End node: pulsing filled for running (signal traveling) */
.pcb-node-running {
  border-radius: 50%;
  border-width: 1.5px;
  border-style: solid;
  pointer-events: none;
  animation: signal-pulse 1.2s ease-in-out infinite;
}

@keyframes signal-pulse {
  0%, 100% {
    opacity: 1;
    transform: translateY(-50%) scale(1);
  }
  50% {
    opacity: 0.5;
    transform: translateY(-50%) scale(1.4);
  }
}

.trace-running {
  animation: trace-active 1.5s ease-in-out infinite;
}

@keyframes trace-active {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.65;
  }
}

/* PCB-styled chip badge */
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

/* PCB header accent dot */
.pcb-header-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}

/* Tooltip styled as PCB label */
.pcb-tooltip {
  background-color: #0a150d;
  border: 1px solid #1a3a22;
  box-shadow: 0 0 12px #00ff0018, 0 4px 16px rgba(0, 0, 0, 0.6);
}
</style>
