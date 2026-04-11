import { watch, statSync, type FSWatcher } from "fs";
import { parseTranscriptLine } from "./transcript-reader";

type BroadcastFn = (topic: string, data: unknown) => void;

interface WatcherEntry {
  watcher: FSWatcher;
  offset: number;
  filePath: string;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  safetyTimer: ReturnType<typeof setTimeout> | null;
}

const activeWatchers = new Map<string, WatcherEntry>();
const registeredPaths = new Map<string, string>();

const DEBOUNCE_MS = 100;
const MAX_WATCH_DURATION_MS = 60 * 60 * 1000; // 1 hour safety net

export function registerTranscriptPath(agentId: string, filePath: string) {
  registeredPaths.set(agentId, filePath);
}

export function startWatching(agentId: string, broadcast: BroadcastFn): boolean {
  if (activeWatchers.has(agentId)) return true;

  const filePath = registeredPaths.get(agentId);
  if (!filePath) return false;

  let offset: number;
  try {
    offset = statSync(filePath).size;
  } catch {
    return false;
  }

  const watcher = watch(filePath, (eventType) => {
    if (eventType !== "change") return;

    const entry = activeWatchers.get(agentId);
    if (!entry) return;

    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.debounceTimer = setTimeout(() => processNewLines(agentId, broadcast), DEBOUNCE_MS);
  });

  const entry: WatcherEntry = { watcher, offset, filePath, debounceTimer: null, safetyTimer: null };
  entry.safetyTimer = setTimeout(() => stopWatching(agentId, broadcast), MAX_WATCH_DURATION_MS);
  activeWatchers.set(agentId, entry);

  return true;
}

async function processNewLines(agentId: string, broadcast: BroadcastFn) {
  const entry = activeWatchers.get(agentId);
  if (!entry) return;

  let size: number;
  try {
    size = statSync(entry.filePath).size;
  } catch {
    return;
  }

  if (size <= entry.offset) return;

  // Reserve the slice range BEFORE awaiting so a second debounce fire that
  // lands while we're reading doesn't see the same offset and broadcast
  // the same lines twice.
  const sliceStart = entry.offset;
  entry.offset = size;

  let newContent: string;
  try {
    newContent = await Bun.file(entry.filePath).slice(sliceStart, size).text();
  } catch (err) {
    entry.offset = sliceStart; // restore so the next fire can retry the range
    console.error(`transcript-watcher: failed to read ${entry.filePath}:`, err);
    return;
  }

  const lines = newContent.split("\n");
  for (const line of lines) {
    const parsed = parseTranscriptLine(line);
    if (parsed) {
      broadcast(`transcript:${agentId}`, {
        type: "transcript_line",
        agentId,
        data: parsed,
      });
    }
  }
}

export function stopWatching(agentId: string, broadcast: BroadcastFn) {
  const entry = activeWatchers.get(agentId);
  if (!entry) return;

  if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
  if (entry.safetyTimer) clearTimeout(entry.safetyTimer);
  entry.watcher.close();
  activeWatchers.delete(agentId);

  broadcast(`transcript:${agentId}`, {
    type: "transcript_complete",
    agentId,
  });
}

export function isWatching(agentId: string): boolean {
  return activeWatchers.has(agentId);
}
