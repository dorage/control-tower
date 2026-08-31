# T-022 — 텔레메트리 대시보드

| | |
| --- | --- |
| **ID** | T-022 |
| **우선순위** | P2 |
| **영역** | web-session |
| **선행** | T-010, T-011, T-017, T-021 |
| **후행** | 없음 |

## 1. 목적

T-021 이 모은 데이터로 **"내 토큰이 어디로 갔나"** 를 답한다. Grafana 를 붙이지 않고 control-tower 안에서 끝낸다.

T-017 대시보드가 "지금 무슨 일이 벌어지는가"라면 이 화면은 "무엇에 얼마를 썼는가"다. 경로는 `/telemetry`.

## 2. 답해야 할 질문 — 화면 설계의 기준

이 다섯 개에 답하지 못하면 화면이 실패한 것이다.

1. **오버헤드 비율** — `query_source` 별 토큰 분포. `main`(실제 작업) 대 `auxiliary`·`generate_session_title`·`sdk`. 트랜스크립트로는 절대 알 수 없는 값이고, 이 화면의 존재 이유다.
2. **캐시 효율** — `cacheRead` 가 `input` 대비 얼마나 큰가. 실측 예: input 10 / cacheRead 13,979 → 캐시가 일하고 있다는 뜻이다.
3. **비용 추이** — 일별 `cost_usd`. 어느 날 무엇이 비쌌나.
4. **모델 배분** — `model` 별 토큰·비용. opus 대 haiku 의 실제 비중.
5. **지연 분포** — `duration_ms` 의 p50/p95/p99.

## 3. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/web/pages/telemetry.page.tsx` | 화면 |
| `src/web/components/bar-breakdown.tsx` | 그룹별 가로 막대 (분포) |
| `src/web/components/stacked-timeline.tsx` | 시계열 누적 막대 (추이) |
| `src/web/components/range-picker.tsx` | 기간 선택 |
| `src/web/lib/api.ts` | `telemetry*` 함수 5종 추가 |
| `src/web/components/app-shell.tsx` | 내비게이션 항목 추가 |
| `src/web/styles.css` | 차트 스타일 |

## 4. 상세 명세

### 4.1 레이아웃

```
┌────────────────────────────────────────────────────────────────┐
│ 텔레메트리        [24h] [7d] [30d] [전체]      수집 시작 8/31 12:55 │
│                                                  DB 18 MiB / 4 GiB │
├──────────────────────────────┬─────────────────────────────────┤
│ 토큰 분포 (query_source)      │ 비용 추이 (일별)                  │
│  main        ████████ 1.2M   │  ▁▃█▅▂▁▃  $0.42 총             │
│  auxiliary   █ 84K   (6.5%)  │                                 │
│  sdk         ▏ 12K           │                                 │
├──────────────────────────────┼─────────────────────────────────┤
│ 토큰 종류                     │ 모델별                           │
│  cacheRead  ██████████ 14M   │  opus-5    ████████ $0.38       │
│  cacheCreat ██ 6.7M          │  haiku-4.5 ██ $0.04             │
│  output     ▏ 52K            │                                 │
│  input      ▏ 10K            │                                 │
├──────────────────────────────┴─────────────────────────────────┤
│ 요청 지연 (duration_ms)                                          │
│  main      1,240건  p50 1.7s  p95 8.2s  p99 14s  max 41s        │
│  auxiliary   210건  p50 0.9s  p95 2.1s  p99 3.4s  max 5s        │
└────────────────────────────────────────────────────────────────┘
```

카드 그리드는 T-017 과 같은 `repeat(auto-fit, minmax(320px, 1fr))` 를 쓴다. 지연 카드만 전체 폭.

### 4.2 차트는 CSS 와 인라인 SVG 로 그린다

**차트 라이브러리를 도입하지 않는다** (CONVENTIONS 의존성 정책, T-017 이 이미 세운 선례).

- **분포 막대** (`bar-breakdown.tsx`) — `div` 의 `width: ${value / max * 100}%`. T-017 의 툴 사용 막대와 같은 방식이므로, 두 곳이 같은 모양이면 **T-017 컴포넌트를 재사용하고 여기서 새로 만들지 않는다.** 구현 시 T-017 의 막대를 먼저 확인한다.
- **시계열** (`stacked-timeline.tsx`) — 인라인 SVG `<rect>` 누적 막대. 라인이 필요하면 `<polyline>` 하나로 끝난다. 버킷이 400개를 넘으면 클라이언트에서 묶지 말고 `bucket=day` 로 요청한다.
- 색은 `styles.css` 의 기존 토큰을 쓴다. 그룹 수가 토큰 수를 넘으면 나머지를 한 색 + "기타"로 접는다. 무작위 색 생성 금지 — 새로고침마다 색이 바뀌면 읽을 수 없다.

### 4.3 데이터 로딩

```ts
api.telemetryStatus()
api.telemetryTokens({ from, to, groupBy: "query_source", bucket })
api.telemetryTokens({ from, to, groupBy: "type", bucket })
api.telemetryCost({ from, to, groupBy: "model", bucket })
api.telemetryTimeseries({ from, to, metric: "cost.usage", groupBy: "model", bucket })
api.telemetryLatency({ from, to, groupBy: "query_source" })
```

- 여섯 요청을 **병렬**로 보낸다. T-017 과 같은 규칙이다.
- **카드 단위 에러 격리.** 하나가 실패해도 나머지를 렌더한다. 화면 전체를 `ErrorBox` 로 덮지 않는다.
- `bucket` 은 기간에서 유도한다: 24h → `raw`, 7d/30d → `hour`, 전체 → `day`.
- 응답에 `degraded: "hour"` 가 오면(T-021 §5.8) 카드 머리에 "이 구간은 시간 단위로만 남아 있습니다"를 조용히 표시한다. 에러가 아니다.

### 4.4 텔레메트리 미수집 상태 — 이 화면의 기본값일 수 있다

**텔레메트리는 사용자가 `~/.claude/settings.json` 을 직접 고쳐야 흐른다.** 아무 설정도 안 한 사용자에게 이 화면은 영원히 비어 있다. 그러니 빈 화면이 예외가 아니라 **정상적인 첫 상태**다.

`status.collecting === false` 또는 `status.points === 0` 이면 차트 대신 안내를 보여준다.

```
텔레메트리가 아직 수집되지 않았습니다.

~/.claude/settings.json 의 env 에 다음을 넣고 claude 를 새로 시작하세요.

  { "env": {
      "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
      "OTEL_METRICS_EXPORTER": "otlp",
      "OTEL_LOGS_EXPORTER": "otlp",
      "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
      "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4317",
      "OTEL_METRIC_EXPORT_INTERVAL": "10000" } }

⚠️ OTEL_EXPORTER_OTLP_PROTOCOL 을 빼면 gRPC 로 시도해 조용히 실패합니다.

[복사]
```

- 설정 JSON 은 **평문 `<pre>`** 로 보여주고 클립보드 복사 버튼을 붙인다. 우리가 사용자 파일을 대신 고치지 않는다 — `settings.json` 은 사용자 소유이고 다른 설정이 들어 있다.
- 문자열을 컴포넌트에 하드코딩하지 않고 `status` 응답이 알려준 실제 포트를 끼워 넣는다(사용자가 `PORT` 를 바꿨을 수 있다).

### 4.5 수집 시작 시점을 반드시 표시한다

텔레메트리는 **소급이 불가능하다.** `status.since` 이전 기간을 선택하면 데이터가 없는 게 정상인데, 사용자는 버그로 오해한다.

- 헤더에 "수집 시작 <시각>" 을 항상 표시한다.
- 선택한 `from` 이 `since` 보다 과거면, 차트 위에 "8/31 12:55 이전은 수집되지 않았습니다" 를 표시하고 **x축을 `since` 부터 그린다.** 빈 왼쪽 여백을 남기지 않는다.
- 트랜스크립트 기반 수치(T-017 의 토큰 타일)와 이 화면의 합계가 다를 수 있다. 같은 화면에 두 수치를 나란히 두지 않는다 — 나란히 두면 어느 쪽이 맞는지 설명해야 한다.

### 4.6 저장소 상태

헤더에 `DB <사용량> / <hardLimit>` 을 표시한다. `softLimitBytes` 를 넘으면 주황, `hardLimitBytes` 의 90% 를 넘으면 빨강.

용량 관리는 서버가 알아서 한다(T-021 §5.5–5.6). **화면에 "삭제" 버튼을 만들지 않는다** — 보존 정책이 이미 자동이고, 수동 삭제 버튼은 되돌릴 수 없는 조작을 한 번의 오클릭에 노출한다.

### 4.7 갱신

- 마운트 시 1회 + 수동 새로고침.
- T-018 완료 후에도 **SSE 로 자동 갱신하지 않는다.** export 간격이 10초라 데이터가 그렇게 자주 바뀌지 않고, 분석 화면이 눈앞에서 다시 그려지면 읽는 것을 방해한다. T-018 의 원칙("갱신하지 말아야 할 것을 갱신하지 않는다")을 그대로 적용한 판단이다.

## 5. 수용 기준

- [ ] `/telemetry` 에서 6개 카드가 렌더된다.
- [ ] 여섯 요청이 병렬로 나간다.
- [ ] 한 요청이 실패해도 나머지 카드가 정상 렌더된다.
- [ ] `query_source` 분포에 `main` 과 `auxiliary` 가 분리돼 보이고 비율(%)이 함께 나온다.
- [ ] 기간 버튼이 `bucket` 을 올바르게 바꾼다(24h→raw, 7d/30d→hour, 전체→day).
- [ ] 텔레메트리 미수집 상태에서 설정 안내가 뜨고, 복사 버튼이 동작하며, 안내에 박힌 포트가 실제 서버 포트다.
- [ ] `status.since` 이전 기간을 골라도 빈 차트가 아니라 안내가 뜬다.
- [ ] 차트 라이브러리를 추가하지 않았다(`package.json` 의존성 불변).
- [ ] 그룹 색이 새로고침 후에도 같다.
- [ ] 화면 폭 400px 에서 세로 1열로 정상 표시된다.
- [ ] `bunx tsc --noEmit` 통과.

## 6. 검증

```bash
bun run dev & sleep 1

# 데이터 없는 상태 — 안내 화면이 떠야 한다
curl -s localhost:4317/api/telemetry/status; echo

# 데이터 만들기
CLAUDE_CODE_ENABLE_TELEMETRY=1 OTEL_METRICS_EXPORTER=otlp OTEL_LOGS_EXPORTER=otlp \
OTEL_EXPORTER_OTLP_PROTOCOL=http/json OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 \
OTEL_METRIC_EXPORT_INTERVAL=3000 claude --model haiku -p "Reply with exactly: ok"
sleep 5

curl -s 'localhost:4317/api/telemetry/tokens?groupBy=query_source'; echo
curl -s 'localhost:4317/api/telemetry/latency?groupBy=query_source'; echo
kill %1
```

브라우저에서: 네트워크 탭의 병렬성, 반응형(개발자도구 400px), 미수집 안내(`TELEMETRY_ENABLED=0` 으로 재기동), 기간 버튼별 `bucket` 파라미터.

## 7. 완료 처리

1. `docs/STRUCTURE.md` — 새 파일 4종을 `✅` 로.
2. `docs/CONVENTIONS.md` §10 — "차트는 CSS/인라인 SVG 로 그리고 라이브러리를 추가하지 않는다"(T-017 이 추가했다면 재확인), "그룹 색은 토큰에서 결정적으로 뽑는다 — 무작위 생성 금지", "분석 화면은 SSE 로 자동 갱신하지 않는다"를 추가.
3. `docs/README.md` — 텔레메트리 설정 안내가 T-021 에서 들어갔는지 확인하고, 화면 설명에 `/telemetry` 를 추가.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-022`
