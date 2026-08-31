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

### `GET /api/stats` ✅

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

### `GET /api/projects` ✅

| 파라미터 | 기본 | 설명 |
| --- | --- | --- |
| `limit` | 200 | 1..1000 |
| `offset` | 0 | ≥0 |

`{ total, offset, limit, items: ProjectSummary[] }`. `lastActivityAt` 내림차순.

### `GET /api/sessions` ✅

| 파라미터 | 기본 | 설명 |
| --- | --- | --- |
| `projectId` | – | 프로젝트로 필터 |
| `q` | – | 부분 일치(대소문자 무시). 대상은 `id` · `title` · `firstPrompt` · `projectPath` · `projectId` |
| `limit` | 50 | 1..500 |
| `offset` | 0 | ≥0 |

`{ total, offset, limit, items: SessionSummary[] }`. `lastActivityAt` 내림차순.

### `GET /api/sessions/:id` ✅

`SessionSummary` 단건. 없으면 404.

### `GET /api/sessions/:id/timeline` ✅

| 파라미터 | 기본 | 설명 |
| --- | --- | --- |
| `limit` | 200 | 1..1000 |
| `offset` | 0 | ≥0 |
| `events` | 0 | 1이면 비대화 레코드(`mode`·`ai-title` 류, `system`, `attachment`, `isMeta`) 포함 |
| `sidechain` | 0 | 1이면 서브에이전트 레코드 포함 |
| `thinking` | 0 | 1이면 `thinking` 블록 포함 |
| `tools` | 0 | 1이면 `tool_use`·`tool_result` 블록 포함 |

`Timeline` (`{ sessionId, total, offset, limit, entries: TimelineEntry[] }`). 없으면 404.
이미 봉투 형태라 목록 봉투로 다시 감싸지 않는다.

**기본값은 대화만이다.** 아무 파라미터도 주지 않으면 사람이 쓴 프롬프트와 모델의 답변
텍스트만 남는다. `system`(훅 요약·턴 소요)과 `attachment`(토큰 리마인더 등 주입된 컨텍스트), 그리고
`isMeta` 레코드(인터럽트 리마인더·`/context` 출력처럼 사람이 쓴 것처럼 들어오지만 사람이
쓰지 않은 줄)는 본문이 있어도 대화가 아니므로 `events` 쪽에 묶인다. 실측 735줄 트랜스크립트가 기본값에서
22줄로 줄어든다.

블록 필터(`thinking`·`tools`)는 **서버에서** 적용한다. 필터 후 블록이 하나도 남지 않은
엔트리(예: 툴 결과만 담긴 `user` 레코드)는 응답에서 아예 빠진다. 클라이언트가 걸러 내면
`total`에는 세어지고 화면에는 없는 엔트리가 생겨 페이지 경계가 어긋나기 때문이다.

`total`은 필터 적용 후의 엔트리 수다. 다섯 파라미터 중 무엇을 바꿔도 페이지 경계가 함께 바뀐다.

`TimelineEntry.blocks`는 5종의 유니온이다(`src/domain/types.ts`의 `TimelineBlock`).

| `type` | 필드 |
| --- | --- |
| `text` | `text`, `truncated` |
| `thinking` | `text`, `truncated` |
| `tool_use` | `id`, `name`, `input`(JSON 문자열), `truncated` |
| `tool_result` | `toolUseId`, `text`, `isError`, `truncated` |
| `image` | `text`, `truncated` |

`truncated: true`는 서버가 `MAX_BLOCK_CHARS`(기본 4000자)에서 잘랐다는 뜻이다. `tool_use.input`이
잘렸으면 JSON 이 깨져 있으므로 클라이언트는 파싱 실패를 정상 경로로 다뤄야 한다.

### `GET /api/history` ✅

| 파라미터 | 기본 | 설명 |
| --- | --- | --- |
| `project` | – | 프로젝트 **절대경로**로 필터 |
| `sessionId` | – | 세션 id로 필터 |
| `limit` | 100 | 1..1000 |

`{ total, offset, limit, items: HistoryEntry[] }`. `timestamp` 내림차순.

### `GET /api/events` ✅

Server-Sent Events. `~/.claude` 데이터가 바뀌면 이벤트를 푸시한다.

```
Content-Type: text/event-stream

event: ready
data: {"at":"2026-08-31T13:32:08.984Z"}

event: change
data: {"type":"change","fingerprint":"7c25f3de79f9391e","transcripts":1,"liveSessions":0,
       "at":"2026-08-31T13:32:15.774Z","changedSessions":["s-probe"],
       "addedSessions":[],"removedSessions":[]}

: ping
```

- 연결 직후 `ready` 1회.
- 데이터 변경 시 `change`.
- 25초마다 주석 라인(`: ping`)으로 keep-alive.
- 클라이언트가 끊으면 구독 해제. 구독자가 0이면 폴링 타이머도 멈춘다.

`change` 는 **무엇이 바뀌었는지 함께 알려준다.** 수신 측이 전체를 다시 읽지 않아도 되게 하는 것이 이 필드들의 목적이다.

| 필드 | 의미 |
| --- | --- |
| `changedSessions` | 트랜스크립트 크기/시각 또는 라이브 세션 상태가 달라진 세션 id |
| `addedSessions` | 처음 나타난 세션 id |
| `removedSessions` | 사라진 세션 id |

세 배열 모두 정렬돼 있다. 트랜스크립트와 라이브 세션 파일은 같은 `sessionId` 키 공간을 쓰므로, 한 세션의 두 소스가 동시에 바뀌어도 한 번만 보고된다.

**연결 직후에는 `change` 가 오지 않는다.** 첫 폴링은 관측 상태만 채우고 아무것도 알리지 않는다 — 기존 세션 전부를 `addedSessions` 로 보고하면 클라이언트가 접속할 때마다 전체를 다시 읽게 되기 때문이다.

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

### `GET /api/fs/file` ✅

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

- 텍스트 파일이면 확장자와 무관하게 읽을 수 있다. 쓰기 허용 여부는 `editable`로만 구분한다.
- 앞 8000바이트에 NUL 이 있으면 바이너리로 보고 `encoding: "binary"`, `content: null`, `editable: false`, `language: "text"`.
- 크기 검사는 바이트를 읽기 **전에** `stat`으로 한다. `FS_MAX_READ_BYTES`(기본 2MiB) 초과면 413.
- 디코딩은 `TextDecoder("utf-8", { fatal: false })`. 깨진 바이트는 U+FFFD 가 되고 500 이 나지 않는다.
- `version`은 `"<modifiedAt>:<size>"`. 저장 시 낙관적 잠금 키로 쓴다. `/api/fs/list`의 `modifiedAt`/`size`와 같은 값이다.

### `PUT /api/fs/file` ✅

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
| 400 | JSON 파싱 실패, 필드 누락/형식 오류, **기존 파일을 덮어쓰는데 `baseVersion`이 없음** |
| 403 | 루트 밖 경로 또는 쓰기 비허용 확장자 |
| 404 | 파일이 없고 `createIfMissing`이 아님 |
| 409 | `baseVersion`이 현재 `version`과 불일치. 본문에 `{ "error": "...", "currentVersion": "..." }` |
| 413 | 본문이 `FS_MAX_READ_BYTES` 초과 |

- `content: ""`는 유효하다(파일을 비우는 정당한 편집). `content`가 문자열이 아니면 400이다.
- 검사 순서가 곧 보안이다: 크기 → `resolvePath` → 확장자 허용목록 → 파일 접근 → 낙관적 잠금 → 쓰기.
- 쓰기는 같은 디렉터리의 임시 파일(`.<name>.tmp-<pid>-<n>`)에 쓴 뒤 `rename`으로 원자 교체한다. 실패해도 임시 파일을 남기지 않는다.
- 응답의 `version`은 쓰기 뒤 다시 `stat`한 결과로 만든다. 그래서 방금 받은 `version`으로 곧바로 다시 저장해도 409가 나지 않는다.
- **서버에 강제 덮어쓰기 플래그는 없다.** 409를 해소하는 방법은 하나뿐이다 — 클라이언트가 `GET /api/fs/file`로 최신 `version`을 다시 받아 그것을 `baseVersion`으로 삼아 재저장한다. `src/web/hooks/use-editor-file.ts`의 `overwrite()`가 그 흐름이다.

---

## 텔레메트리

Claude Code 의 OpenTelemetry 내보내기를 직접 받는다. 수집을 켜는 방법은 `docs/README.md` 를 본다.

### `POST /v1/metrics` ✅ · `POST /v1/logs` ✅

OTLP/HTTP(`http/json`) 수신 엔드포인트. **이 두 경로는 위의 `/api/*` 공통 규약을 따르지 않는다.**

| 차이 | 이유 |
| --- | --- |
| 파싱 실패에도 항상 `200` | OTLP 클라이언트는 4xx/5xx 를 재시도 대상으로 보고 큐를 쌓는다. 우리가 못 읽은 것을 실패로 돌려주면 한 번의 잘못된 export 가 재시도 폭주가 된다. 오류는 서버 로그로만 남긴다 |
| 목록 봉투·`{error}` 형식 없음 | OTLP 규격 응답(`{"partialSuccess":{}}`)을 돌려준다 |
| `withRoute` 미사용 | 예외를 상태 코드로 바꾸는 래퍼가 위 두 항목과 정면으로 충돌한다 |

`TELEMETRY_ENABLED=0` 이면 본문을 파싱하지 않고 `200` 만 돌려준다(설정된 claude 가 영원히 재시도하지 않도록). 이 경우 DB 파일을 만들지 않는다.

`GET` 으로 열면 `405` 와 함께 설정 힌트를 돌려준다. SPA 폴백으로 새어 앱 화면이 뜨면 텔레메트리를 디버깅하는 사람에게 혼란스럽기 때문이다.

> **⚠️ 포트 4317 은 OTLP gRPC 의 기본 포트이기도 하다.** 여기서는 HTTP 를 받으므로 보내는 쪽이 `OTEL_EXPORTER_OTLP_PROTOCOL=http/json` 을 **반드시** 지정해야 한다. 빠뜨리면 claude 가 gRPC 로 시도하고 **완전히 조용히** 실패한다 — `claude --debug` 출력에도 아무 흔적이 남지 않는다. 유일하게 실용적인 진단은 `GET /api/telemetry/status` 의 `collecting` 이 계속 `false` 인 것을 보는 것이다.

### `GET /api/telemetry/status` ✅

```ts
{
  enabled: boolean;          // TELEMETRY_ENABLED
  collecting: boolean;       // 한 건이라도 받았는가
  since: string | null;      // 가장 오래된 보관 표본 (ISO). 소급 수집은 불가능하다
  dbBytes: number;
  softLimitBytes: number;    // 넘으면 경고 로그
  hardLimitBytes: number;    // 넘으면 오래된 raw 를 강제 삭제
  series: number; sessions: number; points: number; requests: number;
  port: number;              // 화면의 설정 안내가 실제 포트를 쓸 수 있게
}
```

### `GET /api/telemetry/tokens` ✅ · `GET /api/telemetry/cost` ✅

| 파라미터 | 기본값 | 설명 |
| --- | --- | --- |
| `from` | `to - 24h` | epoch ms |
| `to` | 현재 | epoch ms. `from >= to` 는 400 |
| `bucket` | `hour` | `raw` \| `hour` \| `day`. 그 외는 400 |
| `groupBy` | `model` | `type` \| `model` \| `query_source` \| `speed` \| `effort` \| `agent` \| `skill`. 그 외는 400 |

```ts
{ items: Array<{ key: string; value: number }>;   // value 내림차순
  total: number;
  degraded: "hour" | null }
```

`tokens` 는 `token.usage`(단위 tokens), `cost` 는 `cost.usage`(단위 USD)를 집계한다. 속성이 없는 그룹은 `"(none)"` 키로 모인다.

**`degraded`**: `bucket=raw` 인데 `from` 이 raw 보존 기간(`TEL_RETAIN_RAW_DAYS`) 밖이면 조용히 `hour` 로 승격하고 이 필드에 `"hour"` 를 넣는다. 빈 결과를 돌려주면 사용자가 데이터가 없다고 오해하기 때문이다. 에러가 아니다.

### `GET /api/telemetry/timeseries` ✅

위 파라미터에 `metric`(기본 `token.usage`)이 추가된다.

```ts
{ buckets: number[];                                  // epoch ms, 오름차순
  series: Array<{ key: string; values: number[] }>;    // values 길이 = buckets 길이
  degraded: "hour" | null }
```

`bucket=raw` 도 시간 단위로 접어서 돌려준다 — 10초 해상도는 차트로 읽을 수 없다.

### `GET /api/telemetry/latency` ✅

`from`·`to`·`groupBy` 만 쓴다(`bucket` 무시). `api_request` 의 `duration_ms` 분포다.

```ts
{ items: Array<{ key: string; count: number;
                 p50: number; p95: number; p99: number; max: number }> }  // count 내림차순
```

백분위는 확장 함수 없이 윈도 함수로 순위를 매겨 `ceil(count * p / 100)` 번째 행을 고른다.

---

## 정적 자원

| 경로 | 상태 | 설명 |
| --- | --- | --- |
| `/` | ✅ | `src/web/index.html` (번들된 SPA) |
| `/*` | ✅ | SPA 폴백. `/api/*`보다 낮은 우선순위 |

클라이언트 라우트 ✅

| 경로 | 화면 | 상태 |
| --- | --- | --- |
| `/` | 대시보드 | ⬜ T-017 (자리표시) |
| `/files?root=<루트 id>&path=<상대경로>` | 파일 탐색기 + 뷰어 | ✅ |
| `/sessions?q=<검색어>&projectId=<프로젝트 id>` | 세션 목록 | ✅ |
| `/sessions/:id?events=&sidechain=&thinking=&tools=&from=#entry-<n>` | 세션 타임라인 | ✅ |
| 그 외 | 앱 내부 404 화면 | ✅ |

`/files`의 선택 상태(`root`, `path`)는 쿼리에 담긴다. 그 URL을 그대로 공유하면 같은 파일이 열린다.

`/sessions`의 필터(`q`, `projectId`)도 마찬가지다. 검색어는 300ms 디바운스 후 `replace`로 반영하므로
뒤로가기가 글자 단위로 되돌아가지 않는다.

`/sessions/:id`의 토글은 모두 `1`/`0`이며 기본값은 `events=0`, `sidechain=1`, `thinking=1`, `tools=1`이다.
`events`·`sidechain`은 서버 필터라 토글하면 `from`이 사라진다(첫 페이지로 되돌아간다). `from`은 타임라인
오프셋이고, 해시 `#entry-<n>`은 원본 JSONL 줄 번호로 특정 엔트리에 앵커한다.
