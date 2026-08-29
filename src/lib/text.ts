const ESC = String.fromCharCode(27);
const ANSI = new RegExp(ESC + "\\[[0-9;?]*[ -/]*[@-~]", "g");

/** Tool results are captured with terminal colouring; strip it for the web view. */
export function stripAnsi(value: string): string {
  return value.replace(ANSI, "");
}

export function truncate(value: string, max: number): { text: string; truncated: boolean } {
  if (value.length <= max) return { text: value, truncated: false };
  return { text: value.slice(0, max), truncated: true };
}

/** Parses JSONL defensively: a corrupt or half-written line is skipped, not fatal. */
export function parseJsonl<T>(text: string): T[] {
  const out: T[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as T);
    } catch {
      // ignore partially flushed lines - transcripts are appended to live
    }
  }
  return out;
}

/** `-home-dorage-workspace-app` -> `/home/dorage/workspace/app` (best effort). */
export function decodeProjectId(projectId: string): string {
  return projectId.replace(/^-/, "/").replaceAll("-", "/");
}
