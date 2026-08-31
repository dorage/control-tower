import { config } from "../config";
import { listTranscriptFiles } from "../repositories/transcript.repository";
import { listLiveSessions } from "../repositories/live-session.repository";

export interface ChangeEvent {
  type: "change";
  fingerprint: string;
  transcripts: number;
  liveSessions: number;
  at: string;
  /** Sessions whose transcript size/mtime or live-session state moved. */
  changedSessions: string[];
  /** Sessions seen for the first time. */
  addedSessions: string[];
  /** Sessions that disappeared. */
  removedSessions: string[];
}

type Listener = (event: ChangeEvent) => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;
let lastFingerprint = "";
/** sessionId -> signature. Compared tick to tick to derive the delta. */
let lastState = new Map<string, string>();
/** The very first tick only seeds `lastState`; there is nothing to diff against yet. */
let seeded = false;

interface Snapshot {
  value: string;
  transcripts: number;
  liveSessions: number;
  state: Map<string, string>;
}

/**
 * Cheap digest of the data directory: changes whenever any transcript or session file moves.
 *
 * Parts are collected as (sessionId, part) pairs and sorted before folding into the map, so
 * the signature of a session is identical regardless of directory scan order - and so two
 * files that happen to share a sessionId cannot produce a phantom change by swapping places.
 */
async function snapshot(): Promise<Snapshot> {
  const files = await listTranscriptFiles();
  const live = await listLiveSessions();

  const parts: Array<[string, string]> = [];
  for (const file of files) parts.push([file.sessionId, `t:${file.size}:${file.modifiedAt}`]);
  for (const session of live) {
    parts.push([
      session.sessionId,
      `l:${session.pid}:${session.status ?? ""}:${session.updatedAt ?? 0}:${session.alive}`,
    ]);
  }
  parts.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));

  const state = new Map<string, string>();
  for (const [sessionId, part] of parts) {
    const previous = state.get(sessionId);
    state.set(sessionId, previous === undefined ? part : `${previous}|${part}`);
  }

  const digest = [...state].map(([sessionId, signature]) => `${sessionId}=${signature}`).join("|");

  return {
    value: Bun.hash(digest).toString(16),
    transcripts: files.length,
    liveSessions: live.length,
    state,
  };
}

interface Delta {
  changed: string[];
  added: string[];
  removed: string[];
}

/** Exported for tests. Pure. */
export function diffState(previous: Map<string, string>, next: Map<string, string>): Delta {
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  for (const [sessionId, signature] of next) {
    const before = previous.get(sessionId);
    if (before === undefined) added.push(sessionId);
    else if (before !== signature) changed.push(sessionId);
  }
  for (const sessionId of previous.keys()) if (!next.has(sessionId)) removed.push(sessionId);
  changed.sort();
  added.sort();
  removed.sort();
  return { changed, added, removed };
}

async function tick(): Promise<ChangeEvent | null> {
  try {
    const { value, transcripts, liveSessions, state } = await snapshot();

    // First ever tick: remember the world, announce nothing. Reporting every existing
    // session as "added" would make consumers reload everything on connect.
    if (!seeded) {
      seeded = true;
      lastFingerprint = value;
      lastState = state;
      return null;
    }

    if (value === lastFingerprint) return null;
    const { changed, added, removed } = diffState(lastState, state);
    lastFingerprint = value;
    lastState = state;

    const event: ChangeEvent = {
      type: "change",
      fingerprint: value,
      transcripts,
      liveSessions,
      at: new Date().toISOString(),
      changedSessions: changed,
      addedSessions: added,
      removedSessions: removed,
    };
    for (const listener of listeners) listener(event);
    return event;
  } catch (error) {
    console.error("[control-tower] watch failed", error);
    return null;
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => void tick(), config.watchIntervalMs);
    timer.unref?.();
    void tick();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function subscriberCount(): number {
  return listeners.size;
}

/**
 * Test seam: run one tick without owning a subscription, and hand back whatever was
 * dispatched. Returns null when nothing changed or when this was the seeding tick.
 */
export async function tickOnce(): Promise<ChangeEvent | null> {
  return tick();
}

/** Test seam: forget the observed world so the next tick seeds again. */
export function resetWatchState(): void {
  lastFingerprint = "";
  lastState = new Map();
  seeded = false;
}
