import { test, expect } from "bun:test";
import { hasChanged } from "../services/transcript-scanner";
import { computeSessionTotals } from "../services/transcript-reader";
import type { TranscriptLine } from "../types/transcript";

function assistantLine(
  id: string | undefined,
  usage: Partial<{ input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }>,
  model?: string,
): TranscriptLine {
  return {
    type: "assistant",
    timestamp: "2026-07-19T10:00:00Z",
    message: {
      role: "assistant",
      id,
      model,
      usage: {
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      },
    },
  };
}

test("sums usage across messages", () => {
  const totals = computeSessionTotals([
    assistantLine("msg_1", { input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 1000 }, "claude-fable-5"),
    assistantLine("msg_2", { input_tokens: 5, output_tokens: 50, cache_creation_input_tokens: 500 }),
  ]);

  expect(totals).toEqual({
    model: "claude-fable-5",
    tokens: { input: 15, output: 150, cache_read: 1000, cache_creation: 500 },
  });
});

test("dedups by message id — last occurrence wins", () => {
  const totals = computeSessionTotals([
    assistantLine("msg_1", { output_tokens: 10 }),
    assistantLine("msg_1", { output_tokens: 40 }),
    assistantLine("msg_2", { output_tokens: 7 }),
  ]);

  expect(totals.tokens.output).toBe(47);
});

test("usage-bearing lines without an id each count once", () => {
  const totals = computeSessionTotals([
    assistantLine(undefined, { output_tokens: 3 }),
    assistantLine(undefined, { output_tokens: 4 }),
  ]);

  expect(totals.tokens.output).toBe(7);
});

test("model is the last non-null model seen", () => {
  const totals = computeSessionTotals([
    assistantLine("msg_1", { output_tokens: 1 }, "claude-sonnet-5"),
    assistantLine("msg_2", { output_tokens: 1 }, "claude-fable-5"),
    assistantLine("msg_3", { output_tokens: 1 }),
  ]);

  expect(totals.model).toBe("claude-fable-5");
});

test("lines without usage contribute nothing", () => {
  const lines: TranscriptLine[] = [
    { type: "user", timestamp: "2026-07-19T10:00:00Z", message: { role: "user", content: "hi" } },
    { type: "ai-title", timestamp: "2026-07-19T10:00:00Z", aiTitle: "Some title" },
  ];

  expect(computeSessionTotals(lines)).toEqual({
    model: null,
    tokens: { input: 0, output: 0, cache_read: 0, cache_creation: 0 },
  });
});

test("hasChanged detects token and model differences", () => {
  const a = { model: "m", tokens: { input: 1, output: 2, cache_read: 3, cache_creation: 4 } };

  expect(hasChanged(a, { model: "m", tokens: { input: 1, output: 2, cache_read: 3, cache_creation: 4 } })).toBe(false);
  expect(hasChanged(a, { model: "m", tokens: { input: 1, output: 9, cache_read: 3, cache_creation: 4 } })).toBe(true);
  expect(hasChanged(a, { model: "other", tokens: { input: 1, output: 2, cache_read: 3, cache_creation: 4 } })).toBe(true);
  expect(hasChanged(undefined, a)).toBe(true);
});
