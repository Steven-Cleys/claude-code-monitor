import { test, expect } from "bun:test";
import { contextWindow } from "../context-window";

test("current models have a 1M window", () => {
  expect(contextWindow("claude-fable-5-1")).toBe(1_000_000);
  expect(contextWindow("claude-opus-5-5")).toBe(1_000_000);
  expect(contextWindow("claude-haiku-5-5")).toBe(1_000_000);
});

test("Opus 4.6 to 4.8 and Sonnet 4.6 have a 1M window", () => {
  for (const model of ["claude-opus-4-6", "claude-opus-4-7", "claude-opus-4-8", "claude-sonnet-4-6"]) {
    expect(contextWindow(model)).toBe(1_000_000);
  }
});

test("Haiku 4.5 and unknown models keep 200K", () => {
  expect(contextWindow("claude-haiku-4-5")).toBe(200_000);
  expect(contextWindow(null)).toBe(200_000);
});

test("a [1m] model id gets the 1M window", () => {
  expect(contextWindow("claude-sonnet-4-5[1m]")).toBe(1_000_000);
});
