import { test, expect } from "bun:test";
import { useAgents } from "../useAgents";
import type { TimelineEvent } from "../../types/events";

function event(id: number, sessionId: string): TimelineEvent {
  return {
    id,
    session_id: sessionId,
    event_type: "PreToolUse",
    tool_name: "Bash",
    tool_input: null,
    created_at: new Date(Date.UTC(2026, 9, 25, 10, 0, id)).toISOString(),
  };
}

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

test("selecting a session shows its own events, not only those in the range-wide list", async () => {
  globalThis.fetch = (async (url: string) => {
    const body = url.startsWith("/api/sessions/old-session/events") ? [event(1, "old-session")] : [];
    return new Response(JSON.stringify(body));
  }) as typeof fetch;
  const agents = useAgents();

  agents.selectedSessionId.value = "old-session";
  await flush();

  expect(agents.filteredEvents.value.map((e) => e.id)).toEqual([1]);
});
