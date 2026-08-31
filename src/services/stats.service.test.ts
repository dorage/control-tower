import { test, expect, beforeAll, afterAll } from "bun:test";
import { makeClaudeHome, sampleSession, skillSession, type FakeClaudeHome } from "../../test/helpers";
import { getStats } from "./stats.service";

/**
 * 두 프로젝트에 각각 스킬 세션을 하나씩 둔다. 호출 수와 세션 수가 다른 값이어야
 * 집계가 둘을 헷갈리지 않는지 확인할 수 있다.
 */
const PROJECT_A = "-home-u-app-a";
const PROJECT_B = "-home-u-app-b";
const PLAIN = "10000000-0000-4000-8000-000000000001";
const SKILL_A = "20000000-0000-4000-8000-000000000002";
const SKILL_B = "30000000-0000-4000-8000-000000000003";

let home: FakeClaudeHome;

beforeAll(async () => {
  home = await makeClaudeHome();
  process.env.CLAUDE_HOME = home.dir;
  await home.addTranscript(PROJECT_A, PLAIN, sampleSession(PLAIN));
  await home.addTranscript(PROJECT_A, SKILL_A, skillSession(SKILL_A));
  await home.addTranscript(PROJECT_B, SKILL_B, skillSession(SKILL_B));
});

afterAll(async () => {
  delete process.env.CLAUDE_HOME;
  await home.cleanup();
});

test("스킬 호출 수를 세션 전체에서 합친다", async () => {
  const stats = await getStats();
  // 세션마다 update-config 2회, code-review 1회.
  expect(stats.skills).toEqual([
    { name: "update-config", count: 4, sessions: 2 },
    { name: "code-review", count: 2, sessions: 2 },
  ]);
});

test("스킬을 쓰지 않은 세션은 sessions 에 들어가지 않는다", async () => {
  const stats = await getStats();
  expect(stats.sessions).toBe(3);
  for (const skill of stats.skills) expect(skill.sessions).toBe(2);
});

test("호출 수 내림차순으로 정렬한다", async () => {
  const stats = await getStats();
  const counts = stats.skills.map((skill) => skill.count);
  expect([...counts].sort((a, b) => b - a)).toEqual(counts);
});

test("툴 집계는 스킬 집계와 별개로 남는다", async () => {
  const stats = await getStats();
  // Skill 툴 호출 자체도 툴이다. 세션당 2회씩 두 세션.
  expect(stats.tools.find((tool) => tool.name === "Skill")).toEqual({ name: "Skill", count: 4 });
});
