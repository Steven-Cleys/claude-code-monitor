import { computed, ref, type Ref } from "vue";
import type { TimelineEvent, WsMessage } from "../types/events";
import { getToolVisual, type ToolVisual } from "../utils/tool-config";

export interface ToolTimelineNode {
  eventId: number;
  toolName: string;
  visual: ToolVisual;
  runningCount: number;
  sessionId: string;
  timestamp: string;
  detail: string;
}

const MAX_NODES = 500;

function extractDetail(toolInput: Record<string, unknown> | null): string {
  if (!toolInput) return "";
  if (typeof toolInput.command === "string") return toolInput.command.slice(0, 60);
  if (typeof toolInput.file_path === "string") return toolInput.file_path;
  if (typeof toolInput.pattern === "string") return toolInput.pattern;
  if (typeof toolInput.query === "string") return toolInput.query.slice(0, 60);
  if (typeof toolInput.description === "string") return toolInput.description.slice(0, 60);
  if (typeof toolInput.prompt === "string") return toolInput.prompt.slice(0, 60);
  return "";
}

export function useToolTimeline(
  events: Ref<TimelineEvent[]>,
  _messages: Ref<WsMessage[]>,
  selectedSessionId: Ref<string | null>,
  hoursFilter: Ref<number>,
) {
  const activeToolFilters = ref<Set<string>>(new Set());
  const showCounts = ref(false);

  const allNodes = computed<ToolTimelineNode[]>(() => {
    const cutoff = new Date(Date.now() - hoursFilter.value * 60 * 60 * 1000).getTime();
    const preToolEvents = events.value
      .filter((e) => e.event_type === "PreToolUse" && e.tool_name != null && new Date(e.created_at).getTime() >= cutoff)
      .slice(0, MAX_NODES)
      .reverse();

    const runningCounts = new Map<string, number>();
    return preToolEvents.map((e) => {
      const toolName = e.tool_name!;
      const count = (runningCounts.get(toolName) ?? 0) + 1;
      runningCounts.set(toolName, count);
      return {
        eventId: e.id,
        toolName,
        visual: getToolVisual(toolName),
        runningCount: count,
        sessionId: e.session_id,
        timestamp: e.created_at,
        detail: extractDetail(e.tool_input),
      };
    });
  });

  const toolCounts = computed<Map<string, number>>(() => {
    const counts = new Map<string, number>();
    for (const node of allNodes.value) {
      counts.set(node.toolName, (counts.get(node.toolName) ?? 0) + 1);
    }
    return counts;
  });

  const filteredNodes = computed<ToolTimelineNode[]>(() => {
    return allNodes.value.filter((node) => {
      if (selectedSessionId.value && node.sessionId !== selectedSessionId.value) return false;
      if (activeToolFilters.value.size > 0 && !activeToolFilters.value.has(node.toolName)) return false;
      return true;
    });
  });

  const knownToolTypes = computed<string[]>(() => {
    const names = new Set<string>();
    for (const node of allNodes.value) names.add(node.toolName);
    return Array.from(names).sort();
  });

  function toggleToolFilter(toolName: string) {
    const next = new Set(activeToolFilters.value);
    if (next.has(toolName)) next.delete(toolName);
    else next.add(toolName);
    activeToolFilters.value = next;
  }

  function clearToolFilters() {
    activeToolFilters.value = new Set();
  }

  function toggleCounts() {
    showCounts.value = !showCounts.value;
  }

  return {
    toolCounts,
    activeToolFilters,
    showCounts,
    allNodes,
    filteredNodes,
    knownToolTypes,
    toggleToolFilter,
    clearToolFilters,
    toggleCounts,
  };
}
