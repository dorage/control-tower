/**
 * 워크스페이스 루트 아래의 git 저장소를 모아, 같은 저장소의 작업 트리를 한 항목으로 묶는다.
 *
 * 파일 접근은 만들지 않는다. 각 체크아웃이 어느 파일 API 루트에 속하는지(`root`/`relPath`)만
 * 알려 주고, 실제 읽기는 화면이 기존 `/api/fs/*` 로 한다 — 경로 관문(`resolvePath`)을
 * 우회하는 길을 하나도 늘리지 않기 위해서다.
 */
import { basename, join } from "node:path";
import type { FsRoot } from "../domain/types";
import type { WorkspaceCheckout, WorkspaceRepo } from "../domain/workspace";
import { readDirectory } from "../repositories/fs.repository";
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
