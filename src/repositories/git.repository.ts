/**
 * git 저장소 메타데이터 읽기.
 *
 * **`git` 명령을 띄우지 않는다.** 필요한 것(HEAD, 브랜치, worktree 목록, 잠금 사유)은
 * 전부 `.git` 아래의 작은 텍스트 파일이고, 그 형식은 gitrepository-layout(5) 로 공개돼
 * 있다. 목록 API 는 화면을 열 때마다 도는 경로라 프로세스를 띄울 자리가 아니다
 * (CONVENTIONS §1 — 호스트 지표를 `ps` 대신 `/proc` 로 읽는 것과 같은 이유다).
 *
 * `Bun.file` 로 얻을 수 없는 디렉터리 순회·stat·심볼릭 링크 해석에만
 * `node:fs/promises` 를 쓴다. 이 파일이 그 예외 중 하나다.
 *
 * 읽기는 방어적으로 — 반쯤 쓰인 파일, 사라진 worktree, 손상된 HEAD 는 정상 경로다.
 * 던지지 않고 null 로 돌려준다.
 */
import { readdir, realpath, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface RawCheckout {
  kind: "main" | "linked";
  name: string;
  path: string;
  branch: string | null;
  head: string | null;
  locked: string | null;
}

export interface RawRepository {
  main: RawCheckout;
  linked: RawCheckout[];
}

const SHA = /^[0-9a-f]{40}$/;
const HEADS_PREFIX = "refs/heads/";

/** 참조 이름이 `.git` 밖을 가리키지 않게 한다. 우리 파일이지만 조립은 안전하게. */
function isSafeRef(ref: string): boolean {
  return ref !== "" && !ref.startsWith("/") && !ref.split("/").includes("..");
}

async function readText(path: string): Promise<string | null> {
  try {
    return await Bun.file(path).text();
  } catch {
    return null;
  }
}

/** `.git` 이 디렉터리면 저장소, 파일이면 linked 작업 트리이거나 서브모듈이다. */
export async function probeGit(dir: string): Promise<"dir" | "file" | "none"> {
  try {
    const info = await stat(join(dir, ".git"));
    return info.isDirectory() ? "dir" : "file";
  } catch {
    return "none";
  }
}

/** `<sha> <refname>` 줄만 본다. `#` 은 헤더, `^` 은 peeled 태그라 건너뛴다. */
async function readPackedRef(gitDir: string, ref: string): Promise<string | null> {
  const text = await readText(join(gitDir, "packed-refs"));
  if (!text) return null;
  for (const line of text.split("\n")) {
    if (line === "" || line.startsWith("#") || line.startsWith("^")) continue;
    const space = line.indexOf(" ");
    if (space < 0) continue;
    if (line.slice(space + 1).trim() !== ref) continue;
    const sha = line.slice(0, space);
    return SHA.test(sha) ? sha : null;
  }
  return null;
}

/** 느슨한 참조 파일이 먼저, 없으면 packed-refs. 심볼릭 참조는 몇 단계만 따라간다. */
async function resolveRef(gitDir: string, ref: string, depth = 0): Promise<string | null> {
  if (depth > 4 || !isSafeRef(ref)) return null;

  const loose = (await readText(join(gitDir, ref)))?.trim();
  if (loose) {
    if (SHA.test(loose)) return loose;
    if (loose.startsWith("ref:")) return resolveRef(gitDir, loose.slice(4).trim(), depth + 1);
    return null;
  }
  return readPackedRef(gitDir, ref);
}

/**
 * HEAD 한 장을 읽는다. `ref: refs/heads/x` 면 브랜치, 40자 hex 면 detached.
 *
 * 참조는 **공용 `.git` 기준**으로 푼다. linked 작업 트리는 자기 HEAD 를
 * `.git/worktrees/<name>/HEAD` 에 두지만 `refs/heads/*` 는 저장소가 함께 쓴다.
 */
async function readHead(
  gitDir: string,
  headPath: string,
): Promise<{ branch: string | null; head: string | null }> {
  const raw = (await readText(headPath))?.trim();
  if (!raw) return { branch: null, head: null };

  if (raw.startsWith("ref:")) {
    const ref = raw.slice(4).trim();
    const branch = ref.startsWith(HEADS_PREFIX) ? ref.slice(HEADS_PREFIX.length) : null;
    return { branch, head: await resolveRef(gitDir, ref) };
  }
  if (SHA.test(raw)) return { branch: null, head: raw };
  return { branch: null, head: null };
}

/**
 * `.git/worktrees/<name>` 항목 하나. 가리키는 디렉터리가 사라졌으면(prunable) null.
 *
 * `gitdir` 파일 내용은 작업 트리의 `.git` **파일** 경로라, 디렉터리를 얻으려면
 * 한 단계 올라가야 한다.
 */
async function readLinked(gitDir: string, entryDir: string, name: string): Promise<RawCheckout | null> {
  const pointer = (await readText(join(entryDir, "gitdir")))?.trim();
  if (!pointer) return null;

  let path: string;
  try {
    path = await realpath(dirname(pointer));
  } catch {
    // prunable: 작업 트리 디렉터리를 지웠지만 `git worktree prune` 은 아직 돌지 않았다.
    return null;
  }

  const { branch, head } = await readHead(gitDir, join(entryDir, "HEAD"));
  const lockedRaw = await readText(join(entryDir, "locked"));
  return { kind: "linked", name, path, branch, head, locked: lockedRaw === null ? null : lockedRaw.trim() };
}

async function readAllLinked(gitDir: string): Promise<RawCheckout[]> {
  let entries;
  try {
    entries = await readdir(join(gitDir, "worktrees"), { withFileTypes: true });
  } catch {
    // worktree 를 한 번도 만들지 않은 저장소에는 이 디렉터리가 없다.
    return [];
  }

  const out: RawCheckout[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const checkout = await readLinked(gitDir, join(gitDir, "worktrees", entry.name), entry.name);
    if (checkout) out.push(checkout);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
}

/** `.git` 이 디렉터리인 경우에만 저장소로 본다. linked 작업 트리와 서브모듈은 null. */
export async function readRepository(dir: string): Promise<RawRepository | null> {
  if ((await probeGit(dir)) !== "dir") return null;

  const gitDir = join(dir, ".git");
  const { branch, head } = await readHead(gitDir, join(gitDir, "HEAD"));
  // 경로를 풀어 둔다. locate() 가 루트 포함 여부를 실제 경로로 판정한다.
  const path = await realpath(dir).catch(() => dir);

  return {
    main: { kind: "main", name: "main", path, branch, head, locked: null },
    linked: await readAllLinked(gitDir),
  };
}
