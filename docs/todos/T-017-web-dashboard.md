# T-017 — 대시보드 뷰

| | |
| --- | --- |
| **ID** | T-017 |
| **우선순위** | P1 |
| **영역** | web-session |
| **선행** | T-003, T-010, T-011 |
| **후행** | 없음 |

## 1. 목적

`/` 첫 화면. 지금 무슨 일이 벌어지고 있는지 한눈에 보여주고, 다음 행동(세션 열기, 파일 열기)으로 보낸다. 관제탑의 "탑" 부분이다.

## 2. 데이터

- `api.stats()` → `Stats`
- `api.sessions({ limit: 8 })` → 최근 세션
- `api.projects({ limit: 6 })` → 활동 많은 프로젝트
- `api.history({ limit: 10 })` → 최근 프롬프트
- `api.telemetryStatus()` → 수집 여부 (T-021 완료 후. 실패해도 무시한다)

요청을 병렬로 보낸다. 하나가 실패해도 나머지 카드는 렌더한다 — 대시보드 전체를 `ErrorBox`로 덮지 않는다. 카드 단위로 에러를 격리한다.

## 3. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/web/pages/dashboard.page.tsx` | 화면 |
| `src/web/components/stat-tile.tsx` | 수치 타일 |
| `src/web/styles.css` | 대시보드 그리드 |

## 4. 상세 명세

### 4.1 레이아웃

```
┌───────────────────────────────────────────────────────┐
│ [실행 중 3] [세션 128] [프로젝트 7] [24시간 12] [토큰 8.4M] │
├──────────────────────────┬────────────────────────────┤
│ 최근 세션                 │ 프로젝트                    │
│  · 제목  3분 전           │  · control-tower  42세션    │
│  · ...                   │  · ...                     │
│  [모두 보기 →]            │                            │
├──────────────────────────┼────────────────────────────┤
│ 자주 쓴 툴                │ 최근 프롬프트                │
│  Bash    ████████ 412    │  · "docs 정리해줘"  10분 전  │
│  Read    █████ 288       │  · ...                     │
└──────────────────────────┴────────────────────────────┘
```

- 상단 타일은 `display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))`.
- 카드 영역은 `repeat(auto-fit, minmax(320px, 1fr))`. 좁은 화면에서 자동으로 1열이 된다.

### 4.2 통계 타일

| 타일 | 값 | 부가 |
| --- | --- | --- |
| 실행 중 | `stats.activeSessions` | `/sessions`로 이동 |
| 전체 세션 | `stats.sessions` | `/sessions`로 이동 |
| 프로젝트 | `stats.projects` | – |
| 24시간 활동 | `stats.activityLast24h` | – |
| 토큰 | `stats.usage.total` (compact) | 툴팁에 input/output/cache 분해 |
| 오늘 비용 | `telemetryToday.cost` (USD) | T-021 수집 시에만. 없으면 타일 자체를 렌더하지 않는다 |

`activeSessions > 0`이면 그 타일에 초록 점을 붙인다.

**비용 타일은 조건부다.** 텔레메트리(T-021)는 사용자가 `~/.claude/settings.json` 을 직접 고쳐야 흐르므로, 대부분의 경우 데이터가 없다. `api.telemetryStatus()` 가 실패하거나 `collecting === false` 면 **타일을 빈 값으로 그리지 않고 아예 렌더하지 않는다.** "$0.00" 은 "공짜로 썼다"로 읽히므로 없는 것보다 나쁘다. 상단 그리드가 `auto-fit` 이라 타일이 4개여도 레이아웃이 깨지지 않는다.

T-021 이 없는 동안에도 이 작업은 독립적으로 완료할 수 있다 — 그때는 타일 4개다. 자세한 토큰 분포는 T-022 의 `/telemetry` 화면이 담당하고, 대시보드는 "오늘 얼마"라는 한 숫자와 그 화면으로 가는 링크까지만 갖는다.

```tsx
export function StatTile(props: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "accent" | "success";
  to?: string;        // 있으면 Link 로 감싼다
}): JSX.Element;
```

### 4.3 최근 세션 카드

T-015의 세션 카드를 **재사용한다.** `session-list.tsx`에서 `SessionCard`를 named export 하고 여기서 import 한다. 대시보드용으로 별도 카드를 만들지 않는다(CONVENTIONS: 중복 금지).

밀도가 다르므로 `compact` prop을 추가한다: 배지와 카운트를 줄이고 제목 + 시각만 보여준다.

### 4.4 프로젝트 카드

`ProjectSummary`에서 `path`(홈은 `~`로 축약), `sessionCount`, `liveSessionCount`, `lastActivityAt`, `usage.total`을 보여준다.

클릭하면 `/sessions?projectId=<id>`로 이동한다.

### 4.5 툴 사용 막대

`stats.tools`(상위 12개)를 가로 막대로 그린다. 차트 라이브러리를 도입하지 않는다 — `div`의 `width: ${count / max * 100}%`로 충분하다.

- 최대값 기준 상대 폭.
- 툴 이름 + 횟수를 함께 표시.
- 상위 8개만 보여주고 나머지는 "더 보기"로 펼친다.

### 4.6 최근 프롬프트

`HistoryEntry`의 `display`를 두 줄로 잘라 보여주고, `sessionId`가 있으면 그 세션으로 가는 링크를 건다. `project`(절대경로)는 축약해 회색으로.

프롬프트 내용은 사용자가 직접 입력한 텍스트다. **마크다운으로 렌더하지 않고 평문으로** 보여준다(줄바꿈만 보존).

### 4.7 갱신

- 마운트 시 1회 로드.
- 우상단에 "새로고침" 버튼과 마지막 갱신 시각(`stats.updatedAt`).
- T-018 완료 후에는 SSE `change` 이벤트에 반응해 자동 갱신한다(디바운스 2초). 이 작업에서는 수동 새로고침까지만 만든다.

### 4.8 빈 상태

`stats.sessions === 0`이면 타일과 카드 대신 안내 화면을 보여준다.

```
아직 세션 데이터가 없습니다.
관찰 중인 경로: /home/u/.claude
CLAUDE_HOME 환경변수로 바꿀 수 있습니다.
[파일 탐색기로 가기]
```

## 5. 수용 기준

- [ ] `/`에서 타일과 4개 카드가 렌더된다(텔레메트리 미수집 시 타일 4개, 수집 시 5개).
- [ ] 텔레메트리가 없을 때 비용 타일이 렌더되지 않고 레이아웃이 깨지지 않는다.
- [ ] 요청이 병렬로 나간다(네트워크 탭에서 waterfall이 아니다).
- [ ] `/api/history`가 실패해도(예: `history.jsonl` 없음) 나머지 카드가 정상 렌더된다.
- [ ] 타일과 카드의 링크가 올바른 화면으로 이동한다.
- [ ] 세션 카드가 T-015의 컴포넌트를 재사용한다(복제 구현이 없다).
- [ ] 툴 막대가 최대값 기준으로 그려지고 라이브러리를 쓰지 않는다.
- [ ] 프롬프트가 평문으로 표시되고 마크다운/HTML이 해석되지 않는다.
- [ ] 빈 데이터 디렉터리에서 안내 화면이 뜬다.
- [ ] 화면 폭 400px에서 세로 1열로 정상 표시된다.
- [ ] 새로고침 버튼이 데이터를 다시 불러온다.
- [ ] `bunx tsc --noEmit` 통과.

## 6. 검증

```bash
bun run dev & sleep 1
curl -s localhost:4317/api/stats | head -c 400; echo
kill %1

# 빈 상태
mkdir -p /tmp/ct-empty/projects /tmp/ct-empty/sessions
CLAUDE_HOME=/tmp/ct-empty bun run dev &
sleep 1
curl -s localhost:4317/api/stats | head -c 200; echo   # sessions: 0
kill %1

# history.jsonl 없음 상태 (위 디렉터리에는 이미 없다)
```

브라우저에서: 네트워크 탭의 병렬성, 반응형(개발자도구 400px), 링크 이동, 빈 상태.

## 7. 완료 처리

1. `docs/STRUCTURE.md` — `src/web/pages/dashboard.page.tsx`, `src/web/components/stat-tile.tsx`를 `✅`로.
2. `docs/CONVENTIONS.md` §10 — "대시보드처럼 여러 소스를 모으는 화면은 카드 단위로 에러를 격리한다", "차트는 CSS로 그리고 라이브러리를 추가하지 않는다"를 추가.
3. `docs/ENDPOINTS.md` — `/api/stats`의 필드 표가 실제 응답과 일치하는지 확인.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-017`
