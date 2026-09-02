# T-026 — 파일뷰 코멘트 레이어

| | |
| --- | --- |
| **ID** | T-026 |
| **우선순위** | P1 |
| **영역** | web-files |
| **선행** | T-025(코멘트 API), T-013(에디터 3탭) |
| **후행** | 없음 |

## 1. 목적

파일뷰에서 줄을 골라 코멘트를 달고, 달린 코멘트를 그 줄 옆에서 읽고 완료 처리한다. 멀티라인 선택을 지원한다.

**탭을 늘리지 않고 레이어 토글로 만든다.** 원문·편집 화면 위에 거터(줄 번호 + 말풍선)를 얹고, 말풍선을 누르면 스레드가 펼쳐진다. 코멘트를 보면서 편집하는 것이 이 기능의 목적이므로, 코멘트를 별도 탭으로 떼면 매번 탭을 왕복해야 한다.

```
docs/plan.md  [미리보기][원문][편집] [x]코멘트
-----------------------------------------
  1 # 제목
  2
 *3 본문 첫 줄        <- 3 memo (1)
  4 본문 둘째 줄
 *5 [ 선택 범위       <- 5-6 ai (1)
 *6   끝 ]
  7
```

## 2. 전제와 결정

### 2.1 미리보기 모드에는 토글이 없다

렌더된 마크다운에는 줄 개념이 없다. `preview` 에서는 토글 자체를 노출하지 않는다(비활성이 아니라 없음). 마크다운이 아닌 파일은 원문·편집만 있으므로 영향이 없다.

### 2.2 편집 중(dirty)에는 코멘트를 **추가**할 수 없다

- 기존 코멘트는 계속 보인다(초안 기준으로 재앵커해서 그린다).
- 새 코멘트 추가 버튼만 비활성. 안내: "저장하면 이 줄에 코멘트를 달 수 있습니다."

이유: 앵커는 그 줄의 원문이다. 저장되지 않은 줄을 앵커로 잡으면 서버가 디스크에서 읽은 원문과 다른 값이 저장되고(또는 서버가 캡처하므로 **엉뚱한 줄**의 원문이 저장되고), 첫 재앵커에서 바로 고아가 된다. "자동 저장하지 않는다"는 규칙(CONVENTIONS §10) 아래에서는 저장을 코멘트의 선행 조건으로 두는 것이 가장 단순하고 예측 가능하다.

### 2.3 재앵커는 여기서만 한다

`src/web/lib/anchor.ts` 의 순수 함수가 유일한 구현이다(T-025 §2.3). 입력은 **지금 화면의 버퍼**(`editor.draft` — 저장 상태면 디스크 내용과 같다)와 서버가 준 코멘트 목록이고, 출력은 보정된 줄 번호와 상태다.

```ts
export type AnchorStatus = "ok" | "moved" | "orphan";

export interface ResolvedComment {
  comment: FileComment;
  /** orphan 이면 저장된 값 그대로(표시에 쓰지 않는다). */
  startLine: number;
  endLine: number;
  status: AnchorStatus;
}

export function resolveAnchors(lines: string[], comments: FileComment[]): ResolvedComment[];
```

알고리즘 (결정적이어야 테스트가 된다):

1. `lines[startLine - 1] === anchorStart` 이면 그대로 → `ok`. (`anchorEnd` 도 맞으면 범위 그대로, 다르면 4번으로.)
2. 아니면 저장된 `startLine` 에서 **가까운 순서로 바깥으로 퍼져나가며** 정확히 일치하는 줄을 찾는다: `-1, +1, -2, +2, …` 최대 `WINDOW = 400`. 첫 일치를 채택 → `moved`. **같은 거리에서는 위쪽(작은 번호)을 먼저 본다** — 순서를 고정하지 않으면 테스트가 흔들린다.
3. 창 안에 없으면 파일 전체에서 일치하는 줄을 센다. **정확히 하나**면 그 줄로 → `moved`. 0개거나 2개 이상(모호)이면 → `orphan`.
4. `anchorEnd` 가 있으면 새 `startLine` **이후**에서 같은 규칙으로 찾는다. 못 찾으면 `endLine = startLine` 으로 접고 `moved` 로 둔다(범위를 잃었을 뿐 코멘트는 살아 있다).
5. `anchorStart` 가 빈 문자열이거나 공백만이면 3번(전체 유일성)을 **건너뛴다**. 빈 줄은 문서에 수십 개 있어 유일성이 성립하지 않고, 전체 검색이 항상 모호로 끝난다. 2번 창 검색에서 실패하면 바로 `orphan`.

`useMemo(() => resolveAnchors(lines, comments), [lines, comments])`. `lines` 는 `useMemo(() => draft.split("\n"), [draft])` — T-025 §2.5 의 줄 나누기 규칙과 **같아야 한다**(정규화 없음).

### 2.4 보정 결과를 되돌려 저장한다

`status === "moved"` 인 항목이 하나라도 있고, **dirty 가 아니면**, `POST /api/comments/reanchor` 를 1초 디바운스로 **한 번** 호출한다(항목 전부를 한 요청에). 같은 `fileVersion` 에 대해 두 번 보내지 않는다(ref 에 보낸 version 을 기록).

- dirty 면 보내지 않는다. 초안 기준 위치는 디스크의 진실이 아니다.
- 실패는 조용히 무시한다. 화면은 이미 보정된 위치로 그려져 있고, 다음 진입에서 다시 시도한다.
- `orphan` 은 절대 보내지 않는다. 위치를 모르는 것을 아무 위치로 확정하면 복구할 수 없다.

### 2.5 큰 파일에는 레이어를 켜지 않는다

가상 스크롤을 도입하지 않는다는 규칙(CONVENTIONS §10) 때문에, 줄 단위 렌더는 DOM 행 수에 그대로 비례한다. `lines.length > COMMENT_MAX_LINES(3000)` 이면 토글을 비활성하고 이유를 툴팁으로 보여준다: "파일이 커서 코멘트 레이어를 켤 수 없습니다(3000줄 초과)."

토글이 **꺼져 있으면 원문은 지금과 똑같이 `<pre>` 한 덩어리**로 그린다. 줄 단위 렌더는 토글이 켜졌을 때만 만든다 — 코멘트를 쓰지 않는 사람의 화면이 무거워질 이유가 없다.

### 2.6 실시간 갱신은 범위 밖

`/api/events` 는 `~/.claude` 만 감시한다(T-018). 다른 세션의 에이전트가 코멘트를 완료 처리해도 이 화면은 모른다. 갱신 시점은 **파일 전환·모드 전환·자기 뮤테이션 직후**뿐이다. 코멘트 변경을 SSE 로 흘리는 것은 별개 작업으로 남긴다(서버에 브로드캐스트 훅을 넣어야 하고, 그것은 T-004 의 이벤트 계약을 건드린다).

## 3. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/web/lib/anchor.ts` | `resolveAnchors` / `lineRangeOf` — 순수 함수 |
| `src/web/lib/anchor.test.ts` | 재앵커·선택→줄 범위 테스트 |
| `src/web/hooks/use-comments.ts` | 목록 조회·생성·수정·완료·삭제·보정 저장 |
| `src/web/components/comment-gutter.tsx` | 거터 열(줄 번호 버튼 + 말풍선). 원문·편집 공용 |
| `src/web/components/comment-thread.tsx` | 스레드 카드 하나(배지·완료·수정·삭제) |
| `src/web/components/comment-composer.tsx` | 새 코멘트 입력(범위·인용·type 선택) |
| `src/web/components/source-view.tsx` | 줄 단위 원문 렌더 + 인라인 스레드 |
| `src/web/components/markdown-editor.tsx` | 거터 붙이기·선택 줄 계산·스크롤 동기화 |
| `src/web/pages/files.page.tsx` | 코멘트 토글, `useComments` 배선 |
| `src/web/lib/api.ts` | `comments` / `commentCreate` / `commentPatch` / `commentDelete` / `commentsReanchor` |
| `src/web/styles.css` | 아래 §4.5 의 클래스 |

## 4. 상세 명세

### 4.1 상태

| 상태 | 위치 | 이유 |
| --- | --- | --- |
| 코멘트 레이어 on/off | `localStorage` `ct:comments` | 보기 방식이라 개인 취향(CONVENTIONS §10). `ct:view-mode` 와 같은 방식 |
| 완료 코멘트 보이기 | `localStorage` `ct:comments-done` | 같음 |
| 선택된 줄 범위 | 지역 상태 | 순간적인 것. URL 에 넣으면 뒤로가기가 줄 단위로 되돌아간다 |
| 펼친 스레드 줄 | 지역 상태 | 같음 |

### 4.2 선택 (멀티라인)

**원문 모드** — 거터 번호는 `<button type="button">` 이다(CONVENTIONS §10, 포커스와 Enter 가 공짜로 따라온다).

- 클릭: 그 줄만 선택.
- Shift+클릭: 마지막 클릭(앵커)에서 지금 클릭까지 범위 선택. 역방향(아래→위)도 정규화해서 `start <= end` 로 만든다.
- 같은 줄 재클릭: 선택 해제.
- 선택이 있으면 툴바에 "선택한 N줄에 코멘트" 버튼이 나타난다.

**편집 모드** — textarea 의 선택을 그대로 쓴다.

```ts
/** 커서/선택을 1-based 양끝 포함 줄 범위로 바꾼다. */
export function lineRangeOf(text: string, selectionStart: number, selectionEnd: number):
  { startLine: number; endLine: number };
```

경계 규칙(우선 확인 규칙 — 여기서 한 줄씩 어긋나기 쉽다):

- 선택이 없으면(`start === end`) 커서가 놓인 줄 하나.
- 선택 끝이 **줄 시작 위치에 정확히 걸치면**(개행 바로 뒤) 그 줄은 **포함하지 않는다**. 에디터 관례이고, 이러지 않으면 "3줄 선택"이 4줄로 보고된다. 단 그렇게 접어서 `endLine < startLine` 이 되면 `endLine = startLine`.
- 선택 끝이 줄 중간이면 그 줄은 포함한다.
- 텍스트 전체 선택은 `1 .. lines.length`.

### 4.3 그리기

**거터** (`comment-gutter.tsx`, 원문·편집 공용): 줄 번호와, 그 줄에서 시작하는 코멘트가 있으면 말풍선 + 개수. 범위 코멘트는 `start` 줄에 말풍선을 두고 `start..end` 줄에 왼쪽 세로 띠를 그린다. 선택 중인 줄은 `--selected` 변형.

- 줄 높이를 **고정**한다. `.editor__input` 은 이미 `line-height: 1.6` 과 `white-space: pre`(자동 줄바꿈 없음)라서 거터와 1:1 로 맞는다. 원문 뷰도 같은 `line-height` 를 쓴다. **이 두 값이 어긋나면 아래로 갈수록 어긋난다** — 토큰 하나(`--code-line`)로 묶어 둔다.
- 편집 모드: `textarea.onScroll` → 거터 `scrollTop` 동기화. 반대 방향은 만들지 않는다(거터는 자체 스크롤바를 숨긴다).

**스레드 위치**

- 원문 모드: 말풍선을 누르면 **그 줄 아래**에 스레드가 펼쳐진다(문서 흐름을 밀어낸다). 접힌 스레드는 렌더하지 않는다(CONVENTIONS §10).
- 편집 모드: textarea 안에 요소를 끼울 수 없으므로 **에디터 아래 패널**에 그 줄의 스레드를 펼친다. 어느 줄인지 패널 머리에 표시한다("5–6줄").

**스레드 카드** (`comment-thread.tsx`)

- `type` 배지: `메모` / `AI`. `author === "agent"` 일 때만 `에이전트` 배지를 덧붙인다.
- 인용: 보정된 현재 버퍼에서 첫 줄 80자. 저장된 앵커 원문이 아니라 지금 내용을 보여준다.
- 시각: `createdAt`. `modifiedAt !== createdAt` 이면 "(수정됨)".
- 완료 체크박스 → `PATCH { isComplete }`. 완료된 카드는 `--done` 변형(흐리게, 취소선 없음 — 본문을 읽어야 한다).
- 수정: 인라인 textarea + 저장/취소. 저장은 `PATCH { comment }`.
- 삭제: `window.confirm` 후 `DELETE`. 되돌릴 수 없다.
- `fileVersion !== file.version` 이면 카드에 조용한 힌트("파일이 그 뒤 변경됨"). `status === "moved"` 로 이미 보정된 경우에는 표시하지 않는다 — 보정에 성공했으면 사용자가 할 일이 없다.

**컴포저** (`comment-composer.tsx`)

- 머리: "3–5줄에 코멘트" + 첫 줄 인용.
- 본문 textarea(4000자 상한, 남은 글자 수는 3800자부터 표시).
- `type` 선택: `메모` / `AI` 라디오. 기본은 `메모`.
- 저장(⌘Enter) / 취소(Esc). `event.nativeEvent.isComposing` 이면 키 핸들러를 즉시 반환한다(한글 조합 중 Enter 를 가로채면 글자가 깨진다).

**고아 목록** — `status === "orphan"` 인 코멘트는 본문에 붙이지 않고 하단 `.comment-orphans` 에 모은다. 각 항목에 저장된 앵커 원문 미리보기, "지금 선택한 줄로 옮기기"(선택이 있을 때만 활성 → `reanchor` 호출), 삭제. 조용히 사라지게 두지 않는다 — 사용자가 쓴 글이다.

### 4.4 훅

```ts
export function useComments(root: string | null, path: string | null, opts: { enabled: boolean }): {
  items: FileComment[];
  loading: boolean;
  error: unknown;
  reload: () => void;
  create: (input: { startLine: number; endLine: number; comment: string; type: CommentType }) => Promise<void>;
  update: (id: number, patch: { comment?: string; isComplete?: boolean }) => Promise<void>;
  remove: (id: number) => Promise<void>;
  reanchor: (items: Array<{ id: number; startLine: number; endLine: number }>, fileVersion: string) => Promise<void>;
};
```

- 조회는 `use-query.ts` 를 경유한다(컴포넌트가 `fetch` 를 직접 부르지 않는다). 뮤테이션 후 토큰을 올려 재조회.
- `enabled: false`(레이어 꺼짐)면 요청을 보내지 않는다.
- `await` 뒤에 상태를 쓰기 전에 **대상 파일이 아직 열려 있는지 ref 로 확인**한다(CONVENTIONS §10). 늦게 온 응답이 다른 파일의 코멘트를 덮어쓰지 않게.

### 4.5 스타일

`.viewer__lines` `.line` `.line__no` `.line__mark` `.line__text` `.line--selected` `.line--ranged` · `.thread` `.thread__meta` `.thread__badge` `.thread--done` · `.composer` `.composer__quote` · `.editor__gutter` · `.comment-orphans`

색은 전부 기존 토큰(`--accent-soft` 로 선택 줄, `--warning` 으로 고아 배지, `--text-faint` 로 줄 번호). 새 hex 를 박지 않는다. 새로 추가하는 토큰은 줄 높이 하나(`--code-line: 1.6`)뿐이며 `:root` 에 둔다.

## 5. 수용 기준

- [ ] 원문 모드에서 거터 번호를 눌러 한 줄, Shift+클릭으로 여러 줄에 코멘트를 달 수 있다.
- [ ] 편집 모드에서 텍스트를 드래그 선택하고 "선택한 N줄에 코멘트" 로 같은 일을 할 수 있다.
- [ ] 선택 끝이 개행 직후에 걸친 경우 그 줄이 범위에 포함되지 않는다(3줄 선택이 3줄로 보고된다).
- [ ] 파일 앞부분에 줄을 몇 개 넣고 저장한 뒤 다시 열면, 코멘트가 **원래 문장을 따라 내려가** 붙어 있다.
- [ ] 앵커 줄을 지우면 그 코멘트가 본문에서 사라지고 하단 고아 목록에 나타난다. "지금 선택한 줄로 옮기기" 로 되살릴 수 있다.
- [ ] 보정이 일어난 뒤 새로고침해도 같은 위치다(`reanchor` 가 실제로 저장됐다).
- [ ] dirty 상태에서는 코멘트 추가가 비활성이고 안내가 보인다. 기존 코멘트는 초안 기준으로 계속 보인다.
- [ ] 완료 체크 → 기본으로 접히고, "완료 N건 보기" 로 다시 볼 수 있다.
- [ ] 미리보기 모드에는 코멘트 토글이 없다. 3000줄 초과 파일에서는 토글이 비활성이고 이유가 보인다.
- [ ] 토글이 꺼진 원문 모드의 DOM 이 지금과 같다(줄 단위 렌더가 생기지 않는다).
- [ ] 거터와 본문이 파일 끝까지 한 줄도 어긋나지 않는다(500줄 파일로 확인).
- [ ] 라이트/다크 모두 토큰 색만 쓴다.
- [ ] `.ts` 같은 비마크다운 파일에도 코멘트를 달 수 있다.
- [ ] `bun run check` 통과.

## 6. 검증

```bash
bun test src/web/lib/anchor.test.ts
bun run check
```

`anchor.test.ts` 가 덮을 것:

- `resolveAnchors`: 정확 일치 / 위로 밀림 / 아래로 밀림 / 같은 거리 동시 후보에서 위쪽 채택 / 창(400) 밖 유일 일치 / 창 밖 모호 2곳 → orphan / 앵커 줄 삭제 → orphan / 빈 줄 앵커는 전체 검색을 건너뛴다 / `anchorEnd` 실종 시 범위 축소 / 파일 첫 줄·마지막 줄 경계.
- `lineRangeOf`: 선택 없음(커서) / 줄 중간~중간 / 끝이 개행 직후 / 끝이 개행 직전 / 전체 선택 / 빈 문서.

**브라우저에서 사람이 확인할 것**(이 환경에는 브라우저가 없다):

거터 정렬(긴 파일 끝까지), 편집 모드 스크롤 동기화, 한글 IME 로 코멘트 입력, 다크 모드, 좁은 폭에서 스레드 카드 줄바꿈.

## 7. 완료 처리

1. `docs/STRUCTURE.md` 트리에 새 파일 7종 추가.
2. `docs/CONVENTIONS.md` §10 에 추가 — 코멘트 레이어는 켜졌을 때만 줄 단위로 렌더한다(3000줄 상한, 가상 스크롤 금지 규칙의 귀결), 거터 정렬은 고정 줄 높이 토큰에 의존한다, dirty 상태에서는 코멘트를 추가하지 않는다.
3. `README.md` 화면 표의 `/files` 설명에 코멘트 한 줄 추가.
4. `docs/TODO.md` 에 append: `<UTC-ISO> DONE T-026`.

## 8. 크기와 안전망

- 크기: 5시간 내외. 완수조건은 §5 전부(브라우저 육안 항목은 사용자 확인으로 넘긴다).
- 안전망: 토글이 꺼진 상태의 화면이 지금과 동일해야 한다는 수용 기준이 곧 feature flag 다. 문제가 생기면 토글을 끄면 되고, 되돌리기는 `git revert` 다. 파일을 쓰지 않으므로(코멘트는 별도 DB) 사용자 문서를 손상시킬 경로가 없다.
