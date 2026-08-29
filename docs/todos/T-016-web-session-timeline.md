# T-016 — 세션 타임라인 뷰

| | |
| --- | --- |
| **ID** | T-016 |
| **우선순위** | P0 |
| **영역** | web-session |
| **선행** | T-003, T-010, T-011, T-015 |
| **후행** | 없음 |

## 1. 목적

`/sessions/:id` 화면. 한 세션의 대화를 처음부터 끝까지 읽는다. 이 프로젝트에서 말하는 "세션 뷰"의 본체다.

## 2. 데이터

`api.session(id)` → `SessionSummary` (헤더용)
`api.timeline(id, { limit, offset, events, sidechain })` → `Timeline`

`TimelineEntry` (`src/domain/types.ts`):

```ts
{
  index: number;            // 원본 JSONL 줄 번호
  uuid: string | null;
  parentUuid: string | null;
  kind: string;             // "user" | "assistant" | "system" | "attachment" | "event"
  role: string | null;
  timestamp: string | null;
  isSidechain: boolean;     // 서브에이전트
  isMeta: boolean;
  isError: boolean;
  model: string | null;
  usage: TokenUsage | null;
  blocks: TimelineBlock[];
}
```

`TimelineBlock`은 5종의 유니온이다.

| type | 필드 | 렌더 |
| --- | --- | --- |
| `text` | `text`, `truncated` | 마크다운으로 렌더 (T-014 재사용) |
| `thinking` | `text`, `truncated` | 접힌 회색 블록, 기본 접힘 |
| `tool_use` | `id`, `name`, `input`(JSON 문자열), `truncated` | 툴 이름 헤더 + 접힌 입력 |
| `tool_result` | `toolUseId`, `text`, `isError`, `truncated` | 접힌 결과, `isError`면 빨강 |
| `image` | `text` | "이미지" 자리표시 |

`truncated: true`는 서버가 `MAX_BLOCK_CHARS`(기본 4000자)에서 잘랐다는 뜻이다. 반드시 사용자에게 알린다.

## 3. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/web/components/timeline.tsx` | 타임라인 렌더러 |
| `src/web/pages/session-detail.page.tsx` | 헤더 + 필터 + 타임라인 |
| `src/web/styles.css` | 타임라인 스타일 |

## 4. 상세 명세

### 4.1 화면 구성

```
┌────────────────────────────────────────────────────────┐
│ ← 세션 목록                                             │
│ 세션 제목                                    [실행 중]   │
│ ~/workspace/control-tower · main · opus-5 · 12분        │
│ 메시지 42 · 툴 118 · 오류 2 · 1.2M 토큰                  │
├────────────────────────────────────────────────────────┤
│ [x] 사고 과정  [ ] 시스템 이벤트  [x] 서브에이전트       │
│ [x] 툴 입출력                        1-200 / 842        │
├────────────────────────────────────────────────────────┤
│  ▸ 타임라인 엔트리들                                     │
│                                                        │
│                  [이전 200개]  [다음 200개]              │
└────────────────────────────────────────────────────────┘
```

### 4.2 필터

| 토글 | 기본 | 처리 위치 |
| --- | --- | --- |
| 사고 과정 (thinking) | 켬(접힌 채) | 클라이언트 (블록 필터) |
| 시스템 이벤트 | 끔 | **서버** (`events` 파라미터) |
| 서브에이전트 | 켬 | **서버** (`sidechain` 파라미터) |
| 툴 입출력 | 켬 | 클라이언트 (블록 필터) |

서버 필터는 `total`과 페이지 경계를 바꾸므로 토글 시 `offset`을 0으로 되돌린다. 클라이언트 필터는 페이지를 다시 부르지 않는다.

토글 상태는 URL 쿼리에 담는다: `/sessions/<id>?events=1&sidechain=0&thinking=0&tools=0`

### 4.3 페이지네이션

- 기본 `limit=200`.
- 서버가 준 `total`로 "이전/다음" 버튼을 만든다.
- `offset`은 URL 쿼리(`from`)에 담아 새로고침해도 위치가 유지되게 한다.
- 긴 세션(수천 엔트리)에서 전부 한 번에 받지 않는다.

### 4.4 엔트리 렌더

역할별로 시각적으로 구분한다.

| kind / role | 스타일 |
| --- | --- |
| `user` | 좌측 강조 테두리 `--accent`, 배경 `--accent-soft` |
| `assistant` | 기본 배경 `--bg-raised` |
| `system` | 작은 회색 텍스트 |
| `attachment` | 클립 아이콘 + 파일 경로 |
| `event` | 한 줄 회색 텍스트 (구분선 느낌) |
| `isSidechain` | 좌측에 세로선 + 들여쓰기 + "서브에이전트" 배지 |
| `isError` | 좌측 테두리 `--danger` |

각 엔트리 헤더 한 줄: `[역할] [모델] [시각] [토큰] [#index]`

- 시각은 `format.dateTime`, 마우스 올리면 절대 시각 툴팁.
- `#index`는 원본 JSONL 줄 번호. 디버깅에 필요하므로 항상 보여준다.
- 엔트리에 앵커 id(`entry-<index>`)를 부여하고, URL 해시(`#entry-42`)로 이동할 수 있게 한다. 헤더의 `#index`를 누르면 그 해시가 주소창에 복사되도록 한다.

### 4.5 블록 렌더

- **text**: `MarkdownPreview`(T-014)로 렌더한다. `root`/`basePath`가 없으므로 상대 링크는 비활성으로 처리한다 — `MarkdownPreview`의 props를 옵셔널로 확장한다.
  - T-014가 아직 없으면 `<pre>` 폴백으로 구현하고, T-014 완료 후 교체한다. 어느 쪽이든 `dangerouslySetInnerHTML`은 쓰지 않는다.
- **thinking**: `<details>` 기반 접기. summary는 "사고 과정 (N자)".
- **tool_use**: 헤더에 툴 이름 배지. 입력 JSON은 접어 두고, 펼치면 `<pre>`로 보여준다.
  - 자주 쓰는 툴은 요약 한 줄을 만들어 접힌 상태에서도 보이게 한다: `Read` → 파일 경로, `Bash` → 명령어 첫 줄, `Edit`/`Write` → 파일 경로, `Grep`/`Glob` → 패턴. 알 수 없는 툴은 요약 없이 이름만.
  - 요약 추출은 `input` JSON을 `JSON.parse`한 뒤 필드를 읽는다. **파싱 실패를 반드시 처리한다** — 서버가 4000자에서 잘랐으면 JSON이 깨져 있다.
- **tool_result**: 기본 접힘. `isError`면 펼친 상태로 시작하고 빨간 테두리.
- **image**: 회색 자리표시. 실제 이미지 데이터는 트랜스크립트에 없다.
- 모든 블록에서 `truncated: true`면 하단에 "서버에서 잘림 (MAX_BLOCK_CHARS)" 안내를 붙인다.

### 4.6 성능

200개 엔트리에 각각 여러 블록이 붙으면 DOM 노드가 수천 개가 된다.

- 접힌 블록(`thinking`, `tool_use` 입력, `tool_result`)은 **펼치기 전에는 내용을 렌더하지 않는다**. `<details>`의 지연 렌더 또는 `open` 상태 기반 조건부 렌더.
- 엔트리 컴포넌트를 `React.memo`로 감싼다.
- 가상 스크롤은 도입하지 않는다. 위 두 가지로 충분하며, 부족하면 `limit`를 줄인다.

### 4.7 부가 기능

- 헤더의 `document.title`을 `<세션 제목> · control tower`로 설정한다(T-011 §4.4).
- 상단에 "원본 JSONL 경로" 표시(툴팁 또는 작은 회색 텍스트). `SessionSummary`에 경로가 없으므로 `projectId`/`id`로 조립해 보여준다: `$CLAUDE_HOME/projects/<projectId>/<id>.jsonl`.
- 세션 id 복사 버튼.
- 존재하지 않는 id면 404 화면 + 목록으로 돌아가는 링크.

## 5. 수용 기준

- [ ] `/sessions/<유효한 id>`가 헤더 요약과 대화를 보여준다.
- [ ] user / assistant / system / 서브에이전트 엔트리가 시각적으로 구분된다.
- [ ] thinking 블록이 기본 접혀 있고 펼치면 내용이 보인다.
- [ ] tool_use가 툴 이름과 요약 한 줄을 보여주고, 펼치면 전체 입력이 보인다.
- [ ] 잘린 JSON 입력에서도 요약 추출이 앱을 죽이지 않는다.
- [ ] tool_result 오류가 빨갛게, 펼쳐진 채로 시작한다.
- [ ] `truncated` 블록에 잘림 안내가 뜬다.
- [ ] 4개 필터 토글이 동작하고 URL에 반영된다.
- [ ] 서버 필터(이벤트/서브에이전트) 토글 시 `offset`이 0으로 초기화된다.
- [ ] "다음/이전"으로 페이지를 넘길 수 있고 `from`이 URL에 남는다.
- [ ] `#entry-42` 해시로 특정 엔트리에 스크롤된다.
- [ ] 없는 세션 id에서 404 화면이 뜬다.
- [ ] 엔트리 1000개 이상 세션에서 스크롤과 펼치기가 버벅이지 않는다.
- [ ] 텍스트 블록이 마크다운으로 렌더되며 스크립트가 실행되지 않는다.
- [ ] `bunx tsc --noEmit` 통과.

## 6. 검증

```bash
bun run dev & sleep 1
B=localhost:4317
# 가장 큰 세션을 고른다
curl -s "$B/api/sessions?limit=200" \
  | python3 -c "import sys,json; s=json.load(sys.stdin)['items']; s.sort(key=lambda x:-x['counts']['records']); print(s[0]['id'], s[0]['counts'])"
SID=<위에서 나온 id>
curl -s "$B/api/sessions/$SID/timeline?limit=5" | head -c 800; echo
curl -s "$B/api/sessions/$SID/timeline?limit=5&events=1" | grep -o '"kind":"event"' | head -1
curl -s "$B/api/sessions/$SID/timeline?limit=5&sidechain=0" >/dev/null && echo ok
kill %1
```

브라우저 시나리오:

1. 위에서 찾은 가장 큰 세션을 열어 렌더 시간과 스크롤 반응성 확인.
2. 4개 토글을 각각 켜고 꺼 보며 URL과 목록 변화 확인.
3. thinking / tool_use / tool_result 펼치기.
4. 오류가 있는 세션(`counts.errors > 0`)을 찾아 빨간 표시 확인.
5. `#entry-<n>` 해시 이동 확인.
6. `/sessions/nope`에서 404 화면 확인.
7. `MAX_BLOCK_CHARS=200 bun run dev`로 재시작해 잘림 안내가 뜨는지 확인.

## 7. 완료 처리

1. `docs/STRUCTURE.md` — `src/web/components/timeline.tsx`, `src/web/pages/session-detail.page.tsx`를 `✅`로.
2. `docs/ENDPOINTS.md` — `/api/sessions/:id/timeline`의 파라미터 기본값과 `TimelineBlock` 5종을 명세와 대조해 맞춘다.
3. `docs/CONVENTIONS.md` §10 — "접힌 콘텐츠는 펼치기 전에 렌더하지 않는다", "긴 목록은 서버 페이지네이션 + `React.memo`, 가상 스크롤은 쓰지 않는다"를 추가.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-016`
