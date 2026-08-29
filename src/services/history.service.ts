import type { HistoryEntry } from "../domain/types";
import { listHistory } from "../repositories/history.repository";

export interface HistoryOptions {
  projectPath?: string | null;
  sessionId?: string | null;
  limit?: number;
}

export async function getHistory(options: HistoryOptions = {}): Promise<HistoryEntry[]> {
  const { projectPath = null, sessionId = null, limit = 100 } = options;
  const entries = await listHistory();
  return entries
    .filter((entry) => !projectPath || entry.project === projectPath)
    .filter((entry) => !sessionId || entry.sessionId === sessionId)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}
