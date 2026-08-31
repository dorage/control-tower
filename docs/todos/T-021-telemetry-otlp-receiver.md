# T-021 — OTLP 텔레메트리 수신기와 저장소

| | |
| --- | --- |
| **ID** | T-021 |
| **우선순위** | P1 |
| **영역** | api-telemetry |
| **선행** | T-001, T-002 |
| **후행** | T-022 |

## 1. 목적

Claude Code 가 내보내는 OpenTelemetry 메트릭·로그를 control-tower 가 직접 받아서 보관한다. 트랜스크립트로는 알 수 없는 세 가지를 얻는 것이 목적이다.

1. **실제 비용** — `cost_usd`. 트랜스크립트에는 모델별 단가가 없어 계산할 수 없다.
2. **토큰 귀속** — `query_source`(`main` / `auxiliary` / `sdk` / `generate_session_title`), `agent.name`, `skill.name`. "내 토큰 중 얼마가 실제 작업이고 얼마가 오버헤드인가"를 처음으로 답할 수 있다.
3. **요청 지연** — `duration_ms` 분포.

트랜스크립트 기반 집계(`session.service.ts`의 `usageOf`)를 **대체하지 않는다.** 트랜스크립트는 과거 전체를 갖고 있고 소급 조회가 되지만 거칠다. 텔레메트리는 켠 순간부터만 흐르지만 세밀하다. 두 소스는 공존한다.

## 2. 선행 지식 — 실측으로 확인된 사실

로컬 싱크를 띄우고 `claude --model haiku -p ...` 를 실제로 실행해 확인했다.

**(a) `http/json` 프로토콜은 평범한 JSON POST 다.** gRPC·protobuf·OTel SDK 가 전혀 필요 없다. `Bun.serve` 라우트에서 `await req.json()` 하면 끝이다. 의존성 0.

```
[sink] /v1/logs    7285 bytes  content-type=application/json
[sink] /v1/metrics 10450 bytes content-type=application/json
```

**(b) 받는 메트릭** (`claude_code.` 접두사 생략)

| 메트릭 | 단위 | 주요 속성 |
| --- | --- | --- |
| `token.usage` | tokens | `type`(input/output/cacheRead/cacheCreation), `model`, `query_source`, `speed`, `effort`, `agent.name`, `skill.name`, `mcp_tool.name` |
| `cost.usage` | USD | 위와 동일 |
| `session.count` | 개 | `start_type` |
| `active_time.total` | s | `type`(user/cli) |
| `lines_of_code.count` | 줄 | `type`(added/removed), `model` |
| `commit.count`, `pull_request.count` | 개 | — |
| `code_edit_tool.decision` | 개 | `tool_name`, `decision`, `source`, `language` |

**(c) 받는 로그 이벤트** — `api_request` 가 핵심이다. 요청 1건 = 1행의 시계열이 된다.

```
model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
cost_usd, cost_usd_micros, duration_ms, request_id, client_request_id,
speed, query_source, prompt.id, session.id, event.timestamp, event.sequence
```

그 외 `user_prompt`, `assistant_response`, `api_error`, `api_refusal`, `tool_result`, `tool_decision`, `hook_registered`, `hook_execution_start/complete`, `mcp_server_connection`, `permission_mode_changed`, `auth`.

**(d) delta temporality 가 기본이다.** 매 export 는 "지난 간격의 증가분"이며, 변화한 시리즈만 나온다(실측: 첫 export 11개 → 다음 export 1개). 누적 조회를 하려면 저장해서 합해야 한다.

**(e) 프롬프트·응답은 기본적으로 `<REDACTED>` 다.** `OTEL_LOG_USER_PROMPTS` 가 꺼져 있기 때문이다. **끈 채로 둔다** — 프롬프트는 이미 `history.jsonl` 에 있어 중복이고, 본문을 DB 에 복제할 이유가 없다.

**(f) 모든 메트릭·로그에 `user.email`·`organization.id`·`user.account_uuid`·`user.account_id`·`user.id`(64자 hex) 가 붙어 온다.** 레코드마다 반복되므로 정규화 대상이며, DB 를 커밋·내보내지 않도록 `.gitignore` 가 필요하다.

## 3. ⚠️ 포트 4317 충돌

`src/config.ts`의 `port: 4317`은 **OTLP gRPC 의 기본 포트와 정확히 같다.** 우연이 아니라 정면 충돌이다.

**결정: control-tower 가 4317 을 그대로 쓰고 `/v1/metrics`·`/v1/logs` 를 직접 받는다.** 새 포트를 열지 않는다. `routes/index.ts`의 `"/*": index` SPA 폴백보다 구체적 경로가 먼저 매칭되므로 안전하다.

**함정**: 사용자가 `OTEL_EXPORTER_OTLP_PROTOCOL` 을 빼먹으면 기본값이 `grpc` 라서 claude 가 4317 로 gRPC 를 시도하고 **조용히 실패**한다. 에러가 화면에 뜨지 않는다. 진단은 `claude --debug` 로그의 `[3P telemetry]` 로 한다. 이 함정을 `docs/README.md` 설정 안내에 굵게 박는다.

## 4. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/config.ts` | `telemetry` 설정 블록 |
| `src/domain/telemetry.ts` | OTLP 원본 타입과 정규화 타입 |
| `src/db/telemetry.db.ts` | `bun:sqlite` 연결·스키마·PRAGMA |
| `src/repositories/telemetry.repository.ts` | insert / rollup / prune / 크기 조회 |
| `src/services/telemetry.service.ts` | OTLP 파싱 → 정규화, 카디널리티 가드, 보존 잡 |
| `src/routes/otlp.route.ts` | `POST /v1/metrics`, `POST /v1/logs` |
| `src/routes/telemetry.route.ts` | `GET /api/telemetry/*` |
| `src/routes/index.ts` | 두 모듈 spread |
| `src/services/telemetry.service.test.ts` | 파싱·가드·보존 테스트 |
| `test/fixtures/otlp-metrics.json`, `otlp-logs.json` | 실측 캡처 |
| `.gitignore` | `*.db`, `*.db-wal`, `*.db-shm` |

## 5. 상세 명세

### 5.1 설정

```ts
// src/config.ts 에 추가
telemetry: {
  /** 수신기 자체를 끌 수 있게 한다. 기본 켜짐 — 안 오면 아무 일도 안 한다. */
  enabled: Bun.env.TELEMETRY_ENABLED !== "0",
  dbPath: Bun.env.TELEMETRY_DB ?? `${home}/.control-tower/telemetry.db`,
  retainRawDays:     Number(Bun.env.TEL_RETAIN_RAW_DAYS ?? 30),
  retainHourlyDays:  Number(Bun.env.TEL_RETAIN_HOURLY_DAYS ?? 400),
  retainDailyDays:   Number(Bun.env.TEL_RETAIN_DAILY_DAYS ?? 3650),
  retainRequestDays: Number(Bun.env.TEL_RETAIN_REQUEST_DAYS ?? 400),
  maxSeries:         Number(Bun.env.TEL_MAX_SERIES ?? 2000),
  softLimitBytes:    Number(Bun.env.TEL_SOFT_LIMIT_BYTES ?? 1.5 * 1024 ** 3),
  hardLimitBytes:    Number(Bun.env.TEL_HARD_LIMIT_BYTES ?? 4 * 1024 ** 3),
  /** 보존 잡 주기. SD 카드 쓰기를 아끼려고 1시간이다. */
  pruneIntervalMs:   Number(Bun.env.TEL_PRUNE_INTERVAL_MS ?? 3_600_000),
},
```

`dbPath` 는 `~/.claude` 아래가 **아니다.** 관찰 대상 디렉터리에 우리 파일을 쓰면 `watch.service.ts`의 핑거프린트를 흔들어 무한 change 이벤트를 만든다.

### 5.2 스키마 — 정규화가 핵심

OTLP 원본 레코드는 1.2–1.7 KB 인데 대부분이 매번 반복되는 고정 속성이다. 차원 테이블로 빼면 **약 40배** 줄어든다. **원본 JSON 을 그대로 저장하지 않는다.**

```sql
-- auto_vacuum 은 첫 테이블 생성 "전"에 정해야 한다.
-- 나중에 바꾸려면 full VACUUM 이 필요하고, full VACUUM 은 DB 크기만큼
-- 임시 공간을 더 쓴다. 이 한 줄을 놓치면 되돌리기가 번거롭다.
pragma auto_vacuum = incremental;
pragma journal_mode = wal;

create table tel_session (
  id integer primary key,
  session_uuid text unique not null,
  project_id text, started_at integer,
  version text, entrypoint text, terminal text
);

-- (metric, 속성조합) 하나당 한 행. 활동량과 무관하게 개수가 고정된다.
create table tel_series (
  id integer primary key,
  metric text not null,
  kind text, model text, query_source text,
  speed text, effort text, agent text, skill text,
  unique(metric, kind, model, query_source, speed, effort, agent, skill)
);

-- 메트릭 델타. fact 행은 정수 FK 만 갖는다.
create table tel_point (
  ts integer not null,
  session integer not null references tel_session(id),
  series integer not null references tel_series(id),
  value real not null
);
create index ix_point on tel_point(ts, series);

-- api_request 이벤트. 요청 단위라 롤업하면 분포가 죽으므로 raw 로 오래 둔다.
create table tel_request (
  ts integer not null,
  session integer not null references tel_session(id),
  series integer not null references tel_series(id),
  input integer, output integer, cache_read integer, cache_creation integer,
  cost_micros integer, duration_ms integer
);
create index ix_req on tel_request(ts);

-- 롤업. 해상도만 다르고 구조는 tel_point 와 같다.
create table tel_hourly (bucket integer not null, series integer not null, value real not null,
  primary key(bucket, series)) without rowid;
create table tel_daily  (bucket integer not null, series integer not null, value real not null,
  primary key(bucket, series)) without rowid;
```

측정된 단가(200k 행 실측, 인덱스 포함):

| 테이블 | B/행 |
| --- | --- |
| `tel_point` + `ix_point` | **33.9** |
| `tel_request` + `ix_req` | **44.1** |

### 5.3 OTLP 파싱

OTLP/JSON 은 protobuf 의 JSON 매핑이라 형태가 고정돼 있다. 스키마 검증 라이브러리를 쓰지 않고 방어적으로 읽는다.

```
resourceMetrics[] → scopeMetrics[] → metrics[] → (sum|gauge|histogram).dataPoints[]
resourceLogs[]    → scopeLogs[]    → logRecords[]
```

- 값은 `asInt`(문자열일 수 있다) 또는 `asDouble` 중 하나로 온다. **`asInt` 는 JSON 에서 문자열로 직렬화된다** — `Number()` 로 변환한다.
- 속성은 `[{key, value:{stringValue|intValue|doubleValue|boolValue}}]` 배열이다. 평탄한 `Record<string,string>` 으로 정규화하는 헬퍼를 하나 두고 재사용한다.
- 시각은 `timeUnixNano`(문자열, 나노초). `Number(x) / 1e6` 으로 ms 로 만든다. `Number` 로 나노초를 직접 다루면 정밀도를 잃으므로 나눈 뒤에만 쓴다.
- 모르는 메트릭·이벤트는 **조용히 버린다.** 새 Claude Code 버전이 메트릭을 추가해도 수신기가 죽지 않아야 한다.
- 응답은 항상 `200` 과 `{}` 다. OTLP 클라이언트는 4xx/5xx 를 받으면 재시도하며 큐를 쌓는다. 우리가 파싱에 실패한 것은 claude 의 문제가 아니므로 에러를 돌려주지 않고 서버 로그에만 남긴다.

### 5.4 카디널리티 가드 — 폭주를 막는 유일한 층

용량이 터지는 경로는 활동량이 아니라 **시리즈 개수 × export 빈도**다. 오설정 시나리오(1s 간격 × 8세션)는 470 MiB/일로 5 GiB 를 11일에 소진한다. 삭제 잡은 이미 쓰인 뒤에 도므로 사후약방문이고, SD 카드 쓰기만 낭비한다.

```
tel_series 의 행 수가 config.telemetry.maxSeries(2000) 에 도달하면,
새로운 속성 조합은 개별 시리즈를 만들지 않고
metric 별 '__other__' 시리즈 하나로 접어 넣는다.
접기가 처음 발생할 때 경고 로그를 1회 남긴다(매 건 남기면 로그가 폭주한다).
```

`session.id` 는 `tel_series` 가 아니라 `tel_session` FK 로 들어가므로 시리즈를 늘리지 않는다. 세션이 많아지면 행이 늘 뿐 시리즈는 고정이다. 이 구분이 설계의 핵심이다.

### 5.5 보존과 롤업

| 계층 | 해상도 | 보존 | 최악 시나리오 용량 |
| --- | --- | --- | --- |
| `tel_point` raw | export 간격 | 30일 | 939 MiB |
| `tel_hourly` | 1시간 | 400일 | 12 MiB |
| `tel_daily` | 1일 | 3650일 | 5 MiB |
| `tel_request` | 요청 1건 | 400일 | 135 MiB |
| | | **합계** | **1.06 GiB (5 GiB 의 21%)** |

최악 시나리오 = 병렬 8세션 × 24시간 × 40시리즈 × 10s 간격. 이 기기 실측(피크 543 req/일)에서는 전체가 **20 MiB 미만**이고 raw 30일이 1.6 MiB 다.

롤업이 극적으로 작은 이유: raw 는 세션 수와 export 빈도에 비례하지만, 시간 롤업은 **시리즈당 24행/일로 활동량과 무관하게 고정**된다.

`pruneIntervalMs`(1시간)마다 순서대로 수행한다.

```
1. tel_point 에서 retainRawDays 를 넘긴 구간을 tel_hourly 로 집계(sum) 후 삭제
2. tel_hourly 에서 retainHourlyDays 를 넘긴 구간을 tel_daily 로 집계 후 삭제
3. tel_daily / tel_request 에서 보존 기간 초과분 삭제
4. 크기 차단기(5.6)
5. pragma incremental_vacuum(1000)   -- 페이지 상한을 걸어 나눠 회수
```

집계는 `insert into tel_hourly ... on conflict(bucket,series) do update set value = value + excluded.value` 로 멱등하게 만든다. 잡이 중간에 죽고 재실행돼도 이중 계상되지 않도록, **집계와 삭제를 한 트랜잭션**에 넣는다.

### 5.6 크기 차단기

SQLite 는 행을 지워도 파일이 줄지 않는다. 실측:

```
삽입 후                        : 8.87 MiB
DELETE (오래된 2/3) 직후        : 8.87 MiB   ← 전혀 줄지 않는다
pragma incremental_vacuum 후    : 3.02 MiB   (280ms)
```

```ts
// page_count * page_size 로 현재 크기를 본다. 파일 stat 은 -wal 을 놓친다.
if (bytes > softLimitBytes) console.warn(...);       // 경고만
while (bytes > hardLimitBytes) {                     // 보존 기간을 무시하고
  // tel_point 의 가장 오래된 1일치를 삭제한다 (롤업은 남긴다 — 해상도만 잃는다)
  // 줄어들지 않으면 tel_request 의 가장 오래된 1일치도 삭제한다
  // 진행이 없으면 루프를 깨고 에러 로그 (무한 루프 금지)
}
```

5 GiB 예산 배분:

```
soft   1.5 GiB   정상 운영 천장. 넘으면 경고 로그.
hard   4.0 GiB   초과 시 오래된 raw 강제 삭제.
여유   1.0 GiB   -wal / -shm / vacuum 전이 공간
```

여유를 남기는 이유는 `-wal` 파일과 vacuum 이다. `incremental_vacuum` 을 쓰면 full VACUUM 처럼 DB 크기만큼의 임시 공간이 필요하지 않다.

### 5.7 수신 라우트

```ts
// src/routes/otlp.route.ts
export const otlpRoutes = {
  "/v1/metrics": { POST: (req: Request) => ingestMetrics(req) },
  "/v1/logs":    { POST: (req: Request) => ingestLogs(req) },
};
```

- `config.telemetry.enabled` 가 false 면 파싱 없이 `200 {}` 를 돌려준다(claude 가 재시도하지 않게).
- `withRoute` 로 감싸지 않는다 — 에러를 4xx 로 바꿔 돌려주면 안 되기 때문이다(5.3 참조).
- 쓰기는 **동기 트랜잭션 1회**로 묶는다. export 는 10초에 한 번 오므로 배치가 이미 충분히 크고, 요청당 트랜잭션 하나면 SD 카드 쓰기가 최소화된다.

### 5.8 조회 라우트

T-022 가 쓸 최소 집합이다. 응답은 `src/lib/http.ts`의 목록 봉투를 따른다.

| 엔드포인트 | 파라미터 | 응답 |
| --- | --- | --- |
| `GET /api/telemetry/status` | — | `{ enabled, collecting, since, dbBytes, softLimitBytes, hardLimitBytes, series, sessions, points, requests }` |
| `GET /api/telemetry/tokens` | `from`, `to`, `groupBy`(type\|model\|query_source\|agent\|skill), `bucket`(raw\|hour\|day) | `{ items: [{ key, value }], total }` |
| `GET /api/telemetry/cost` | 위와 동일 | 같은 형태, 단위 USD |
| `GET /api/telemetry/timeseries` | `from`, `to`, `metric`, `groupBy`, `bucket` | `{ buckets: number[], series: [{ key, values: number[] }] }` |
| `GET /api/telemetry/latency` | `from`, `to`, `groupBy` | `{ items: [{ key, count, p50, p95, p99, max }] }` |

- `bucket` 이 `raw` 인데 `from` 이 `retainRawDays` 보다 과거면, **조용히 `hour` 로 승격하고 응답에 `degraded: "hour"` 를 넣는다.** 빈 결과를 돌려주면 사용자는 데이터가 없다고 오해한다.
- `status.since` 는 `min(tel_point.ts, tel_request.ts)` 다. T-022 가 "이 시점부터 수집됨"을 표시하는 데 쓴다. 텔레메트리는 소급이 안 되므로 이 표시가 반드시 필요하다.
- 백분위는 SQLite 에서 `order by duration_ms limit 1 offset (count*p)` 로 계산한다. 확장 함수를 도입하지 않는다.

### 5.9 사용자 설정 안내

`docs/README.md` 에 넣을 내용이다. `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4317",
    "OTEL_METRIC_EXPORT_INTERVAL": "10000"
  }
}
```

- **`OTEL_EXPORTER_OTLP_PROTOCOL` 을 반드시 쓴다.** 빠지면 gRPC 로 시도하고 조용히 실패한다(§3).
- **`OTEL_METRIC_EXPORT_INTERVAL` 을 10000 미만으로 내리지 않는다.** 기본값 60000 을 10000 으로 올리는 것까지가 안전선이다. 1000 으로 내리면 용량이 47배가 된다.
- `OTEL_LOG_USER_PROMPTS` 를 켜지 않는다. 프롬프트 본문은 `history.jsonl` 에 이미 있다.
- 랩퍼 스크립트나 `otelHeadersHelper` 는 필요 없다. 로컬 수신이라 인증이 없다.

## 6. 수용 기준

- [ ] `POST /v1/metrics` 와 `POST /v1/logs` 가 실측 픽스처를 받아 `200 {}` 를 돌려주고 행을 만든다.
- [ ] 깨진 JSON·빈 본문·모르는 메트릭을 받아도 `200` 이고 서버가 죽지 않는다.
- [ ] `asInt` 가 문자열로 온 값이 숫자로 저장된다.
- [ ] 같은 속성 조합을 두 번 보내면 `tel_series` 행이 하나만 생긴다.
- [ ] `maxSeries` 를 3으로 낮추면 네 번째 조합이 `__other__` 로 접히고 경고가 1회만 뜬다.
- [ ] `tel_session` 에 `user.email`·`account_uuid` 가 세션당 한 번만 저장되고, `tel_point`/`tel_request` 에는 없다.
- [ ] 보존 잡이 raw → hourly → daily 로 값을 보존하며 집계한다(합이 일치한다).
- [ ] 보존 잡을 두 번 연속 실행해도 합이 변하지 않는다(멱등).
- [ ] `hardLimitBytes` 를 작게 낮추면 오래된 raw 가 삭제되고 파일이 실제로 줄어든다.
- [ ] `auto_vacuum` 이 `2`(incremental) 다.
- [ ] `TELEMETRY_ENABLED=0` 이면 DB 파일을 만들지 않는다.
- [ ] DB 가 `~/.claude` 아래에 있지 않다(= `watch.service.ts` 가 반응하지 않는다).
- [ ] `bunx tsc --noEmit` 통과, `bun test` 통과.

## 7. 검증

### 7.1 실제 claude 로 왕복

```bash
bun run dev & sleep 1

CLAUDE_CODE_ENABLE_TELEMETRY=1 \
OTEL_METRICS_EXPORTER=otlp OTEL_LOGS_EXPORTER=otlp \
OTEL_EXPORTER_OTLP_PROTOCOL=http/json \
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 \
OTEL_METRIC_EXPORT_INTERVAL=3000 OTEL_LOGS_EXPORT_INTERVAL=2000 \
claude --model haiku -p "Reply with exactly: ok"

sleep 5
curl -s localhost:4317/api/telemetry/status; echo
curl -s 'localhost:4317/api/telemetry/tokens?groupBy=query_source'; echo
curl -s 'localhost:4317/api/telemetry/cost?groupBy=model'; echo
kill %1
```

`query_source` 별 토큰이 `main` 과 `auxiliary`(또는 `generate_session_title`)로 나뉘어 나와야 한다. 이게 이 작업의 존재 이유다.

### 7.2 프로토콜 함정 재현

```bash
# PROTOCOL 을 빼면 gRPC 로 시도하고 조용히 실패한다 — 반드시 눈으로 확인한다
bun run dev & sleep 1
CLAUDE_CODE_ENABLE_TELEMETRY=1 OTEL_METRICS_EXPORTER=otlp \
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 \
claude --debug --model haiku -p "ok" 2>&1 | grep -i '3P telemetry'
kill %1
```

### 7.3 방어 검증

```bash
bun run dev & sleep 1
for body in '' 'not json' '{}' '{"resourceMetrics":[]}' '{"resourceMetrics":[{"scopeMetrics":null}]}'; do
  printf '%-40s %s\n' "${body:0:38}" \
    "$(curl -s -o /dev/null -w '%{http_code}' -X POST localhost:4317/v1/metrics \
       -H 'content-type: application/json' -d "$body")"
done
curl -s localhost:4317/api/health | grep -q '"ok":true' && echo "alive ok"
kill %1
```

모두 `200` 이어야 하고 서버가 살아 있어야 한다.

### 7.4 자동

`src/services/telemetry.service.test.ts`. 임시 디렉터리에 DB 를 만들고 `afterAll` 에서 지운다. **사용자의 실제 DB 를 건드리지 않는다.**

```ts
test("실측 메트릭 픽스처를 파싱해 11개 데이터포인트를 만든다", ...);
test("asInt 문자열이 숫자로 저장된다", ...);
test("같은 속성 조합은 시리즈를 하나만 만든다", ...);
test("maxSeries 초과분은 __other__ 로 접힌다", ...);
test("깨진 페이로드가 예외를 던지지 않는다", ...);
test("모르는 메트릭은 조용히 무시된다", ...);
test("raw → hourly 집계가 합을 보존한다", ...);
test("보존 잡이 멱등하다 (두 번 실행해도 합 불변)", ...);
test("hardLimit 초과 시 오래된 raw 가 삭제되고 파일이 줄어든다", ...);
test("bucket=raw 이고 from 이 보존 범위 밖이면 hour 로 승격되고 degraded 가 붙는다", ...);
```

## 8. 완료 처리

1. `docs/ENDPOINTS.md` — `POST /v1/metrics`, `POST /v1/logs`, `GET /api/telemetry/*` 5종 추가. `/v1/*` 이 `/api/*` 규약(목록 봉투·에러 형식)을 따르지 않는 이유를 명시한다.
2. `docs/STRUCTURE.md` — 새 파일 7종과 `telemetry` 환경변수 9종을 표에 추가. `⚠️ 4317 = OTLP gRPC 기본 포트` 경고를 포트 항목에 붙인다.
3. `docs/README.md` — §5.9 설정 안내와 두 개의 함정(PROTOCOL 누락, EXPORT_INTERVAL 하한)을 추가.
4. `docs/CONVENTIONS.md` — "외부 도구가 POST 하는 수집 엔드포인트는 파싱 실패에도 200 을 돌려준다(재시도 폭주 방지)", "SQLite 는 `auto_vacuum=incremental` 을 첫 테이블 생성 전에 설정한다", "고정 속성은 차원 테이블로 정규화하고 fact 행에는 FK 만 둔다"를 추가.
5. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-021`
