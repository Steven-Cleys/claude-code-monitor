import { test, expect, beforeEach } from "bun:test";
import { useAgents } from "../useAgents";
import type { Session, SubagentMetadata, TimelineEvent } from "../../types/events";

const at = (sec: number) => new Date(Date.UTC(2026, 9, 25, 10, 0, sec)).toISOString();

const metadata: SubagentMetadata = {
  model: "claude-sonnet-5-5",
  total_input_tokens: 10,
  total_output_tokens: 20,
  cache_read_tokens: 30,
  cache_creation_tokens: 40,
  tool_call_count: 3,
};

let agents: ReturnType<typeof useAgents>;
let nextId = 1;

function hook(sec: number, fields: Partial<TimelineEvent>) {
  agents.processMessage({
    type: "new_event",
    data: {
      id: nextId++,
      session_id: "s1",
      event_type: "PreToolUse",
      tool_name: null,
      tool_input: null,
      created_at: at(sec),
      ...fields,
    },
  });
}

const session = () => agents.sessions.value.get("s1")!;
// toMatchObject does not see through Vue's reactive proxy.
const plainSession = () => JSON.parse(JSON.stringify(session()));

beforeEach(() => {
  globalThis.fetch = (async () => new Response("[]")) as unknown as typeof fetch;
  agents = useAgents();
  agents.processMessage({
    type: "session_created",
    data: {
      id: "s1",
      model: null,
      cwd: null,
      permission_mode: null,
      status: "idle",
      first_seen: at(0),
      last_seen: at(0),
    } as unknown as Session,
  });
});

test("a new session starts with no events, no subagents and no attention", () => {
  expect(plainSession()).toMatchObject({ event_count: 0, subagents: [], needs_attention: false, attention_since: null });
});

test("a dispatched agent runs, gets its id at SubagentStart and completes at SubagentStop", () => {
  hook(1, { tool_name: "Agent", tool_input: { name: "Explore", description: "look around", subagent_type: "general-purpose" } });
  hook(2, { event_type: "SubagentStart", agent_id: "agent-1", agent_type: "general-purpose" });
  agents.processMessage({ type: "subagent_metadata_updated", data: { session_id: "s1", agent_id: "late", metadata } });
  hook(9, { event_type: "SubagentStop", agent_id: "agent-1" });

  expect(session().subagents).toEqual([
    {
      name: "Explore",
      description: "look around",
      subagent_type: "general-purpose",
      agent_type: "general-purpose",
      agent_id: "agent-1",
      status: "completed",
      dispatched_at: at(1),
      completed_at: at(9),
      permission_mode: null,
      last_message: null,
      run_in_background: false,
    },
  ]);
});

test("metadata that arrives before the stop is applied when the agent completes", () => {
  hook(1, { event_type: "SubagentStart", agent_id: "early" });
  agents.processMessage({ type: "subagent_metadata_updated", data: { session_id: "other", agent_id: "early", metadata } });
  hook(5, { event_type: "SubagentStop", agent_id: "early" });

  expect(session().subagents![0]!.metadata).toEqual(metadata);
});

test("a start without a dispatch shows up as a running row named by its id", () => {
  hook(1, { event_type: "SubagentStart", agent_id: "abcdef0123456789", agent_type: "workflow" });

  expect(session().subagents).toEqual([
    {
      name: "23456789",
      description: "",
      subagent_type: null,
      agent_type: "workflow",
      agent_id: "abcdef0123456789",
      status: "running",
      dispatched_at: at(1),
      completed_at: null,
      permission_mode: null,
      last_message: null,
      run_in_background: false,
    },
  ]);
});

test("a stop-only agent appears only once its metadata proves it is real", () => {
  hook(4, { event_type: "SubagentStop", agent_id: "stoponly-12345678" });
  expect(session().subagents).toEqual([]);

  agents.processMessage({ type: "subagent_metadata_updated", data: { session_id: "s1", agent_id: "stoponly-12345678", metadata } });

  expect(session().subagents).toEqual([
    {
      name: "12345678",
      description: "",
      subagent_type: null,
      agent_type: null,
      agent_id: "stoponly-12345678",
      status: "completed",
      dispatched_at: at(4),
      completed_at: at(4),
      permission_mode: null,
      last_message: null,
      run_in_background: false,
      metadata,
    },
  ]);
});

test("passive events count but do not wake an idle session", () => {
  hook(1, { event_type: "Notification" });
  expect(plainSession()).toMatchObject({ status: "idle", event_count: 1 });

  hook(2, { tool_name: "Bash" });
  expect(plainSession()).toMatchObject({ status: "active", event_count: 2, last_tool: "Bash", last_seen: at(2) });
});
