# T-014 — 마크다운 렌더링과 프리뷰

| | |
| --- | --- |
| **ID** | T-014 |
| **우선순위** | P1 |
| **영역** | web-files |
| **선행** | T-013 |
| **후행** | 없음 |

## 1. 목적

에디터 옆에 렌더된 마크다운을 보여준다. **HTML 문자열을 만들지 않고 React 엘리먼트를 직접 만든다.** 그러면 `dangerouslySetInnerHTML`이 필요 없고, XSS 위험이 구조적으로 사라지며, sanitizer 의존성도 필요 없다(CONVENTIONS §2, §10).

## 2. 범위

지원할 문법 — 문서 작업에 실제로 쓰이는 것만.

| 블록 | 문법 |
| --- | --- |
| 제목 | `#` ~ `######` |
| 문단 | 빈 줄로 구분 |
| 목록 | `-`, `*`, `1.` (중첩 2단계까지) |
| 체크박스 | `- [ ]`, `- [x]` (읽기 전용 렌더) |
| 코드 블록 | ` ``` ` 펜스, 언어 표시자 보존 |
| 인용 | `>` |
| 표 | GFM 파이프 표 (정렬 행 포함) |
| 수평선 | `---`, `***` |

| 인라인 | 문법 |
| --- | --- |
| 강조 | `**굵게**`, `*기울임*`, `` `코드` ``, `~~취소~~` |
| 링크 | `[텍스트](url)` |
| 이미지 | `![대체텍스트](url)` |
| 자동 링크 | `<https://...>`, 맨 URL |

**범위 밖**: 각주, 정의 목록, HTML 인라인, 수식, 참조 링크(`[a][b]`). 지원하지 않는 문법은 원문 그대로 텍스트로 출력한다 — 깨뜨리지 않는다.

## 3. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/web/lib/markdown.ts` | 파서: 텍스트 → AST |
| `src/web/components/markdown-preview.tsx` | AST → React 엘리먼트 |
| `src/web/lib/markdown.test.ts` | 파서 테스트 |
| `src/web/components/markdown-editor.tsx` | 미리보기 토글 활성화 |
| `src/web/styles.css` | 프리뷰 타이포그래피 |

## 4. 상세 명세

### 4.1 AST

```ts
export type MdBlock =
  | { type: "heading"; level: 1|2|3|4|5|6; children: MdInline[] }
  | { type: "paragraph"; children: MdInline[] }
  | { type: "code"; lang: string | null; text: string }
  | { type: "quote"; blocks: MdBlock[] }
  | { type: "list"; ordered: boolean; start: number; items: MdListItem[] }
  | { type: "table"; header: MdInline[][]; align: Array<"left"|"center"|"right"|null>; rows: MdInline[][][] }
  | { type: "hr" };

export interface MdListItem { checked: boolean | null; blocks: MdBlock[] }

export type MdInline =
  | { type: "text"; value: string }
  | { type: "strong"; children: MdInline[] }
  | { type: "em"; children: MdInline[] }
  | { type: "del"; children: MdInline[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: MdInline[] }
  | { type: "image"; src: string; alt: string }
  | { type: "break" };

export function parseMarkdown(text: string): MdBlock[];
```

### 4.2 파싱 전략

두 단계로 나눈다. 한 번에 하려 들면 코드가 엉킨다.

**1단계: 블록 스캔.** 텍스트를 줄 배열로 만들고 위에서 아래로 훑으며 블록을 잘라낸다.

- 코드 펜스를 **가장 먼저** 확인한다. 펜스 안에서는 다른 어떤 규칙도 적용하지 않는다. 닫히지 않은 펜스는 파일 끝까지 코드로 본다.
- 목록은 들여쓰기(2칸 또는 4칸)로 중첩을 판정한다. 3단계 이상은 2단계로 접는다.
- 표는 헤더 줄 다음 줄이 `|---|:--:|` 형태일 때만 표로 인정한다. 아니면 그냥 문단이다.
- 인용은 각 줄의 `> ` 접두사를 벗겨 내부를 **재귀 파싱**한다.

**2단계: 인라인 파싱.** 각 블록의 텍스트에 대해 좌에서 우로 훑는다.

- 인라인 코드(`` ` ``)를 가장 먼저 인식한다. 그 안의 `*`, `[` 등은 전부 리터럴이다.
- 그 다음 이미지, 링크, `**`, `~~`, `*` 순.
- 짝이 맞지 않는 표식(`**닫히지 않음`)은 리터럴 텍스트로 남긴다.
- 줄 끝의 스페이스 2개는 `break`.

### 4.3 링크 안전성

```ts
const SAFE_SCHEME = /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i;

function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (!SAFE_SCHEME.test(trimmed)) return null;   // javascript:, data:, vbscript: 차단
  return trimmed;
}
```

- `safeHref`가 `null`이면 링크로 만들지 않고 원문 텍스트로 렌더한다.
- 이미지 `src`도 같은 검사를 거친다. 통과 못 하면 `alt` 텍스트만 출력한다.
- 외부 링크(`http://`, `https://`)에는 `target="_blank" rel="noopener noreferrer"`를 붙인다.
- 상대 링크는 현재 파일 기준으로 다른 파일을 여는 내부 내비게이션으로 처리한다. `.md`로 끝나면 `/files?root=<현재 root>&path=<해석된 경로>`로 `navigate`한다. 그 외 상대 링크는 비활성 텍스트로 둔다.

### 4.4 렌더러

```tsx
export function MarkdownPreview({ text, root, basePath }: {
  text: string;
  root: string;
  basePath: string;   // 상대 링크 해석 기준 (파일이 든 디렉터리)
}): JSX.Element;
```

- `parseMarkdown`의 결과를 `useMemo`로 캐시한다(deps: `text`). 타이핑마다 재파싱되지만 문서 크기 기준으로 충분히 빠르다.
- 코드 블록은 구문 강조를 하지 않는다. `<pre><code className={lang ? \`lang-${lang}\` : undefined}>`로만 감싼다. 하이라이터 도입은 별도 작업이다.
- 체크박스는 `<input type="checkbox" checked disabled>`.
- 표는 `overflow-x: auto` 컨테이너로 감싼다.
- **`dangerouslySetInnerHTML`을 쓰지 않는다.** 이 규칙을 어기면 이 작업의 목적이 사라진다.

### 4.5 에디터 통합

`markdown-editor.tsx`의 미리보기 토글을 활성화한다.

| 모드 | 레이아웃 |
| --- | --- |
| `edit` | 편집기만 |
| `split` | 좌 편집기 / 우 프리뷰 (기본) |
| `preview` | 프리뷰만 |

- 모드는 `localStorage`의 `ct:editor-mode`에 저장한다.
- 폭 900px 미만에서는 `split`을 `edit`/`preview` 탭 전환으로 강등한다.
- 스크롤 동기화는 범위 밖이다.
- 프리뷰는 `file.editable`이 false인 텍스트 파일에도 쓸 수 있다 — 단, `.md`일 때만 켠다.

## 5. 수용 기준

- [ ] §2 표의 모든 문법이 올바르게 렌더된다.
- [ ] 코드 펜스 안의 `# 제목`, `**굵게**`, `|표|`가 렌더되지 않고 그대로 나온다.
- [ ] 닫히지 않은 펜스가 앱을 깨뜨리지 않는다.
- [ ] `[클릭](javascript:alert(1))`이 링크가 아니라 텍스트로 나온다.
- [ ] `![x](data:text/html;base64,...)`가 이미지로 렌더되지 않는다.
- [ ] `<img src=x onerror=alert(1)>` 같은 원시 HTML이 실행되지 않고 텍스트로 나온다.
- [ ] `**닫히지 않음`이 원문 그대로 나온다.
- [ ] 외부 링크에 `rel="noopener noreferrer"`가 붙는다.
- [ ] 같은 문서 안의 `[다른 문서](./other.md)`를 누르면 그 파일이 열린다.
- [ ] 이 프로젝트의 `docs/TODO.md`, `docs/ENDPOINTS.md`, `docs/CONVENTIONS.md`가 깨짐 없이 렌더된다(표·코드블록·중첩 목록이 모두 들어 있는 좋은 시험 대상이다).
- [ ] split 모드에서 타이핑이 버벅이지 않는다.
- [ ] `bun test src/web/lib/markdown.test.ts` 통과.
- [ ] `bunx tsc --noEmit` 통과.

## 6. 검증

`src/web/lib/markdown.test.ts`가 최소한 다음을 덮는다.

```ts
import { test, expect } from "bun:test";
import { parseMarkdown } from "./markdown";

test("제목", () => {
  expect(parseMarkdown("# 안녕")[0]).toMatchObject({ type: "heading", level: 1 });
});

test("코드 펜스 안은 파싱하지 않는다", () => {
  const blocks = parseMarkdown("```ts\n# not a heading\n**not bold**\n```");
  expect(blocks).toHaveLength(1);
  expect(blocks[0]).toMatchObject({ type: "code", lang: "ts" });
  expect((blocks[0] as { text: string }).text).toContain("# not a heading");
});

test("닫히지 않은 펜스는 끝까지 코드", () => {
  expect(parseMarkdown("```\nabc")[0]).toMatchObject({ type: "code" });
});

test("체크박스 목록", () => {
  const list = parseMarkdown("- [ ] 할 일\n- [x] 완료")[0] as { items: Array<{ checked: boolean | null }> };
  expect(list.items.map((i) => i.checked)).toEqual([false, true]);
});

test("GFM 표", () => {
  const table = parseMarkdown("| a | b |\n| --- | ---: |\n| 1 | 2 |")[0];
  expect(table).toMatchObject({ type: "table", align: ["left", "right"] });
});

test("정렬 행이 없으면 표가 아니다", () => {
  expect(parseMarkdown("| a | b |\n| 1 | 2 |")[0]).toMatchObject({ type: "paragraph" });
});

test("짝이 맞지 않는 강조는 리터럴", () => {
  const para = parseMarkdown("**열림만")[0] as { children: Array<{ type: string; value?: string }> };
  expect(para.children[0]).toMatchObject({ type: "text", value: "**열림만" });
});

test("인라인 코드 안은 리터럴", () => {
  const para = parseMarkdown("`**x**`")[0] as { children: Array<{ type: string; value?: string }> };
  expect(para.children[0]).toMatchObject({ type: "code", value: "**x**" });
});
```

렌더러의 링크 차단은 브라우저에서 확인한다.

```bash
mkdir -p /tmp/ct-demo/proj
cp docs/TODO.md docs/ENDPOINTS.md docs/CONVENTIONS.md /tmp/ct-demo/proj/
cat > /tmp/ct-demo/proj/xss.md <<'MD'
[클릭](javascript:alert(1))
![img](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)
<img src=x onerror=alert(1)>
<script>alert(1)</script>
[상대 링크](./TODO.md)
[외부](https://example.com)
MD
WORKSPACE_ROOTS=/tmp/ct-demo bun run dev
```

브라우저에서 `xss.md`를 열어 경고창이 뜨지 않는지, 각 줄이 텍스트로 나오는지 확인한다. 이어서 `TODO.md`/`ENDPOINTS.md`/`CONVENTIONS.md`가 정상 렌더되는지 확인하고 `rm -rf /tmp/ct-demo`.

## 7. 완료 처리

1. `docs/STRUCTURE.md` — `src/web/lib/markdown.ts`, `src/web/components/markdown-preview.tsx`를 `✅`로.
2. `docs/CONVENTIONS.md` §10 — "마크다운은 자체 파서로 React 엘리먼트를 만든다. `dangerouslySetInnerHTML` 금지", "링크/이미지 URL은 스킴 허용목록으로 거른다"를 확정한다. §2에 "sanitizer/마크다운 라이브러리를 추가하지 않은 이유"를 한 줄 남긴다.
3. `docs/ENDPOINTS.md` — 변경 없음.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-014`
