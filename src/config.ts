const home = Bun.env.HOME ?? "/root";

export const config = {
  /**
   * Root of the Claude Code data directory that we observe.
   *
   * Read lazily for the same reason as `workspaceRoots` below: `bun test` shares one
   * module registry across test files, so a test that sets CLAUDE_HOME must still be
   * able to redirect the data directory after this module was first imported.
   */
  get claudeDir(): string {
    return Bun.env.CLAUDE_HOME ?? `${home}/.claude`;
  },
  port: Number(Bun.env.PORT ?? 4317),
  hostname: Bun.env.HOST ?? "0.0.0.0",
  /** How often the watcher re-fingerprints the data directory. */
  watchIntervalMs: Number(Bun.env.WATCH_INTERVAL_MS ?? 1500),
  /** Max characters kept per timeline text block before truncation. */
  maxBlockChars: Number(Bun.env.MAX_BLOCK_CHARS ?? 4000),
  /** One log line per request. Off by default - this is a local tool and it gets noisy. */
  logRequests: Bun.env.LOG_REQUESTS === "1",
  /**
   * Roots the file browser may traverse. ":" separated.
   *
   * Read lazily so that a process which sets WORKSPACE_ROOTS after this module was first
   * imported (notably `bun test`, which shares one module registry across test files)
   * still sees its own value.
   */
  get workspaceRoots(): string[] {
    return (Bun.env.WORKSPACE_ROOTS ?? `${home}/workspace`)
      .split(":")
      .map((value) => value.trim())
      .filter(Boolean);
  },
  /** Upper bound for a read or a written body. */
  fsMaxReadBytes: Number(Bun.env.FS_MAX_READ_BYTES ?? 2 * 1024 * 1024),
  /** Extensions we allow writing to (lowercase, dot included). */
  writableExtensions: (Bun.env.FS_WRITABLE_EXTENSIONS ?? ".md,.markdown")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),

  /**
   * Every field here is a getter, for the same reason as `claudeDir`: `bun test` shares
   * one module registry, so a test must be able to change a limit after this module was
   * first imported. Reading an env var per access is far cheaper than the query it guards.
   */
  telemetry: {
    /** Turn the OTLP receiver off entirely. When off, /v1/* still answers 200 so that a
     *  configured claude does not retry forever - it just discards the payload. */
    get enabled(): boolean {
      return Bun.env.TELEMETRY_ENABLED !== "0";
    },
    /**
     * Deliberately NOT under claudeDir: writing our own file into the directory we watch
     * would move the fingerprint on every insert and produce endless change events.
     */
    get dbPath(): string {
      return Bun.env.TELEMETRY_DB ?? `${home}/.control-tower/telemetry.db`;
    },
    get retainRawDays(): number {
      return Number(Bun.env.TEL_RETAIN_RAW_DAYS ?? 30);
    },
    get retainHourlyDays(): number {
      return Number(Bun.env.TEL_RETAIN_HOURLY_DAYS ?? 400);
    },
    get retainDailyDays(): number {
      return Number(Bun.env.TEL_RETAIN_DAILY_DAYS ?? 3650);
    },
    get retainRequestDays(): number {
      return Number(Bun.env.TEL_RETAIN_REQUEST_DAYS ?? 400);
    },
    /** Distinct attribute combinations kept. Beyond this, new ones fold into `__other__`. */
    get maxSeries(): number {
      return Number(Bun.env.TEL_MAX_SERIES ?? 2000);
    },
    /** Warn above this. */
    get softLimitBytes(): number {
      return Number(Bun.env.TEL_SOFT_LIMIT_BYTES ?? 1.5 * 1024 ** 3);
    },
    /** Drop the oldest raw data above this, ignoring retention. */
    get hardLimitBytes(): number {
      return Number(Bun.env.TEL_HARD_LIMIT_BYTES ?? 4 * 1024 ** 3);
    },
    /** One hour, not one minute: this runs on an SD card. */
    get pruneIntervalMs(): number {
      return Number(Bun.env.TEL_PRUNE_INTERVAL_MS ?? 3_600_000);
    },
  },
} as const;

/** Derived from `config.claudeDir`, so these are lazy too. */
export const paths = {
  get projects(): string {
    return `${config.claudeDir}/projects`;
  },
  get sessions(): string {
    return `${config.claudeDir}/sessions`;
  },
  get history(): string {
    return `${config.claudeDir}/history.jsonl`;
  },
} as const;
