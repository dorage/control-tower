import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let base: string;
let service: typeof import("./session.service");

/** `~/.claude` 대신 쓸 임시 데이터 디렉터리. 사용자의 실제 홈은 건드리지 않는다. */
const PROJECT = "-tmp-ct-session";
const SESSION = "11111111-2222-3333-4444-555555555555";

/**
 * 실제 트랜스크립트의 축소판. 비율까지 흉내 냈다 - 사람이 쓴 줄은 하나, 모델의 말도 하나,
 * 나머지는 툴 왕복과 주입된 컨텍스트다.
 */
const RECORDS: unknown[] = [
  {
    type: "user",
    uuid: "u1",
    timestamp: "2026-08-31T00:00:00Z",
    message: { role: "user", content: "세션 뷰를 만들어줘" },
  },
  {
    type: "assistant",
    uuid: "a1",
    timestamp: "2026-08-31T00:00:01Z",
    message: { role: "assistant", content: [{ type: "thinking", thinking: "어디부터 볼까" }] },
  },
  {
    type: "assistant",
    uuid: "a2",
    timestamp: "2026-08-31T00:00:02Z",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "먼저 구조를 보겠습니다." },
        { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/tmp/a.ts" } },
      ],
    },
  },
  {
    type: "user",
    uuid: "u2",
    timestamp: "2026-08-31T00:00:03Z",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content: "파일 내용" }],
    },
  },
  {
    type: "attachment",
    uuid: "x1",
    timestamp: "2026-08-31T00:00:04Z",
    attachment: { type: "total_tokens_reminder" },
  },
  { type: "system", subtype: "turn_duration", uuid: "x2", timestamp: "2026-08-31T00:00:05Z", content: "12s" },
  { type: "mode", uuid: "x3", timestamp: "2026-08-31T00:00:06Z", mode: "default" },
  {
    // 사람이 쓴 것처럼 들어오지만 사람이 쓰지 않은 줄.
    type: "user",
    uuid: "x4",
    isMeta: true,
    timestamp: "2026-08-31T00:00:06.5Z",
    message: { role: "user", content: "<system-reminder>주입된 안내</system-reminder>" },
  },
  {
    type: "assistant",
    uuid: "a3",
    timestamp: "2026-08-31T00:00:07Z",
    isSidechain: true,
    message: { role: "assistant", content: [{ type: "text", text: "서브에이전트의 답" }] },
  },
];

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "ct-session-"));
  await mkdir(join(base, "projects", PROJECT), { recursive: true });
  await mkdir(join(base, "sessions"), { recursive: true });
  await writeFile(
    join(base, "projects", PROJECT, `${SESSION}.jsonl`),
    `${RECORDS.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );
  process.env.CLAUDE_HOME = base;
  // config 는 claudeDir/paths 를 지연 평가하므로 여기서 바꿔도 반영된다.
  service = await import("./session.service");
});

afterAll(async () => {
  delete process.env.CLAUDE_HOME;
  await rm(base, { recursive: true, force: true });
});

const uuids = (timeline: { entries: Array<{ uuid: string | null }> }) =>
  timeline.entries.map((entry) => entry.uuid);

test("기본값은 사람의 말과 모델의 답만 남긴다", async () => {
  const timeline = await service.getTimeline(SESSION);
  expect(timeline).not.toBeNull();
  // u2 는 툴 결과뿐이라 통째로 빠지고, a2 는 텍스트만 남는다.
  expect(uuids(timeline!)).toEqual(["u1", "a2"]);
  expect(timeline!.entries[1]!.blocks.map((block) => block.type)).toEqual(["text"]);
});

test("total 은 실제로 내려보낸 엔트리 수와 같다 - 페이지 경계가 화면과 어긋나지 않게", async () => {
  const timeline = await service.getTimeline(SESSION, { limit: 1000 });
  expect(timeline!.total).toBe(timeline!.entries.length);
});

test("tools=1 이면 툴 입력·결과가 돌아온다", async () => {
  const timeline = await service.getTimeline(SESSION, { includeTools: true });
  expect(uuids(timeline!)).toEqual(["u1", "a2", "u2"]);
  expect(timeline!.entries[1]!.blocks.map((block) => block.type)).toEqual(["text", "tool_use"]);
});

test("thinking=1 이면 사고 과정만 담긴 엔트리가 돌아온다", async () => {
  const timeline = await service.getTimeline(SESSION, { includeThinking: true });
  expect(uuids(timeline!)).toEqual(["u1", "a1", "a2"]);
});

test("attachment 와 system 은 대화가 아니라 이벤트로 묶인다", async () => {
  const off = await service.getTimeline(SESSION);
  expect(uuids(off!)).not.toContain("x1");
  expect(uuids(off!)).not.toContain("x2");

  const on = await service.getTimeline(SESSION, { includeEvents: true });
  // 이벤트를 켜면 본문(리마인더 종류·훅 요약)까지 그대로 보인다.
  expect(uuids(on!)).toEqual(["u1", "a2", "x1", "x2", "x3", "x4"]);
  const attachment = on!.entries[2]!.blocks[0]!;
  expect(attachment.type).toBe("text");
  expect(attachment.type === "text" ? attachment.text : "").toContain("total_tokens_reminder");
});

test("isMeta 는 사람이 쓴 줄이 아니므로 대화에서 뺀다", async () => {
  const off = await service.getTimeline(SESSION);
  expect(uuids(off!)).not.toContain("x4");
});

test("서브에이전트는 켤 때만 보인다", async () => {
  const off = await service.getTimeline(SESSION);
  expect(uuids(off!)).not.toContain("a3");

  const on = await service.getTimeline(SESSION, { includeSidechain: true });
  expect(uuids(on!)).toContain("a3");
});
