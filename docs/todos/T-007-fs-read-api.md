# T-007 — 파일 내용 읽기 API

| | |
| --- | --- |
| **ID** | T-007 |
| **우선순위** | P0 |
| **영역** | api-fs |
| **선행** | T-005, T-006 |
| **후행** | T-013 |

## 1. 목적

에디터가 파일을 열 수 있게 한다. 마크다운뿐 아니라 모든 텍스트 파일을 **읽기 전용으로** 볼 수 있어야 한다(탐색기에서 `.ts`를 눌렀을 때 아무 일도 안 일어나면 안 된다). 쓰기 허용은 별개이며 `editable` 플래그로 구분한다.

## 2. 선행 지식

T-005의 `resolvePath`, `isEditable`, `languageOf`, `versionOf`.
T-006의 `statEntry`.
`config.fsMaxReadBytes`(기본 2MiB).

## 3. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/repositories/fs.repository.ts` | `readFileText` 추가 |
| `src/services/fs.service.ts` | `readFile` 추가 |
| `src/routes/fs.route.ts` | `GET /api/fs/file` 추가 |

## 4. 상세 명세

### 4.1 repository

```ts
/** 바이너리 판정을 위해 바이트로 읽는다. */
export async function readFileBytes(absolute: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(absolute).arrayBuffer());
}
```

`Bun.file`을 쓴다(CONVENTIONS §1).

### 4.2 바이너리 판정

앞쪽 8000바이트 안에 `0x00`이 하나라도 있으면 바이너리로 본다. git이 쓰는 것과 같은 휴리스틱이며, UTF-8 텍스트에는 NUL이 나타나지 않는다.

```ts
function looksBinary(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 8000);
  for (let i = 0; i < limit; i++) if (bytes[i] === 0) return true;
  return false;
}
```

UTF-16 파일은 이 검사에 바이너리로 걸린다. 의도된 동작이다 — 에디터는 UTF-8만 다룬다.

### 4.3 service

```ts
export async function readFile(rootId: string, relPath: string): Promise<FsFile>;
```

절차:

1. `const { root, absolute, relative } = await resolvePath(rootId, relPath)`
2. `relative === ""`면 `HttpError(400, "path is required")`.
3. `const stat = await statEntry(absolute)`; null이면 `HttpError(404, "not found: <relative>")`.
4. 디렉터리면 `HttpError(400, "is a directory: <relative>")`.
5. `stat.size > config.fsMaxReadBytes`면 `HttpError(413, "file too large: <size> bytes (max <limit>)")`.
   - **바이트를 읽기 전에** 크기를 검사한다. 200MB 파일을 메모리에 올린 뒤 거절하면 의미가 없다.
6. `readFileBytes(absolute)`. EACCES면 `HttpError(403, "permission denied")`.
7. `looksBinary(bytes)`면 `encoding: "binary"`, `content: null`.
8. 아니면 `new TextDecoder("utf-8", { fatal: false }).decode(bytes)`. `fatal: false`이므로 깨진 바이트는 U+FFFD가 된다 — 잘못된 인코딩 때문에 500이 나지 않게 한다.
9. `FsFile`을 구성한다. `version: versionOf(stat.modifiedAt, stat.size)`.

**`version`은 반드시 `versionOf`로 만든다.** T-008의 충돌 검사가 같은 함수를 쓰므로, 여기서 직접 문자열을 조립하면 미묘하게 어긋난다.

### 4.4 라우트

```ts
"/api/fs/file": {
  GET: withRoute(async (req) => {
    const url = new URL(req.url);
    const root = stringParam(url, "root");
    const path = stringParam(url, "path");
    if (!root) throw new HttpError(400, "root is required");
    if (!path) throw new HttpError(400, "path is required");
    return json(await readFile(root, path));
  }),
  // PUT 은 T-008 에서 같은 객체에 추가한다
},
```

`GET`/`PUT`이 같은 경로 객체를 공유하므로, T-008 작업 시 이 객체에 `PUT` 키를 추가하기만 하면 된다.

### 4.5 응답 예시

```json
{
  "root": "workspace",
  "path": "control-tower/docs/TODO.md",
  "name": "TODO.md",
  "size": 2481,
  "modifiedAt": 1756400000000,
  "version": "1756400000000:2481",
  "language": "markdown",
  "editable": true,
  "encoding": "utf-8",
  "content": "# TODO — AppendOnlyLog\n..."
}
```

바이너리:

```json
{ "...": "...", "language": "text", "editable": false, "encoding": "binary", "content": null }
```

## 5. 수용 기준

- [ ] `.md` 파일 읽기가 `editable: true`, `language: "markdown"`, 전체 본문을 반환한다.
- [ ] `.ts` 파일 읽기가 성공하되 `editable: false`, `language: "typescript"`다.
- [ ] PNG 등 바이너리가 `encoding: "binary"`, `content: null`이고 500이 아니다.
- [ ] 없는 파일 404, 디렉터리 400, 루트 밖 403, `path` 누락 400.
- [ ] `FS_MAX_READ_BYTES`를 작게 주면 큰 파일이 413이고, 응답이 즉시 온다(전체를 읽지 않는다).
- [ ] 빈 파일이 `content: ""`, `size: 0`으로 200이다.
- [ ] 잘못된 UTF-8 바이트가 섞인 텍스트 파일이 500 없이 읽힌다.
- [ ] `version`이 `/api/fs/list`의 `modifiedAt`/`size`와 일관된다.
- [ ] `bunx tsc --noEmit` 통과.

## 6. 검증

```bash
mkdir -p /tmp/ct-demo/proj
printf '# hello\n\nbody\n' > /tmp/ct-demo/proj/a.md
printf 'const x = 1\n'      > /tmp/ct-demo/proj/b.ts
printf ''                   > /tmp/ct-demo/proj/empty.md
printf 'ok\x00binary'       > /tmp/ct-demo/proj/blob.bin
printf 'caf\xe9 latin1\n'   > /tmp/ct-demo/proj/bad-utf8.md
head -c 3000000 /dev/urandom | base64 > /tmp/ct-demo/proj/big.md

WORKSPACE_ROOTS=/tmp/ct-demo bun run dev & sleep 1
B='localhost:4317/api/fs/file?root=ct-demo'

curl -s "$B&path=proj/a.md"; echo
curl -s "$B&path=proj/b.ts"        | grep -q '"editable":false' && echo "readonly ok"
curl -s "$B&path=proj/empty.md"    | grep -q '"content":""'     && echo "empty ok"
curl -s "$B&path=proj/blob.bin"    | grep -q '"encoding":"binary"' && echo "binary ok"
curl -s "$B&path=proj/bad-utf8.md" >/dev/null && echo "lenient utf8 ok"
curl -s -o /dev/null -w 'big -> %{http_code}\n' "$B&path=proj/big.md"        # 413 (기본 2MiB)
curl -s -o /dev/null -w 'missing -> %{http_code}\n' "$B&path=proj/nope.md"   # 404
curl -s -o /dev/null -w 'dir -> %{http_code}\n' "$B&path=proj"               # 400
curl -s -o /dev/null -w 'escape -> %{http_code}\n' "$B&path=../../etc/hosts" # 403
curl -s -o /dev/null -w 'nopath -> %{http_code}\n' "localhost:4317/api/fs/file?root=ct-demo"  # 400

kill %1; rm -rf /tmp/ct-demo
```

## 7. 완료 처리

1. `docs/ENDPOINTS.md` — `GET /api/fs/file`을 `✅`로. 바이너리/413 동작을 명세에 반영.
2. `docs/STRUCTURE.md` — 변경된 파일 상태 갱신.
3. `docs/CONVENTIONS.md` §7 — "상한 검사는 데이터를 읽기 전에 stat으로 한다", "텍스트 디코딩은 `fatal: false`" 규칙 추가.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-007`
