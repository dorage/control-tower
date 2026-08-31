import { mkdtemp, mkdir, rm, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface FakeClaudeHome {
  dir: string;
  addTranscript(projectId: string, sessionId: string, lines: unknown[]): Promise<void>;
  /** Appends raw text, so a test can write a deliberately broken line. */
  appendRaw(projectId: string, sessionId: string, text: string): Promise<void>;
  addLiveSession(pid: number, data: Record<string, unknown>): Promise<void>;
  addHistory(entries: unknown[]): Promise<void>;
  cleanup(): Promise<void>;
}

/**
 * A throwaway `~/.claude` layout.
 *
 * Tests must never read or write the real home directory - a transcript there holds the
 * user's actual conversations. Everything here lives under `mkdtemp` and is removed in
 * `cleanup()`.
 *
 * `config.claudeDir` is a getter, so setting `process.env.CLAUDE_HOME` takes effect even
 * for modules that were already imported by another test file. A static import is fine;
 * the dynamic-import dance the task doc described is no longer needed.
 */
export async function makeClaudeHome(): Promise<FakeClaudeHome> {
  const dir = await mkdtemp(join(tmpdir(), "ct-home-"));
  await mkdir(join(dir, "projects"), { recursive: true });
  await mkdir(join(dir, "sessions"), { recursive: true });

  return {
    dir,
    async addTranscript(projectId, sessionId, lines) {
      await mkdir(join(dir, "projects", projectId), { recursive: true });
      const body = lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
      await writeFile(join(dir, "projects", projectId, `${sessionId}.jsonl`), body);
    },
    async appendRaw(projectId, sessionId, text) {
      await mkdir(join(dir, "projects", projectId), { recursive: true });
      await appendFile(join(dir, "projects", projectId, `${sessionId}.jsonl`), text);
    },
    async addLiveSession(pid, data) {
      await writeFile(join(dir, "sessions", `${pid}.json`), JSON.stringify({ pid, ...data }));
    },
    async addHistory(entries) {
      const body = entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
      await writeFile(join(dir, "history.jsonl"), body);
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

const BASE = Date.parse("2026-08-30T10:00:00.000Z");

/** Minutes after a fixed base, so assertions on ordering and duration are deterministic. */
export function at(minutes: number): string {
  return new Date(BASE + minutes * 60_000).toISOString();
}

export function usage(over: Partial<Record<string, number>> = {}) {
  return {
    input_tokens: over.input ?? 10,
    output_tokens: over.output ?? 20,
    cache_read_input_tokens: over.cacheRead ?? 30,
    cache_creation_input_tokens: over.cacheCreation ?? 40,
    output_tokens_details: { thinking_tokens: over.thinking ?? 5 },
  };
}

/**
 * A synthetic transcript covering every record shape the parser branches on.
 *
 * Built here rather than copied from a real session: real transcripts contain the user's
 * prompts and file contents.
 */
export function sampleSession(sessionId: string, cwd = "/home/u/my-app"): unknown[] {
  return [
    { type: "mode", mode: "default", sessionId, timestamp: at(0) },
    {
      type: "user",
      uuid: "u1",
      sessionId,
      cwd,
      gitBranch: "main",
      version: "2.1.251",
      timestamp: at(1),
      message: { role: "user", content: "첫 프롬프트입니다" },
    },
    {
      type: "assistant",
      uuid: "a1",
      parentUuid: "u1",
      sessionId,
      cwd,
      timestamp: at(2),
      message: {
        role: "assistant",
        model: "claude-opus-5",
        usage: usage(),
        content: [
          { type: "thinking", thinking: "생각 중" },
          { type: "text", text: "답변입니다" },
          { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } },
        ],
      },
    },
    {
      // tool_result 만 든 user 레코드는 사용자가 친 메시지가 아니다.
      type: "user",
      uuid: "u2",
      parentUuid: "a1",
      sessionId,
      cwd,
      timestamp: at(3),
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "a.txt\nb.txt" }],
      },
    },
    {
      type: "assistant",
      uuid: "a2",
      sessionId,
      cwd,
      timestamp: at(4),
      message: {
        role: "assistant",
        model: "claude-opus-5",
        usage: usage(),
        content: [{ type: "tool_use", id: "t2", name: "Read", input: { file_path: "/tmp/x" } }],
      },
    },
    {
      type: "user",
      uuid: "u3",
      sessionId,
      cwd,
      timestamp: at(5),
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t2", is_error: true, content: "ENOENT" }],
      },
    },
    {
      type: "assistant",
      uuid: "a3",
      sessionId,
      cwd,
      isApiErrorMessage: true,
      timestamp: at(6),
      message: { role: "assistant", content: [{ type: "text", text: "API 오류" }] },
    },
    {
      type: "user",
      uuid: "u4",
      sessionId,
      cwd,
      isSidechain: true,
      timestamp: at(7),
      message: { role: "user", content: [{ type: "text", text: "서브에이전트 프롬프트" }] },
    },
    {
      type: "user",
      uuid: "u5",
      sessionId,
      cwd,
      isMeta: true,
      timestamp: at(8),
      message: { role: "user", content: "메타 레코드" },
    },
    // 타임스탬프가 없는 레코드 — 시각 계산에서 건너뛰어야 한다.
    {
      type: "assistant",
      uuid: "a4",
      sessionId,
      cwd,
      message: { role: "assistant", content: [{ type: "text", text: "시각 없음" }] },
    },
    { type: "summary", summary: "요약 텍스트", sessionId, timestamp: at(9) },
    // 실제 레코드의 필드명은 `title` 이 아니라 `aiTitle` 이다.
    { type: "ai-title", aiTitle: "AI 가 붙인 제목", sessionId, timestamp: at(10) },
    { type: "attachment", sessionId, timestamp: at(11) },
    {
      type: "user",
      uuid: "u6",
      sessionId,
      cwd,
      timestamp: at(12),
      message: { role: "user", content: "두 번째 프롬프트" },
    },
  ];
}
