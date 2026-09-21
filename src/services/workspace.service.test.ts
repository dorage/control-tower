import { test, expect, beforeAll, afterAll } from "bun:test";
import { $ } from "bun";
import { mkdir, realpath, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FsRoot } from "../domain/types";
import { listRepos } from "./workspace.service";

/**
 * 루트를 `WORKSPACE_ROOTS` 로 세우지 않고 `listRepos(roots)` 에 직접 넣는다.
 *
 * `fs.service` 의 `getRoots()` 는 프로세스당 한 번만 계산해 모듈에 남긴다. `bun test` 는
 * 테스트 파일 사이에 모듈 레지스트리를 공유하므로(CONVENTIONS §11), 다른 테스트 파일이
 * 먼저 자기 루트를 캐시해 두면 여기서 환경변수를 무엇으로 바꾸든 반영되지 않는다.
 * 동적 `import` 로도 해결되지 않는다 — 이미 평가된 모듈이 그대로 돌아온다.
 *
 * 픽스처는 **진짜 git** 으로 만든다. `.git/worktrees` 의 형태를 손으로 흉내 내지 않는다.
 */
const GIT = Bun.which("git");
const hasGit = GIT !== null;

let base: string;
let roots: FsRoot[];

async function git(...args: string[]): Promise<string> {
  return (await $`${GIT} -c user.name=t -c user.email=t@t ${args}`.text()).trim();
}

/** 커밋 하나를 가진 저장소를 만든다. */
async function initRepo(dir: string): Promise<void> {
  await git("init", "-q", "-b", "main", dir);
  await git("-C", dir, "commit", "-q", "--allow-empty", "-m", "init");
}

beforeAll(async () => {
  if (!hasGit) return;
  base = await mkdtemp(join(tmpdir(), "ct-ws-"));
  const a = join(base, "a");
  const b = join(base, "b");
  await mkdir(a, { recursive: true });
  await mkdir(b, { recursive: true });

  const one = join(a, "repo-one");
  await initRepo(one);
  // 관례상의 자리. 숨김 디렉터리 아래라 탐색에는 안 걸리고, 체크아웃으로만 나와야 한다.
  await git("-C", one, "worktree", "add", "-q", join(one, ".claude/worktrees/x"), "-b", "feat/x");
  // 루트 밖. 목록에는 나오되 열 수 없다고 표시돼야 한다.
  await git("-C", one, "worktree", "add", "-q", join(base, "outside/wt-out"), "-b", "feat/out");
  // 루트 직계에 놓인 linked 작업 트리. `.git` 이 파일이라 저장소로 잡히면 안 된다.
  await git("-C", one, "worktree", "add", "-q", join(a, "linked-only"), "-b", "feat/linked");

  // 깊이 2 저장소는 잡히고, 깊이 3 은 잡히지 않는다.
  await initRepo(join(a, "plain/nested-repo"));
  await initRepo(join(a, "plain/deeper/too-deep"));

  // 건너뛰어야 하는 것들.
  await initRepo(join(a, "node_modules/fake-repo"));
  await initRepo(join(a, ".hidden-repo"));

  await initRepo(join(b, "repo-two"));

  roots = [
    { id: "a", name: "a", path: await realpath(a) },
    { id: "b", name: "b", path: await realpath(b) },
  ];
});

afterAll(async () => {
  if (!hasGit) return;
  await rm(base, { recursive: true, force: true });
});

test.if(hasGit)("루트 아래 저장소를 이름순으로 모으고, 건너뛸 것은 건너뛴다", async () => {
  const repos = await listRepos(roots);

  expect(repos.map((repo) => repo.id)).toEqual(["nested-repo", "repo-one", "repo-two"]);
  expect(repos.map((repo) => repo.name)).toEqual(["nested-repo", "repo-one", "repo-two"]);
  // node_modules · 숨김 · 깊이 3 · linked 작업 트리는 저장소가 아니다.
  expect(repos.some((repo) => repo.name === "fake-repo")).toBe(false);
  expect(repos.some((repo) => repo.name === ".hidden-repo")).toBe(false);
  expect(repos.some((repo) => repo.name === "too-deep")).toBe(false);
  expect(repos.some((repo) => repo.name === "linked-only")).toBe(false);
});

test.if(hasGit)("main 작업 트리가 첫 번째고 linked 가 이름순으로 뒤따른다", async () => {
  const one = (await listRepos(roots)).find((repo) => repo.id === "repo-one")!;

  expect(one.checkouts[0]!.kind).toBe("main");
  expect(one.checkouts[0]!.id).toBe("main");
  expect(one.checkouts[0]!.branch).toBe("main");
  expect(one.checkouts.map((checkout) => checkout.id)).toEqual([
    "main",
    "linked-only",
    "wt-out",
    "x",
  ]);
  expect(one.path).toBe(await realpath(join(base, "a/repo-one")));
});

test.if(hasGit)("루트 안의 체크아웃은 루트 id 와 상대경로를 갖는다", async () => {
  const one = (await listRepos(roots)).find((repo) => repo.id === "repo-one")!;
  const x = one.checkouts.find((checkout) => checkout.id === "x")!;

  expect(x.root).toBe("a");
  expect(x.relPath).toBe("repo-one/.claude/worktrees/x");
  expect(x.branch).toBe("feat/x");
  expect(x.head).toMatch(/^[0-9a-f]{40}$/);
  expect(x.locked).toBeNull();

  const main = one.checkouts[0]!;
  expect(main.root).toBe("a");
  expect(main.relPath).toBe("repo-one");
});

test.if(hasGit)("루트 밖의 체크아웃은 열 수 없다고 표시된다", async () => {
  const one = (await listRepos(roots)).find((repo) => repo.id === "repo-one")!;
  const out = one.checkouts.find((checkout) => checkout.id === "wt-out")!;

  expect(out.root).toBeNull();
  expect(out.relPath).toBeNull();
  expect(out.path).toBe(await realpath(join(base, "outside/wt-out")));
});

test.if(hasGit)("깊이 2 저장소는 두 번째 루트의 저장소와 함께 잡힌다", async () => {
  const repos = await listRepos(roots);
  const nested = repos.find((repo) => repo.id === "nested-repo")!;
  const two = repos.find((repo) => repo.id === "repo-two")!;

  expect(nested.checkouts[0]!.relPath).toBe("plain/nested-repo");
  expect(nested.checkouts[0]!.root).toBe("a");
  expect(two.checkouts[0]!.root).toBe("b");
  expect(two.checkouts[0]!.relPath).toBe("repo-two");
});

test.if(hasGit)("루트가 없으면 빈 목록이다", async () => {
  expect(await listRepos([])).toEqual([]);
});
