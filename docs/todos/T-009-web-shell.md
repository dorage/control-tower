# T-009 — 프론트엔드 셸과 번들 파이프라인

| | |
| --- | --- |
| **ID** | T-009 |
| **우선순위** | P0 |
| **영역** | web-core |
| **선행** | T-001 |
| **후행** | T-010 ~ T-018 |

## 1. 목적

React 앱이 브라우저에 뜨는 최소 경로를 확정한다. Bun HTML import → 번들 → HMR이 실제로 도는지 여기서 못 박는다. 이후 모든 UI 작업은 이 골격 위에 올린다.

## 2. 전제

- `react`, `react-dom` 19가 이미 설치돼 있다.
- `tsconfig.json`의 `jsx: "react-jsx"`가 이미 켜져 있다 — `import React`가 필요 없다.
- T-001이 `src/web/index.html`을 플레이스홀더로 만들어 뒀고 `src/routes/index.ts`가 이를 `"/*"`로 서빙한다.
- 번들러를 추가하지 않는다. Bun이 `<script type="module" src="./main.tsx">`와 `<link rel="stylesheet">`를 보고 번들한다.

## 3. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/web/index.html` | 교체. 스크립트/스타일 연결 |
| `src/web/main.tsx` | 신규. React 루트 마운트 |
| `src/web/styles.css` | 신규. 토큰 + 리셋 + 기본 타이포 |
| `src/web/components/ui.tsx` | 신규. 공통 프리미티브 |

## 4. 상세 명세

### 4.1 `index.html`

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>control tower</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`<meta name="color-scheme" content="light dark">`가 있어야 브라우저 기본 UI(스크롤바, 폼 컨트롤)가 다크에서도 맞는다.

### 4.2 `main.tsx`

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");
createRoot(container).render(<App />);
```

T-011이 `app.tsx`를 만들기 전까지는 임시로 이 파일 안에 `function App() { return <div className="app">control tower</div> }`를 두고, T-011에서 `./app`으로 옮긴다. 산출물 목록에 `app.tsx`가 없는 이유다.

### 4.3 `styles.css` — 토큰

라이트/다크를 모두 지원한다. 색은 **항상 토큰으로만** 쓴다(CONVENTIONS §10).

```css
:root {
  color-scheme: light dark;

  --bg:          #ffffff;
  --bg-subtle:   #f6f7f9;
  --bg-raised:   #ffffff;
  --border:      #e3e6ea;
  --border-strong: #cbd1d9;
  --text:        #14171a;
  --text-muted:  #5c6572;
  --text-faint:  #8b95a3;
  --accent:      #2f6fed;
  --accent-soft: #e8f0fe;
  --danger:      #c0392b;
  --danger-soft: #fdecea;
  --success:     #1e7d44;
  --warning:     #b26a00;

  --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  --sans: system-ui, -apple-system, "Segoe UI", "Noto Sans KR", sans-serif;

  --radius: 8px;
  --gap: 12px;
  --sidebar-w: 300px;
  --header-h: 48px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg:          #0f1115;
    --bg-subtle:   #14171c;
    --bg-raised:   #1a1e24;
    --border:      #262b33;
    --border-strong: #39414c;
    --text:        #e7eaee;
    --text-muted:  #9aa4b2;
    --text-faint:  #6b7684;
    --accent:      #6f9dff;
    --accent-soft: #1b2740;
    --danger:      #ff7b6b;
    --danger-soft: #3a1f1c;
    --success:     #4ec97f;
    --warning:     #e0a34a;
  }
}
```

리셋과 기본:

```css
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { height: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 14px/1.55 var(--sans);
  -webkit-font-smoothing: antialiased;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
button { font: inherit; }
code, pre { font-family: var(--mono); font-size: 0.92em; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

클래스 네이밍은 `블록__요소--변형` (BEM 축약형). 예: `tree__row--active`, `editor__toolbar`.

### 4.4 `components/ui.tsx` — 공통 프리미티브

이후 모든 화면이 로딩/빈 상태/에러를 같은 모양으로 그리게 한다.

```tsx
export function Spinner({ label }: { label?: string }): JSX.Element;
// 접근성: role="status", aria-live="polite"

export function EmptyState({ title, hint }: { title: string; hint?: string }): JSX.Element;

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }): JSX.Element;
// error 가 Error 면 message, 아니면 String(error). onRetry 가 있으면 "다시 시도" 버튼.

export function Badge({ tone, children }: { tone?: "neutral" | "accent" | "danger" | "success" | "warning"; children: ReactNode }): JSX.Element;

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }): JSX.Element;
```

각각에 대응하는 CSS를 `styles.css`에 함께 넣는다.

### 4.5 프로덕션 빌드 확인

`bun build ./src/web/index.html --outdir dist` 가 성공해야 한다. 실패하면 정적 자원 참조가 잘못된 것이다. 이 명령은 배포 절차가 아니라 **번들 그래프 건전성 검사**로 쓴다.

## 5. 수용 기준

- [ ] `bun run dev` 후 `http://localhost:4317/`에서 React가 마운트되고 "control tower"가 보인다.
- [ ] 브라우저 콘솔에 에러가 없다.
- [ ] `main.tsx`를 저장하면 HMR로 새로고침 없이 반영된다.
- [ ] OS 테마를 다크로 바꾸면 배경/글자색이 따라 바뀐다.
- [ ] `styles.css` 안에 하드코딩된 hex 색이 토큰 정의 블록 밖에 없다.
- [ ] `bun build ./src/web/index.html --outdir /tmp/ct-dist`가 성공한다.
- [ ] `bunx tsc --noEmit` 통과.

## 6. 검증

```bash
bun run dev & sleep 2
curl -s localhost:4317/ | grep -q 'main.tsx\|<script' && echo "script tag ok"
curl -s localhost:4317/ | grep -q 'id="root"' && echo "root ok"
kill %1

bun build ./src/web/index.html --outdir /tmp/ct-dist && ls /tmp/ct-dist && rm -rf /tmp/ct-dist
bunx tsc --noEmit

# 토큰 밖 하드코딩 색 검사 (:root 블록 이후에 나오는 hex)
grep -n '#[0-9a-fA-F]\{3,8\}' src/web/styles.css | sed -n '40,999p'
```

브라우저에서 직접 확인할 것: 마운트, 콘솔 청결, HMR, 다크 모드.

## 7. 완료 처리

1. `docs/STRUCTURE.md` — `src/web/{index.html,main.tsx,styles.css,components/ui.tsx}`를 `✅`로.
2. `docs/CONVENTIONS.md` §10 — 확정된 CSS 토큰 이름 목록과 BEM 축약 클래스 규칙을 추가한다.
3. `docs/ENDPOINTS.md` — `/`와 `/*`가 실제 번들된 SPA를 서빙함을 확인(변경 없으면 그대로).
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-009`
