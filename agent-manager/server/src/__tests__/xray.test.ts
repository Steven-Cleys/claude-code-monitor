import { test, expect, describe } from "bun:test";
import {
  buildFlow,
  findLoops,
  buildContextTimeline,
  buildFriction,
  type XrayEventRow,
} from "../services/xray";
import type { TranscriptLine } from "../types/transcript";

const ts = (sec: number) => new Date(Date.UTC(2026, 6, 8, 10, 0, sec)).toISOString();

function assistantLine(id: string, timestamp: string, usage: Partial<Record<string, number>>): TranscriptLine {
  return {
    type: "assistant",
    timestamp,
    message: {
      role: "assistant",
      id,
      usage: {
        input_tokens: usage.input ?? 0,
        output_tokens: usage.output ?? 0,
        cache_read_input_tokens: usage.cacheRead ?? 0,
        cache_creation_input_tokens: usage.cacheCreation ?? 0,
      },
    },
  };
}

function eventRow(overrides: Partial<XrayEventRow> & { event_type: string; created_at: string }): XrayEventRow {
  return { tool_name: null, notification_type: null, ...overrides };
}

describe("buildFlow", () => {
  test("counts nodes and directed edges from the tool sequence", () => {
    const flow = buildFlow(["Read", "Edit", "Bash", "Edit", "Bash"]);

    expect(flow.nodes).toContainEqual({ tool: "Edit", count: 2 });
    expect(flow.nodes).toContainEqual({ tool: "Bash", count: 2 });
    expect(flow.edges).toContainEqual({ from: "Edit", to: "Bash", count: 2 });
    expect(flow.edges).toContainEqual({ from: "Read", to: "Edit", count: 1 });
  });

  test("empty sequence yields empty flow", () => {
    const flow = buildFlow([]);
    expect(flow.nodes).toEqual([]);
    expect(flow.edges).toEqual([]);
    expect(flow.loops).toEqual([]);
  });
});

describe("findLoops", () => {
  test("detects a repeated Edit-Bash cycle", () => {
    const tools = ["Read", "Edit", "Bash", "Edit", "Bash", "Edit", "Bash", "Write"];
    expect(findLoops(tools)).toEqual([{ pattern: ["Edit", "Bash"], count: 3 }]);
  });

  test("ignores cycles repeated fewer than 3 times", () => {
    expect(findLoops(["Edit", "Bash", "Edit", "Bash", "Read"])).toEqual([]);
  });

  test("ignores runs of a single tool", () => {
    expect(findLoops(["Bash", "Bash", "Bash", "Bash", "Bash", "Bash"])).toEqual([]);
  });

  test("prefers the longer pattern when it covers more calls", () => {
    const cycle = ["Read", "Edit", "Bash"];
    const tools = [...cycle, ...cycle, ...cycle, ...cycle];
    expect(findLoops(tools)).toEqual([{ pattern: cycle, count: 4 }]);
  });

  test("merges the same pattern found in separate stretches", () => {
    const stretch = ["Edit", "Bash", "Edit", "Bash", "Edit", "Bash"];
    const tools = [...stretch, "Read", ...stretch];
    expect(findLoops(tools)).toEqual([{ pattern: ["Edit", "Bash"], count: 6 }]);
  });
});

describe("buildContextTimeline", () => {
  test("builds one point per assistant message with context sum", () => {
    const { points } = buildContextTimeline([
      assistantLine("m1", ts(0), { input: 100, cacheRead: 5000, cacheCreation: 200, output: 50 }),
      assistantLine("m2", ts(10), { input: 150, cacheRead: 5300, output: 80 }),
    ]);

    expect(points).toHaveLength(2);
    expect(points[0]!.context).toBe(5300);
    expect(points[1]!.context).toBe(5450);
  });

  test("dedupes streamed chunks by message id keeping the last", () => {
    const { points } = buildContextTimeline([
      assistantLine("m1", ts(0), { input: 100, output: 10 }),
      assistantLine("m1", ts(1), { input: 100, output: 90 }),
    ]);

    expect(points).toHaveLength(1);
    expect(points[0]!.output).toBe(90);
  });

  test("ignores user messages and assistant messages without usage", () => {
    const userLine: TranscriptLine = { type: "user", timestamp: ts(0), message: { role: "user", content: "hi" } };
    const noUsage: TranscriptLine = { type: "assistant", timestamp: ts(1), message: { role: "assistant" } };

    expect(buildContextTimeline([userLine, noUsage]).points).toEqual([]);
  });

  test("flags a >30% context drop as compaction", () => {
    const { compactions } = buildContextTimeline([
      assistantLine("m1", ts(0), { input: 100, cacheRead: 150_000 }),
      assistantLine("m2", ts(10), { input: 100, cacheRead: 40_000 }),
      assistantLine("m3", ts(20), { input: 100, cacheRead: 41_000 }),
    ]);

    expect(compactions).toEqual([ts(10)]);
  });

  test("small fluctuations are not compactions", () => {
    const { compactions } = buildContextTimeline([
      assistantLine("m1", ts(0), { input: 100, cacheRead: 50_000 }),
      assistantLine("m2", ts(10), { input: 100, cacheRead: 45_000 }),
    ]);

    expect(compactions).toEqual([]);
  });
});

describe("buildFriction", () => {
  test("segments working, waiting_user and waiting_permission time", () => {
    const rows = [
      eventRow({ event_type: "UserPromptSubmit", created_at: ts(0) }),
      eventRow({ event_type: "PreToolUse", tool_name: "Bash", created_at: ts(2) }),
      eventRow({ event_type: "Notification", notification_type: "permission_prompt", created_at: ts(4) }),
      eventRow({ event_type: "PostToolUse", tool_name: "Bash", created_at: ts(14) }),
      eventRow({ event_type: "Stop", created_at: ts(20) }),
      eventRow({ event_type: "UserPromptSubmit", created_at: ts(50) }),
      eventRow({ event_type: "Stop", created_at: ts(60) }),
    ];

    const { segments, totals } = buildFriction(rows);

    expect(segments).toEqual([
      { kind: "working", start: ts(0), end: ts(4) },
      { kind: "waiting_permission", start: ts(4), end: ts(14) },
      { kind: "working", start: ts(14), end: ts(20) },
      { kind: "waiting_user", start: ts(20), end: ts(50) },
      { kind: "working", start: ts(50), end: ts(60) },
    ]);
    expect(totals.waiting_permission_ms).toBe(10_000);
    expect(totals.waiting_user_ms).toBe(30_000);
    expect(totals.working_ms).toBe(20_000);
  });

  test("collects failures and pairs pre/post durations for slowest calls", () => {
    const rows = [
      eventRow({ event_type: "PreToolUse", tool_name: "Bash", created_at: ts(0) }),
      eventRow({ event_type: "PostToolUse", tool_name: "Bash", created_at: ts(8) }),
      eventRow({ event_type: "PreToolUse", tool_name: "Edit", created_at: ts(10) }),
      eventRow({ event_type: "PostToolUseFailure", tool_name: "Edit", created_at: ts(11) }),
    ];

    const { failures, slowest, totals } = buildFriction(rows);

    expect(failures).toEqual([{ tool: "Edit", ts: ts(11) }]);
    expect(totals.failure_count).toBe(1);
    expect(totals.tool_call_count).toBe(2);
    expect(slowest[0]).toEqual({ tool: "Bash", ts: ts(0), ms: 8000 });
    expect(slowest[1]).toEqual({ tool: "Edit", ts: ts(10), ms: 1000 });
  });

  test("ignores idle_prompt notifications", () => {
    const rows = [
      eventRow({ event_type: "UserPromptSubmit", created_at: ts(0) }),
      eventRow({ event_type: "Notification", notification_type: "idle_prompt", created_at: ts(5) }),
      eventRow({ event_type: "Stop", created_at: ts(10) }),
    ];

    expect(buildFriction(rows).segments).toEqual([
      { kind: "working", start: ts(0), end: ts(10) },
    ]);
  });

  test("empty rows yield empty friction", () => {
    const friction = buildFriction([]);
    expect(friction.segments).toEqual([]);
    expect(friction.totals.tool_call_count).toBe(0);
  });
});
