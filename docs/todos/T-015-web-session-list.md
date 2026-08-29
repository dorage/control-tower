# T-015 — 세션 목록 뷰

| | |
| --- | --- |
| **ID** | T-015 |
| **우선순위** | P0 |
| **영역** | web-session |
| **선행** | T-003, T-010, T-011 |
| **후행** | T-016 |

## 1. 목적

`/sessions` 화면. `~/.claude`에 쌓인 Claude Code 세션을 프로젝트별로 훑고, 검색하고, 하나를 골라 타임라인으로 들어간다.

## 2. 데이터

`api.sessions({ projectId, q, limit, offset })` → `Page<SessionSummary>`
`api.projects()` → `Page<ProjectSummary>` (좌측 필터용)

`SessionSummary`의 주요 필드 (`src/domain/types.ts`):

| 필드 | 표시 |
| --- | --- |
| `title` | 카드 제목. null이면 `firstPrompt` 앞부분, 그것도 없으면 `id` 앞 8자 |
| `projectPath` | 프로젝트 경로. 홈 디렉터리는 `~`로 축약 |
| `lastActivityAt` | 상대 시간 (`format.relativeTime`) |
| `durationMs` | `format.duration` |
| `counts` | 메시지/툴/오류 수 |
| `usage.total` | 토큰 합계 (`format.compactNumber`) |
| `models` | 모델 배지 |
| `gitBranch` | 브랜치 배지 |
| `live` | null이 아니고 `alive`면 "실행 중" 표시 |
| `kind` | 세션 종류 배지 |

## 3. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/web/components/session-list.tsx` | 목록 + 카드 |
| `src/web/pages/sessions.page.tsx` | 필터 사이드 + 목록 |
| `src/web/styles.css` | 카드 스타일 |

## 4. 상세 명세

### 4.1 화면 구성

```
┌───────────────────────────────────────────────────────┐
│ [검색어_____________]  프로젝트: [전체 ▾]   총 128개    │
├───────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────┐ │
│ │ ● 세션 제목                          3분 전        │ │
│ │   ~/workspace/control-tower · main                │ │
│ │   메시지 42 · 툴 118 · 12분 · 1.2M 토큰            │ │
│ │   [opus-5] [실행 중]                              │ │
│ └───────────────────────────────────────────────────┘ │
│ ...                                                   │
│                  [더 보기]                             │
└───────────────────────────────────────────────────────┘
```

### 4.2 상태와 URL

| 상태 | 위치 |
| --- | --- |
| 검색어 `q` | URL 쿼리 |
| 프로젝트 필터 `projectId` | URL 쿼리 |
| 페이지 크기 | 지역 상수 50 |
| 누적 로드된 세션 | 지역 상태 |

`q`와 `projectId`가 URL에 있으므로 필터 상태를 링크로 공유할 수 있다.

**검색 입력은 300ms 디바운스**로 URL을 `replace` 갱신한다. 매 타이핑마다 `push`하면 뒤로가기가 글자 단위로 되돌아간다.

### 4.3 페이지네이션

무한 스크롤이 아니라 "더 보기" 버튼을 쓴다. 구현이 단순하고 스크롤 위치 복원 문제가 없다.

- `offset`을 지역 상태로 두고, "더 보기"가 `offset += limit` 후 결과를 기존 배열에 이어 붙인다.
- 필터(`q`/`projectId`)가 바뀌면 `offset`을 0으로 되돌리고 배열을 비운다.
- `items.length >= total`이면 버튼을 숨기고 "전체 N개"를 표시한다.

### 4.4 정렬과 그룹

서버가 이미 `lastActivityAt` 내림차순으로 준다. 클라이언트에서 재정렬하지 않는다.

날짜 구분선을 넣는다: "오늘", "어제", "이번 주", "2026년 8월" 같은 헤더를 카드 사이에 끼운다. `lastActivityAt` 기준.

### 4.5 상태 표시

| 조건 | 표시 |
| --- | --- |
| `live?.alive === true` | 초록 점 + "실행 중" |
| `live !== null && live.alive === false` | 회색 점 + "종료됨" (등록만 남은 상태) |
| `live === null` | 점 없음 |
| `counts.errors > 0` | 빨간 배지 "오류 N" |
| `counts.sidechainRecords > 0` | "서브에이전트" 배지 |

### 4.6 상호작용

- 카드 전체가 `<Link to={`/sessions/${id}`}>`. 카드 안에 다른 링크를 중첩하지 않는다.
- 세션 id 우측에 복사 버튼(`navigator.clipboard.writeText`). 클릭 시 카드 링크가 함께 발동하지 않도록 `event.preventDefault(); event.stopPropagation();`.
- 프로젝트 경로를 누르면 그 프로젝트로 필터링한다(카드 링크와 충돌하지 않도록 별도 버튼으로).

### 4.7 빈 상태와 에러

| 상황 | 표시 |
| --- | --- |
| 세션 0개 (필터 없음) | `EmptyState` "세션이 없습니다" + `CLAUDE_HOME` 경로 안내 |
| 세션 0개 (필터 있음) | `EmptyState` "조건에 맞는 세션이 없습니다" + 필터 초기화 버튼 |
| 로드 에러 | `ErrorBox` + 다시 시도 |
| 첫 로딩 | 카드 모양 스켈레톤 5개 |
| 추가 로딩 | "더 보기" 버튼 자리에 스피너 |

## 5. 수용 기준

- [ ] `/sessions`가 세션 카드를 최신순으로 보여준다.
- [ ] 검색어를 입력하면 300ms 후 목록이 좁혀지고 URL에 `q`가 반영된다.
- [ ] 빠르게 타이핑해도 마지막 질의 결과만 표시된다(오래된 응답이 덮어쓰지 않는다).
- [ ] 프로젝트 필터가 동작하고 URL에 남는다.
- [ ] 필터가 담긴 URL을 새 탭에 붙여 넣으면 같은 목록이 뜬다.
- [ ] "더 보기"가 다음 50개를 이어 붙이고, 끝에 도달하면 사라진다.
- [ ] 필터를 바꾸면 목록이 처음부터 다시 로드된다.
- [ ] 실행 중 세션에 초록 점이 표시된다.
- [ ] 카드를 누르면 `/sessions/<id>`로 이동한다.
- [ ] 복사 버튼이 링크 이동을 유발하지 않는다.
- [ ] `CLAUDE_HOME`이 빈 디렉터리일 때 빈 상태가 뜨고 에러가 아니다.
- [ ] 세션 500개에서 스크롤이 부드럽다.
- [ ] `bunx tsc --noEmit` 통과.

## 6. 검증

```bash
bun run dev & sleep 1
curl -s "localhost:4317/api/sessions?limit=3" | head -c 400; echo
curl -s "localhost:4317/api/projects?limit=3" | head -c 300; echo
kill %1

# 빈 데이터 디렉터리
mkdir -p /tmp/ct-empty/projects /tmp/ct-empty/sessions
CLAUDE_HOME=/tmp/ct-empty bun run dev
# 브라우저: /sessions -> "세션이 없습니다" (에러 아님)
```

브라우저 시나리오:

1. `/sessions`에서 카드 목록과 날짜 구분선 확인.
2. 검색창에 프로젝트 이름 일부를 빠르게 타이핑 — 결과가 마지막 질의와 일치하는지, URL에 `q`가 붙는지.
3. URL 복사 후 새 탭 — 같은 필터 상태 복원.
4. "더 보기" 반복 클릭 후 끝에서 버튼이 사라지는지.
5. 프로젝트 필터 변경 시 목록이 리셋되는지.
6. 카드 클릭 → 타임라인 이동(T-016 이후).
7. 복사 버튼 클릭 시 이동하지 않는지.

## 7. 완료 처리

1. `docs/STRUCTURE.md` — `src/web/components/session-list.tsx`, `src/web/pages/sessions.page.tsx`를 `✅`로.
2. `docs/ENDPOINTS.md` — `/api/sessions`의 `q` 검색 대상 필드(id/title/firstPrompt/projectPath/projectId)를 명세에 적는다.
3. `docs/CONVENTIONS.md` §10 — "필터 상태는 URL, 검색 입력은 디바운스 + replace", "페이지네이션은 '더 보기'" 규칙 추가.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-015`
