import { ref, computed, watch, onMounted } from "vue";
import type { Session, TimelineEvent, WsMessage } from "../types/events";
import { calculateCost } from "../utils/pricing";

export function useAgents(messages: { value: WsMessage[] }) {
  const sessions = ref<Map<string, Session>>(new Map());
  const events = ref<TimelineEvent[]>([]);
  const selectedSessionId = ref<string | null>(null);
  const hoursFilter = ref(4);

  // F2: Search & filter state
  const searchQuery = ref("");
  const activeEventTypes = ref<Set<string>>(new Set());

  // F3: Event detail expansion
  const expandedEventId = ref<number | null>(null);

  // Subagent filter state
  const activeSubagentFilter = ref<{
    sessionId: string;
    name: string;
    dispatchedAt: string;
    completedAt: string | null;
  } | null>(null);

  function filterBySubagent(sessionId: string, agentName: string) {
    if (
      activeSubagentFilter.value?.sessionId === sessionId &&
      activeSubagentFilter.value?.name === agentName
    ) {
      activeSubagentFilter.value = null;
      return;
    }

    const session = sessions.value.get(sessionId);
    if (!session?.subagents) return;

    const agent = session.subagents.find((a) => a.name === agentName);
    if (!agent) return;

    selectedSessionId.value = sessionId;

    activeSubagentFilter.value = {
      sessionId,
      name: agentName,
      dispatchedAt: agent.dispatched_at,
      completedAt: agent.completed_at,
    };
  }

  function clearSubagentFilter() {
    activeSubagentFilter.value = null;
  }

  async function fetchSessions() {
    const res = await fetch(`/api/sessions?hours=${hoursFilter.value}`);
    const data: Session[] = await res.json();
    sessions.value = new Map(data.map((s) => [s.id, { ...s, event_count: Number(s.event_count) || 0 }]));
  }

  async function fetchEvents() {
    const since = new Date(Date.now() - hoursFilter.value * 60 * 60 * 1000).toISOString();
    const res = await fetch(`/api/events?since=${since}&limit=500`);
    events.value = await res.json();
  }

  function processMessage(msg: WsMessage) {
    switch (msg.type) {
      case "session_created": {
        sessions.value.set(msg.data.id, { ...msg.data, event_count: 0, subagents: [] });
        break;
      }
      case "new_event": {
        events.value.unshift(msg.data);
        const session = sessions.value.get(msg.data.session_id);
        if (session) {
          session.last_seen = msg.data.created_at;
          session.status = "active";
          session.last_tool = msg.data.tool_name;
          session.event_count = Number(session.event_count ?? 0) + 1;

          // Real-time subagent tracking
          if (msg.data.event_type === "PreToolUse" && msg.data.tool_name === "Agent" && msg.data.tool_input) {
            if (!session.subagents) session.subagents = [];
            session.subagents.push({
              name: (msg.data.tool_input.name as string) ?? `agent-${session.subagents.length + 1}`,
              description: (msg.data.tool_input.description as string) ?? "",
              subagent_type: (msg.data.tool_input.subagent_type as string) ?? null,
              agent_type: null,
              agent_id: null,
              status: "running",
              dispatched_at: msg.data.created_at,
              completed_at: null,
              permission_mode: null,
              last_message: null,
              run_in_background: (msg.data.tool_input.run_in_background as boolean) ?? false,
            });
          }

          if (msg.data.event_type === "SubagentStop" && session.subagents) {
            const running = session.subagents.find((a) => a.status === "running");
            if (running) {
              running.status = "completed";
              running.completed_at = msg.data.created_at;
              if (msg.data.tool_input) {
                running.agent_id = (msg.data.tool_input.agent_id as string) ?? null;
                running.agent_type = (msg.data.tool_input.agent_type as string) ?? null;
              }
            }
          }
        }
        break;
      }
      case "session_status_changed": {
        const session = sessions.value.get(msg.data.id);
        if (session) session.status = msg.data.status as Session["status"];
        break;
      }
      case "session_enriched": {
        const session = sessions.value.get(msg.data.id);
        if (session && msg.data.model) session.model = msg.data.model;
        break;
      }
      case "session_metrics": {
        const session = sessions.value.get(msg.data.id);
        if (session) session.tokens = msg.data.tokens;
        break;
      }
    }
  }

  watch(
    () => messages.value.length,
    (newLen, oldLen) => {
      for (let i = oldLen ?? 0; i < newLen; i++) {
        processMessage(messages.value[i]);
      }
    },
  );

  // F1: Total cost across all sessions
  const totalCost = computed(() => {
    let sum = 0;
    for (const s of sessions.value.values()) {
      sum += calculateCost(s.tokens, s.model);
    }
    return sum;
  });

  const filteredEvents = computed(() => {
    let result = events.value;

    // Session filter
    if (selectedSessionId.value) {
      result = result.filter((e) => e.session_id === selectedSessionId.value);
    }

    // Subagent time-range filter
    if (activeSubagentFilter.value) {
      const start = new Date(activeSubagentFilter.value.dispatchedAt).getTime();
      const end = activeSubagentFilter.value.completedAt
        ? new Date(activeSubagentFilter.value.completedAt).getTime()
        : Date.now();
      result = result.filter((e) => {
        if (e.session_id !== activeSubagentFilter.value!.sessionId) return false;
        const t = new Date(e.created_at).getTime();
        return t >= start && t <= end;
      });
    }

    // F2: Event type filter
    if (activeEventTypes.value.size > 0) {
      result = result.filter((e) => activeEventTypes.value.has(e.event_type));
    }

    // F2: Text search
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase();
      result = result.filter((e) => {
        if (e.tool_name?.toLowerCase().includes(q)) return true;
        if (e.event_type.toLowerCase().includes(q)) return true;
        if (e.tool_input) {
          const vals = Object.values(e.tool_input);
          for (const v of vals) {
            if (typeof v === "string" && v.toLowerCase().includes(q)) return true;
          }
        }
        return false;
      });
    }

    return result;
  });

  // F2: Known event types across all events
  const knownEventTypes = computed(() => {
    const types = new Set<string>();
    for (const e of events.value) types.add(e.event_type);
    return Array.from(types).sort();
  });

  function toggleEventType(type: string) {
    const set = new Set(activeEventTypes.value);
    if (set.has(type)) set.delete(type);
    else set.add(type);
    activeEventTypes.value = set;
  }

  function clearFilters() {
    searchQuery.value = "";
    activeEventTypes.value = new Set();
  }

  // F3: Toggle event detail panel
  function toggleEventDetail(id: number) {
    expandedEventId.value = expandedEventId.value === id ? null : id;
  }

  const sortedSessions = computed(() => {
    return Array.from(sessions.value.values()).sort(
      (a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime(),
    );
  });

  onMounted(() => {
    fetchSessions();
    fetchEvents();
  });

  return {
    sessions,
    sortedSessions,
    events,
    filteredEvents,
    selectedSessionId,
    hoursFilter,
    fetchSessions,
    fetchEvents,
    totalCost,
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
  };
}
