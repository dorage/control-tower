import type { LiveSession } from "../domain/types";
import { listLiveSessions } from "../repositories/live-session.repository";

/** Sessions registered as processes on this machine, keyed by session id. */
export async function getLiveSessionMap(): Promise<Map<string, LiveSession>> {
  const sessions = await listLiveSessions();
  const map = new Map<string, LiveSession>();
  for (const session of sessions) {
    const existing = map.get(session.sessionId);
    // Prefer a live process over a stale registration for the same session.
    if (!existing || (session.alive && !existing.alive)) map.set(session.sessionId, session);
  }
  return map;
}

export async function listLive(): Promise<LiveSession[]> {
  const sessions = await listLiveSessions();
  return sessions.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}
