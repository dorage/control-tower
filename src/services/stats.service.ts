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
  const skills = new Map<string, { count: number; sessions: number }>();
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
    for (const skill of session.skillUsage) {
      const entry = skills.get(skill.name);
      // 세션 수를 따로 센다. 한 세션에서 12번 부른 것과 12개 세션이 각각 부른 것은 다른 이야기다.
      if (entry) {
        entry.count += skill.count;
        entry.sessions += 1;
      } else {
        skills.set(skill.name, { count: skill.count, sessions: 1 });
      }
    }
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
    skills: [...skills.entries()]
      .map(([name, entry]) => ({ name, count: entry.count, sessions: entry.sessions }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 12),
    activityLast24h,
    updatedAt: new Date().toISOString(),
  };
}
