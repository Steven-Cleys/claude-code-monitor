import { test, expect, describe } from "bun:test";
import { buildSubagents } from "../services/subagent-enricher";

describe("buildSubagents", () => {
  test("includes a stop-only subagent (SubagentStop, no SubagentStart) as a completed row", () => {
    const result = buildSubagents({
      starts: [],
      dispatches: [],
      stops: [
        {
          agent_id: "abc123def456",
          agent_type: "",
          permission_mode: "bypassPermissions",
          last_message: "done",
          completed_at: "2026-07-06T09:00:00.000Z",
        },
      ],
      metadataRows: [
        {
          agent_id: "abc123def456",
          model: "claude-opus-4-8",
          total_input_tokens: 100,
          total_output_tokens: 50,
          cache_read_tokens: 10,
          cache_creation_tokens: 5,
          tool_call_count: 3,
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      agent_id: "abc123def456",
      status: "completed",
      completed_at: "2026-07-06T09:00:00.000Z",
    });
    expect(result[0].metadata?.tool_call_count).toBe(3);
  });

  test("filters phantom stop-only rows (empty agent_type AND no metadata)", () => {
    const result = buildSubagents({
      starts: [],
      dispatches: [],
      stops: [
        {
          agent_id: "a35f347e80541b602",
          agent_type: "",
          permission_mode: "bypassPermissions",
          last_message: "while they're running, also count the Python files",
          completed_at: "2026-07-19T17:37:12.000Z",
        },
      ],
      metadataRows: [],
    });

    expect(result).toHaveLength(0);
  });

  test("keeps a typed stop-only row even without metadata", () => {
    const result = buildSubagents({
      starts: [],
      dispatches: [],
      stops: [
        {
          agent_id: "abc123def456",
          agent_type: "general-purpose",
          permission_mode: null,
          last_message: null,
          completed_at: "2026-07-19T17:37:12.000Z",
        },
      ],
      metadataRows: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0].agent_type).toBe("general-purpose");
  });

  test("does not duplicate a subagent that has both a start and a stop", () => {
    const result = buildSubagents({
      starts: [
        { agent_id: "start1", agent_type: "general-purpose", dispatched_at: "2026-07-06T08:00:00.000Z" },
      ],
      dispatches: [
        {
          name: "Explore",
          description: "look around",
          subagent_type: "Explore",
          run_in_background: false,
          dispatched_at: "2026-07-06T08:00:00.000Z",
        },
      ],
      stops: [
        {
          agent_id: "start1",
          agent_type: "general-purpose",
          permission_mode: null,
          last_message: null,
          completed_at: "2026-07-06T08:05:00.000Z",
        },
      ],
      metadataRows: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0].agent_id).toBe("start1");
    expect(result[0].name).toBe("Explore");
    expect(result[0].status).toBe("completed");
  });

  test("orders started and stop-only subagents chronologically by dispatch/stop time", () => {
    const result = buildSubagents({
      starts: [
        { agent_id: "started", agent_type: "general-purpose", dispatched_at: "2026-07-06T08:00:00.000Z" },
      ],
      dispatches: [],
      stops: [
        {
          agent_id: "stoponly",
          agent_type: "",
          permission_mode: null,
          last_message: null,
          completed_at: "2026-07-06T07:00:00.000Z",
        },
      ],
      // Metadata marks the stop-only agent as real (transcript existed) so it
      // survives the phantom filter.
      metadataRows: [
        {
          agent_id: "stoponly",
          model: "claude-sonnet-5",
          total_input_tokens: 1,
          total_output_tokens: 1,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
          tool_call_count: 0,
        },
      ],
    });

    expect(result.map((s) => s.agent_id)).toEqual(["stoponly", "started"]);
  });
});
