# T-013 — 마크다운 에디터 뷰

| | |
| --- | --- |
| **ID** | T-013 |
| **우선순위** | P0 |
| **영역** | web-files |
| **선행** | T-007, T-008, T-010, T-012 |
| **후행** | T-014 |

## 1. 목적

`.md` 파일을 열어 고치고 저장한다. 이 프로젝트의 핵심 기능 중 하나이므로 **편집 내용을 잃지 않는 것**을 최우선으로 설계한다.

CodeMirror나 Monaco를 도입하지 않는다. `<textarea>` + 얇은 보조 기능으로 충분하고, 의존성 정책(CONVENTIONS §2)에 맞다.

## 2. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/web/components/markdown-editor.tsx` | 에디터 위젯 |
| `src/web/hooks/use-editor-file.ts` | 로드/더티/저장 상태 기계 |
| `src/web/pages/files.page.tsx` | `.md`일 때 에디터로 분기 |
| `src/web/styles.css` | 에디터 스타일 추가 |

## 3. 상태 기계

`use-editor-file.ts`가 다음을 관리한다. 컴포넌트에 상태 로직을 흩뿌리지 않는다.

```ts
export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; error: unknown }
  | { kind: "conflict"; currentVersion: string | null };

export interface EditorFile {
  file: FsFile | null;       // 마지막으로 서버에서 읽은 상태
  draft: string;             // 편집 중인 본문
  dirty: boolean;            // draft !== file.content
  loading: boolean;
  loadError: unknown;
  status: SaveStatus;
  setDraft: (value: string) => void;
  save: () => Promise<void>;
  reload: () => Promise<void>;      // 디스크 내용으로 되돌린다 (draft 폐기)
  overwrite: () => Promise<void>;   // 충돌 시: 최신 version 을 받아 draft 로 덮어쓴다
}

export function useEditorFile(root: string | null, path: string | null): EditorFile;
```

### 3.1 로드

- `root`/`path`가 바뀌면 `api.fsFile`을 호출하고 `draft`를 `file.content ?? ""`로 초기화한다.
- **`dirty`인 상태에서 다른 파일로 이동하려 하면** 확인을 받는다(§5.3).
- `file.editable === false`면 편집을 막고 읽기 전용으로 렌더한다.

### 3.2 저장

```ts
await api.fsSave({ root, path, content: draft, baseVersion: file.version });
```

- 성공: 응답의 `version`/`size`/`modifiedAt`으로 `file`을 갱신하고 `file.content = draft`로 맞춘다. `status = { kind: "saved", at: Date.now() }`.
  - **`file.content`를 갱신하지 않으면 저장 직후에도 `dirty`가 true로 남는다.** 흔한 버그다.
- `ApiError`의 `status === 409`: `status = { kind: "conflict", currentVersion: error.detail.currentVersion ?? null }`. `draft`는 **절대 건드리지 않는다**.
- 그 외 에러: `status = { kind: "error", error }`. `draft` 유지.
- 저장 중(`saving`) 재진입을 막는다.

### 3.3 충돌 해소

409가 나면 편집 영역 위에 경고 바를 띄운다.

```
디스크에서 파일이 변경되었습니다.   [내 변경으로 덮어쓰기]  [디스크 내용 불러오기]  [닫기]
```

- **덮어쓰기**(`overwrite`): `api.fsFile`로 최신 `version`을 다시 받아 그 `baseVersion`으로 `draft`를 저장한다. 서버에 강제 플래그를 두지 않는다(T-008 §4.5).
- **불러오기**(`reload`): 디스크 내용을 `draft`에 넣는다. 되돌릴 수 없으므로 `dirty`일 때는 한 번 더 확인한다.
- **닫기**: 경고만 숨긴다. `draft`는 그대로다.

## 4. 에디터 UI

### 4.1 툴바

```
[파일 경로]        [수정됨 표시]  [저장됨 12:03]  [미리보기 토글]  [저장 (Cmd+S)]
```

- 경로는 루트 기준 상대경로. 길면 앞을 줄인다(`…/docs/TODO.md`).
- `dirty`면 경로 옆에 점 하나(`editor__dot--dirty`).
- 저장 버튼은 `!dirty || saving`일 때 비활성.
- 미리보기 토글은 T-014가 채운다. 이 작업에서는 버튼만 만들고 비활성으로 둔다.

### 4.2 편집 영역

```tsx
<textarea
  className="editor__input"
  value={draft}
  onChange={(e) => setDraft(e.target.value)}
  spellCheck={false}
  readOnly={!file.editable}
  onKeyDown={handleKeyDown}
/>
```

- 폰트 `var(--mono)`, `tab-size: 2`, `white-space: pre`, `overflow-wrap: normal`, 가로 스크롤 허용.
- 높이는 부모를 꽉 채운다(`height: 100%`, 부모에 `min-height: 0`).
- `resize: none`.

### 4.3 편집 보조 (`handleKeyDown`)

`document.execCommand("insertText")`를 쓴다. 이것이 브라우저의 실행 취소 스택에 기록되는 유일한 방법이며, `setDraft`로 값을 직접 조작하면 **Cmd+Z가 망가진다.**

```ts
function insert(textarea: HTMLTextAreaElement, text: string) {
  textarea.focus();
  document.execCommand("insertText", false, text);
}
```

지원할 키:

| 키 | 동작 |
| --- | --- |
| `Tab` | 선택 없음이면 스페이스 2칸 삽입. 선택이 있으면 선택된 줄 전체를 2칸 들여쓰기 |
| `Shift+Tab` | 선택된 줄 내어쓰기 |
| `Enter` | 이전 줄이 `- `, `* `, `1. `, `- [ ] ` 로 시작하면 같은 표식을 이어서 삽입. 표식만 있고 내용이 없으면 그 표식을 지운다 |
| `Cmd/Ctrl+S` | 저장. `preventDefault`로 브라우저 저장 대화상자를 막는다 |
| `Cmd/Ctrl+B` / `I` | 선택 영역을 `**`/`*`로 감싼다 |

`execCommand`는 deprecated지만 대체 API(`beforeinput` + 커스텀 undo 스택)는 훨씬 복잡하고 모든 주요 브라우저가 여전히 지원한다. 이 선택의 근거를 코드 주석으로 남긴다.

### 4.4 자동 저장

**자동 저장하지 않는다.** 이유: 낙관적 잠금 때문에 자동 저장은 사용자가 인지하지 못하는 409를 만들고, 파일을 실시간으로 다른 프로세스가 쓰는 환경(에이전트가 문서를 고치는 중)에서 위험하다. 저장은 항상 명시적이다.

대신 **초안 보존**을 한다: `draft`가 `dirty`일 때 `localStorage`에 `ct:draft:<root>:<path>`로 저장한다(500ms 디바운스). 같은 파일을 다시 열었을 때 저장된 초안이 있고 디스크 내용과 다르면 배너를 띄운다.

```
저장하지 않은 편집 내용이 있습니다.   [복원]  [버리기]
```

저장에 성공하거나 사용자가 "버리기"를 누르면 해당 키를 지운다.

## 5. 데이터 손실 방지

이 절의 항목은 전부 필수다.

### 5.1 페이지 이탈

```ts
useEffect(() => {
  if (!dirty) return;
  const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); };
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}, [dirty]);
```

### 5.2 SSE 갱신

T-018의 실시간 갱신이 **편집 중인 파일의 `draft`를 덮어쓰면 안 된다.** SSE 이벤트는 트리 캐시만 무효화하고, 열려 있는 파일은 `dirty`가 false일 때만 다시 읽는다.

### 5.3 파일 전환

`dirty`인 상태에서 트리의 다른 파일을 누르면 `window.confirm("저장하지 않은 변경이 있습니다. 이동할까요?")`로 확인한다. 취소하면 URL을 바꾸지 않는다.

## 6. 수용 기준

- [ ] `.md` 파일을 열면 내용이 textarea에 뜨고 편집할 수 있다.
- [ ] `.ts` 등 비허용 확장자는 읽기 전용으로 뜨고 저장 버튼이 없다.
- [ ] 편집하면 "수정됨" 표시가 뜨고, 저장하면 사라진다(저장 직후 `dirty`가 false다).
- [ ] `Cmd/Ctrl+S`가 저장하고 브라우저 대화상자가 뜨지 않는다.
- [ ] 저장 후 곧바로 다시 편집·저장해도 409가 나지 않는다.
- [ ] 외부에서 파일을 고친 뒤 저장하면 409 배너가 뜨고, `draft`가 보존된다.
- [ ] "덮어쓰기"가 성공하고, "불러오기"가 디스크 내용을 가져온다.
- [ ] `dirty` 상태에서 탭을 닫으려 하면 브라우저가 경고한다.
- [ ] `dirty` 상태에서 다른 파일을 누르면 확인을 묻는다.
- [ ] `Tab`, `Shift+Tab`, 목록 자동 이어쓰기가 동작한다.
- [ ] 편집 후 `Cmd+Z`로 실행 취소가 된다.
- [ ] 편집 중 새로고침하면 초안 복원 배너가 뜬다.
- [ ] 한글 IME 조합 중에 글자가 깨지거나 커서가 튀지 않는다.
- [ ] 5000줄 문서에서 타이핑이 버벅이지 않는다.
- [ ] `bunx tsc --noEmit` 통과.

## 7. 검증

```bash
mkdir -p /tmp/ct-demo/proj
printf '# 제목\n\n- 하나\n- 둘\n' > /tmp/ct-demo/proj/a.md
echo 'const x = 1' > /tmp/ct-demo/proj/b.ts
python3 -c "print('\n'.join(f'line {i}' for i in range(5000)))" > /tmp/ct-demo/proj/big.md

WORKSPACE_ROOTS=/tmp/ct-demo bun run dev
```

브라우저 시나리오:

1. `a.md`를 열고 고친 뒤 Cmd+S. 터미널에서 `cat /tmp/ct-demo/proj/a.md`로 반영 확인.
2. 곧바로 다시 고치고 저장 — 409가 아니어야 한다.
3. 편집 중인 상태로 터미널에서 `echo 'outside' >> /tmp/ct-demo/proj/a.md` 실행 후 저장 — 409 배너 확인, 편집 내용 보존 확인, "덮어쓰기" 동작 확인.
4. 고친 상태로 탭 닫기 시도 — 경고 확인.
5. 고친 상태로 트리에서 `b.ts` 클릭 — 확인 대화상자.
6. `b.ts`가 읽기 전용인지 확인.
7. 한글 입력기로 "안녕하세요"를 입력하며 조합 중 커서 확인.
8. `big.md`에서 중간 줄 타이핑 반응성 확인.
9. 고친 뒤 새로고침 — 초안 복원 배너 확인.

정리: `rm -rf /tmp/ct-demo`

## 8. 완료 처리

1. `docs/STRUCTURE.md` — `src/web/components/markdown-editor.tsx`, `src/web/hooks/use-editor-file.ts`를 `✅`로.
2. `docs/CONVENTIONS.md` §10 — "자동 저장 없음, 저장은 명시적", "초안은 localStorage에 보존", "textarea 편집 보조는 `execCommand('insertText')`로 실행 취소 스택을 지킨다"를 추가.
3. `docs/ENDPOINTS.md` — `PUT /api/fs/file`의 409 흐름 설명에 클라이언트 해소 방식(재읽기 후 재저장)을 한 줄 덧붙인다.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-013`
