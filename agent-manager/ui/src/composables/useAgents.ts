import { ref, computed, watch, onMounted } from "vue";
import type { Session, TimelineEvent, WsMessage } from "../types/events";

export function useAgents(messages: { value: WsMessage[] }) {
  const sessions = ref<Map<string, Session>>(new Map());
  const events = ref<TimelineEvent[]>([]);
  const selectedSessionId = ref<string | null>(null);
  const hoursFilter = ref(4);

  async function fetchSessions() {
    const res = await fetch(`/api/sessions?hours=${hoursFilter.value}`);
    const data: Session[] = await res.json();
    sessions.value = new Map(data.map((s) => [s.id, s]));
  }

  async function fetchEvents() {
    const since = new Date(Date.now() - hoursFilter.value * 60 * 60 * 1000).toISOString();
    const res = await fetch(`/api/events?since=${since}&limit=500`);
    events.value = await res.json();
  }

  function processMessage(msg: WsMessage) {
    switch (msg.type) {
      case "session_created": {
        sessions.value.set(msg.data.id, { ...msg.data, event_count: 0 });
        break;
      }
      case "new_event": {
        events.value.unshift(msg.data);
        const session = sessions.value.get(msg.data.session_id);
        if (session) {
          session.last_seen = msg.data.created_at;
          session.status = "active";
          session.last_tool = msg.data.tool_name;
          session.event_count = (session.event_count ?? 0) + 1;
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

  const filteredEvents = computed(() => {
    if (!selectedSessionId.value) return events.value;
    return events.value.filter((e) => e.session_id === selectedSessionId.value);
  });

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
  };
}
