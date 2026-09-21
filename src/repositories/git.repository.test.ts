import { test, expect, beforeAll, afterAll } from "bun:test";
import { $ } from "bun";
import { mkdir, realpath, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeGit, readRepository } from "./git.repository";

/**
 * 픽스처를 손으로 만들지 않고 **진짜 git 으로** 만든다. 이 코드가 파싱하는 것은
 * 외부 규격(gitrepository-layout)이라, 손으로 흉내 낸 `.git` 은 실제 형태와
 * 어긋나기 쉽다(CONVENTIONS §11).
 */
const GIT = Bun.which("git");
const hasGit = GIT !== null;

let base: string;
let repo: string;
let mainHead = "";

/** 커밋에 필요한 신원을 전역 설정에 기대지 않는다. 테스트가 사용자 gitconfig 를 읽지 않게. */
async function git(...args: string[]): Promise<string> {
  return (await $`${GIT} -c user.name=t -c user.email=t@t ${args}`.text()).trim();
}

beforeAll(async () => {
  if (!hasGit) return;
  base = await mkdtemp(join(tmpdir(), "ct-git-"));
  repo = join(base, "repo");

  await git("init", "-q", "-b", "main", repo);
  await git("-C", repo, "commit", "-q", "--allow-empty", "-m", "init");
  mainHead = await git("-C", repo, "rev-parse", "HEAD");

  await git("-C", repo, "worktree", "add", "-q", join(base, "wt-a"), "-b", "feat/a");
  await git("-C", repo, "worktree", "add", "-q", "--detach", join(base, "wt-detached"));
  await git("-C", repo, "worktree", "add", "-q", join(base, "wt-locked"), "-b", "feat/locked");
  await git("-C", repo, "worktree", "lock", "--reason", "busy", join(base, "wt-locked"));

  // 디렉터리를 지워 prunable 로 만든다. `.git/worktrees/wt-gone` 항목만 남는다.
  await git("-C", repo, "worktree", "add", "-q", join(base, "wt-gone"), "-b", "feat/gone");
  await rm(join(base, "wt-gone"), { recursive: true, force: true });

  // 느슨한 참조를 없애 packed-refs 경로를 강제한다.
  await git("-C", repo, "pack-refs", "--all");

  // git 이 아닌 디렉터리, 그리고 HEAD 가 깨진 손수 만든 `.git`.
  await mkdir(join(base, "plain"), { recursive: true });
  await Bun.write(join(base, "broken/.git/HEAD"), "not a ref at all\n");
});

afterAll(async () => {
  if (!hasGit) return;
  await rm(base, { recursive: true, force: true });
});

test.if(hasGit)("probeGit 은 저장소·linked 작업 트리·평범한 디렉터리를 구분한다", async () => {
  expect(await probeGit(repo)).toBe("dir");
  expect(await probeGit(join(base, "wt-a"))).toBe("file");
  expect(await probeGit(join(base, "plain"))).toBe("none");
});

test.if(hasGit)("main 작업 트리의 브랜치와 HEAD 를 packed-refs 에서 푼다", async () => {
  // pack-refs 가 느슨한 참조를 치웠는지 먼저 확인한다 - 안 치웠으면 이 테스트가 무의미하다.
  expect(await Bun.file(join(repo, ".git/refs/heads/main")).exists()).toBe(false);

  const repository = await readRepository(repo);
  expect(repository).not.toBeNull();
  expect(repository!.main.kind).toBe("main");
  expect(repository!.main.name).toBe("main");
  expect(repository!.main.branch).toBe("main");
  expect(repository!.main.head).toBe(mainHead);
  expect(repository!.main.locked).toBeNull();
  expect(repository!.main.path).toBe(await realpath(repo));
});

test.if(hasGit)("linked 작업 트리는 이름순이고 prunable 은 빠진다", async () => {
  const repository = await readRepository(repo);
  const linked = repository!.linked;

  expect(linked.map((checkout) => checkout.name)).toEqual(["wt-a", "wt-detached", "wt-locked"]);
  expect(linked.every((checkout) => checkout.kind === "linked")).toBe(true);

  const a = linked[0]!;
  expect(a.branch).toBe("feat/a");
  expect(a.head).toBe(mainHead);
  expect(a.path).toBe(await realpath(join(base, "wt-a")));
  expect(a.locked).toBeNull();
});

test.if(hasGit)("detached HEAD 는 브랜치가 없고 SHA 만 있다", async () => {
  const repository = await readRepository(repo);
  const detached = repository!.linked.find((checkout) => checkout.name === "wt-detached")!;

  expect(detached.branch).toBeNull();
  expect(detached.head).toMatch(/^[0-9a-f]{40}$/);
});

test.if(hasGit)("잠긴 작업 트리는 사유를 그대로 돌려준다", async () => {
  const repository = await readRepository(repo);
  const locked = repository!.linked.find((checkout) => checkout.name === "wt-locked")!;

  expect(locked.locked).toBe("busy");
});

test.if(hasGit)("저장소가 아닌 디렉터리는 null 이다", async () => {
  // `.git` 이 없는 디렉터리와, `.git` 이 파일인 디렉터리(= linked 작업 트리 자신).
  expect(await readRepository(join(base, "plain"))).toBeNull();
  expect(await readRepository(join(base, "wt-a"))).toBeNull();
  expect(await readRepository(join(base, "does-not-exist"))).toBeNull();
});

test.if(hasGit)("깨진 HEAD 는 던지지 않고 null 두 개로 떨어진다", async () => {
  const repository = await readRepository(join(base, "broken"));

  expect(repository).not.toBeNull();
  expect(repository!.main.branch).toBeNull();
  expect(repository!.main.head).toBeNull();
  expect(repository!.linked).toEqual([]);
});
