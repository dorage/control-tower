import { config } from "../config";
import { listTranscriptFiles } from "../repositories/transcript.repository";
import { listLiveSessions } from "../repositories/live-session.repository";

export interface ChangeEvent {
  type: "change";
  fingerprint: string;
  transcripts: number;
  liveSessions: number;
  at: string;
}

type Listener = (event: ChangeEvent) => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;
let lastFingerprint = "";

/** Cheap digest of the data directory: changes whenever any transcript or session file moves. */
async function fingerprint(): Promise<{ value: string; transcripts: number; liveSessions: number }> {
  const files = await listTranscriptFiles();
  const live = await listLiveSessions();

  const transcriptPart = files
    .map((file) => `${file.sessionId}:${file.size}:${file.modifiedAt}`)
    .sort()
    .join("|");
  const livePart = live
    .map((session) => `${session.pid}:${session.status ?? ""}:${session.updatedAt ?? 0}:${session.alive}`)
    .sort()
    .join("|");

  return {
    value: Bun.hash(`${transcriptPart}#${livePart}`).toString(16),
    transcripts: files.length,
    liveSessions: live.length,
  };
}

async function tick(): Promise<void> {
  try {
    const { value, transcripts, liveSessions } = await fingerprint();
    if (value === lastFingerprint) return;
    lastFingerprint = value;
    const event: ChangeEvent = {
      type: "change",
      fingerprint: value,
      transcripts,
      liveSessions,
      at: new Date().toISOString(),
    };
    for (const listener of listeners) listener(event);
  } catch (error) {
    console.error("[control-tower] watch failed", error);
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
