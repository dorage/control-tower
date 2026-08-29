const home = Bun.env.HOME ?? "/root";

export const config = {
  /** Root of the Claude Code data directory that we observe. */
  claudeDir: Bun.env.CLAUDE_HOME ?? `${home}/.claude`,
  port: Number(Bun.env.PORT ?? 4317),
  hostname: Bun.env.HOST ?? "0.0.0.0",
  /** How often the watcher re-fingerprints the data directory. */
  watchIntervalMs: Number(Bun.env.WATCH_INTERVAL_MS ?? 1500),
  /** Max characters kept per timeline text block before truncation. */
  maxBlockChars: Number(Bun.env.MAX_BLOCK_CHARS ?? 4000),
  /** One log line per request. Off by default - this is a local tool and it gets noisy. */
  logRequests: Bun.env.LOG_REQUESTS === "1",
  /** Roots the file browser may traverse. ":" separated. */
  workspaceRoots: (Bun.env.WORKSPACE_ROOTS ?? `${home}/workspace`)
    .split(":")
    .map((value) => value.trim())
    .filter(Boolean),
  /** Upper bound for a read or a written body. */
  fsMaxReadBytes: Number(Bun.env.FS_MAX_READ_BYTES ?? 2 * 1024 * 1024),
  /** Extensions we allow writing to (lowercase, dot included). */
  writableExtensions: (Bun.env.FS_WRITABLE_EXTENSIONS ?? ".md,.markdown")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
} as const;

export const paths = {
  projects: `${config.claudeDir}/projects`,
  sessions: `${config.claudeDir}/sessions`,
  history: `${config.claudeDir}/history.jsonl`,
} as const;
