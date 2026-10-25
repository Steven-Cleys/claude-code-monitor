import { test, expect } from "bun:test";
import { calculateCost } from "../pricing";

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
