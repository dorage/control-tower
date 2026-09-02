# T-025 — 라인 단위 코멘트 저장소와 CRUD API

| | |
| --- | --- |
| **ID** | T-025 |
| **우선순위** | P1 |
| **영역** | api-fs |
| **선행** | T-005(경로 안전), T-007(파일 읽기) |
| **후행** | T-026(파일뷰 코멘트 레이어) |

## 1. 목적

파일의 특정 줄(또는 줄 범위)에 코멘트를 남기고, 사람과 에이전트가 그것을 함께 읽고 완료 처리할 수 있게 한다. 이 작업은 **저장소와 API 까지**만 만든다. 화면은 T-026 이다.

두 갈래의 수요를 하나의 표로 받는다.

- **memo** — 사람이 자기 자신에게 남기는 메모. "이 문단 애매하다."
- **ai** — 사람이 에이전트에게 남기는 지시. "이 목록을 표로 바꿔줘." 에이전트가 `type=ai&complete=0` 으로 모아 읽고, 처리한 뒤 완료로 바꾼다.

## 2. 전제와 결정

### 2.1 저장소는 별도 파일로 둔다

`~/.control-tower/comments.db` (`COMMENTS_DB`). 텔레메트리 DB 에 합치지 않는다 — 텔레메트리는 보존 잡이 오래된 행을 지우고 `incremental_vacuum` 을 돌리는 **버려도 되는** 데이터고, 코멘트는 사용자가 손으로 쓴 **지워지면 안 되는** 데이터다. 한 파일에 두면 백업 정책과 삭제 잡이 서로를 위협한다. 코멘트에는 보존 잡을 두지 않는다.

### 2.2 라인 앵커: 번호 + 원문 스냅샷

에이전트가 같은 파일을 실시간으로 고치는 환경이므로 줄 번호는 반드시 밀린다. 그래서 번호와 함께 **그 줄의 원문**을 저장하고, 파일이 바뀌면 그 원문을 다시 찾아 번호를 보정한다.

- `anchor_start` — 저장 당시 `start_line` 의 원문. 필수.
- `anchor_end` — 범위 코멘트일 때만 `end_line` 의 원문. 한 줄 코멘트는 `NULL`.
- `file_version` — 저장 당시 파일의 낙관적 잠금 키(`versionOf`). 지금 version 과 다르면 "밀렸을 수 있다"의 근거다.

범위 전체를 스냅샷으로 저장하지 않는다. 1000줄을 선택한 코멘트 하나가 본문보다 큰 앵커를 갖는 것을 막고, 재앵커에 필요한 것은 양 끝 두 줄뿐이다. 인용 미리보기는 저장된 스냅샷이 아니라 **보정된 현재 버퍼**에서 뜬다.

### 2.3 재앵커는 서버가 하지 않는다

목록 조회에서 파일을 다시 읽지 않는다. 서버는 저장된 번호와 앵커 원문을 그대로 돌려주고, 보정은 **버퍼를 가진 쪽**이 한다.

- 이유 ①: 편집 화면의 기준은 디스크가 아니라 초안(draft)이다. 서버가 디스크 기준으로 보정하면 편집 중 화면과 어긋난다.
- 이유 ②: 목록 조회마다 대상 파일을 읽으면(최대 2MB) 코멘트 10건에 파일 읽기 10번이 붙는다.
- 이유 ③: 보정 로직이 서버와 웹 두 곳에 생기는 것을 막는다. 로직은 `src/web/lib/anchor.ts` **한 곳**에만 둔다(T-026).

밀렸는지의 판정도 클라이언트가 한다 — `GET /api/fs/file` 이 준 `version` 과 코멘트의 `fileVersion` 을 비교하면 된다. 에이전트도 같은 방법을 쓰거나, `anchor_start` 로 직접 찾으면 된다.

보정 결과는 클라이언트가 `POST /api/comments/reanchor` 로 되돌려 저장한다(자기 치유). 그러지 않으면 드리프트가 누적되어 언젠가 탐색 창을 벗어난다.

### 2.4 `type` 과 `author` 는 다른 축이다

`type` 은 **누가 처리할 일인가**(memo=나, ai=에이전트), `author` 는 **누가 썼는가**(human/agent)다. 한 컬럼으로 겹치면 "에이전트가 남긴 지적"을 표현할 수 없다.

| | `author=human` | `author=agent` |
| --- | --- | --- |
| `type=memo` | 사람이 자기 메모 | 에이전트가 남긴 관찰·지적 |
| `type=ai` | 사람이 에이전트에게 낸 지시 | 에이전트가 후속 작업으로 남긴 지시 |

기본값은 `author="human"`. 에이전트가 쓸 때만 명시한다. 인증이 없으므로(§9) 이 값은 신뢰 경계가 아니라 **분류 표시**다.

### 2.5 줄 번호 불변식 (우선 확인 규칙)

- **1-based**, **양끝 포함(inclusive)**. 한 줄 코멘트는 `start_line === end_line`.
- `start_line >= 1`, `end_line >= start_line`, `end_line <= 줄 수`. 셋 중 하나라도 어기면 400.
- `end_line === 줄 수` 는 **유효**하다(마지막 줄에 코멘트를 달 수 있다). `end_line === 줄 수 + 1` 은 400.
- 줄 나누기는 `content.split("\n")` 그대로다. 마지막 빈 줄을 지우지 않고, `\r\n` 도 정규화하지 않는다(`\r` 는 앵커 원문에 그대로 포함되므로 재앵커는 여전히 일치한다). 서버와 웹이 **같은 규칙**을 쓰지 않으면 마지막 줄에서 한 줄씩 어긋난다.

### 2.6 대상 파일 범위

**원문 탭이 열리는 모든 텍스트 파일.** 쓰기 허용목록(`.md`)과 무관하다 — 코멘트는 파일을 고치지 않으므로 `.ts` 에 리뷰 메모를 남겨도 안전하다. 단 다음은 거절한다.

- 바이너리(`encoding === "binary"`) → 400. 줄 개념이 없다.
- `FS_MAX_READ_BYTES` 초과 → 413. `readFile` 이 이미 그렇게 한다.

### 2.7 파일이 사라지면

코멘트 행을 지우지 않는다. 파일이 없으면 뷰어가 열리지 않으므로 그냥 보이지 않는다. 자동 청소를 두지 않는다 — 파일 이동과 삭제를 구별할 방법이 없고, 사람이 쓴 글을 감시 이벤트로 지우는 것은 되돌릴 수 없다. 필요하면 `DELETE /api/comments/:id` 로 손으로 지운다.

## 3. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/db/comments.db.ts` | 핸들·PRAGMA·스키마. `commentsDb()` / `closeCommentsDb()` |
| `src/repositories/comment.repository.ts` | SQL 전용. 행 ↔ `FileComment` 변환 |
| `src/services/comment.service.ts` | 검증·경로 해석·앵커 캡처. `fs.service` 경유 |
| `src/services/comment.service.test.ts` | 경계·거절·왕복 테스트 |
| `src/routes/comment.route.ts` | 5개 핸들러 |
| `src/routes/index.ts` | `...commentRoutes` 한 줄 |
| `src/config.ts` | `comments.dbPath` getter |
| `src/domain/types.ts` | `FileComment` / `CommentType` / `CommentAuthor` |

## 4. 상세 명세

### 4.1 스키마

```sql
create table if not exists comment (
  id integer primary key,
  root text not null,
  path text not null,
  start_line integer not null,
  end_line integer not null,
  anchor_start text not null,
  anchor_end text,
  file_version text not null,
  comment text not null,
  type text not null check(type in ('memo', 'ai')),
  author text not null check(author in ('human', 'agent')),
  is_complete integer not null default 0 check(is_complete in (0, 1)),
  created_at integer not null,
  modified_at integer not null
);
create index if not exists ix_comment_file on comment(root, path);
create index if not exists ix_comment_open on comment(type, is_complete, modified_at);
```

- `check` 제약을 DB 에 둔다. 서비스가 이미 검증하지만, 저장소가 마지막 방어선이다.
- `path` 는 `resolvePath` 가 돌려준 **정규화된 상대경로**를 저장한다. `./docs/a.md` 와 `docs/a.md` 가 다른 행으로 갈라지지 않게.
- 시각은 epoch ms 정수(`Date.now()`). 도메인 타입의 다른 시각 필드와 같은 단위다.
- 정규화용 차원 테이블을 두지 않는다 — §9.1 의 정규화 규칙은 폭주하는 유입에 대한 것이다. 코멘트는 사람이 손으로 쓰는 양이고, 조회가 항상 `(root, path)` 로 들어와 조인이 손해다.
- PRAGMA 는 텔레메트리와 같은 순서: `auto_vacuum = incremental` 을 **첫 테이블 전에**, 그다음 `journal_mode = wal`, `wal_autocheckpoint = 512`, `synchronous = normal`, `foreign_keys = on`.

### 4.2 도메인 타입

```ts
export type CommentType = "memo" | "ai";
export type CommentAuthor = "human" | "agent";

export interface FileComment {
  id: number;
  root: string;
  path: string;
  /** 1-based, 양끝 포함. 한 줄이면 startLine === endLine. */
  startLine: number;
  endLine: number;
  /** 저장 당시 startLine 의 원문. 재앵커의 기준. */
  anchorStart: string;
  /** 범위 코멘트일 때만. 한 줄 코멘트는 null. */
  anchorEnd: string | null;
  /** 저장 당시 파일의 낙관적 잠금 키. 지금 version 과 다르면 밀렸을 수 있다. */
  fileVersion: string;
  comment: string;
  type: CommentType;
  author: CommentAuthor;
  isComplete: boolean;
  createdAt: number;
  modifiedAt: number;
}
```

### 4.3 엔드포인트

#### `GET /api/comments`

| 파라미터 | 기본 | 설명 |
| --- | --- | --- |
| `root` | — | 없으면 전체 루트 |
| `path` | — | 루트 기준 상대경로. 주면 그 파일만 |
| `type` | — | `memo` / `ai`. 그 외 값은 무시(읽기는 방어적으로) |
| `complete` | — | `0` 미완료만 / `1` 완료만 / 생략하면 전체 |
| `limit` | 200 | 1..1000 clamp |
| `offset` | 0 | |

응답은 목록 봉투 `{ total, offset, limit, items }`.

정렬은 두 갈래다.

- `path` 가 있으면 `start_line, id` 오름차순 — 화면이 그 순서로 그린다.
- `path` 가 없으면 `modified_at` 내림차순 — 에이전트가 최근 지시를 먼저 본다.

파일을 읽지 않는다. 밀림 판정은 호출자가 `fileVersion` 비교로 한다(§2.3).

#### `GET /api/comments/:id`

단건. 없으면 404. **이 핸들러가 없으면 브라우저로 이 주소를 열었을 때 405 가 아니라 SPA 폴백이 걸려 앱 HTML 이 나간다**(CONVENTIONS §8).

#### `POST /api/comments`

```json
{ "root": "workspace", "path": "docs/plan.md", "startLine": 3, "endLine": 5,
  "comment": "이 목록을 표로 바꿔줘", "type": "ai", "author": "human" }
```

검증 순서를 지킨다. **이 순서가 곧 보안이다**(CONVENTIONS §9).

1. JSON 파싱 실패 → 400. 객체가 아니면 400.
2. 필드 타입: `root`/`path`/`comment` 는 비어 있지 않은 문자열, `startLine`/`endLine` 은 정수, `type` ∈ {memo, ai}, `author` ∈ {human, agent}(생략 시 `human`) → 아니면 400.
3. `resolvePath(root, path)` — 미등록 루트 403, 절대경로·`\0` 400, 루트 밖 400, 없는 파일 404.
4. `readFile` — 413(상한 초과), 404(그사이 사라짐).
5. `encoding === "binary"` → 400 `"binary file cannot be commented"`.
6. 줄 경계(§2.5) → 400.
7. `comment` 길이: 빈 문자열(공백만도 포함) 400, `COMMENT_MAX_CHARS`(4000) 초과 400. 환경변수로 빼지 않는다 — 사람이 손으로 쓰는 글의 상한이고, 늘려야 할 이유가 생기기 전에는 설정 항목을 하나 더 두는 값이 없다.
8. 앵커 캡처: `anchorStart = lines[startLine - 1]`, `anchorEnd = startLine === endLine ? null : lines[endLine - 1]`. 각 4000자에서 자른다(한 줄이 그보다 긴 파일이 실제로 있다).
9. insert. `created_at = modified_at = Date.now()`.

응답 200 + 생성된 `FileComment`. 201 을 쓰지 않는다 — CONVENTIONS §8 의 상태 코드 표에 없고, `PUT /api/fs/file` 도 생성 시 200 이다.

#### `PATCH /api/comments/:id`

사용자 편집만 받는다: `comment`(문자열), `isComplete`(불리언). 둘 다 생략이면 400. `modified_at` 을 갱신한다. 없는 id 는 404.

위치(`startLine` 등)는 이 엔드포인트로 바꾸지 않는다 — 아래 이유 참조.

#### `POST /api/comments/reanchor`

```json
{ "root": "workspace", "path": "docs/plan.md", "fileVersion": "1756800000000:1234",
  "items": [{ "id": 7, "startLine": 9, "endLine": 11 }] }
```

- `items` 는 1..500 건. 각 항목의 줄 경계를 `POST` 와 **같은 규칙**으로 검증한다(파일을 한 번만 읽고 전체를 검사).
- `anchor_start`/`anchor_end` 는 바꾸지 않는다. 앵커 원문이 바뀌면 그것은 보정이 아니라 다른 코멘트다.
- **`modified_at` 을 건드리지 않는다.** 위치 보정은 사용자의 수정이 아니다. 파일이 바뀔 때마다 "수정됨" 시각이 갱신되면 그 값이 아무 뜻도 갖지 못한다. 그래서 `PATCH` 와 분리했다.
- `root`/`path` 가 다른 코멘트 id 가 섞여 오면 그 항목만 건너뛰고 응답의 `skipped` 에 담는다. 전체를 실패시키지 않는다.
- 하나의 트랜잭션으로 적용한다.
- 응답: `{ updated: number, skipped: number[] }`.

라우트 등록에서 `"/api/comments/reanchor"` 가 `"/api/comments/:id"` 보다 먼저 매칭돼야 한다. Bun 은 구체적 경로를 파라미터 경로보다 먼저 매칭하지만, **실제 호출로 확인**한다(§6).

#### `DELETE /api/comments/:id`

200 + `{ deleted: true }`. 없는 id 는 404. 확인 절차(정말 지울지 묻기)는 화면이 맡는다(T-026).

### 4.4 계층

`route → comment.service → comment.repository → db`. 서비스가 `fs.service` 의 `resolvePath`/`readFile` 을 쓰는 것은 service→service 이며 기존 선례가 있다(`stats.service` → `session.service`). **repository 는 `fs.*` 를 모른다** — 경로 해석은 전부 서비스에서 끝난다.

## 5. 수용 기준

- [ ] `POST` → `GET ?root&path` 왕복으로 생성한 코멘트가 `start_line` 오름차순으로 나온다.
- [ ] `startLine=0` / `-1` / `startLine > endLine` / `endLine = 줄 수 + 1` 네 경우가 모두 400, `endLine = 줄 수` 와 `startLine = 1` 은 200.
- [ ] 빈 본문(공백만 포함) 400, 4000자 200, 4001자 400.
- [ ] 미등록 루트 403, `../` 400, 없는 파일 404, 바이너리 파일 400.
- [ ] `./docs/a.md` 로 만든 코멘트가 `docs/a.md` 조회에 나온다(경로 정규화).
- [ ] `PATCH` 로 `isComplete` 를 켜면 `modified_at` 이 커지고, `reanchor` 로 줄을 옮기면 `modified_at` 이 **그대로**이며 `start_line`/`end_line`/`file_version` 만 바뀐다.
- [ ] `type=ai&complete=0` 전역 조회가 `modified_at` 내림차순으로 여러 파일의 코멘트를 함께 준다.
- [ ] `POST /api/comments/reanchor` 를 `:id` 핸들러가 가로채지 않는다.
- [ ] `GET /api/comments/:id` 가 존재하며, 없는 id 에 앱 HTML 이 아니라 404 JSON 을 준다.
- [ ] 테스트는 임시 `WORKSPACE_ROOTS` 와 임시 `COMMENTS_DB` 만 건드리고, 끝나면 임시 디렉터리 잔여가 0이다.
- [ ] `bun run check` 통과.

## 6. 검증

```bash
bun test src/services/comment.service.test.ts
bun run check

# 실서버 왕복 (다른 포트·다른 DB 로 띄워 사용자 세션을 방해하지 않는다)
PORT=4319 COMMENTS_DB=/tmp/ct-comments-check.db bun index.ts &
curl -s 'localhost:4319/api/comments' | head -c 200
curl -s -X POST localhost:4319/api/comments -H 'content-type: application/json' \
  -d '{"root":"<루트id>","path":"docs/TODO.md","startLine":1,"endLine":1,"comment":"확인","type":"memo"}'
curl -s 'localhost:4319/api/comments?root=<루트id>&path=docs/TODO.md'
curl -s -X POST localhost:4319/api/comments/reanchor -H 'content-type: application/json' \
  -d '{"root":"<루트id>","path":"docs/TODO.md","fileVersion":"x","items":[{"id":1,"startLine":2,"endLine":2}]}'
curl -s -X DELETE localhost:4319/api/comments/1

# 메서드·폴백 확인
curl -s -o /dev/null -w '%{http_code}\n' localhost:4319/api/comments/9999      # 404 (HTML 아님)
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE localhost:4319/api/comments # 405
```

## 7. 완료 처리

1. `docs/ENDPOINTS.md` 에 "코멘트" 절과 5개 엔드포인트를 `✅` 로 추가.
2. `docs/STRUCTURE.md` 트리에 새 파일 6종, 환경변수 표에 `COMMENTS_DB` 추가.
3. `docs/CONVENTIONS.md` 에 앵커 규칙 추가 — 줄 번호는 1-based 양끝 포함, 줄 나누기는 `split("\n")` 그대로, 재앵커는 버퍼를 가진 쪽에서만, 위치 보정은 `modified_at` 을 건드리지 않는다.
4. `docs/TODO.md` 에 append: `<UTC-ISO> DONE T-025`.

## 8. 크기와 안전망

- 크기: 3시간 내외. 완수조건은 §5 전부.
- 안전망: 새 테이블·새 라우트뿐이라 기존 기능 경로를 건드리지 않는다. 되돌리기는 `git revert` + `~/.control-tower/comments.db` 삭제. 스키마 삭제·데이터 마이그레이션이 없다.
