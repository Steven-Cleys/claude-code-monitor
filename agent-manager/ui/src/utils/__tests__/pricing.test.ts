import { test, expect, describe } from "bun:test";
import { calculateCost, sessionCost, totalSessionCost } from "../pricing";

const MTOK = 1_000_000;

// Per-MTok rates as [input, output, cache read, 5m cache write].
function rates(model: string): number[] {
  return [
    calculateCost({ input: MTOK }, model),
    calculateCost({ output: MTOK }, model),
    calculateCost({ cache_read: MTOK }, model),
    calculateCost({ cache_creation: MTOK }, model),
  ].map((usd) => Math.round(usd * 1000) / 1000);
}

test.each([
  ["claude-fable-5-1", [10, 50, 0.25, 12.5]],
  ["claude-fable-5", [10, 50, 1, 12.5]],
  ["claude-mythos-5-1", [10, 50, 0.25, 12.5]],
  ["claude-mythos-5", [10, 50, 1, 12.5]],
  ["claude-opus-5-5", [4, 20, 0.2, 5]],
  ["claude-opus-5", [5, 25, 0.5, 6.25]],
  ["claude-sonnet-5-5", [2, 10, 0.2, 2.5]],
  ["claude-sonnet-5", [2, 10, 0.2, 2.5]],
  ["claude-haiku-5-5", [0.1, 0.5, 0.01, 0.125]],
])("%s uses its own list price", (model, expected) => {
  expect(rates(model)).toEqual(expected);
});

test.each([
  ["claude-opus-4-8", [5, 25, 0.5, 6.25]],
  ["claude-sonnet-4-6", [3, 15, 0.3, 3.75]],
  ["claude-haiku-4-5", [1, 5, 0.1, 1.25]],
])("older model %s keeps its price", (model, expected) => {
  expect(rates(model)).toEqual(expected);
});

test("unknown models fall back to the default price", () => {
  expect(rates("some-future-model")).toEqual([3, 15, 0.3, 3.75]);
});

describe("sessionCost", () => {
  const tokens = { input: 0, output: MTOK, cache_read: 0, cache_creation: 0 };

  test("uses the cost reported by Claude Code when present", () => {
    expect(sessionCost({ cost_usd: 1.5, tokens, model: "claude-opus-5-5" })).toEqual({ usd: 1.5, estimated: false });
  });

  test("keeps a reported cost of zero", () => {
    expect(sessionCost({ cost_usd: 0, tokens, model: "claude-opus-5-5" })).toEqual({ usd: 0, estimated: false });
  });

  test("falls back to the token estimate without a reported cost", () => {
    expect(sessionCost({ cost_usd: null, tokens, model: "claude-opus-5-5" })).toEqual({ usd: 20, estimated: true });
    expect(sessionCost({ tokens, model: "claude-opus-5-5" })).toEqual({ usd: 20, estimated: true });
  });
});

describe("totalSessionCost", () => {
  const tokens = { output: MTOK };

  test("sums reported costs", () => {
    expect(totalSessionCost([
      { cost_usd: 1, tokens, model: "claude-opus-5-5" },
      { cost_usd: 2, tokens, model: "claude-opus-5-5" },
    ])).toEqual({ usd: 3, estimated: false });
  });

  test("is an estimate when any session contributes an estimate", () => {
    expect(totalSessionCost([
      { cost_usd: 1, tokens, model: "claude-opus-5-5" },
      { cost_usd: null, tokens, model: "claude-opus-5-5" },
    ])).toEqual({ usd: 21, estimated: true });
  });

  test("sessions without tokens or cost don't make the total an estimate", () => {
    expect(totalSessionCost([
      { cost_usd: 1, tokens, model: "claude-opus-5-5" },
      { cost_usd: null, tokens: undefined, model: null },
    ])).toEqual({ usd: 1, estimated: false });
  });
});
