import { test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, appendFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let base: string;
let watch: typeof import("./watch.service");

/** `~/.claude` 대신 쓸 임시 데이터 디렉터리. 사용자의 실제 홈은 건드리지 않는다. */
const PROJECT = "-tmp-ct-watch";

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "ct-watch-"));
  await mkdir(join(base, "projects", PROJECT), { recursive: true });
  await mkdir(join(base, "sessions"), { recursive: true });
  process.env.CLAUDE_HOME = base;
  // config 는 claudeDir/paths 를 지연 평가하므로 여기서 바꿔도 반영된다.
  watch = await import("./watch.service");
});

afterAll(async () => {
  delete process.env.CLAUDE_HOME;
  await rm(base, { recursive: true, force: true });
});

beforeEach(() => watch.resetWatchState());

function transcript(sessionId: string): string {
  return join(base, "projects", PROJECT, `${sessionId}.jsonl`);
}

/** tick 을 돌리고 발생한 이벤트를 모아 돌려준다. 구독을 만들지 않으므로 타이머가 돌지 않는다. */
async function collect(...steps: Array<() => Promise<unknown> | unknown>) {
  const events: import("./watch.service").ChangeEvent[] = [];
  for (const step of steps) {
    await step();
    const event = await watch.tickOnce();
    if (event) events.push(event);
  }
  return events;
}

// ---------------------------------------------------------------- diffState (순수)

test("diffState 가 변경·추가·삭제를 분리한다", () => {
  const before = new Map([
    ["a", "1"],
    ["b", "1"],
    ["c", "1"],
  ]);
  const after = new Map([
    ["a", "1"],
    ["b", "2"],
    ["d", "1"],
  ]);
  expect(watch.diffState(before, after)).toEqual({
    changed: ["b"],
    added: ["d"],
    removed: ["c"],
  });
});

test("diffState 의 결과는 정렬돼 있다", () => {
  const after = new Map([
    ["z", "1"],
    ["m", "1"],
    ["a", "1"],
  ]);
  expect(watch.diffState(new Map(), after).added).toEqual(["a", "m", "z"]);
});

test("diffState 는 변화가 없으면 빈 배열 셋을 준다", () => {
  const state = new Map([["a", "1"]]);
  expect(watch.diffState(state, new Map(state))).toEqual({ changed: [], added: [], removed: [] });
});

// ---------------------------------------------------------------- tick 통합

test("첫 tick 은 기존 세션을 added 로 보고하지 않는다", async () => {
  await writeFile(transcript("s-seed"), '{"type":"user"}\n');
  const events = await collect(() => {});
  expect(events).toEqual([]);
});

test("트랜스크립트 append 는 그 세션만 changed 로 잡는다", async () => {
  await writeFile(transcript("s-one"), '{"type":"user"}\n');
  await writeFile(transcript("s-two"), '{"type":"user"}\n');

  const events = await collect(
    () => {}, // seed
    () => appendFile(transcript("s-one"), '{"type":"assistant"}\n'),
  );

  expect(events).toHaveLength(1);
  expect(events[0]!.changedSessions).toEqual(["s-one"]);
  expect(events[0]!.addedSessions).toEqual([]);
  expect(events[0]!.removedSessions).toEqual([]);
});

test("새 트랜스크립트는 added, 삭제는 removed 로 잡힌다", async () => {
  await writeFile(transcript("s-keep"), "x\n");

  const events = await collect(
    () => {},
    () => writeFile(transcript("s-new"), "y\n"),
    () => unlink(transcript("s-new")),
  );

  expect(events).toHaveLength(2);
  expect(events[0]!.addedSessions).toEqual(["s-new"]);
  expect(events[1]!.removedSessions).toEqual(["s-new"]);
});

test("라이브 세션 파일 변경도 같은 세션 키로 잡힌다", async () => {
  const live = join(base, "sessions", "live.json");
  await writeFile(transcript("s-live"), "x\n");

  const events = await collect(
    () => {},
    () =>
      writeFile(
        live,
        JSON.stringify({ sessionId: "s-live", pid: 424242, status: "running", updatedAt: 1 }),
      ),
    () =>
      writeFile(
        live,
        JSON.stringify({ sessionId: "s-live", pid: 424242, status: "idle", updatedAt: 2 }),
      ),
  );

  // 트랜스크립트가 이미 있는 세션이므로 added 가 아니라 changed 다.
  expect(events).toHaveLength(2);
  expect(events[0]!.changedSessions).toEqual(["s-live"]);
  expect(events[1]!.changedSessions).toEqual(["s-live"]);
  await unlink(live);
});

test("변화가 없으면 이벤트를 보내지 않는다", async () => {
  await writeFile(transcript("s-quiet"), "x\n");
  const events = await collect(
    () => {},
    () => {},
    () => {},
  );
  expect(events).toEqual([]);
});

test("이벤트가 기존 필드를 유지한다", async () => {
  await writeFile(transcript("s-shape"), "x\n");
  const events = await collect(
    () => {},
    () => appendFile(transcript("s-shape"), "y\n"),
  );
  const event = events[0]!;
  expect(event.type).toBe("change");
  expect(typeof event.fingerprint).toBe("string");
  expect(event.transcripts).toBeGreaterThan(0);
  expect(typeof event.liveSessions).toBe("number");
  expect(Date.parse(event.at)).toBeGreaterThan(0);
});

test("구독자가 0이 되면 타이머가 멈춘다", () => {
  const stop = watch.subscribe(() => {});
  expect(watch.subscriberCount()).toBe(1);
  stop();
  expect(watch.subscriberCount()).toBe(0);
  // 해지를 두 번 불러도 안전하다.
  stop();
  expect(watch.subscriberCount()).toBe(0);
});
