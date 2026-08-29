/**
 * 워크스페이스 파일 접근의 단일 관문.
 * 디스크에 닿는 모든 경로는 예외 없이 `resolvePath`를 통과해야 한다.
 */
import { realpath } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve as resolveAbs, sep } from "node:path";
import { config } from "../config";
import type { FsRoot } from "../domain/types";
import { HttpError } from "../lib/http";

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
