import type { ProjectSummary } from "../domain/types";
import { addUsage, emptyUsage, listSessions } from "./session.service";

export async function listProjects(): Promise<ProjectSummary[]> {
  const { sessions } = await listSessions({ limit: Number.MAX_SAFE_INTEGER });
  const projects = new Map<string, ProjectSummary>();

  for (const session of sessions) {
    let project = projects.get(session.projectId);
    if (!project) {
      project = {
        id: session.projectId,
        path: session.projectPath,
        sessionCount: 0,
        liveSessionCount: 0,
        lastActivityAt: null,
        usage: emptyUsage(),
        messageCount: 0,
      };
      projects.set(session.projectId, project);
    }

    project.sessionCount += 1;
    if (session.live?.alive) project.liveSessionCount += 1;
    project.messageCount += session.counts.userMessages + session.counts.assistantMessages;
    addUsage(project.usage, session.usage);
    if ((session.lastActivityAt ?? "") > (project.lastActivityAt ?? "")) {
      project.lastActivityAt = session.lastActivityAt;
    }
  }

  return [...projects.values()].sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));
}
