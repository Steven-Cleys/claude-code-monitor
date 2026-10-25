import { test, expect } from "bun:test";
import { clampQueryInt } from "../routes/query";

test("falls back to the default when the param is missing or not a number", () => {
  expect(clampQueryInt(undefined, 100, 1, 2000)).toBe(100);
  expect(clampQueryInt("abc", 100, 1, 2000)).toBe(100);
});

test("truncates a fraction so it never reaches SQL LIMIT", () => {
  expect(clampQueryInt("1.5", 100, 1, 2000)).toBe(1);
});

test("zero is a value, not the default", () => {
  expect(clampQueryInt("0", 4, 0, 168)).toBe(0);
});

test("clamps to the range", () => {
  expect(clampQueryInt("-5", 4, 0, 168)).toBe(0);
  expect(clampQueryInt("9999", 100, 1, 2000)).toBe(2000);
});
