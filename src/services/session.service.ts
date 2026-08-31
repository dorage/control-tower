import { config } from "../config";
import type {
  SessionSummary,
  Timeline,
  TimelineBlock,
  TimelineEntry,
  TokenUsage,
  TranscriptRecord,
  RawUsage,
} from "../domain/types";
import { decodeProjectId, stripAnsi, truncate } from "../lib/text";
import {
  findTranscriptFile,
  listTranscriptFiles,
  readTranscript,
  type TranscriptFileRef,
} from "../repositories/transcript.repository";
import { getLiveSessionMap } from "./live.service";

/** Record types that carry no conversation content - hidden unless explicitly asked for. */
const EVENT_TYPES = new Set([
  "mode",
  "permission-mode",
  "ai-title",
  "agent-name",
  "atis-latch",
  "bridge-session",
  "last-prompt",
  "file-history-snapshot",
  "summary",
  "auto_mode",
]);

export function emptyUsage(): TokenUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, thinking: 0, total: 0 };
}

function usageOf(raw: RawUsage | undefined): TokenUsage | null {
  if (!raw) return null;
  const usage: TokenUsage = {
    input: raw.input_tokens ?? 0,
    output: raw.output_tokens ?? 0,
    cacheRead: raw.cache_read_input_tokens ?? 0,
    cacheCreation: raw.cache_creation_input_tokens ?? 0,
    thinking: raw.output_tokens_details?.thinking_tokens ?? 0,
    total: 0,
  };
  usage.total = usage.input + usage.output + usage.cacheRead + usage.cacheCreation;
  return usage;
}

export function addUsage(target: TokenUsage, source: TokenUsage | null): TokenUsage {
  if (!source) return target;
  target.input += source.input;
  target.output += source.output;
  target.cacheRead += source.cacheRead;
  target.cacheCreation += source.cacheCreation;
  target.thinking += source.thinking;
  target.total += source.total;
  return target;
}

function asBlocks(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value.filter((b) => typeof b === "object" && b !== null) as Record<string, unknown>[]) : [];
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function block(type: "text" | "thinking", raw: string): TimelineBlock {
  const { text, truncated } = truncate(stripAnsi(raw), config.maxBlockChars);
  return { type, text, truncated };
}

function blocksOf(record: TranscriptRecord): TimelineBlock[] {
  if (record.type === "system") return [block("text", textOf(record.content))];

  if (record.type === "attachment") {
    const attachment = record.attachment ?? {};
    const label = attachment.displayPath ?? attachment.path ?? "";
    return [block("text", `[attachment: ${attachment.type ?? "unknown"}]${label ? ` ${label}` : ""}`)];
  }

  const content = record.message?.content;
  if (typeof content === "string") return content ? [block("text", content)] : [];

  const out: TimelineBlock[] = [];
  for (const raw of asBlocks(content)) {
    const type = typeof raw.type === "string" ? raw.type : "";
    if (type === "text") {
      out.push(block("text", typeof raw.text === "string" ? raw.text : ""));
    } else if (type === "thinking") {
      const thinking = typeof raw.thinking === "string" ? raw.thinking : "";
      out.push(block("thinking", thinking || "(redacted thinking)"));
    } else if (type === "tool_use") {
      const serialized = JSON.stringify(raw.input ?? {}, null, 2);
      const { text, truncated } = truncate(serialized, config.maxBlockChars);
      out.push({
        type: "tool_use",
        id: typeof raw.id === "string" ? raw.id : null,
        name: typeof raw.name === "string" ? raw.name : "unknown",
        input: text,
        truncated,
      });
    } else if (type === "tool_result") {
      const { text, truncated } = truncate(stripAnsi(textOf(raw.content)), config.maxBlockChars);
      out.push({
        type: "tool_result",
        toolUseId: typeof raw.tool_use_id === "string" ? raw.tool_use_id : null,
        text,
        isError: raw.is_error === true,
        truncated,
      });
    } else if (type === "image") {
      out.push({ type: "image", text: "[image]", truncated: false });
    }
  }
  return out;
}

function isConversational(record: TranscriptRecord): boolean {
  const type = record.type ?? "";
  if (EVENT_TYPES.has(type)) return false;
  return type === "user" || type === "assistant" || type === "system" || type === "attachment";
}

/**
 * 사람과 모델이 주고받은 말인가.
 *
 * `system`(훅 요약·턴 소요)과 `attachment`(토큰 리마인더·스킬 목록 등 주입된 컨텍스트)는
 * 본문이 있으니 렌더는 되지만 대화는 아니다. 실측 트랜스크립트 735줄에서 이 둘이 142줄,
 * 그중 attachment 136줄이 `total_tokens_reminder` 류였다. 기본 화면에서는 이벤트로 취급해
 * 감추고, `events=1` 일 때만 되살린다.
 */
function isDialogue(record: TranscriptRecord): boolean {
  // isMeta 는 사람이 쓴 것처럼 들어오지만 사람이 쓰지 않은 줄이다 - 인터럽트 리마인더,
  // /context 출력, local-command caveat. 요약 쪽 isUserPrompt 도 같은 이유로 이미 뺀다.
  if (record.isMeta === true) return false;
  const type = record.type ?? "";
  return type === "user" || type === "assistant";
}

/** 블록 단위 필터. 사고 과정과 툴 입출력은 요청이 있을 때만 내려보낸다. */
function keepBlock(block: TimelineBlock, thinking: boolean, tools: boolean): boolean {
  if (block.type === "thinking") return thinking;
  if (block.type === "tool_use" || block.type === "tool_result") return tools;
  return true;
}

function eventLabel(record: TranscriptRecord): string {
  const type = record.type ?? "unknown";
  if (type === "ai-title") return `title: ${record.aiTitle ?? ""}`;
  if (type === "agent-name") return `agent name: ${record.agentName ?? ""}`;
  if (type === "summary") return `summary: ${record.summary ?? ""}`;
  if (type === "mode") return `mode: ${record.mode ?? ""}`;
  if (type === "permission-mode") return `permission mode: ${record.permissionMode ?? ""}`;
  return type;
}

function toTimelineEntry(record: TranscriptRecord, index: number): TimelineEntry {
  const conversational = isConversational(record);
  const blocks = conversational ? blocksOf(record) : [block("text", eventLabel(record))];
  return {
    index,
    uuid: typeof record.uuid === "string" ? record.uuid : null,
    parentUuid: typeof record.parentUuid === "string" ? record.parentUuid : null,
    kind: conversational ? (record.type ?? "unknown") : "event",
    role: record.message?.role ?? null,
    timestamp: typeof record.timestamp === "string" ? record.timestamp : null,
    isSidechain: record.isSidechain === true,
    isMeta: record.isMeta === true,
    isError: record.isApiErrorMessage === true || blocks.some((b) => b.type === "tool_result" && b.isError),
    model: record.message?.model ?? null,
    usage: usageOf(record.message?.usage),
    blocks,
  };
}

/** A user record that is a real prompt, not a tool result echoed back to the model. */
function isUserPrompt(record: TranscriptRecord): boolean {
  if (record.type !== "user" || record.isMeta === true || record.isSidechain === true) return false;
  const content = record.message?.content;
  if (typeof content === "string") return content.trim().length > 0;
  return asBlocks(content).some((b) => b.type === "text");
}

function buildSummary(ref: TranscriptFileRef, records: TranscriptRecord[]): SessionSummary {
  const usage = emptyUsage();
  const models = new Set<string>();
  const tools = new Map<string, number>();

  let title: string | null = null;
  let firstPrompt: string | null = null;
  let lastPrompt: string | null = null;
  let firstTimestamp: string | null = null;
  let lastTimestamp: string | null = null;
  let cwd: string | null = null;
  let gitBranch: string | null = null;
  let version: string | null = null;
  let kind: string | null = null;

  const counts = {
    records: records.length,
    userMessages: 0,
    assistantMessages: 0,
    toolUses: 0,
    thinkingBlocks: 0,
    sidechainRecords: 0,
    errors: 0,
  };

  for (const record of records) {
    if (typeof record.timestamp === "string") {
      firstTimestamp ??= record.timestamp;
      lastTimestamp = record.timestamp;
    }
    if (typeof record.cwd === "string") cwd = record.cwd;
    if (typeof record.gitBranch === "string") gitBranch = record.gitBranch;
    if (typeof record.version === "string") version = record.version;
    if (typeof record.sessionKind === "string") kind = record.sessionKind;
    if (typeof record.aiTitle === "string" && record.aiTitle) title = record.aiTitle;
    else if (typeof record.agentName === "string" && record.agentName) title ??= record.agentName;
    if (record.isSidechain === true) counts.sidechainRecords += 1;
    if (record.isApiErrorMessage === true) counts.errors += 1;

    if (record.type === "user" && isUserPrompt(record)) {
      counts.userMessages += 1;
      const prompt = stripAnsi(textOf(record.message?.content)).trim();
      if (prompt) {
        firstPrompt ??= prompt.slice(0, 400);
        lastPrompt = prompt.slice(0, 400);
      }
    }

    if (record.type === "assistant") {
      counts.assistantMessages += 1;
      if (record.message?.model) models.add(record.message.model);
      addUsage(usage, usageOf(record.message?.usage));
      for (const raw of asBlocks(record.message?.content)) {
        if (raw.type === "thinking") counts.thinkingBlocks += 1;
        if (raw.type === "tool_use") {
          counts.toolUses += 1;
          const name = typeof raw.name === "string" ? raw.name : "unknown";
          tools.set(name, (tools.get(name) ?? 0) + 1);
        }
      }
    }

    if (record.type === "user") {
      for (const raw of asBlocks(record.message?.content)) {
        if (raw.type === "tool_result" && raw.is_error === true) counts.errors += 1;
      }
    }
  }

  const startedAt = firstTimestamp;
  const lastActivityAt = lastTimestamp ?? new Date(ref.modifiedAt).toISOString();

  return {
    id: ref.sessionId,
    projectId: ref.projectId,
    projectPath: cwd ?? decodeProjectId(ref.projectId),
    title: title ?? (firstPrompt ? firstPrompt.slice(0, 80) : null),
    firstPrompt,
    lastPrompt,
    startedAt,
    lastActivityAt,
    durationMs:
      startedAt && lastTimestamp ? new Date(lastTimestamp).getTime() - new Date(startedAt).getTime() : null,
    counts,
    toolUsage: [...tools.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    models: [...models],
    usage,
    gitBranch,
    version,
    kind,
    fileSize: ref.size,
    modifiedAt: ref.modifiedAt,
    live: null,
  };
}

const summaryCache = new Map<string, { key: string; summary: SessionSummary }>();

async function summaryFor(ref: TranscriptFileRef): Promise<SessionSummary> {
  const key = `${ref.size}:${ref.modifiedAt}`;
  const cached = summaryCache.get(ref.path);
  if (cached && cached.key === key) return { ...cached.summary };

  const summary = buildSummary(ref, await readTranscript(ref));
  summaryCache.set(ref.path, { key, summary });
  return { ...summary };
}

export interface ListSessionsOptions {
  projectId?: string | null;
  query?: string | null;
  limit?: number;
  offset?: number;
}

export interface ListSessionsResult {
  total: number;
  offset: number;
  limit: number;
  sessions: SessionSummary[];
}

export async function listSessions(options: ListSessionsOptions = {}): Promise<ListSessionsResult> {
  const { projectId = null, query = null, limit = 100, offset = 0 } = options;
  const files = await listTranscriptFiles();
  const live = await getLiveSessionMap();

  let summaries = await Promise.all(
    files
      .filter((file) => !projectId || file.projectId === projectId)
      .map(async (file) => {
        const summary = await summaryFor(file);
        summary.live = live.get(summary.id) ?? null;
        return summary;
      }),
  );

  if (query) {
    const needle = query.toLowerCase();
    summaries = summaries.filter((summary) =>
      [summary.id, summary.title, summary.firstPrompt, summary.projectPath, summary.projectId]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(needle)),
    );
  }

  summaries.sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));

  return {
    total: summaries.length,
    offset,
    limit,
    sessions: summaries.slice(offset, offset + limit),
  };
}

export async function getSession(sessionId: string): Promise<SessionSummary | null> {
  const ref = await findTranscriptFile(sessionId);
  if (!ref) return null;
  const summary = await summaryFor(ref);
  summary.live = (await getLiveSessionMap()).get(sessionId) ?? null;
  return summary;
}

export interface TimelineOptions {
  limit?: number;
  offset?: number;
  includeEvents?: boolean;
  includeSidechain?: boolean;
  /** 사고 과정 블록을 내려보낸다. */
  includeThinking?: boolean;
  /** 툴 입력·결과 블록을 내려보낸다. */
  includeTools?: boolean;
}

export async function getTimeline(sessionId: string, options: TimelineOptions = {}): Promise<Timeline | null> {
  const {
    limit = 200,
    offset = 0,
    includeEvents = false,
    includeSidechain = false,
    includeThinking = false,
    includeTools = false,
  } = options;
  const ref = await findTranscriptFile(sessionId);
  if (!ref) return null;

  const records = await readTranscript(ref);
  const entries: TimelineEntry[] = [];
  records.forEach((record, index) => {
    if (!includeEvents && !isDialogue(record)) return;
    if (!includeSidechain && record.isSidechain === true) return;

    const entry = toTimelineEntry(record, index);
    entry.blocks = entry.blocks.filter((b) => keepBlock(b, includeThinking, includeTools));
    // 남은 블록이 없으면 화면에 아무것도 그리지 못하는 엔트리다. 여기서 버려야
    // total 과 페이지 경계가 실제로 보이는 개수와 일치한다 - 툴 결과만 담긴
    // user 레코드가 트랜스크립트의 다수라, 안 버리면 200개 페이지에 20개만 뜬다.
    if (entry.blocks.length === 0) return;
    entries.push(entry);
  });

  return {
    sessionId,
    total: entries.length,
    offset,
    limit,
    entries: entries.slice(offset, offset + limit),
  };
}
