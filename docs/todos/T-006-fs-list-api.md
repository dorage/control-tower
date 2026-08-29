# T-006 — 디렉터리 목록·트리 조회 API

| | |
| --- | --- |
| **ID** | T-006 |
| **우선순위** | P0 |
| **영역** | api-fs |
| **선행** | T-005 |
| **후행** | T-012 |

## 1. 목적

파일 탐색기가 쓸 세 엔드포인트를 만든다: 루트 목록, 한 디렉터리의 직계 항목, 얕은 재귀 트리.

## 2. 선행 지식

T-005가 만든 것을 그대로 쓴다.

```ts
// src/services/fs.service.ts
listRoots(): Promise<FsRoot[]>
resolvePath(rootId: string, relPath: string): Promise<{ root: FsRoot; absolute: string; relative: string }>
isEditable(name: string): boolean
versionOf(modifiedAt: number, size: number): string
```

`resolvePath`는 실패 시 `HttpError`를 던진다. 라우트는 잡지 않는다 — `withRoute`(T-002)가 상태 코드로 변환한다.

## 3. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/repositories/fs.repository.ts` | 신규. `readDirectory`, `statEntry` |
| `src/services/fs.service.ts` | `listDirectory`, `buildTree` 추가 |
| `src/routes/fs.route.ts` | 신규. `/api/fs/roots`, `/api/fs/list`, `/api/fs/tree` |
| `src/routes/index.ts` | `...fsRoutes` 추가 |

## 4. 상세 명세

### 4.1 repository

```ts
// src/repositories/fs.repository.ts
import { readdir, stat } from "node:fs/promises";

export interface RawEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

/**
 * 한 디렉터리의 직계 항목. 각 항목의 stat 실패는 건너뛴다
 * (심볼릭 링크가 깨졌거나 순회 중 삭제된 경우).
 */
export async function readDirectory(absolute: string): Promise<RawEntry[]>;

/** 대상이 없으면 null. */
export async function statEntry(absolute: string): Promise<{ isDirectory: boolean; size: number; modifiedAt: number } | null>;
```

- `readdir(absolute, { withFileTypes: true })`로 읽는다.
- **심볼릭 링크는 `stat`(따라감)으로 판정한다.** `dirent.isDirectory()`는 링크에 대해 false를 주므로 신뢰하지 않는다. 링크가 깨져 `stat`이 던지면 그 항목을 제외한다.
- `readdir` 자체가 실패하면(ENOENT/EACCES) 예외를 그대로 던진다 — service가 의미 있는 HttpError로 바꾼다.
- Bun 규약상 파일 내용은 `Bun.file`을 쓰지만, 디렉터리 순회와 stat 메타데이터는 `node:fs/promises`가 필요하다. 이 예외를 파일 상단 주석으로 남긴다.

### 4.2 service — `listDirectory`

```ts
export interface ListDirectoryOptions { hidden?: boolean }

export interface DirectoryListing {
  root: string;
  path: string;
  parent: string | null;
  items: FsEntry[];
}

export async function listDirectory(
  rootId: string,
  relPath: string,
  options?: ListDirectoryOptions,
): Promise<DirectoryListing>;
```

동작:

1. `const { root, absolute, relative } = await resolvePath(rootId, relPath)`
2. `statEntry(absolute)`가 null이면 `HttpError(404, "not found: <relative>")`.
3. 디렉터리가 아니면 `HttpError(400, "not a directory: <relative>")`.
4. `readDirectory(absolute)` — EACCES면 `HttpError(403, "permission denied")`.
5. `hidden !== true`면 `name.startsWith(".")` 항목 제거.
6. `FsEntry`로 매핑. `path`는 `relative ? `${relative}/${name}` : name`.
7. 정렬: 디렉터리 먼저, 그 다음 `localeCompare(name, undefined, { sensitivity: "base", numeric: true })`.
8. `parent`: `relative === ""`면 `null`, 아니면 `relative`에서 마지막 `/` 이후를 자른 값(최상위 항목이면 `""`).

`node_modules`, `.git` 같은 항목을 서버가 임의로 숨기지 않는다. `.git`은 숨김 규칙에 이미 걸리고, `node_modules`는 사용자가 열 수 있어야 한다.

### 4.3 service — `buildTree`

```ts
export interface TreeOptions { depth?: number; hidden?: boolean }

export async function buildTree(rootId: string, relPath: string, options?: TreeOptions): Promise<FsEntry>;
```

동작:

1. `depth`는 1..5로 clamp(라우트에서 이미 clamp 하지만 서비스도 방어).
2. 루트 노드는 대상 디렉터리 자신(`name`은 `relative`의 마지막 세그먼트, 루트면 `root.name`).
3. 깊이가 남아 있으면 하위 디렉터리를 재귀로 채우고 `children`을 설정한다.
4. 깊이를 소진한 디렉터리는 `children`을 생략하고 `hasChildren: true`만 넣는다. (실제로 비어 있는지 확인하려면 추가 IO가 필요하므로 확인하지 않는다 — 클라이언트는 펼칠 때 `/api/fs/list`로 확인한다.)
5. **폭 제한**: 한 디렉터리의 항목이 2000개를 넘으면 앞의 2000개만 담고 그 노드에 `truncated: true`를 넣는다. `FsEntry`에 `truncated?: boolean`을 추가한다.
6. 재귀는 `Promise.all`로 형제끼리 병렬 실행한다.

### 4.4 라우트

```ts
export const fsRoutes = {
  "/api/fs/roots": {
    GET: withRoute(async () => json({ items: await listRoots() })),
  },
  "/api/fs/list": {
    GET: withRoute(async (req) => {
      const url = new URL(req.url);
      const root = stringParam(url, "root");
      if (!root) throw new HttpError(400, "root is required");
      return json(await listDirectory(root, url.searchParams.get("path") ?? "", {
        hidden: boolParam(url, "hidden", false),
      }));
    }),
  },
  "/api/fs/tree": {
    GET: withRoute(async (req) => {
      const url = new URL(req.url);
      const root = stringParam(url, "root");
      if (!root) throw new HttpError(400, "root is required");
      return json(await buildTree(root, url.searchParams.get("path") ?? "", {
        depth: intRange(url, "depth", 2, 1, 5),
        hidden: boolParam(url, "hidden", false),
      }));
    }),
  },
};
```

- `path`는 `url.searchParams.get`으로 직접 읽는다(`stringParam`은 빈 문자열을 null로 바꾸는데, 빈 문자열은 "루트 자신"이라는 유효한 값이다).
- `URLSearchParams`가 이미 퍼센트 디코딩을 수행한다. 별도 `decodeURIComponent`를 **중복 호출하지 않는다**(이중 디코딩은 `%252e%252e` 우회를 만든다).

### 4.5 응답 예시

`GET /api/fs/list?root=workspace&path=control-tower/src`

```json
{
  "root": "workspace",
  "path": "control-tower/src",
  "parent": "control-tower",
  "items": [
    { "name": "lib", "path": "control-tower/src/lib", "type": "dir", "size": 4096, "modifiedAt": 1756400000000, "editable": false },
    { "name": "config.ts", "path": "control-tower/src/config.ts", "type": "file", "size": 512, "modifiedAt": 1756400000000, "editable": false }
  ]
}
```

## 5. 수용 기준

- [ ] `/api/fs/roots`가 `WORKSPACE_ROOTS`의 존재하는 루트만 반환한다.
- [ ] `/api/fs/list`가 `path` 없이도(루트 자신) 동작하고 `parent`가 `null`이다.
- [ ] 디렉터리 우선 + 이름 오름차순 정렬이 맞다.
- [ ] `hidden=1`일 때만 `.`으로 시작하는 항목이 보인다.
- [ ] `.md` 파일만 `editable: true`다.
- [ ] `path`에 `../..`을 주면 403, 없는 경로면 404, 파일 경로를 주면 400.
- [ ] `root`를 빼면 400, 모르는 `root`면 403.
- [ ] `/api/fs/tree?depth=2`가 2단계까지 `children`을 채우고 3단계 디렉터리에 `hasChildren: true`를 넣는다.
- [ ] `depth=99`가 5로 clamp 된다.
- [ ] 깨진 심볼릭 링크가 있는 디렉터리를 목록해도 500이 나지 않는다.
- [ ] `bunx tsc --noEmit` 통과.

## 6. 검증

```bash
mkdir -p /tmp/ct-demo/proj/{docs,src}
echo '# hi' > /tmp/ct-demo/proj/docs/a.md
echo 'x'    > /tmp/ct-demo/proj/src/b.ts
echo 'h'    > /tmp/ct-demo/proj/.hidden
ln -sf /nowhere /tmp/ct-demo/proj/broken
mkdir -p /tmp/ct-demo/proj/docs/deep/deeper

WORKSPACE_ROOTS=/tmp/ct-demo bun run dev & sleep 1
B=localhost:4317

curl -s "$B/api/fs/roots"; echo
curl -s "$B/api/fs/list?root=ct-demo"; echo
curl -s "$B/api/fs/list?root=ct-demo&path=proj"; echo
curl -s "$B/api/fs/list?root=ct-demo&path=proj&hidden=1" | grep -q '.hidden' && echo "hidden ok"
curl -s "$B/api/fs/list?root=ct-demo&path=proj/docs" | grep -q '"editable":true' && echo "editable ok"
curl -s "$B/api/fs/tree?root=ct-demo&path=proj&depth=2"; echo
curl -s "$B/api/fs/tree?root=ct-demo&path=proj&depth=99" >/dev/null && echo "clamp ok"

for q in "root=ct-demo&path=../../etc" "root=ct-demo&path=nope" "root=ct-demo&path=proj/docs/a.md" "path=proj" "root=bogus"; do
  printf '%s -> ' "$q"; curl -s -o /dev/null -w '%{http_code}\n' "$B/api/fs/list?$q"
done
# 기대: 403, 404, 400, 400, 403

kill %1; rm -rf /tmp/ct-demo
```

## 7. 완료 처리

1. `docs/ENDPOINTS.md` — `/api/fs/roots`, `/api/fs/list`, `/api/fs/tree`를 `✅`로 하고 실제 응답 예시로 갱신. `truncated` 필드를 명세에 추가.
2. `docs/STRUCTURE.md` — `src/repositories/fs.repository.ts`, `src/routes/fs.route.ts`를 `✅`로.
3. `docs/CONVENTIONS.md` §1 — "디렉터리 순회/stat은 `node:fs/promises` 예외를 허용한다"를 명시. §8 — 쿼리 파라미터를 이중 디코딩하지 않는다는 규칙 추가.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-006`
