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
} as const;

export const paths = {
  projects: `${config.claudeDir}/projects`,
  sessions: `${config.claudeDir}/sessions`,
  history: `${config.claudeDir}/history.jsonl`,
} as const;
