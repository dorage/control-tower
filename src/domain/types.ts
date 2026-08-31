/** Raw shapes as they appear on disk under ~/.claude. */

export interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  output_tokens_details?: { thinking_tokens?: number };
}

export interface RawMessage {
  role?: string;
  model?: string;
  content?: unknown;
  usage?: RawUsage;
  stop_reason?: string | null;
}

/** One line of a `projects/<project>/<sessionId>.jsonl` transcript. */
export interface TranscriptRecord {
  type?: string;
  subtype?: string;
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  sessionKind?: string;
  entrypoint?: string;
  userType?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  isApiErrorMessage?: boolean;
  message?: RawMessage;
  content?: unknown;
  aiTitle?: string;
  /** 스킬이 활성인 동안 만들어진 레코드에 붙는 스킬 이름. 호출 레코드 자체에는 없다. */
  attributionSkill?: string;
  agentName?: string;
  summary?: string;
  mode?: string;
  permissionMode?: string;
  effort?: string;
  attachment?: { type?: string; path?: string; displayPath?: string };
  [key: string]: unknown;
}

/** One `sessions/<pid>.json` file: a session process registered on this machine. */
export interface LiveSession {
  pid: number;
  sessionId: string;
  cwd: string | null;
  name: string | null;
  status: string | null;
  kind: string | null;
  entrypoint: string | null;
  jobId: string | null;
  version: string | null;
  startedAt: number | null;
  updatedAt: number | null;
  /** Whether /proc/<pid> still exists (null when not determinable). */
  alive: boolean | null;
}

/** One line of `history.jsonl`: a prompt the user typed. */
export interface HistoryEntry {
  display: string;
  timestamp: number;
  project: string | null;
  sessionId: string | null;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  thinking: number;
  total: number;
}

export interface SessionSummary {
  id: string;
  projectId: string;
  projectPath: string;
  title: string | null;
  firstPrompt: string | null;
  lastPrompt: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
  durationMs: number | null;
  counts: {
    records: number;
    userMessages: number;
    assistantMessages: number;
    toolUses: number;
    thinkingBlocks: number;
    sidechainRecords: number;
    errors: number;
  };
  toolUsage: Array<{ name: string; count: number }>;
  /** 이 세션에서 쓰인 스킬과 호출 횟수. 호출 순서를 잃지 않으려면 `firstUsedAt` 을 본다. */
  skillUsage: Array<{ name: string; count: number; firstUsedAt: string | null }>;
  models: string[];
  usage: TokenUsage;
  gitBranch: string | null;
  version: string | null;
  kind: string | null;
  fileSize: number;
  modifiedAt: number;
  live: LiveSession | null;
}

export interface ProjectSummary {
  id: string;
  path: string;
  sessionCount: number;
  liveSessionCount: number;
  lastActivityAt: string | null;
  usage: TokenUsage;
  messageCount: number;
}

export type TimelineBlock =
  | { type: "text"; text: string; truncated: boolean }
  | { type: "thinking"; text: string; truncated: boolean }
  | { type: "tool_use"; id: string | null; name: string; input: string; truncated: boolean }
  | { type: "tool_result"; toolUseId: string | null; text: string; isError: boolean; truncated: boolean }
  | { type: "image"; text: string; truncated: boolean };

export interface TimelineEntry {
  index: number;
  uuid: string | null;
  parentUuid: string | null;
  kind: string;
  role: string | null;
  timestamp: string | null;
  isSidechain: boolean;
  isMeta: boolean;
  isError: boolean;
  model: string | null;
  usage: TokenUsage | null;
  blocks: TimelineBlock[];
}

export interface Timeline {
  sessionId: string;
  total: number;
  offset: number;
  limit: number;
  entries: TimelineEntry[];
}

export interface Stats {
  projects: number;
  sessions: number;
  liveSessions: number;
  activeSessions: number;
  messages: number;
  usage: TokenUsage;
  models: Array<{ name: string; count: number }>;
  tools: Array<{ name: string; count: number }>;
  /** 스킬별 호출 수와 그 스킬을 쓴 세션 수. 상위 12개. */
  skills: Array<{ name: string; count: number; sessions: number }>;
  activityLast24h: number;
  updatedAt: string;
}

/** A directory the file browser is allowed to traverse. */
export interface FsRoot {
  /** URL-safe identifier. */
  id: string;
  name: string;
  /** Absolute path with symlinks resolved. */
  path: string;
}

export interface FsEntry {
  name: string;
  /** Relative to the root. The root itself is "". Always POSIX separators. */
  path: string;
  type: "file" | "dir";
  size: number;
  modifiedAt: number;
  /** Whether the extension is on the write allowlist (directories are always false). */
  editable: boolean;
  /** Only filled in by tree responses. */
  children?: FsEntry[];
  hasChildren?: boolean;
  /** Set when a directory had more entries than the tree is willing to walk. */
  truncated?: boolean;
}

export interface FsFile {
  root: string;
  path: string;
  name: string;
  size: number;
  modifiedAt: number;
  /** Optimistic locking key: `${modifiedAt}:${size}`. */
  version: string;
  /** Highlighting language guessed from the extension; "text" when unknown. */
  language: string;
  editable: boolean;
  encoding: "utf-8" | "binary";
  /** null when binary. */
  content: string | null;
}

export interface FsWriteResult {
  root: string;
  path: string;
  size: number;
  modifiedAt: number;
  version: string;
  created: boolean;
}

/** Emitted by the watcher when the observed data directory moves. */
export interface ChangeEvent {
  type: "change";
  fingerprint: string;
  transcripts: number;
  liveSessions: number;
  at: string;
  /** Sessions whose transcript size/mtime or live-session state moved. */
  changedSessions: string[];
  /** Sessions seen for the first time. */
  addedSessions: string[];
  /** Sessions that disappeared. */
  removedSessions: string[];
}
