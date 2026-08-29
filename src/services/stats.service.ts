import type { Stats } from "../domain/types";
import { addUsage, emptyUsage, listSessions } from "./session.service";
import { listLive } from "./live.service";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getStats(): Promise<Stats> {
  const { sessions } = await listSessions({ limit: Number.MAX_SAFE_INTEGER });
  const live = await listLive();

  const usage = emptyUsage();
  const models = new Map<string, number>();
  const tools = new Map<string, number>();
  const projects = new Set<string>();
  const since = Date.now() - DAY_MS;

  let messages = 0;
  let activityLast24h = 0;

  for (const session of sessions) {
    projects.add(session.projectId);
    messages += session.counts.userMessages + session.counts.assistantMessages;
    addUsage(usage, session.usage);
    for (const model of session.models) models.set(model, (models.get(model) ?? 0) + 1);
    for (const tool of session.toolUsage) tools.set(tool.name, (tools.get(tool.name) ?? 0) + tool.count);
    const last = session.lastActivityAt ? new Date(session.lastActivityAt).getTime() : session.modifiedAt;
    if (last >= since) activityLast24h += 1;
  }

  const rank = (map: Map<string, number>) =>
    [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  return {
    projects: projects.size,
    sessions: sessions.length,
    liveSessions: live.length,
    activeSessions: live.filter((session) => session.alive !== false).length,
    messages,
    usage,
    models: rank(models),
    tools: rank(tools).slice(0, 12),
    activityLast24h,
    updatedAt: new Date().toISOString(),
  };
}
