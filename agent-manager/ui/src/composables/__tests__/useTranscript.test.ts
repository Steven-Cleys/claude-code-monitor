import { test, expect, beforeEach, afterEach, jest } from "bun:test";
import { useTranscript } from "../useTranscript";

class FakeSocket {
  static instances: FakeSocket[] = [];
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.onclose?.();
  }

  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

let fetchCount = 0;

beforeEach(() => {
  FakeSocket.instances = [];
  fetchCount = 0;
  Object.assign(globalThis, {
    window: { location: { protocol: "http:", host: "localhost:3002" } },
    WebSocket: FakeSocket,
    fetch: async () => {
      fetchCount++;
      return new Response(JSON.stringify({ messages: [], metadata: null, isLive: true }));
    },
  });
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function openLiveTranscript() {
  useTranscript("sess-1", "running", "session");
  await flush();
  const socket = FakeSocket.instances[0]!;
  socket.onopen?.();
  return socket;
}

test("refetches and resubscribes after a live socket drops", async () => {
  const socket = await openLiveTranscript();

  socket.close();
  jest.advanceTimersByTime(3000);
  await flush();

  expect(fetchCount).toBe(2);
  expect(FakeSocket.instances).toHaveLength(2);
});

test("resubscribes when the server ends its watch but the session is still live", async () => {
  const socket = await openLiveTranscript();

  socket.receive({ type: "transcript_complete", agentId: "sess-1" });
  await flush();

  expect(fetchCount).toBe(2);
  expect(FakeSocket.instances).toHaveLength(2);
});
