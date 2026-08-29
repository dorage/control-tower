# T-008 — 마크다운 저장 API와 충돌 감지

| | |
| --- | --- |
| **ID** | T-008 |
| **우선순위** | P0 |
| **영역** | api-fs |
| **선행** | T-005, T-007 |
| **후행** | T-013 |

## 1. 목적

에디터가 편집한 마크다운을 저장한다. 세 가지를 보장한다.

1. **범위 제한** — 쓰기 허용 확장자(`.md`, `.markdown`)와 루트 안으로만.
2. **원자성** — 저장 도중 프로세스가 죽어도 반쪽짜리 파일이 남지 않는다.
3. **충돌 감지** — 내가 읽은 뒤 남이 바꿨으면 덮어쓰지 않고 409로 알린다.

## 2. 선행 지식

- T-005: `resolvePath`, `isEditable`, `versionOf`, `config.writableExtensions`, `config.fsMaxReadBytes`
- T-007: `statEntry`, `GET /api/fs/file`이 돌려주는 `version`
- T-002: `HttpError`, `withRoute`

## 3. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/repositories/fs.repository.ts` | `writeFileAtomic` 추가 |
| `src/services/fs.service.ts` | `writeFile` 추가 |
| `src/routes/fs.route.ts` | `PUT /api/fs/file` 추가 |
| `src/services/fs.service.test.ts` | 충돌/원자성 테스트 추가 |

## 4. 상세 명세

### 4.1 요청

```
PUT /api/fs/file
Content-Type: application/json
```

```ts
interface WriteRequest {
  root: string;
  path: string;
  content: string;
  /** 마지막으로 읽은 version. createIfMissing 으로 새로 만들 때는 생략. */
  baseVersion?: string;
  /** 기본 false. */
  createIfMissing?: boolean;
}
```

본문 검증(하나라도 어기면 400):

- `root`가 비어 있지 않은 문자열
- `path`가 비어 있지 않은 문자열
- `content`가 문자열 (`undefined`/`null`/객체 거부. **빈 문자열은 유효** — 파일을 비우는 정당한 편집이다)
- `baseVersion`이 있으면 문자열
- `createIfMissing`이 있으면 불리언

JSON 파싱 실패도 400(`"invalid json body"`). `await req.json()`을 try/catch로 감싼다.

### 4.2 원자적 쓰기

```ts
// src/repositories/fs.repository.ts
import { rename, unlink } from "node:fs/promises";

let counter = 0;
import { basename, dirname, join } from "node:path";

/**
 * 같은 디렉터리의 임시 파일에 쓴 뒤 rename 으로 교체한다.
 * rename 은 같은 파일시스템 안에서 원자적이므로, 임시 파일을
 * 시스템 tmp 가 아니라 대상 디렉터리에 만들어야 한다.
 */
export async function writeFileAtomic(absolute: string, content: string): Promise<void> {
  const temp = join(dirname(absolute), `.${basename(absolute)}.tmp-${process.pid}-${counter++}`);
  try {
    await Bun.write(temp, content);
    await rename(temp, absolute);
  } catch (error) {
    await unlink(temp).catch(() => {});   // 임시 파일을 남기지 않는다
    throw error;
  }
}
```

- 임시 파일 이름은 `.`으로 시작한다 → 목록 API의 숨김 필터에 걸려 사용자에게 보이지 않는다.
- `counter`는 모듈 스코프의 단조 증가 정수. 같은 프로세스의 동시 저장이 서로의 임시 파일을 밟지 않게 한다.
- `Date.now()`를 이름에 쓰지 않는다(같은 밀리초에 두 번 호출될 수 있다).

### 4.3 service

```ts
export interface WriteOptions {
  baseVersion?: string | null;
  createIfMissing?: boolean;
}

export async function writeFile(
  rootId: string,
  relPath: string,
  content: string,
  options?: WriteOptions,
): Promise<FsWriteResult>;
```

절차 (**순서가 곧 보안이다**):

1. `Buffer.byteLength(content, "utf8") > config.fsMaxReadBytes` → `HttpError(413, ...)`.
2. `const { root, absolute, relative } = await resolvePath(rootId, relPath)`.
   `resolvePath`는 존재하지 않는 파일에 대해 **부모 디렉터리 기준**으로 심볼릭 링크를 검사한다(T-005 §4.4-7).
3. `relative === ""` → `HttpError(400, "path is required")`.
4. `isEditable(relative)`가 false → `HttpError(403, "not writable: <ext> (allowed: .md, .markdown)")`.
   **확장자 검사는 경로 해석 다음, 파일 접근 전에.**
5. `const current = await statEntry(absolute)`.
6. `current`가 디렉터리 → `HttpError(400, "is a directory")`.
7. 분기:
   - `current === null` (신규):
     - `options.createIfMissing !== true` → `HttpError(404, "not found: <relative>")`
     - `options.baseVersion`이 주어졌으면 → `HttpError(409, "file does not exist", { currentVersion: null })`
   - `current !== null` (기존):
     - `options.baseVersion`이 없으면 → `HttpError(400, "baseVersion is required to overwrite an existing file")`
     - `versionOf(current.modifiedAt, current.size) !== options.baseVersion` →
       `HttpError(409, "file changed on disk", { currentVersion: <현재 version> })`
8. `writeFileAtomic(absolute, content)`. EACCES/EROFS → `HttpError(403, "permission denied")`.
9. `statEntry(absolute)`를 다시 호출해 새 `modifiedAt`/`size`를 얻는다. null이면 `HttpError(500, ...)`.
10. `FsWriteResult`를 반환한다. `created: current === null`.

**9번을 생략하고 `content.length`로 `version`을 계산하지 않는다.** UTF-8 바이트 길이와 문자열 길이가 다르고, `mtime`은 파일시스템이 정한다. 반환한 `version`이 실제 파일과 어긋나면 다음 저장이 즉시 409로 실패한다.

### 4.4 라우트

```ts
"/api/fs/file": {
  GET: withRoute(...),   // T-007
  PUT: withRoute(async (req) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, "invalid json body");
    }
    const { root, path, content, baseVersion, createIfMissing } = parseWriteBody(body);
    return json(await writeFile(root, path, content, { baseVersion, createIfMissing }));
  }),
},
```

`parseWriteBody(body: unknown): WriteRequest`는 같은 파일의 지역 함수로 두고, §4.1 검증을 수행하며 실패 시 `HttpError(400, ...)`를 던진다.

### 4.5 응답

200:

```json
{
  "root": "ct-demo",
  "path": "proj/a.md",
  "size": 24,
  "modifiedAt": 1756400100123,
  "version": "1756400100123:24",
  "created": false
}
```

409:

```json
{ "error": "file changed on disk", "currentVersion": "1756400100999:31" }
```

클라이언트(T-013)는 `currentVersion`을 받아 "디스크에서 변경됨 — 다시 불러오기 / 덮어쓰기"를 제시한다. 덮어쓰기는 다시 읽어 새 `baseVersion`으로 저장하는 것으로 구현한다. 서버에 강제 덮어쓰기 플래그를 두지 않는다.

## 5. 수용 기준

- [ ] 읽기 → 수정 → `baseVersion`과 함께 저장이 200이고 `version`이 갱신된다.
- [ ] 반환된 `version`으로 곧바로 다시 저장하면 또 200이다(버전 계산이 일관됨).
- [ ] 저장 후 다른 프로세스가 파일을 건드리고 옛 `baseVersion`으로 저장하면 409 + `currentVersion`.
- [ ] 기존 파일에 `baseVersion` 없이 저장하면 400.
- [ ] `createIfMissing: true`로 없는 파일을 만들면 201이 아니라 200 + `created: true`.
- [ ] `createIfMissing` 없이 없는 파일에 저장하면 404.
- [ ] `.ts`/`.json` 경로 저장이 403이고 파일이 변경되지 않는다.
- [ ] `../../tmp/evil.md` 저장이 403이고 대상 파일이 생기지 않는다.
- [ ] 루트 안 심볼릭 링크가 밖을 가리킬 때 그 경로 저장이 403이다.
- [ ] `content: ""` 저장이 200이고 파일이 0바이트가 된다.
- [ ] `content`가 문자열이 아니면 400.
- [ ] 저장 실패(예: 읽기 전용 디렉터리) 후 `.*.tmp-*` 잔여 파일이 남지 않는다.
- [ ] 한글/이모지가 포함된 본문이 손상 없이 왕복한다.
- [ ] `bun test src/services/fs.service.test.ts` 통과, `bunx tsc --noEmit` 통과.

## 6. 검증

### 6.1 수동

```bash
mkdir -p /tmp/ct-demo/proj
echo '# a' > /tmp/ct-demo/proj/a.md
echo 'x'   > /tmp/ct-demo/proj/b.ts
WORKSPACE_ROOTS=/tmp/ct-demo bun run dev & sleep 1
B=localhost:4317/api/fs

V=$(curl -s "$B/file?root=ct-demo&path=proj/a.md" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
echo "version=$V"

# 정상 저장
curl -s -X PUT "$B/file" -H 'content-type: application/json' \
  -d "{\"root\":\"ct-demo\",\"path\":\"proj/a.md\",\"content\":\"# 수정됨 🎉\\n\",\"baseVersion\":\"$V\"}"; echo

# 옛 버전으로 재저장 -> 409
curl -s -w '\n%{http_code}\n' -X PUT "$B/file" -H 'content-type: application/json' \
  -d "{\"root\":\"ct-demo\",\"path\":\"proj/a.md\",\"content\":\"stale\",\"baseVersion\":\"$V\"}"

# 확장자 거부 -> 403, 파일 불변
curl -s -o /dev/null -w 'ts -> %{http_code}\n' -X PUT "$B/file" -H 'content-type: application/json' \
  -d '{"root":"ct-demo","path":"proj/b.ts","content":"pwned","baseVersion":"0:0"}'
grep -q '^x$' /tmp/ct-demo/proj/b.ts && echo "b.ts unchanged ok"

# 탈출 -> 403
curl -s -o /dev/null -w 'escape -> %{http_code}\n' -X PUT "$B/file" -H 'content-type: application/json' \
  -d '{"root":"ct-demo","path":"../evil.md","content":"x","createIfMissing":true}'
test ! -e /tmp/evil.md && echo "no escape file ok"

# 신규 생성
curl -s -X PUT "$B/file" -H 'content-type: application/json' \
  -d '{"root":"ct-demo","path":"proj/new.md","content":"hi","createIfMissing":true}'; echo
# 없는 파일 + createIfMissing 없음 -> 404
curl -s -o /dev/null -w 'missing -> %{http_code}\n' -X PUT "$B/file" -H 'content-type: application/json' \
  -d '{"root":"ct-demo","path":"proj/nope.md","content":"hi"}'
# 잘못된 본문 -> 400
curl -s -o /dev/null -w 'badbody -> %{http_code}\n' -X PUT "$B/file" -H 'content-type: application/json' -d '{"root":"ct-demo"}'

ls -a /tmp/ct-demo/proj | grep -q 'tmp-' && echo "LEAK: temp file left" || echo "no temp leak ok"
cat /tmp/ct-demo/proj/a.md
kill %1; rm -rf /tmp/ct-demo
```

### 6.2 자동

`src/services/fs.service.test.ts`에 추가한다.

```ts
test("baseVersion 불일치는 409", async () => { /* 쓰기 → 외부 변경(mtime 바꾸기) → 옛 버전 저장 */ });
test("반환된 version 으로 즉시 재저장할 수 있다", async () => { /* 왕복 2회 */ });
test("허용되지 않은 확장자는 403이고 파일을 바꾸지 않는다", async () => { /* .ts */ });
test("빈 문자열 저장이 파일을 0바이트로 만든다", async () => { /* content: "" */ });
test("유니코드 왕복", async () => { /* "한글 🎉" */ });
```

mtime을 바꿀 때는 `node:fs/promises`의 `utimes`를 쓰거나, 내용을 바꿔 크기를 달라지게 한다.

## 7. 완료 처리

1. `docs/ENDPOINTS.md` — `PUT /api/fs/file`을 `✅`로. 요청 필드/에러 표를 구현과 정확히 맞춘다(특히 "기존 파일 덮어쓰기에는 `baseVersion` 필수" 400).
2. `docs/STRUCTURE.md` — 변경된 파일 상태 갱신.
3. `docs/CONVENTIONS.md` §7/§9 — 원자적 쓰기(같은 디렉터리 임시 파일 + rename), 낙관적 잠금(`version` 왕복), 확장자 허용목록 검사 순서를 명문화.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-008`
