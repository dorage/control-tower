import { test, expect, beforeAll, afterAll } from "bun:test";
import { makeClaudeHome, sampleSession, at, type FakeClaudeHome } from "../../test/helpers";
import { getSession, getTimeline, listSessions } from "./session.service";

/**
 * `CLAUDE_HOME` 은 파일당 하나다. `config.claudeDir` 가 getter 라서 언제든 바꿀 수는
 * 있지만, 서비스가 세션 요약을 캐시하므로 한 파일 안에서 홈을 갈아치우면 캐시가
 * 섞인다. 다른 홈이 필요하면 테스트 파일을 나눈다.
 */
const PROJECT = "-home-u-my-app";
const SESSION = "11111111-2222-4333-8444-555555555555";

let home: FakeClaudeHome;

beforeAll(async () => {
  home = await makeClaudeHome();
  process.env.CLAUDE_HOME = home.dir;
  await home.addTranscript(PROJECT, SESSION, sampleSession(SESSION));
  // 깨진 줄이 있어도 나머지가 살아야 한다.
  await home.appendRaw(PROJECT, SESSION, '{"type":"user","message":{"role"\n');
});

afterAll(async () => {
  delete process.env.CLAUDE_HOME;
  await home.cleanup();
});

// ---------------------------------------------------------------- 요약

test("tool_result 만 든 user 레코드는 사용자 메시지로 세지 않는다", async () => {
  const summary = await getSession(SESSION);
  // u1, u6 만 진짜 프롬프트다. u2·u3 은 tool_result, u4 는 sidechain, u5 는 meta.
  expect(summary!.counts.userMessages).toBe(2);
});

test("tool_use 블록 수와 툴별 집계가 맞다", async () => {
  const summary = await getSession(SESSION);
  expect(summary!.counts.toolUses).toBe(2);
  expect(summary!.toolUsage).toEqual([
    { name: "Bash", count: 1 },
    { name: "Read", count: 1 },
  ]);
});

test("thinking 블록을 센다", async () => {
  const summary = await getSession(SESSION);
  expect(summary!.counts.thinkingBlocks).toBe(1);
});

test("errors 는 isApiErrorMessage 와 is_error tool_result 의 합이다", async () => {
  const summary = await getSession(SESSION);
  expect(summary!.counts.errors).toBe(2);
});

test("sidechain 레코드를 센다", async () => {
  const summary = await getSession(SESSION);
  expect(summary!.counts.sidechainRecords).toBe(1);
});

test("usage.total 이 네 항목의 합이다", async () => {
  const summary = await getSession(SESSION);
  const { input, output, cacheRead, cacheCreation, total } = summary!.usage;
  expect(total).toBe(input + output + cacheRead + cacheCreation);
  // usage 를 가진 assistant 레코드가 둘이다.
  expect(input).toBe(20);
  expect(output).toBe(40);
});

test("aiTitle 이 있으면 제목으로 쓴다", async () => {
  const summary = await getSession(SESSION);
  expect(summary!.title).toBe("AI 가 붙인 제목");
});

/**
 * projectPath 는 레코드의 cwd 를 쓴다. 디렉터리 이름에서 복원하면 `my-app` 이
 * `my/app` 이 된다 — decodeProjectId 의 알려진 한계(text.test.ts 참조).
 */
test("projectPath 는 decodeProjectId 가 아니라 레코드의 cwd 를 쓴다", async () => {
  const summary = await getSession(SESSION);
  expect(summary!.projectPath).toBe("/home/u/my-app");
});

test("타임스탬프 없는 레코드를 건너뛰고 시각을 계산한다", async () => {
  const summary = await getSession(SESSION);
  expect(summary!.startedAt).toBe(at(0));
  expect(summary!.lastActivityAt).toBe(at(12));
});

test("gitBranch 와 version 을 레코드에서 가져온다", async () => {
  const summary = await getSession(SESSION);
  expect(summary!.gitBranch).toBe("main");
  expect(summary!.version).toBe("2.1.251");
});

test("없는 세션은 null 이다", async () => {
  expect(await getSession("no-such-session")).toBe(null);
});

// ---------------------------------------------------------------- 타임라인

test("기본 타임라인에는 이벤트 엔트리가 없다", async () => {
  const timeline = await getTimeline(SESSION);
  expect(timeline!.entries.every((entry) => entry.kind !== "event")).toBe(true);
});

// 서비스의 옵션명은 includeEvents/includeSidechain 이다.
// events/sidechain 은 라우트가 받는 쿼리 파라미터 이름이고, 라우트가 변환한다.
test("includeEvents: true 면 이벤트 엔트리가 포함된다", async () => {
  const timeline = await getTimeline(SESSION, { includeEvents: true });
  const events = timeline!.entries.filter((entry) => entry.kind === "event");
  expect(events.length).toBeGreaterThan(0);
  // 이벤트 엔트리의 본문은 eventLabel 한 줄이다.
  const title = events.find((entry) => entry.blocks[0]?.type === "text" &&
    (entry.blocks[0] as { text: string }).text.startsWith("title:"));
  expect(title).toBeDefined();
});

test("includeSidechain: false 면 sidechain 엔트리가 빠진다", async () => {
  const withSide = await getTimeline(SESSION, { includeSidechain: true });
  const without = await getTimeline(SESSION, { includeSidechain: false });
  expect(without!.total).toBeLessThan(withSide!.total);
});

test("offset/limit 이 슬라이싱하고 total 은 전체 수다", async () => {
  const all = await getTimeline(SESSION);
  const page = await getTimeline(SESSION, { offset: 1, limit: 2 });
  expect(page!.total).toBe(all!.total);
  expect(page!.entries).toHaveLength(2);
  expect(page!.entries[0]!.index).toBe(all!.entries[1]!.index);
});

test("없는 세션의 타임라인은 null 이다", async () => {
  expect(await getTimeline("no-such-session")).toBe(null);
});

// ---------------------------------------------------------------- 목록과 캐시

test("listSessions 가 세션을 돌려준다", async () => {
  const result = await listSessions();
  expect(result.total).toBe(1);
  expect(result.sessions[0]!.id).toBe(SESSION);
});

test("같은 세션을 두 번 요약해도 결과가 같다 (캐시)", async () => {
  const first = await getSession(SESSION);
  const second = await getSession(SESSION);
  expect(second).toEqual(first);
});

test("파일이 커지면 갱신된 요약이 나온다 (캐시 무효화)", async () => {
  const before = await getSession(SESSION);
  await home.appendRaw(
    PROJECT,
    SESSION,
    JSON.stringify({
      type: "user",
      uuid: "u9",
      sessionId: SESSION,
      cwd: "/home/u/my-app",
      timestamp: at(30),
      message: { role: "user", content: "나중에 추가된 프롬프트" },
    }) + "\n",
  );
  const after = await getSession(SESSION);
  expect(after!.counts.userMessages).toBe(before!.counts.userMessages + 1);
  expect(after!.lastActivityAt).toBe(at(30));
});
