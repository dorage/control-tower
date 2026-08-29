import { paths } from "../config";
import type { HistoryEntry } from "../domain/types";
import { parseJsonl } from "../lib/text";

interface RawHistoryEntry {
  display?: unknown;
  timestamp?: unknown;
  project?: unknown;
  sessionId?: unknown;
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const file = Bun.file(paths.history);
  if (!(await file.exists())) return [];

  const raw = parseJsonl<RawHistoryEntry>(await file.text());
  return raw.flatMap((entry) => {
    if (typeof entry.display !== "string") return [];
    return [
      {
        display: entry.display,
        timestamp: typeof entry.timestamp === "number" ? entry.timestamp : 0,
        project: typeof entry.project === "string" ? entry.project : null,
        sessionId: typeof entry.sessionId === "string" ? entry.sessionId : null,
      },
    ];
  });
}
