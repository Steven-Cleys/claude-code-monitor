import { test, expect, describe } from "bun:test";
import { buildTurns, type TurnEventRow } from "../services/turns";
import type { ContextPoint } from "../services/xray";

const ts = (sec: number) => new Date(Date.UTC(2026, 6, 8, 10, 0, sec)).toISOString();

function eventRow(
  overrides: Partial<TurnEventRow> & { event_type: string; created_at: string },
): TurnEventRow {
  return { tool_name: null, prompt: null, file_path: null, ...overrides };
}

function prompt(sec: number, text: string): TurnEventRow {
  return eventRow({ event_type: "UserPromptSubmit", created_at: ts(sec), prompt: text });
}

function toolUse(sec: number, tool: string, filePath?: string): TurnEventRow {
  return eventRow({
    event_type: "PreToolUse",
    created_at: ts(sec),
    tool_name: tool,
    file_path: filePath ?? null,
  });
}

function point(sec: number, usage: Partial<Omit<ContextPoint, "ts">>): ContextPoint {
  return {
    ts: ts(sec),
    input: usage.input ?? 0,
    cache_read: usage.cache_read ?? 0,
    cache_creation: usage.cache_creation ?? 0,
    output: usage.output ?? 0,
    context: usage.context ?? 0,
  };
}

describe("buildTurns", () => {
  test("segments events into one turn per user prompt", () => {
    const rows = [
      prompt(0, "first ask"),
      toolUse(5, "Read"),
      toolUse(10, "Bash"),
      eventRow({ event_type: "Stop", created_at: ts(15) }),
      prompt(20, "second ask"),
      toolUse(25, "Edit"),
      eventRow({ event_type: "Stop", created_at: ts(30) }),
    ];

    const turns = buildTurns(rows, []);

    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({
      index: 0,
      prompt: "first ask",
      start: ts(0),
      end: ts(15),
      duration_ms: 15_000,
      tool_calls: 2,
    });
    expect(turns[1]).toMatchObject({
      index: 1,
      prompt: "second ask",
      start: ts(20),
      end: ts(30),
      duration_ms: 10_000,
      tool_calls: 1,
    });
  });

  test("ignores events before the first prompt", () => {
    const rows = [
      eventRow({ event_type: "SessionStart", created_at: ts(0) }),
      toolUse(1, "Read"),
      prompt(5, "the ask"),
      toolUse(6, "Bash"),
    ];

    const turns = buildTurns(rows, []);

    expect(turns).toHaveLength(1);
    expect(turns[0]!.tool_calls).toBe(1);
    expect(turns[0]!.start).toBe(ts(5));
  });

  test("sums transcript token usage into the owning turn's window", () => {
    const rows = [
      prompt(0, "first"),
      eventRow({ event_type: "Stop", created_at: ts(10) }),
      prompt(20, "second"),
      eventRow({ event_type: "Stop", created_at: ts(40) }),
    ];
    const points = [
      point(2, { input: 100, output: 50, cache_read: 1000 }),
      point(8, { input: 20, output: 30, cache_creation: 500 }),
      point(25, { input: 5, output: 700 }),
    ];

    const turns = buildTurns(rows, points);

    expect(turns[0]!.tokens).toEqual({
      input: 120,
      output: 80,
      cache_read: 1000,
      cache_creation: 500,
    });
    expect(turns[1]!.tokens).toEqual({
      input: 5,
      output: 700,
      cache_read: 0,
      cache_creation: 0,
    });
  });

  test("collects distinct files touched by write-capable tools", () => {
    const rows = [
      prompt(0, "edit stuff"),
      toolUse(1, "Read", "/app/readme.md"),
      toolUse(2, "Edit", "/app/a.ts"),
      toolUse(3, "Write", "/app/b.ts"),
      toolUse(4, "Edit", "/app/a.ts"),
      toolUse(5, "NotebookEdit", "/app/c.ipynb"),
    ];

    const turns = buildTurns(rows, []);

    expect(turns[0]!.files_touched).toEqual(["/app/a.ts", "/app/b.ts", "/app/c.ipynb"]);
  });

  test("counts tool failures per turn", () => {
    const rows = [
      prompt(0, "risky ask"),
      toolUse(1, "Bash"),
      eventRow({ event_type: "PostToolUseFailure", created_at: ts(2), tool_name: "Bash" }),
      prompt(10, "safe ask"),
      toolUse(11, "Read"),
    ];

    const turns = buildTurns(rows, []);

    expect(turns[0]!.failures).toBe(1);
    expect(turns[1]!.failures).toBe(0);
  });

  test("a prompt with no follow-up events is a zero-duration turn", () => {
    const turns = buildTurns([prompt(0, "pending ask")], []);

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ end: ts(0), duration_ms: 0, tool_calls: 0 });
  });

  test("empty input yields no turns", () => {
    expect(buildTurns([], [])).toEqual([]);
  });
});
