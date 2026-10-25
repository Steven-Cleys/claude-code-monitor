import { test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { createHooksRouter } from "../routes/hooks";
import * as eventStore from "../services/event-store";
import * as sessionTracker from "../services/session-tracker";

let sent: { topic: string; data: { type: string; data: Record<string, unknown> } }[] = [];
const broadcast = (topic: string, data: unknown) => {
  sent.push({ topic, data: data as (typeof sent)[number]["data"] });
};
let spies: { mockRestore(): void }[] = [];

function storedSession(isNew: boolean, session: Record<string, unknown>) {
  spies.push(
    spyOn(eventStore, "storeEvent").mockResolvedValue({
      event: { id: 7 },
      session: { isNew, session: { status: "active", needs_attention: false, ...session } },
    } as unknown as Awaited<ReturnType<typeof eventStore.storeEvent>>),
  );
}

function postHook(payload: Record<string, unknown>) {
  return createHooksRouter(broadcast).request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: "sess-1", ...payload }),
  });
}

const types = () => sent.map((m) => m.data.type);

beforeEach(() => {
  sent = [];
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

test("a new session is announced once, without its is_new flag or a status change", async () => {
  storedSession(true, { id: "sess-1", is_new: true });

  const res = await postHook({ hook_event_name: "SessionStart" });

  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ id: 7 });
  expect(types()).toEqual(["session_created", "new_event"]);
  expect(sent[0]!.data.data).not.toHaveProperty("is_new");
});

test("a turn end on a known session broadcasts the stored status", async () => {
  storedSession(false, { status: "idle" });

  await postHook({ hook_event_name: "Stop" });

  expect(types()).toEqual(["new_event", "session_status_changed"]);
  expect(sent[1]!.data.data).toEqual({ id: "sess-1", status: "idle" });
});

test("a tool event does not broadcast a status change", async () => {
  storedSession(false, {});

  await postHook({ hook_event_name: "PreToolUse", tool_name: "Bash" });

  expect(types()).toEqual(["new_event"]);
});

test("a permission prompt flags the session for attention", async () => {
  storedSession(false, {});
  const set = spyOn(sessionTracker, "setSessionAttention").mockResolvedValue({
    changed: true,
    attention_since: "2026-10-25T10:00:00Z",
  });
  spies.push(set);

  await postHook({ hook_event_name: "Notification", notification_type: "permission_prompt" });

  expect(set).toHaveBeenCalledWith("sess-1");
  expect(sent.at(-1)!.data).toEqual({
    type: "session_attention_changed",
    data: { id: "sess-1", needs_attention: true, attention_since: "2026-10-25T10:00:00Z" },
  });
});

test("tool activity clears a flagged session", async () => {
  storedSession(false, { needs_attention: true });
  const clear = spyOn(sessionTracker, "clearSessionAttention").mockResolvedValue({ changed: true });
  spies.push(clear);

  await postHook({ hook_event_name: "PostToolUse", tool_name: "Bash" });

  expect(clear).toHaveBeenCalledWith("sess-1");
  expect(sent.at(-1)!.data.data).toMatchObject({ needs_attention: false });
});
