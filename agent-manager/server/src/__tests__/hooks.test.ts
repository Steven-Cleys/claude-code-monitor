import { test, expect, beforeEach, afterEach, spyOn, jest } from "bun:test";
import { createHooksRouter } from "../routes/hooks";
import * as eventStore from "../services/event-store";
import * as subagentMetadata from "../services/subagent-metadata";
import * as transcriptWatcher from "../services/transcript-watcher";
import { SUBAGENT_METADATA_DELAY_MS } from "../constants";

const broadcast = () => {};
let spies: { mockRestore(): void }[] = [];

beforeEach(() => {
  jest.useFakeTimers();
  spies = [
    spyOn(eventStore, "storeEvent").mockResolvedValue({
      event: { id: 1 },
      session: { isNew: false, session: { status: "idle", needs_attention: false } },
    } as unknown as Awaited<ReturnType<typeof eventStore.storeEvent>>),
  ];
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  jest.useRealTimers();
});

function postHook(payload: Record<string, unknown>) {
  return createHooksRouter(broadcast).request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

test("reads a subagent's metadata only once its transcript has had time to flush", async () => {
  const persist = spyOn(subagentMetadata, "persistSubagentMetadata").mockResolvedValue(null);
  spies.push(persist);

  const res = await postHook({
    session_id: "sess-1",
    hook_event_name: "SubagentStop",
    agent_id: "a42",
    agent_transcript_path: "/Users/a/.claude/projects/-Users-a-shop/sess-1/subagents/agent-a42.jsonl",
  });

  expect(res.status).toBe(201);
  jest.advanceTimersByTime(SUBAGENT_METADATA_DELAY_MS - 1);
  expect(persist).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(persist).toHaveBeenCalledWith(
    "a42",
    "sess-1",
    "/claude-projects/-Users-a-shop/sess-1/subagents/agent-a42.jsonl",
    broadcast,
  );
});

test("stops the session's transcript watch on SessionEnd", async () => {
  const stop = spyOn(transcriptWatcher, "stopWatching").mockImplementation(() => {});
  spies.push(stop);

  await postHook({ session_id: "sess-1", hook_event_name: "SessionEnd" });

  expect(stop).toHaveBeenCalledWith("sess-1", broadcast);
});
