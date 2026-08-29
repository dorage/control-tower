/**
 * 워크스페이스 파일 접근. 호출자는 이미 `resolvePath`를 통과한 절대경로만 넘긴다.
 *
 * 파일 내용은 `Bun.file`을 쓰지만(CONVENTIONS §1), 디렉터리 순회와 stat 메타데이터는
 * `Bun.file`로 얻을 수 없어 `node:fs/promises`를 쓴다. 이 파일이 그 예외다.
 */
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface RawEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

export interface RawStat {
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

/**
 * 대상이 없거나 stat 할 수 없으면 null.
 *
 * `mtimeMs` 의 소수점은 버린다. 낙관적 잠금 키(`versionOf`)가 정수를 쓰므로,
 * 여기서 자르지 않으면 API 가 내보내는 `modifiedAt` 과 `version` 이 서로 어긋나 보인다.
 */
export async function statEntry(absolute: string): Promise<RawStat | null> {
  try {
    const info = await stat(absolute);
    return { isDirectory: info.isDirectory(), size: info.size, modifiedAt: Math.trunc(info.mtimeMs) };
  } catch {
    return null;
  }
}

/**
 * 한 디렉터리의 직계 항목. 개별 항목의 stat 실패는 건너뛴다
 * (깨진 심볼릭 링크이거나 순회 중 삭제된 경우).
 *
 * `readdir` 자체의 실패(ENOENT/EACCES)는 그대로 던진다 - service 가 HttpError 로 바꾼다.
 */
export async function readDirectory(absolute: string): Promise<RawEntry[]> {
  const dirents = await readdir(absolute, { withFileTypes: true });
  const entries = await Promise.all(
    dirents.map(async (dirent) => {
      // dirent.isDirectory() 는 심볼릭 링크에 대해 false 다. 링크를 따라가는 stat 으로 판정한다.
      const info = await statEntry(join(absolute, dirent.name));
      if (!info) return null;
      return {
        name: dirent.name,
        isDirectory: info.isDirectory,
        size: info.size,
        modifiedAt: info.modifiedAt,
      };
    }),
  );
  return entries.filter((entry): entry is RawEntry => entry !== null);
}

/** 바이너리 판정을 해야 하므로 텍스트가 아니라 바이트로 읽는다. */
export async function readFileBytes(absolute: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(absolute).arrayBuffer());
}
