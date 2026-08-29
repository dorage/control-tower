/**
 * 워크스페이스 파일 접근의 단일 관문.
 * 디스크에 닿는 모든 경로는 예외 없이 `resolvePath`를 통과해야 한다.
 */
import { realpath } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve as resolveAbs, sep } from "node:path";
import { config } from "../config";
import type { FsEntry, FsFile, FsRoot } from "../domain/types";
import { HttpError } from "../lib/http";
import { readDirectory, readFileBytes, statEntry, type RawEntry } from "../repositories/fs.repository";

let rootsPromise: Promise<Map<string, FsRoot>> | null = null;

function slugify(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  return slug || "root";
}

async function loadRoots(): Promise<Map<string, FsRoot>> {
  const roots = new Map<string, FsRoot>();
  for (const configured of config.workspaceRoots) {
    const absolute = resolveAbs(configured);
    let real: string;
    try {
      real = await realpath(absolute);
    } catch {
      // 없거나 읽을 수 없는 루트는 조용히 제외한다 - 서버가 죽을 이유가 아니다.
      continue;
    }
    const name = basename(real) || real;
    let id = slugify(name);
    for (let n = 2; roots.has(id); n++) id = `${slugify(name)}-${n}`;
    roots.set(id, { id, name, path: real });
  }
  return roots;
}

/** 설정은 런타임 중 바뀌지 않으므로 프로세스당 한 번만 계산한다. */
export function getRoots(): Promise<Map<string, FsRoot>> {
  rootsPromise ??= loadRoots();
  return rootsPromise;
}

export async function listRoots(): Promise<FsRoot[]> {
  return [...(await getRoots()).values()];
}

export interface Resolved {
  root: FsRoot;
  /** 실제 파일시스템 절대경로. */
  absolute: string;
  /** 루트 기준 상대경로, POSIX 구분자. 루트 자신이면 "". */
  relative: string;
}

/**
 * `root.path` 하나만 startsWith 로 비교하면 `/home/u/work` 가 `/home/u/work-secret` 을
 * 통과시킨다. 구분자를 붙여 경계를 강제한다.
 */
function contains(rootPath: string, candidate: string): boolean {
  return candidate === rootPath || candidate.startsWith(rootPath + sep);
}

function toRelative(rootPath: string, absolute: string): string {
  const rel = relative(rootPath, absolute);
  return rel === "" ? "" : rel.split(sep).join("/");
}

/**
 * 루트 밖으로 나가는 모든 경로를 거부한다.
 * 실패 시 HttpError(400|403|404)를 던진다 - 호출자는 잡지 않는다(withRoute 가 처리).
 */
export async function resolvePath(rootId: string, relPath: string): Promise<Resolved> {
  if (!rootId) throw new HttpError(400, "root is required");

  const root = (await getRoots()).get(rootId);
  if (!root) throw new HttpError(403, `unknown root: ${rootId}`);

  if (relPath.includes("\0")) throw new HttpError(400, "invalid path");
  if (isAbsolute(relPath)) throw new HttpError(400, "path must be relative");

  const candidate = resolveAbs(root.path, relPath);
  if (!contains(root.path, candidate)) throw new HttpError(403, "path escapes root");

  // 심볼릭 링크 재검사. 정규화만으로는 루트 안의 link -> /etc 를 막지 못한다.
  let real: string;
  try {
    real = await realpath(candidate);
  } catch {
    // 아직 없는 파일(신규 생성 경로)이면 부모를 기준으로 검사한다.
    let parentReal: string;
    try {
      parentReal = await realpath(dirname(candidate));
    } catch {
      throw new HttpError(404, "parent directory not found");
    }
    real = join(parentReal, basename(candidate));
  }
  if (!contains(root.path, real)) throw new HttpError(403, "path escapes root");

  return { root, absolute: real, relative: toRelative(root.path, real) };
}

/** 쓰기 허용 확장자인가. */
export function isEditable(name: string): boolean {
  return config.writableExtensions.includes(extname(name).toLowerCase());
}

const LANGUAGES: Record<string, string> = {
  ".md": "markdown",
  ".markdown": "markdown",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".json": "json",
  ".css": "css",
  ".html": "html",
  ".sh": "shell",
  ".py": "python",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".toml": "toml",
};

/** 확장자 -> 에디터 언어. */
export function languageOf(name: string): string {
  return LANGUAGES[extname(name).toLowerCase()] ?? "text";
}

/**
 * 낙관적 잠금 키. mtimeMs 는 소수점을 가질 수 있어 문자열 비교가 흔들리므로 정수로 자른다.
 * 읽기(T-007)와 쓰기(T-008)가 반드시 이 함수를 함께 쓴다.
 */
export function versionOf(modifiedAt: number, size: number): string {
  return `${Math.trunc(modifiedAt)}:${size}`;
}

export interface ListDirectoryOptions {
  hidden?: boolean;
}

export interface DirectoryListing {
  root: string;
  path: string;
  parent: string | null;
  items: FsEntry[];
}

/** 한 디렉터리의 항목이 이보다 많으면 트리는 앞쪽만 담고 truncated 를 세운다. */
const TREE_WIDTH_LIMIT = 2000;

function toEntry(parentRelative: string, raw: RawEntry): FsEntry {
  return {
    name: raw.name,
    path: parentRelative ? `${parentRelative}/${raw.name}` : raw.name,
    type: raw.isDirectory ? "dir" : "file",
    size: raw.size,
    modifiedAt: raw.modifiedAt,
    editable: raw.isDirectory ? false : isEditable(raw.name),
  };
}

/** 디렉터리 먼저, 그다음 이름 오름차순(대소문자 무시, 숫자 자연 정렬). */
function byTypeThenName(a: FsEntry, b: FsEntry): number {
  if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
}

async function readEntries(
  absolute: string,
  relativeDir: string,
  hidden: boolean,
): Promise<FsEntry[]> {
  let raw: RawEntry[];
  try {
    raw = await readDirectory(absolute);
  } catch (error) {
    if ((error as { code?: string }).code === "EACCES") throw new HttpError(403, "permission denied");
    throw error;
  }
  const visible = hidden ? raw : raw.filter((entry) => !entry.name.startsWith("."));
  return visible.map((entry) => toEntry(relativeDir, entry)).sort(byTypeThenName);
}

export async function listDirectory(
  rootId: string,
  relPath: string,
  options: ListDirectoryOptions = {},
): Promise<DirectoryListing> {
  const { root, absolute, relative: rel } = await resolvePath(rootId, relPath);

  const info = await statEntry(absolute);
  if (!info) throw new HttpError(404, `not found: ${rel}`);
  if (!info.isDirectory) throw new HttpError(400, `not a directory: ${rel}`);

  const items = await readEntries(absolute, rel, options.hidden === true);
  const slash = rel.lastIndexOf("/");
  const parent = rel === "" ? null : slash === -1 ? "" : rel.slice(0, slash);

  return { root: root.id, path: rel, parent, items };
}

export interface TreeOptions {
  depth?: number;
  hidden?: boolean;
}

async function walk(
  node: FsEntry,
  absolute: string,
  remaining: number,
  hidden: boolean,
): Promise<void> {
  if (remaining <= 0) {
    // 실제로 비어 있는지 확인하려면 IO 가 한 번 더 든다. 클라이언트가 펼칠 때 /api/fs/list 로 확인한다.
    node.hasChildren = true;
    return;
  }

  let children: FsEntry[];
  try {
    children = await readEntries(absolute, node.path, hidden);
  } catch {
    // 권한 없는 하위 디렉터리 하나가 트리 전체를 죽이지 않게 한다.
    node.children = [];
    return;
  }

  if (children.length > TREE_WIDTH_LIMIT) {
    children = children.slice(0, TREE_WIDTH_LIMIT);
    node.truncated = true;
  }
  node.children = children;

  await Promise.all(
    children
      .filter((child) => child.type === "dir")
      .map((child) => walk(child, join(absolute, child.name), remaining - 1, hidden)),
  );
}

export async function buildTree(
  rootId: string,
  relPath: string,
  options: TreeOptions = {},
): Promise<FsEntry> {
  const { root, absolute, relative: rel } = await resolvePath(rootId, relPath);

  const info = await statEntry(absolute);
  if (!info) throw new HttpError(404, `not found: ${rel}`);
  if (!info.isDirectory) throw new HttpError(400, `not a directory: ${rel}`);

  const depth = Math.min(5, Math.max(1, Math.trunc(options.depth ?? 2)));
  const name = rel === "" ? root.name : (rel.split("/").at(-1) ?? root.name);
  const node: FsEntry = {
    name,
    path: rel,
    type: "dir",
    size: info.size,
    modifiedAt: info.modifiedAt,
    editable: false,
  };

  await walk(node, absolute, depth, options.hidden === true);
  return node;
}

/**
 * 앞쪽 8000바이트 안에 NUL 이 하나라도 있으면 바이너리로 본다. git 이 쓰는 휴리스틱이며
 * UTF-8 텍스트에는 NUL 이 나타나지 않는다. UTF-16 파일은 바이너리로 걸린다 - 의도된 동작이다.
 */
function looksBinary(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 8000);
  for (let i = 0; i < limit; i++) if (bytes[i] === 0) return true;
  return false;
}

export async function readFile(rootId: string, relPath: string): Promise<FsFile> {
  const { root, absolute, relative: rel } = await resolvePath(rootId, relPath);
  if (rel === "") throw new HttpError(400, "path is required");

  const info = await statEntry(absolute);
  if (!info) throw new HttpError(404, `not found: ${rel}`);
  if (info.isDirectory) throw new HttpError(400, `is a directory: ${rel}`);

  // 바이트를 읽기 전에 크기를 본다. 200MB 를 메모리에 올린 뒤 거절하면 의미가 없다.
  if (info.size > config.fsMaxReadBytes) {
    throw new HttpError(413, `file too large: ${info.size} bytes (max ${config.fsMaxReadBytes})`);
  }

  let bytes: Uint8Array;
  try {
    bytes = await readFileBytes(absolute);
  } catch (error) {
    if ((error as { code?: string }).code === "EACCES") throw new HttpError(403, "permission denied");
    throw error;
  }

  const name = rel.split("/").at(-1) ?? rel;
  const binary = looksBinary(bytes);

  return {
    root: root.id,
    path: rel,
    name,
    size: info.size,
    modifiedAt: info.modifiedAt,
    version: versionOf(info.modifiedAt, info.size),
    language: binary ? "text" : languageOf(name),
    editable: !binary && isEditable(name),
    encoding: binary ? "binary" : "utf-8",
    // fatal: false - 깨진 바이트는 U+FFFD 가 된다. 잘못된 인코딩으로 500 을 내지 않는다.
    content: binary ? null : new TextDecoder("utf-8", { fatal: false }).decode(bytes),
  };
}
