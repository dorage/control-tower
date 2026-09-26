/**
 * 워크스페이스 루트 아래의 git 저장소를 모아, 같은 저장소의 작업 트리를 한 항목으로 묶는다.
 *
 * 파일 접근은 만들지 않는다. 각 체크아웃이 어느 파일 API 루트에 속하는지(`root`/`relPath`)만
 * 알려 주고, 실제 읽기는 화면이 기존 `/api/fs/*` 로 한다 — 경로 관문(`resolvePath`)을
 * 우회하는 길을 하나도 늘리지 않기 위해서다.
 */
import { realpath } from "node:fs/promises";
import { basename, join } from "node:path";
import type { FsRoot } from "../domain/types";
import type {
  WorkspaceCheckout,
  WorkspaceGitAction,
  WorkspaceGitResult,
  WorkspaceGitStatus,
  WorkspaceRepo,
} from "../domain/workspace";
import { HttpError } from "../lib/http";
import { formatTimestamp, KST } from "../lib/time";
import { readDirectory } from "../repositories/fs.repository";
import { type GitRun, runGit } from "../repositories/git-command.repository";
import { probeGit, readRepository, type RawCheckout, type RawRepository } from "../repositories/git.repository";
import { getRoots, locate, slugify } from "./fs.service";

/**
 * 루트의 직계와 그 아래 한 단계까지만 본다.
 *
 * 워크스페이스는 보통 `~/workspace/<프로젝트>` 이고, 묶음 디렉터리를 하나 둔
 * `~/workspace/<묶음>/<프로젝트>` 까지가 실제로 쓰이는 형태다. 더 내려가면
 * 저장소 안의 `vendor/*` 같은 것까지 훑게 된다.
 */
const SCAN_DEPTH = 2;

/** 내려가지 않는 디렉터리. 숨김은 `.git` 자신을 포함해 전부 뜻이 없다. */
function skippable(name: string): boolean {
  return name.startsWith(".") || name === "node_modules";
}

async function scan(dir: string, depth: number, out: RawRepository[], seen: Set<string>): Promise<void> {
  let entries;
  try {
    entries = await readDirectory(dir);
  } catch {
    // 권한 없는 디렉터리 하나가 전체 목록을 죽이지 않게 한다. 그 가지만 포기한다.
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory || skippable(entry.name)) continue;
    const child = join(dir, entry.name);

    const probe = await probeGit(child);
    if (probe === "dir") {
      const repository = await readRepository(child);
      // 루트가 겹치면 같은 저장소를 두 번 만날 수 있다.
      if (repository && !seen.has(repository.main.path)) {
        seen.add(repository.main.path);
        out.push(repository);
      }
      continue;
    }
    // `.git` 이 파일이면 linked 작업 트리이거나 서브모듈이다. 저장소가 아니고, 내려갈 것도 없다.
    if (probe === "file") continue;
    if (depth > 1) await scan(child, depth - 1, out, seen);
  }
}

/** 이미 쓴 id 면 `-2`, `-3` 을 붙인다. */
function unique(used: Set<string>, base: string): string {
  let id = base;
  for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
  used.add(id);
  return id;
}

function byName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function toCheckout(raw: RawCheckout, id: string, roots: FsRoot[]): WorkspaceCheckout {
  // 루트 밖의 체크아웃은 목록에는 남기되 열 수 없다고 알린다. 파일 API 가 루트 밖을 열지 않는다.
  const found = locate(roots, raw.path);
  return {
    id,
    kind: raw.kind,
    name: raw.name,
    path: raw.path,
    branch: raw.branch,
    head: raw.head,
    locked: raw.locked,
    root: found?.root ?? null,
    relPath: found?.path ?? null,
  };
}

/**
 * 저장소 목록. 캐시하지 않는다 — 한 저장소당 읽는 것이 작은 텍스트 파일 몇 개뿐이고,
 * 캐시를 두면 worktree 를 방금 만든 사람이 목록에서 그것을 못 보게 된다.
 *
 * `roots` 는 테스트가 주입한다. 비워 두면 설정된 워크스페이스 루트를 쓴다.
 */
export async function listRepos(roots?: FsRoot[]): Promise<WorkspaceRepo[]> {
  const rootList = roots ?? [...(await getRoots()).values()];

  const found: RawRepository[] = [];
  const seen = new Set<string>();
  for (const root of rootList) await scan(root.path, SCAN_DEPTH, found, seen);

  found.sort((a, b) => byName(basename(a.main.path), basename(b.main.path)));

  const usedRepoIds = new Set<string>();
  return found.map((repository) => {
    const name = basename(repository.main.path);
    const usedCheckoutIds = new Set<string>();
    const checkouts = [repository.main, ...repository.linked].map((raw) =>
      toCheckout(raw, unique(usedCheckoutIds, raw.name), rootList),
    );
    return { id: unique(usedRepoIds, slugify(name)), name, path: repository.main.path, checkouts };
  });
}

// ---------------------------------------------------------------------------
// 소스 컨트롤 — pull · commit · push
//
// 위의 목록은 `.git` 을 읽기만 하지만, 여기부터는 `git` 을 띄운다. 사람이 버튼을 눌러 한 번
// 도는 동작이라 CONVENTIONS §1 의 "주기적 경로" 규칙 밖이고, 실행은 `git-command.repository` 에
// 가둔다. 대상 경로는 클라이언트가 보낸 절대경로가 아니라 **위 목록에서 id 로 찾은 체크아웃**
// 뿐이다. 파일 API 가 `resolvePath` 하나로 루트를 지키듯, 여기서는 `requireCheckout` 이 관문이다.
// ---------------------------------------------------------------------------

/** 서버 자신의 저장소. 여기서 pull 하면 자동 배포가 재시작을 건너뛰므로(docs/README) 화면이 알린다. */
let selfPath: Promise<string> | null = null;
function getSelfPath(): Promise<string> {
  selfPath ??= realpath(process.cwd()).catch(() => process.cwd());
  return selfPath;
}

/** 목록에서 체크아웃을 찾는다. 없으면 404, 루트 밖이면 403 — 파일 API 와 같은 코드다. */
async function requireCheckout(repoId: string, checkoutId: string, roots?: FsRoot[]): Promise<WorkspaceCheckout> {
  const repo = (await listRepos(roots)).find((item) => item.id === repoId);
  if (!repo) throw new HttpError(404, `unknown repository: ${repoId}`);
  const checkout = repo.checkouts.find((item) => item.id === checkoutId);
  if (!checkout) throw new HttpError(404, `unknown checkout: ${checkoutId}`);
  if (checkout.root === null) throw new HttpError(403, "checkout is outside workspace roots");
  return checkout;
}

/** git 이 남긴 말을 한 덩어리로. 사람이 읽을 것이라 stderr 를 먼저 둔다 — 실패 이유가 거기 있다. */
function outputOf(run: GitRun): string {
  return [run.stderr.trim(), run.stdout.trim()].filter(Boolean).join("\n");
}

function firstLine(text: string): string {
  return text.split("\n")[0] ?? "";
}

/** 실패한 git 은 409 다. 입력이 틀린 것도, 없는 것도 아니고 "지금 저장소 상태로는 안 된다" 는 뜻이다. */
function rejectIfFailed(run: GitRun, what: string): void {
  if (run.code === 0) return;
  const output = outputOf(run);
  throw new HttpError(409, `git ${what} failed${output ? `: ${firstLine(output)}` : ""}`, { output });
}

/**
 * `git status --porcelain=v1 --branch` 의 출력을 읽는다.
 *
 * 첫 줄 형태는 넷이다 — `## main...origin/main [ahead 1, behind 2]`, `## main`(추적 없음),
 * `## HEAD (no branch)`(detached), `## No commits yet on main`(빈 저장소). 나머지 줄은 변경 항목
 * 하나씩이고, 추적 안 된 파일(`??`)도 한 줄이다. commit 이 `add -A` 로 전부 담으므로 함께 센다.
 */
export function parseStatus(text: string): Omit<WorkspaceGitStatus, "head" | "self"> {
  const lines = text.split("\n").filter((line) => line !== "");
  const hasHeader = lines[0]?.startsWith("## ") ?? false;
  const header = hasHeader ? (lines[0] ?? "").slice(3) : "";
  const changed = lines.length - (hasHeader ? 1 : 0);

  let branch: string | null = null;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;

  if (header === "" || header.startsWith("HEAD ")) {
    branch = null;
  } else if (header.startsWith("No commits yet on ")) {
    branch = header.slice("No commits yet on ".length);
  } else {
    const bracket = header.indexOf(" [");
    const names = bracket === -1 ? header : header.slice(0, bracket);
    const dots = names.indexOf("...");
    branch = dots === -1 ? names : names.slice(0, dots);
    upstream = dots === -1 ? null : names.slice(dots + 3);
    if (bracket !== -1) {
      ahead = Number(/ahead (\d+)/.exec(header)?.[1] ?? 0);
      behind = Number(/behind (\d+)/.exec(header)?.[1] ?? 0);
      // `[gone]` — 추적 브랜치가 원격에서 사라졌다. 이름은 남아 있지만 push 대상으로 믿을 수 없다.
      if (header.includes("[gone]")) upstream = null;
    }
  }

  return { branch, upstream, ahead, behind, changed };
}

async function statusOf(checkout: WorkspaceCheckout): Promise<WorkspaceGitStatus> {
  const status = await runGit(checkout.path, ["status", "--porcelain=v1", "--branch"]);
  rejectIfFailed(status, "status");
  // 빈 저장소는 HEAD 가 없어 코드 1 로 끝난다. 그것은 정상이고 null 로 표현한다.
  const head = await runGit(checkout.path, ["rev-parse", "--verify", "-q", "HEAD"]);
  return {
    ...parseStatus(status.stdout),
    head: head.code === 0 ? head.stdout.trim() : null,
    self: checkout.path === (await getSelfPath()),
  };
}

/** 체크아웃의 현재 상태. 화면의 소스 컨트롤 섹션이 열릴 때와 동작 뒤에 읽는다. */
export async function readGitStatus(
  repoId: string,
  checkoutId: string,
  roots?: FsRoot[],
): Promise<WorkspaceGitStatus> {
  return statusOf(await requireCheckout(repoId, checkoutId, roots));
}

/**
 * pull · commit · push 중 하나를 실행하고, 끝난 뒤의 상태를 함께 돌려준다.
 *
 * - pull 은 `--ff-only` 다. 서버가 머지 커밋을 만들거나 충돌 마커를 파일에 남기게 두지 않는다.
 *   갈라졌으면 409 로 알리고 사람이 터미널에서 정리한다.
 * - commit 은 메시지를 받지 않는다. 화면에서 메시지를 쓰게 하는 것보다 시각(KST)이 낫다고
 *   마스터가 정했다. 워킹 트리 전체(`add -A`)를 담는다.
 * - push 는 추적 브랜치가 있으면 그리로, 없으면 `origin` 에 같은 이름으로 올리며 추적을 건다.
 *
 * `now` 는 테스트가 주입한다.
 */
export async function runGitAction(
  repoId: string,
  checkoutId: string,
  action: WorkspaceGitAction,
  roots?: FsRoot[],
  now: () => Date = () => new Date(),
): Promise<WorkspaceGitResult> {
  const checkout = await requireCheckout(repoId, checkoutId, roots);
  const cwd = checkout.path;
  let message: string;
  let output: string;

  if (action === "pull") {
    const run = await runGit(cwd, ["pull", "--ff-only"]);
    rejectIfFailed(run, "pull");
    output = outputOf(run);
    message = /Already up to date/i.test(output) ? "이미 최신입니다" : "pull 했습니다";
  } else if (action === "commit") {
    const before = await statusOf(checkout);
    if (before.changed === 0) throw new HttpError(409, "nothing to commit", { output: "" });
    rejectIfFailed(await runGit(cwd, ["add", "-A"]), "add");
    message = formatTimestamp(now(), KST);
    const run = await runGit(cwd, ["commit", "-q", "-m", message]);
    rejectIfFailed(run, "commit");
    output = outputOf(run);
  } else {
    const before = await statusOf(checkout);
    if (before.branch === null) throw new HttpError(409, "detached HEAD cannot be pushed", { output: "" });
    const run = await runGit(cwd, before.upstream ? ["push"] : ["push", "-u", "origin", "HEAD"]);
    rejectIfFailed(run, "push");
    output = outputOf(run);
    message = /Everything up-to-date/i.test(output) ? "올릴 것이 없습니다" : `${before.branch} 을 push 했습니다`;
  }

  return { action, message, output, status: await statusOf(checkout) };
}
