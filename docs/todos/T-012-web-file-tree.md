# T-012 — 파일 탐색기 트리 패널

| | |
| --- | --- |
| **ID** | T-012 |
| **우선순위** | P0 |
| **영역** | web-files |
| **선행** | T-006, T-010, T-011 |
| **후행** | T-013 |

## 1. 목적

`/files` 화면의 좌측 트리. 루트를 고르고, 디렉터리를 펼치고, 파일을 선택한다. 선택 상태는 URL에 있다.

## 2. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/web/components/file-tree.tsx` | 트리 위젯 |
| `src/web/pages/files.page.tsx` | 좌 트리 / 우 뷰어 2단 레이아웃 |
| `src/web/styles.css` | 트리 스타일 추가 |

## 3. 상세 명세

### 3.1 데이터 전략 — 지연 로딩

`/api/fs/tree`가 아니라 **`/api/fs/list`를 노드마다 호출**한다. 이유: 큰 워크스페이스에서 트리 전체를 한 번에 받으면 응답이 수 MB가 되고, 펼치지도 않을 디렉터리를 읽는다.

- 루트 노드: 마운트 시 `api.fsList(root, "")`.
- 디렉터리 펼침: 그 노드에 대해 처음 펼칠 때만 `api.fsList(root, node.path)`. 결과를 캐시한다.
- 접었다 다시 펼치면 캐시를 쓴다. 새로고침은 툴바의 "새로고침" 버튼이나 T-018의 SSE로 무효화한다.

캐시 형태:

```ts
type Cache = Map<string, { items: FsEntry[]; error: unknown | null; loading: boolean }>;
// key: `${rootId} ${path}`
```

`useState<Cache>`로 두고 갱신 시 새 Map을 만든다(불변 갱신).

### 3.2 상태

| 상태 | 위치 | 이유 |
| --- | --- | --- |
| 선택된 루트 `root` | URL 쿼리 | 공유·새로고침 보존 |
| 선택된 파일 `path` | URL 쿼리 | 위와 같음 |
| 펼친 디렉터리 집합 | 컴포넌트 지역 `Set<string>` | URL에 넣기엔 길고 공유 가치가 낮음 |
| 숨김 표시 여부 | 컴포넌트 지역 | 개인 취향 |
| 디렉터리 캐시 | 컴포넌트 지역 | 위와 같음 |

`root`가 URL에 없으면 `api.fsRoots()`의 첫 번째를 `navigate(..., { replace: true })`로 채운다. 루트가 하나도 없으면 `EmptyState`로 `WORKSPACE_ROOTS` 설정을 안내한다.

**초기 경로 복원**: URL에 `path=a/b/c.md`가 있으면 그 조상 디렉터리(`a`, `a/b`)를 모두 펼친 상태로 시작한다. `path`를 `/`로 분해해 조상 목록을 만들고 순서대로 로드한다.

### 3.3 렌더링

```tsx
export function FileTree(props: {
  root: string;
  selectedPath: string | null;
  onSelect: (entry: FsEntry) => void;
}): JSX.Element;
```

- 재귀 컴포넌트 `TreeNode`가 자신과 자식을 그린다. 들여쓰기는 `paddingLeft: depth * 14 + 8`.
- 행 구성: `[펼침 표시자] [아이콘] [이름]`
  - 펼침 표시자와 아이콘은 이모지 또는 인라인 SVG. 아이콘 폰트를 추가하지 않는다.
  - `entry.editable`인 파일은 이름 옆에 옅은 점(`tree__dot`)으로 편집 가능함을 표시한다.
- 디렉터리 클릭은 펼침 토글, 파일 클릭은 `onSelect`.
- 로딩 중인 디렉터리는 자식 자리에 작은 스피너 한 줄.
- 에러가 난 디렉터리(예: 권한 없음)는 자식 자리에 빨간 한 줄 메시지. **트리 전체를 죽이지 않는다.**
- `truncated: true`인 응답은 마지막에 "항목이 더 있습니다" 한 줄을 붙인다.

### 3.4 접근성과 키보드

- 루트 컨테이너에 `role="tree"`, 각 행에 `role="treeitem"`, 디렉터리에 `aria-expanded`, 선택 행에 `aria-selected`.
- 행은 `<button type="button">`으로 만든다. div + onClick 금지 — 포커스와 Enter가 공짜로 따라온다.
- 키보드: 위/아래 화살표로 보이는 행 이동, 오른쪽 화살표로 펼침, 왼쪽 화살표로 접기(이미 접혔으면 부모로), Enter로 선택.
  - 구현: 현재 펼침 상태로부터 "보이는 행"의 평탄한 배열을 매 렌더에 계산하고, 인덱스로 이동한다.

### 3.5 툴바

트리 상단에 한 줄:

- 루트 선택 `<select>` (루트가 2개 이상일 때만 표시)
- 숨김 표시 토글 체크박스
- 새로고침 버튼 (캐시 전체를 비우고 현재 펼침 상태를 다시 로드)

### 3.6 `files.page.tsx`

좌측 트리(스크롤) / 우측 뷰어의 2단 구성.

우측이 그리는 것:

| 선택 상태 | 표시 |
| --- | --- |
| 선택 없음 | `EmptyState` — "파일을 선택하세요" |
| `.md` 파일 | T-013의 `MarkdownEditor`. 이 작업 단계에서는 읽기 전용 `<pre>` |
| 그 외 텍스트 | 읽기 전용 `<pre>` + "읽기 전용" 배지 |
| 바이너리 | "미리보기를 지원하지 않는 파일입니다" + 크기 표시 |
| 413 에러 | "파일이 너무 큽니다" 안내 |

- Grid `grid-template-columns: minmax(220px, 320px) 1fr`.
- 이 작업에서는 우측을 읽기 전용으로 구현한다(`api.fsFile` 호출 후 `content` 출력). T-013이 `.md`일 때만 에디터로 교체한다.
- 좌우 분할선을 드래그로 조절하는 기능은 범위 밖이다.

## 4. 수용 기준

- [ ] `/files`에 들어가면 첫 루트가 URL에 채워지고 최상위 항목이 보인다.
- [ ] 디렉터리를 펼치면 그때 네트워크 요청이 한 번 나가고, 접었다 펼치면 추가 요청이 없다.
- [ ] 파일을 선택하면 URL의 `path`가 바뀌고 우측에 내용이 뜬다.
- [ ] 그 URL을 새 탭에 붙여 넣으면 같은 파일이 열리고 조상 디렉터리가 펼쳐져 있다.
- [ ] 숨김 토글을 켜면 `.`으로 시작하는 항목이 나타난다.
- [ ] 권한 없는 디렉터리를 펼쳐도 앱이 죽지 않고 그 노드에만 에러가 표시된다.
- [ ] 키보드 화살표와 Enter로 트리를 조작할 수 있다.
- [ ] 항목 1000개 이상인 디렉터리를 펼쳐도 UI가 멈추지 않는다.
- [ ] `bunx tsc --noEmit` 통과.

## 5. 검증

```bash
mkdir -p /tmp/ct-demo/proj/docs /tmp/ct-demo/proj/src /tmp/ct-demo/proj/.secret
echo '# a' > /tmp/ct-demo/proj/docs/a.md
echo 'x'   > /tmp/ct-demo/proj/src/b.ts
mkdir -p /tmp/ct-demo/proj/docs/deep/deeper && echo '# d' > /tmp/ct-demo/proj/docs/deep/deeper/c.md
mkdir -p /tmp/ct-demo/big && for i in $(seq 1 1200); do echo x > /tmp/ct-demo/big/f$i.md; done
chmod 000 /tmp/ct-demo/proj/.secret

WORKSPACE_ROOTS=/tmp/ct-demo bun run dev
```

브라우저에서 확인할 것:

1. `/files` 진입 시 `?root=ct-demo`가 자동으로 채워진다.
2. `proj > docs > deep > deeper`를 차례로 펼치고, 네트워크 탭에서 디렉터리당 요청이 1회씩만 나가는지 본다.
3. `c.md`를 선택하고 URL을 복사해 새 탭에 붙여 넣어 조상 펼침이 복원되는지 본다.
4. 숨김 토글을 켜서 `.secret`이 보이는지, 펼쳤을 때 그 노드에만 에러가 나는지 본다.
5. `big`을 펼쳐 멈춤 없이 렌더되는지, "더 있습니다" 표시가 나오는지 본다.
6. 키보드만으로 트리를 조작해 본다.

정리:

```bash
chmod 755 /tmp/ct-demo/proj/.secret; rm -rf /tmp/ct-demo
```

## 6. 완료 처리

1. `docs/STRUCTURE.md` — `src/web/components/file-tree.tsx`, `src/web/pages/files.page.tsx`를 `✅`로.
2. `docs/ENDPOINTS.md` — 클라이언트가 `/api/fs/tree`를 쓰지 않는다면 그 엔드포인트에 "현재 UI 미사용, 스크립트/디버그용" 메모를 남긴다.
3. `docs/CONVENTIONS.md` §10 — "트리와 목록은 지연 로딩 + 지역 캐시", "선택 상태는 URL, 펼침 상태는 지역", "클릭 가능한 행은 `<button>`" 규칙 추가.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-012`
