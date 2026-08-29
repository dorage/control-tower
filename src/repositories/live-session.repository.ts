import { paths } from "../config";
import type { LiveSession } from "../domain/types";

const SESSION_GLOB = new Bun.Glob("*.json");

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** On Linux a session's process is alive iff /proc/<pid> is readable. */
async function isAlive(pid: number): Promise<boolean | null> {
  if (process.platform !== "linux") return null;
  try {
    return await Bun.file(`/proc/${pid}/comm`).exists();
  } catch {
    return null;
  }
}

export async function listLiveSessions(): Promise<LiveSession[]> {
  let names: string[];
  try {
    names = await Array.fromAsync(SESSION_GLOB.scan({ cwd: paths.sessions, onlyFiles: true }));
  } catch {
    return [];
  }

  const sessions: LiveSession[] = [];
  for (const name of names) {
    let raw: Record<string, unknown>;
    try {
      raw = (await Bun.file(`${paths.sessions}/${name}`).json()) as Record<string, unknown>;
    } catch {
      continue;
    }
    const sessionId = str(raw.sessionId);
    const pid = num(raw.pid);
    if (!sessionId || pid === null) continue;

    sessions.push({
      pid,
      sessionId,
      cwd: str(raw.cwd),
      name: str(raw.name),
      status: str(raw.status),
      kind: str(raw.kind),
      entrypoint: str(raw.entrypoint),
      jobId: str(raw.jobId),
      version: str(raw.version),
      startedAt: num(raw.startedAt),
      updatedAt: num(raw.updatedAt),
      alive: await isAlive(pid),
    });
  }
  return sessions;
}
