import { computed, type Ref } from "vue";
import type { Session, Subagent } from "../types/events";

export interface ChartBar {
  name: string;
  status: "running" | "completed";
  startPct: number;
  widthPct: number;
  color: string;
  duration: string;
  subagent: Subagent;
}

export interface ChartData {
  bars: ChartBar[];
  timeRange: { start: Date; end: Date };
  timeLabels: string[];
}

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

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function useChartData(
  sessions: Ref<Session[]>,
  selectedSessionId: Ref<string | null>,
) {
  return computed<ChartData | null>(() => {
    const session = selectedSessionId.value
      ? sessions.value.find((s) => s.id === selectedSessionId.value)
      : sessions.value.find((s) => s.subagents && s.subagents.length > 0);

    if (!session?.subagents?.length) return null;

    const subagents = session.subagents;

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

    const timeLabels: string[] = [];
    for (let i = 0; i < 5; i++) {
      const t = new Date(paddedStart + (paddedDuration * i) / 4);
      timeLabels.push(
        t.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
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

    return {
      bars,
      timeRange: { start: new Date(paddedStart), end: new Date(paddedEnd) },
      timeLabels,
    };
  });
}
