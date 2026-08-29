# T-005 — 파일시스템 루트 설정과 안전한 경로 해석

| | |
| --- | --- |
| **ID** | T-005 |
| **우선순위** | P0 |
| **영역** | api-fs |
| **선행** | T-002 |
| **후행** | T-006, T-007, T-008 |

## 1. 목적

파일 탐색기·마크다운 에디터가 딛고 설 토대를 만든다. **모든 파일 접근은 이 작업이 만드는 단 하나의 경로 해석 함수를 통과해야 한다.** 여기서 뚫리면 나머지 전부가 뚫린다.

## 2. 위협 모델

`path` 파라미터는 브라우저에서 오는 임의 문자열이다. 다음을 전부 막아야 한다.

| 공격 | 예시 |
| --- | --- |
| 상위 탈출 | `../../etc/passwd` |
| 인코딩된 탈출 | `..%2F..%2Fetc%2Fpasswd` (URL 디코딩 후 검사해야 함) |
| 절대경로 주입 | `/etc/passwd` |
| 접두사 혼동 | 루트가 `/home/u/work`일 때 `/home/u/work-secret` |
| 심볼릭 링크 탈출 | 루트 안의 `link → /etc` |
| NUL 절단 | `a.md\0.png` |
| 알 수 없는 루트 | `root=../../` |

## 3. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/config.ts` | `workspaceRoots`, `fsMaxReadBytes`, `writableExtensions` 추가 |
| `src/domain/types.ts` | `FsRoot`, `FsEntry`, `FsFile`, `FsWriteResult` 추가 |
| `src/services/fs.service.ts` | 신규. 루트 레지스트리 + `resolve()` |
| `src/services/fs.service.test.ts` | 신규. 보안 테스트 |

파일 IO 자체(`listDirectory`/`readFile`/`writeFile`)는 T-006~T-008에서 `src/repositories/fs.repository.ts`에 추가한다. 이 작업은 **경로 해석과 루트 레지스트리까지**다.

## 4. 상세 명세

### 4.1 설정 (`src/config.ts` 추가)

```ts
const home = Bun.env.HOME ?? "/root";

export const config = {
  ...기존,
  /** 탐색을 허용할 루트들. ':' 로 구분. */
  workspaceRoots: (Bun.env.WORKSPACE_ROOTS ?? `${home}/workspace`)
    .split(":")
    .map((value) => value.trim())
    .filter(Boolean),
  /** 읽기/쓰기 본문 상한. */
  fsMaxReadBytes: Number(Bun.env.FS_MAX_READ_BYTES ?? 2 * 1024 * 1024),
  /** 쓰기를 허용할 확장자 (소문자, 점 포함). */
  writableExtensions: (Bun.env.FS_WRITABLE_EXTENSIONS ?? ".md,.markdown")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
} as const;
```

### 4.2 도메인 타입 (`src/domain/types.ts` 추가)

```ts
export interface FsRoot {
  id: string;    // URL 안전한 식별자
  name: string;  // 표시용
  path: string;  // 심볼릭 링크가 해소된 절대경로
}

export interface FsEntry {
  name: string;
  /** 루트 기준 상대경로. 루트 자신은 "". POSIX 구분자(/) 고정. */
  path: string;
  type: "file" | "dir";
  size: number;
  modifiedAt: number;
  /** 쓰기 허용 확장자인가 (디렉터리는 항상 false). */
  editable: boolean;
  /** 트리 응답에서만 채워진다. */
  children?: FsEntry[];
  hasChildren?: boolean;
}

export interface FsFile {
  root: string;
  path: string;
  name: string;
  size: number;
  modifiedAt: number;
  /** 낙관적 잠금 키. `${modifiedAt}:${size}` */
  version: string;
  /** 확장자로 추정한 하이라이팅 언어. 모르면 "text". */
  language: string;
  editable: boolean;
  encoding: "utf-8" | "binary";
  /** binary 이면 null. */
  content: string | null;
}

export interface FsWriteResult {
  root: string;
  path: string;
  size: number;
  modifiedAt: number;
  version: string;
  created: boolean;
}
```

### 4.3 루트 레지스트리

```ts
import { realpath } from "node:fs/promises";
import { basename, resolve as resolveAbs } from "node:path";

let rootsPromise: Promise<Map<string, FsRoot>> | null = null;

/** 프로세스당 한 번만 계산한다. 존재하지 않는 루트는 조용히 제외한다. */
export function getRoots(): Promise<Map<string, FsRoot>> { ... }

export async function listRoots(): Promise<FsRoot[]> {
  return [...(await getRoots()).values()];
}
```

`getRoots()` 규칙:

1. `config.workspaceRoots`의 각 항목을 `resolveAbs()`로 절대화한다.
2. `realpath()`로 심볼릭 링크를 해소한다. 실패하면(경로 없음/권한 없음) 그 루트를 **건너뛴다** — 서버는 죽지 않는다.
3. `id`는 `basename(path)`를 슬러그화: 소문자, `[^a-z0-9._-]` → `-`. 빈 문자열이면 `root`.
4. id 중복 시 `-2`, `-3`… 접미사를 붙인다.
5. `name`은 원본 `basename`.
6. 결과를 캐시한다(설정은 런타임 중 바뀌지 않는다).

### 4.4 경로 해석 — 핵심 함수

```ts
export interface Resolved {
  root: FsRoot;
  /** 실제 파일시스템 절대경로. */
  absolute: string;
  /** 루트 기준 상대경로, POSIX 구분자. 루트 자신이면 "". */
  relative: string;
}

/**
 * 루트 밖으로 나가는 모든 경로를 거부한다.
 * 실패 시 HttpError(400|403)을 던진다 — 호출자는 잡지 않는다(withRoute 가 처리).
 */
export async function resolvePath(rootId: string, relPath: string): Promise<Resolved>;
```

절차 (순서를 지킬 것):

1. `rootId`가 빈 문자열이면 `HttpError(400, "root is required")`.
2. 레지스트리에 없으면 `HttpError(403, "unknown root: <id>")`.
3. `relPath`에 `\0`이 있으면 `HttpError(400, "invalid path")`.
4. `relPath`가 `/` 또는 드라이브 문자로 시작하면(= `isAbsolute`) `HttpError(400, "path must be relative")`.
5. `const candidate = resolveAbs(root.path, relPath)` — `resolve`는 `..`을 정규화한다.
6. **포함 검사**: `candidate === root.path || candidate.startsWith(root.path + sep)`. 실패하면 `HttpError(403, "path escapes root")`.
   - `root.path + sep`을 쓰는 이유: `startsWith(root.path)`만 하면 `/home/u/work-secret`이 `/home/u/work`를 통과한다.
7. **심볼릭 링크 재검사**: `candidate`가 존재하면 `realpath(candidate)`를 구해 6번 검사를 **한 번 더** 한다. 실패하면 403.
   - 존재하지 않으면(신규 파일 생성 경로) `realpath`를 **부모 디렉터리**에 대해 수행하고, 그 결과 + 파일명으로 6번 검사를 한다. 부모도 없으면 `HttpError(404, "parent directory not found")`.
8. `relative`는 `relative(root.path, finalAbsolute)`를 `/`로 정규화한 값(`split(sep).join("/")`). 루트 자신이면 `""`.

### 4.5 보조 함수

```ts
/** 쓰기 허용 확장자인가. */
export function isEditable(name: string): boolean;
// extname(name).toLowerCase() 가 config.writableExtensions 에 포함되는가

/** 확장자 → 에디터 언어. */
export function languageOf(name: string): string;
// .md/.markdown → "markdown", .ts/.tsx → "typescript", .js/.jsx → "javascript",
// .json → "json", .css → "css", .html → "html", .sh → "shell", .py → "python",
// .yml/.yaml → "yaml", .toml → "toml", 그 외 → "text"

/** 낙관적 잠금 키. */
export function versionOf(modifiedAt: number, size: number): string;
// `${Math.trunc(modifiedAt)}:${size}`
```

`versionOf`가 `modifiedAt`을 정수로 자르는 이유: `mtimeMs`는 소수점을 가질 수 있고, 문자열 비교가 부동소수 표현에 흔들리면 안 된다. **읽기와 쓰기가 반드시 같은 함수를 쓴다.**

### 4.6 숨김 항목

`.`으로 시작하는 이름은 기본 제외한다. 필터링은 T-006의 목록 함수에서 하고, 이 작업에서는 `resolvePath`가 숨김 경로를 막지 **않는다**(사용자가 명시적으로 `.github/x.md`를 열 수 있어야 한다).

## 5. 수용 기준

- [ ] `resolvePath`가 §2 표의 7가지 공격을 모두 거부한다.
- [ ] 정상 경로(`""`, `"a"`, `"a/b.md"`, `"./a/b.md"`)를 올바르게 해석한다.
- [ ] 루트 안에서 `..`으로 다시 루트 안에 머무는 경로(`"a/../b.md"`)는 **허용**된다.
- [ ] 존재하지 않는 루트 디렉터리는 서버를 죽이지 않고 목록에서 빠진다.
- [ ] `WORKSPACE_ROOTS`에 같은 basename의 루트를 둘 주면 id가 `x`, `x-2`로 갈라진다.
- [ ] `versionOf`가 읽기/쓰기에서 동일한 값을 만든다.
- [ ] `bun test src/services/fs.service.test.ts` 통과.
- [ ] `bunx tsc --noEmit` 통과.

## 6. 검증

`src/services/fs.service.test.ts`는 임시 디렉터리를 만들어 검사한다. **사용자의 실제 홈 디렉터리를 건드리지 않는다.**

```ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let base: string;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "ct-fs-"));
  await mkdir(join(base, "work/docs"), { recursive: true });
  await mkdir(join(base, "work-secret"), { recursive: true });
  await mkdir(join(base, "outside"), { recursive: true });
  await writeFile(join(base, "work/docs/a.md"), "# a");
  await writeFile(join(base, "outside/secret.md"), "nope");
  await symlink(join(base, "outside"), join(base, "work/escape"));
  process.env.WORKSPACE_ROOTS = join(base, "work");
  // config 는 모듈 최상단에서 읽으므로, 테스트는 이 파일에서 fs.service 를
  // 동적 import 해 환경변수 설정 이후에 평가되도록 한다.
});

afterAll(() => rm(base, { recursive: true, force: true }));
```

덮어야 할 케이스:

| 입력 | 기대 |
| --- | --- |
| `resolvePath("work", "")` | ok, `relative === ""` |
| `resolvePath("work", "docs/a.md")` | ok |
| `resolvePath("work", "./docs/a.md")` | ok, `relative === "docs/a.md"` |
| `resolvePath("work", "docs/../docs/a.md")` | ok |
| `resolvePath("work", "../outside/secret.md")` | throw 403 |
| `resolvePath("work", "../work-secret")` | throw 403 |
| `resolvePath("work", "/etc/passwd")` | throw 400 |
| `resolvePath("work", "a\0.md")` | throw 400 |
| `resolvePath("work", "escape/secret.md")` | throw 403 (심볼릭 링크) |
| `resolvePath("nope", "a")` | throw 403 |
| `resolvePath("", "a")` | throw 400 |
| `resolvePath("work", "docs/new.md")` | ok (없는 파일, 부모 존재) |
| `resolvePath("work", "nope/new.md")` | throw 404 (부모 없음) |
| `isEditable("a.md")` / `isEditable("a.MD")` | true |
| `isEditable("a.ts")` | false |
| `versionOf(1.9, 10)` | `"1:10"` |

```bash
bun test src/services/fs.service.test.ts
bunx tsc --noEmit
```

## 7. 완료 처리

1. `docs/CONVENTIONS.md` §9 — 실제 함수명(`resolvePath`)과 7단계 절차 요약을 반영한다.
2. `docs/STRUCTURE.md` — `src/services/fs.service.ts`(+테스트)를 `✅`로, 환경변수 표(`WORKSPACE_ROOTS`, `FS_MAX_READ_BYTES`, `FS_WRITABLE_EXTENSIONS`)를 구현과 맞춘다.
3. `docs/ENDPOINTS.md` — 아직 엔드포인트가 없으므로 변경 없음. `path` 파라미터 규약(루트 기준 상대경로, `..`/절대경로 거부)이 정확한지만 확인.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-005`
