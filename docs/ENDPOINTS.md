# 엔드포인트

> 모든 작업 완료 시 이 문서를 갱신한다. 상태 표기: `✅ 구현됨` / `⬜ 예정(T-xxx)`
>
> Base URL: `http://<HOST>:<PORT>` (기본 `http://localhost:4317`)

## 공통 규약

- 모든 API 응답은 JSON. 헤더에 `cache-control: no-store`.
- 에러 응답 본문: `{ "error": "<message>" }`
- 상태 코드
  | 코드 | 의미 |
  | --- | --- |
  | 200 | 성공 |
  | 400 | 요청 파라미터 오류 |
  | 403 | 허용되지 않은 경로/확장자 |
  | 404 | 리소스 없음 |
  | 405 | 허용되지 않은 메서드 |
  | 409 | 낙관적 잠금 충돌(파일이 그 사이 변경됨) |
  | 413 | 리소스가 상한 초과 |
  | 500 | 서버 내부 오류 |
- 목록 응답 봉투: `{ total, offset, limit, items }`
- 쿼리 파라미터는 camelCase. 불리언은 `1`/`true`를 참으로 본다.
- `path` 파라미터는 항상 **루트 기준 상대경로**이며 URL 인코딩한다. 절대경로·`..`은 거부한다.

---

## 시스템

### `GET /api/health` ✅

서버 생존 확인.

```json
{ "ok": true, "uptimeMs": 12345, "version": "0.1.0", "claudeDir": "/home/u/.claude" }
```

---

## 세션

### `GET /api/stats` ⬜ T-003

전체 집계. 응답은 `Stats` (`src/domain/types.ts`).

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `projects` | number | 프로젝트 수 |
| `sessions` | number | 트랜스크립트 세션 수 |
| `liveSessions` | number | 등록된 세션 프로세스 수 |
| `activeSessions` | number | 살아있는 프로세스 수 |
| `messages` | number | user+assistant 메시지 합계 |
| `usage` | TokenUsage | 토큰 합계 |
| `models` | `{name,count}[]` | 모델별 세션 수 |
| `tools` | `{name,count}[]` | 상위 12개 툴 사용 수 |
| `activityLast24h` | number | 24시간 내 활동한 세션 수 |
| `updatedAt` | ISO string | 응답 생성 시각 |

### `GET /api/projects` ⬜ T-003

`{ total, offset, limit, items: ProjectSummary[] }`. `lastActivityAt` 내림차순.

### `GET /api/sessions` ⬜ T-003

| 파라미터 | 기본 | 설명 |
| --- | --- | --- |
| `projectId` | – | 프로젝트로 필터 |
| `q` | – | id/title/firstPrompt/projectPath 부분 일치 |
| `limit` | 50 | 1..500 |
| `offset` | 0 | ≥0 |

`{ total, offset, limit, items: SessionSummary[] }`. `lastActivityAt` 내림차순.

### `GET /api/sessions/:id` ⬜ T-003

`SessionSummary` 단건. 없으면 404.

### `GET /api/sessions/:id/timeline` ⬜ T-003

| 파라미터 | 기본 | 설명 |
| --- | --- | --- |
| `limit` | 200 | 1..1000 |
| `offset` | 0 | ≥0 |
| `events` | 0 | 1이면 비대화 이벤트 레코드 포함 |
| `sidechain` | 1 | 0이면 서브에이전트 레코드 제외 |

`Timeline` (`{ sessionId, total, offset, limit, entries: TimelineEntry[] }`). 없으면 404.

### `GET /api/history` ⬜ T-003

| 파라미터 | 기본 | 설명 |
| --- | --- | --- |
| `project` | – | 프로젝트 **절대경로**로 필터 |
| `sessionId` | – | 세션 id로 필터 |
| `limit` | 100 | 1..1000 |

`{ total, offset, limit, items: HistoryEntry[] }`. `timestamp` 내림차순.

### `GET /api/events` ⬜ T-004

Server-Sent Events. `~/.claude` 데이터가 바뀌면 이벤트를 푸시한다.

```
Content-Type: text/event-stream

event: ready
data: {"at":"2026-08-29T00:00:00.000Z"}

event: change
data: {"type":"change","fingerprint":"a1b2","transcripts":42,"liveSessions":3,"at":"..."}

: ping
```

- 연결 직후 `ready` 1회.
- 데이터 변경 시 `change`.
- 25초마다 주석 라인(`: ping`)으로 keep-alive.
- 클라이언트가 끊으면 구독 해제. 구독자가 0이면 폴링 타이머도 멈춘다.

---

## 파일시스템

### `GET /api/fs/roots` ✅

탐색 가능한 루트 목록.

```json
{ "items": [ { "id": "workspace", "name": "workspace", "path": "/home/u/workspace" } ] }
```

### `GET /api/fs/list` ✅

한 디렉터리의 직계 항목.

| 파라미터 | 필수 | 기본 | 설명 |
| --- | --- | --- | --- |
| `root` | ✓ | – | 루트 id |
| `path` | | `""` | 루트 기준 상대경로 |
| `hidden` | | 0 | 1이면 `.`으로 시작하는 항목 포함 |

```json
{
  "root": "workspace",
  "path": "control-tower/src",
  "parent": "control-tower",
  "items": [
    { "name": "lib", "path": "control-tower/src/lib", "type": "dir",  "size": 0,   "modifiedAt": 1756400000000, "editable": false },
    { "name": "config.ts", "path": "control-tower/src/config.ts", "type": "file", "size": 512, "modifiedAt": 1756400000000, "editable": false }
  ]
}
```

- 정렬: 디렉터리 우선 → 이름 오름차순(대소문자 무시, 숫자는 자연 정렬).
- `editable`은 쓰기 허용 확장자(기본 `.md`, `.markdown`)일 때만 `true`. 디렉터리는 항상 `false`.
- 루트 자신일 때 `parent`는 `null`. 최상위 항목의 `parent`는 `""`.
- 깨진 심볼릭 링크처럼 `stat`이 실패하는 항목은 목록에서 조용히 빠진다.
- `node_modules`, `.git`을 서버가 임의로 숨기지 않는다. `.git`은 숨김 규칙에 걸리고, `node_modules`는 사용자가 열 수 있어야 한다.

### `GET /api/fs/tree` ✅

지연 로딩이 어려운 경우를 위한 얕은 재귀 트리.

| 파라미터 | 필수 | 기본 | 설명 |
| --- | --- | --- | --- |
| `root` | ✓ | – | 루트 id |
| `path` | | `""` | 시작 경로 |
| `depth` | | 2 | 1..5 |
| `hidden` | | 0 | 숨김 포함 |

`FsEntry`에 `children?: FsEntry[]`가 붙은 형태. `depth` 초과 디렉터리는 `children`을 생략하고 `hasChildren: true`만 준다.

- 항목이 2000개를 넘는 디렉터리는 앞의 2000개만 담고 그 노드에 `truncated: true`를 붙인다.
- 읽을 수 없는 하위 디렉터리는 `children: []`로 두고 트리 전체를 실패시키지 않는다.
- `modifiedAt`은 정수 epoch ms다(`mtimeMs`의 소수점은 버린다). `version`과 어긋나지 않게 하기 위해서다.

### `GET /api/fs/file` ⬜ T-007

파일 내용 읽기.

| 파라미터 | 필수 | 기본 | 설명 |
| --- | --- | --- | --- |
| `root` | ✓ | – | 루트 id |
| `path` | ✓ | – | 루트 기준 상대경로 |

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
  "content": "# TODO ..."
}
```

- 바이너리로 판정되면(NUL 바이트 포함) `encoding: "binary"`, `content: null`.
- `FS_MAX_READ_BYTES`(기본 2MiB) 초과면 413.
- `version`은 `"<modifiedAt>:<size>"`. 저장 시 낙관적 잠금 키로 쓴다.

### `PUT /api/fs/file` ⬜ T-008

마크다운 저장. 요청 본문 JSON:

```json
{
  "root": "workspace",
  "path": "control-tower/docs/TODO.md",
  "content": "# TODO ...",
  "baseVersion": "1756400000000:2481",
  "createIfMissing": false
}
```

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `root` | ✓ | 루트 id |
| `path` | ✓ | 루트 기준 상대경로. 확장자가 쓰기 허용목록에 있어야 함 |
| `content` | ✓ | UTF-8 전체 본문 |
| `baseVersion` | 신규 생성 시 제외 | 마지막으로 읽은 `version` |
| `createIfMissing` | | 기본 `false`. `true`면 없는 파일을 새로 만든다 |

응답 200:

```json
{ "root": "workspace", "path": "...", "size": 2500, "modifiedAt": 1756400100000, "version": "1756400100000:2500", "created": false }
```

에러:

| 코드 | 상황 |
| --- | --- |
| 400 | 필드 누락/형식 오류 |
| 403 | 루트 밖 경로 또는 쓰기 비허용 확장자 |
| 404 | 파일이 없고 `createIfMissing`이 아님 |
| 409 | `baseVersion`이 현재 `version`과 불일치. 본문에 `{ "error": "...", "currentVersion": "..." }` |
| 413 | 본문이 `FS_MAX_READ_BYTES` 초과 |

- 쓰기는 같은 디렉터리의 임시 파일에 쓴 뒤 `rename`으로 원자 교체한다.

---

## 정적 자원

| 경로 | 상태 | 설명 |
| --- | --- | --- |
| `/` | ✅ | `src/web/index.html` (번들된 SPA) |
| `/*` | ✅ | SPA 폴백. `/api/*`보다 낮은 우선순위 |

클라이언트 라우트(T-011): `/`(대시보드) · `/files` · `/sessions` · `/sessions/:id`
