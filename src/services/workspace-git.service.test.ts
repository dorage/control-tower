import { test, expect, beforeAll, afterAll } from "bun:test";
import { $ } from "bun";
import { mkdir, realpath, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FsRoot } from "../domain/types";
import { HttpError } from "../lib/http";
import { parseStatus, readGitStatus, runGitAction } from "./workspace.service";

/**
 * pull · commit · push 를 **진짜 git** 으로 검증한다. 원격은 네트워크 없이 같은 디스크의
 * bare 저장소다. 루트는 `workspace.service.test.ts` 와 같은 이유로 `roots` 인자로 주입한다.
 *
 * 순서에 의존하는 테스트다 - commit 다음에 push, 그다음 pull. 픽스처를 매번 새로 만드는 것보다
 * 실제 작업 흐름 그대로가 읽기 쉽고, `bun test` 는 파일 안의 test 를 선언 순서대로 돈다.
 */
const GIT = Bun.which("git");
const hasGit = GIT !== null;

let base: string;
let roots: FsRoot[];
let repo: string;
let other: string;
let origin: string;

async function git(...args: string[]): Promise<string> {
  return (await $`${GIT} -c user.name=t -c user.email=t@t ${args}`.text()).trim();
}

/** 서버 코드는 신원을 주입하지 않으므로 저장소 자체에 넣어 둔다. 사용자 gitconfig 에 기대지 않는다. */
async function identify(dir: string): Promise<void> {
  await git("-C", dir, "config", "user.name", "t");
  await git("-C", dir, "config", "user.email", "t@t");
}

const NOW = () => new Date("2026-09-26T00:00:00Z");

function expectHttp(error: unknown, status: number): HttpError {
  expect(error).toBeInstanceOf(HttpError);
  expect((error as HttpError).status).toBe(status);
  return error as HttpError;
}

beforeAll(async () => {
  if (!hasGit) return;
  base = await mkdtemp(join(tmpdir(), "ct-wsgit-"));
  const ws = join(base, "ws");
  await mkdir(ws, { recursive: true });

  origin = join(base, "origin.git");
  await git("init", "-q", "--bare", "-b", "main", origin);

  // 첫 클론이 origin 에 첫 커밋을 올린다. 그래야 두 번째 클론에 main 이 생긴다.
  repo = join(ws, "repo");
  await git("clone", "-q", origin, repo);
  await identify(repo);
  await git("-C", repo, "commit", "-q", "--allow-empty", "-m", "init");
  await git("-C", repo, "push", "-q", "-u", "origin", "main");

  other = join(base, "other");
  await git("clone", "-q", origin, other);
  await identify(other);

  // 루트 밖 체크아웃 하나 - git 동작을 거절해야 한다.
  await git("-C", repo, "worktree", "add", "-q", join(base, "outside"), "-b", "feat/out");

  roots = [{ id: "ws", name: "ws", path: await realpath(ws) }];
});

afterAll(async () => {
  if (!hasGit) return;
  await rm(base, { recursive: true, force: true });
});

// --- parseStatus: git 을 띄우지 않고 출력 형태만 본다 ---------------------------------

test("추적 브랜치와 앞뒤 커밋 수, 변경 항목 수를 읽는다", () => {
  expect(parseStatus("## main...origin/main [ahead 2, behind 1]\n M a.ts\n?? b.ts\n")).toEqual({
    branch: "main",
    upstream: "origin/main",
    ahead: 2,
    behind: 1,
    changed: 2,
  });
});

test("추적 브랜치가 없으면 upstream 은 null 이고 앞뒤는 0 이다", () => {
  expect(parseStatus("## feat/x\n")).toEqual({ branch: "feat/x", upstream: null, ahead: 0, behind: 0, changed: 0 });
});

test("detached HEAD 는 브랜치가 null 이다", () => {
  expect(parseStatus("## HEAD (no branch)\nA  c.ts\n").branch).toBeNull();
});

test("빈 저장소는 브랜치 이름만 안다", () => {
  expect(parseStatus("## No commits yet on main\n")).toEqual({
    branch: "main",
    upstream: null,
    ahead: 0,
    behind: 0,
    changed: 0,
  });
});

test("원격에서 사라진 추적 브랜치([gone])는 없는 것으로 본다", () => {
  expect(parseStatus("## feat/x...origin/feat/x [gone]\n").upstream).toBeNull();
});

// --- 실제 git ------------------------------------------------------------------------

test.if(hasGit)("깨끗한 클론은 변경 0, origin/main 과 나란하다", async () => {
  const status = await readGitStatus("repo", "main", roots);
  expect(status.branch).toBe("main");
  expect(status.upstream).toBe("origin/main");
  expect(status.changed).toBe(0);
  expect(status.ahead).toBe(0);
  expect(status.behind).toBe(0);
  expect(status.head).toBe(await git("-C", repo, "rev-parse", "HEAD"));
  expect(status.self).toBe(false);
});

test.if(hasGit)("커밋할 것이 없으면 409 다", async () => {
  await expect(runGitAction("repo", "main", "commit", roots, NOW)).rejects.toThrow(HttpError);
  try {
    await runGitAction("repo", "main", "commit", roots, NOW);
  } catch (error) {
    expect(expectHttp(error, 409).message).toBe("nothing to commit");
  }
});

test.if(hasGit)("commit 은 추적 안 된 파일까지 담고, 메시지는 KST 시각이다", async () => {
  await Bun.write(join(repo, "new.md"), "hello\n");
  expect((await readGitStatus("repo", "main", roots)).changed).toBe(1);

  const result = await runGitAction("repo", "main", "commit", roots, NOW);
  expect(result.action).toBe("commit");
  expect(result.message).toBe("2026-09-26 09:00:00");
  expect(await git("-C", repo, "log", "-1", "--format=%s")).toBe("2026-09-26 09:00:00");
  expect(result.status.changed).toBe(0);
  expect(result.status.ahead).toBe(1);
});

test.if(hasGit)("push 는 추적 브랜치로 올리고, 끝나면 앞선 커밋이 0 이다", async () => {
  const result = await runGitAction("repo", "main", "push", roots);
  expect(result.message).toBe("main 을 push 했습니다");
  expect(result.status.ahead).toBe(0);
  expect(result.status.head).toBe(await git("-C", origin, "rev-parse", "main"));

  const again = await runGitAction("repo", "main", "push", roots);
  expect(again.message).toBe("올릴 것이 없습니다");
});

test.if(hasGit)("pull 은 원격의 새 커밋을 fast-forward 로 받는다", async () => {
  await git("-C", other, "pull", "-q");
  await Bun.write(join(other, "from-other.md"), "x\n");
  await git("-C", other, "add", "-A");
  await git("-C", other, "commit", "-q", "-m", "other");
  await git("-C", other, "push", "-q");
  const expected = await git("-C", other, "rev-parse", "HEAD");

  const result = await runGitAction("repo", "main", "pull", roots);
  expect(result.message).toBe("pull 했습니다");
  expect(result.status.head).toBe(expected);
  expect(await Bun.file(join(repo, "from-other.md")).exists()).toBe(true);

  const again = await runGitAction("repo", "main", "pull", roots);
  expect(again.message).toBe("이미 최신입니다");
});

test.if(hasGit)("갈라진 브랜치는 pull 을 409 로 거절하고 워킹 트리를 건드리지 않는다", async () => {
  await Bun.write(join(repo, "local.md"), "l\n");
  await runGitAction("repo", "main", "commit", roots, NOW);
  const local = await git("-C", repo, "rev-parse", "HEAD");

  await Bun.write(join(other, "remote.md"), "r\n");
  await git("-C", other, "add", "-A");
  await git("-C", other, "commit", "-q", "-m", "diverge");
  await git("-C", other, "push", "-q");

  try {
    await runGitAction("repo", "main", "pull", roots);
    expect.unreachable();
  } catch (error) {
    const http = expectHttp(error, 409);
    expect(http.message).toStartWith("git pull failed");
    expect(typeof http.extra?.output).toBe("string");
  }
  expect(await git("-C", repo, "rev-parse", "HEAD")).toBe(local);
  expect((await readGitStatus("repo", "main", roots)).behind).toBe(1);
});

test.if(hasGit)("추적 브랜치가 없는 worktree 의 push 는 origin 에 같은 이름으로 올리고 추적을 건다", async () => {
  await git("-C", repo, "worktree", "add", "-q", join(repo, ".claude/worktrees/x"), "-b", "feat/x");
  expect((await readGitStatus("repo", "x", roots)).upstream).toBeNull();

  const result = await runGitAction("repo", "x", "push", roots);
  expect(result.message).toBe("feat/x 을 push 했습니다");
  expect(result.status.upstream).toBe("origin/feat/x");
  expect(result.status.head).toBe(await git("-C", origin, "rev-parse", "feat/x"));
});

test.if(hasGit)("detached HEAD 는 push 할 수 없다", async () => {
  await git("-C", repo, "worktree", "add", "-q", "--detach", join(repo, ".claude/worktrees/d"));
  try {
    await runGitAction("repo", "d", "push", roots);
    expect.unreachable();
  } catch (error) {
    expect(expectHttp(error, 409).message).toBe("detached HEAD cannot be pushed");
  }
});

test.if(hasGit)("없는 저장소·체크아웃은 404, 루트 밖 체크아웃은 403 이다", async () => {
  try {
    await readGitStatus("nope", "main", roots);
    expect.unreachable();
  } catch (error) {
    expectHttp(error, 404);
  }
  try {
    await readGitStatus("repo", "nope", roots);
    expect.unreachable();
  } catch (error) {
    expectHttp(error, 404);
  }
  try {
    await runGitAction("repo", "outside", "commit", roots, NOW);
    expect.unreachable();
  } catch (error) {
    expectHttp(error, 403);
  }
});
