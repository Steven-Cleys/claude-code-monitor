import { computed, type Ref } from "vue";
import type { Session, Subagent } from "../types/events";
import { formatTime, formatDuration } from "../utils/format";

export interface ChartBar {
  name: string;
  status: "running" | "completed";
  startPct: number;
  widthPct: number;
  color: string;
  duration: string;
  subagent: Subagent;
}

export interface ChartTick {
  label: string;
  pct: number;
}

export interface ChartData {
  bars: ChartBar[];
  ticks: ChartTick[];
}

const TICK_COUNT = 5;

const COLORS = [
  "#f59e0b",
  "#60a5fa",
  "#a78bfa",
  "#22c55e",
  "#e879f9",
  "#34d399",
  "#f87171",
  "#fbbf24",
];

export function useChartData(
  sessions: Ref<Session[]>,
  selectedSessionId: Ref<string | null>,
) {
  return computed<ChartData | null>(() => {
    // Gather subagents from all sessions (or just selected session if filtered)
    const targetSessions = selectedSessionId.value
      ? sessions.value.filter((s) => s.id === selectedSessionId.value)
      : sessions.value;

    const subagents = targetSessions.flatMap((s) => s.subagents ?? []);
    if (!subagents.length) return null;

    const starts = subagents.map((a) => new Date(a.dispatched_at).getTime());
    const ends = subagents.map((a) =>
      a.completed_at ? new Date(a.completed_at).getTime() : Date.now(),
    );
    const rangeStart = Math.min(...starts);
    const rangeEnd = Math.max(...ends);
    const rangeDuration = rangeEnd - rangeStart || 1;

    const padding = rangeDuration * 0.05 || 1000;
    const paddedStart = rangeStart - padding;
    const paddedEnd = rangeEnd + padding;
    const paddedDuration = paddedEnd - paddedStart;

    const ticks: ChartTick[] = [];
    for (let i = 0; i < TICK_COUNT; i++) {
      const fraction = i / (TICK_COUNT - 1);
      ticks.push({ label: formatTime(new Date(paddedStart + paddedDuration * fraction)), pct: fraction * 100 });
    }

    const bars: ChartBar[] = subagents.map((agent, i) => {
      const start = new Date(agent.dispatched_at).getTime();
      const end = agent.completed_at
        ? new Date(agent.completed_at).getTime()
        : Date.now();
      return {
        name: agent.name,
        status: agent.status,
        startPct: ((start - paddedStart) / paddedDuration) * 100,
        widthPct: ((end - start) / paddedDuration) * 100,
        color: COLORS[i % COLORS.length],
        duration: formatDuration(end - start),
        subagent: agent,
      };
    });

    return { bars, ticks };
  });
}
