import { test, expect } from "bun:test";
import { groupTokensBySession } from "../services/prometheus-poller";

test("groups token series per session and normalizes OTEL type names", () => {
  const results = [
    { metric: { session_id: "abc", type: "input" }, value: [0, "4012"] as [number, string] },
    { metric: { session_id: "abc", type: "output" }, value: [0, "16337"] as [number, string] },
    { metric: { session_id: "abc", type: "cacheRead" }, value: [0, "4273660"] as [number, string] },
    { metric: { session_id: "abc", type: "cacheCreation" }, value: [0, "25241"] as [number, string] },
    { metric: { session_id: "def", type: "input" }, value: [0, "923"] as [number, string] },
  ];

  expect(groupTokensBySession(results)).toEqual({
    abc: { input: 4012, output: 16337, cache_read: 4273660, cache_creation: 25241 },
    def: { input: 923 },
  });
});

test("skips series missing session_id or type", () => {
  const results = [
    { metric: { type: "input" }, value: [0, "99"] as [number, string] },
    { metric: { session_id: "abc" }, value: [0, "99"] as [number, string] },
  ];

  expect(groupTokensBySession(results)).toEqual({});
});
