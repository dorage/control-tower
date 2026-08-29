# T-011 — 클라이언트 라우터와 앱 레이아웃

| | |
| --- | --- |
| **ID** | T-011 |
| **우선순위** | P1 |
| **영역** | web-core |
| **선행** | T-009, T-010 |
| **후행** | T-012, T-015, T-016, T-017 |

## 1. 목적

주소창에 상태를 담는다. `/sessions/<id>`를 복사해 붙이면 그 세션이 열려야 하고, 뒤로가기가 동작해야 한다. 라우팅 라이브러리를 추가하지 않고 History API로 직접 만든다(경로가 4개뿐이다).

## 2. 라우트 표

| 경로 | 화면 | 담당 작업 |
| --- | --- | --- |
| `/` | 대시보드 | T-017 |
| `/files` | 파일 탐색기 + 에디터 | T-012, T-013 |
| `/sessions` | 세션 목록 | T-015 |
| `/sessions/:id` | 세션 타임라인 | T-016 |
| 그 외 | 404 화면 | 이 작업 |

`/files`의 선택 상태는 쿼리로 표현한다: `/files?root=workspace&path=docs/TODO.md`

서버는 이미 모든 경로에 SPA를 돌려주므로(T-001의 `"/*"`), 새로고침해도 같은 화면이 뜬다.

## 3. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/web/lib/router.ts` | 라우터 스토어 + 훅 |
| `src/web/components/app-shell.tsx` | 사이드바 + 헤더 + 콘텐츠 |
| `src/web/app.tsx` | 라우트 → 화면 매핑 |
| `src/web/main.tsx` | 임시 App 제거, `./app` import |

## 4. 상세 명세

### 4.1 `router.ts`

`useSyncExternalStore` 위에 얹는다. 컨텍스트/리듀서를 쓰지 않는다.

```ts
export interface Location { pathname: string; search: URLSearchParams }

/** 현재 위치. popstate 와 navigate 에 반응한다. */
export function useLocation(): Location;

/** push 또는 replace. to 는 "/sessions/abc?x=1" 같은 전체 경로. */
export function navigate(to: string, options?: { replace?: boolean }): void;

/** 현재 쿼리 파라미터 하나를 바꾼다(나머지는 유지). value 가 null 이면 제거. */
export function setParam(name: string, value: string | null, options?: { replace?: boolean }): void;

/** <a> 를 가로채 SPA 내비게이션으로 바꾸는 링크. */
export function Link(props: { to: string; className?: string; children: ReactNode }): JSX.Element;
```

구현 요점:

1. 모듈 스코프에 `listeners = new Set<() => void>()`와 `snapshot` 문자열(`location.pathname + location.search`)을 둔다.
2. `subscribe`에서 `window.addEventListener("popstate", notify)`를 건다.
3. `navigate`는 `history.pushState`/`replaceState` 후 `notify()`를 **직접 호출한다**(pushState는 popstate를 발생시키지 않는다).
4. `getSnapshot`은 반드시 **문자열**을 반환한다. `useSyncExternalStore`는 참조 동일성으로 비교하므로 매번 새 객체를 만들면 무한 렌더가 된다. `useLocation`은 그 문자열을 `useMemo`로 `Location`으로 변환한다.
5. `Link`의 `onClick`: `event.metaKey || ctrlKey || shiftKey || altKey || button !== 0`이면 가로채지 않고 브라우저에 맡긴다(새 탭 열기 보존). 그 외에는 `preventDefault` 후 `navigate`.
6. SSR이 없으므로 `getServerSnapshot`은 필요 없다.

### 4.2 라우트 매칭 (`app.tsx`)

정규식 라우터를 만들지 않는다. 세그먼트 분해로 충분하다.

```tsx
export function App() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  let content: ReactNode;
  if (segments.length === 0) content = <DashboardPage />;
  else if (segments[0] === "files" && segments.length === 1) content = <FilesPage />;
  else if (segments[0] === "sessions" && segments.length === 1) content = <SessionsPage />;
  else if (segments[0] === "sessions" && segments.length === 2) content = <SessionDetailPage id={segments[1]!} />;
  else content = <NotFound pathname={pathname} />;

  return <AppShell>{content}</AppShell>;
}
```

각 페이지는 아직 없다. 이 작업에서는 **자리표시 컴포넌트**를 각 파일에 만들어 두고, T-012/015/016/017이 내용을 채운다.

- `src/web/pages/dashboard.page.tsx` → `export function DashboardPage() { return <div>대시보드</div> }`
- `src/web/pages/files.page.tsx` → `export function FilesPage()`
- `src/web/pages/sessions.page.tsx` → `export function SessionsPage()`
- `src/web/pages/session-detail.page.tsx` → `export function SessionDetailPage({ id }: { id: string })`

### 4.3 `app-shell.tsx`

```
┌────────────────────────────────────────────────┐
│ header  control tower        [연결 상태] [테마] │  높이 var(--header-h)
├──────────────┬─────────────────────────────────┤
│ nav          │ main                            │
│  대시보드     │  {children}                     │
│  파일         │                                 │
│  세션         │                                 │
│              │                                 │
└──────────────┴─────────────────────────────────┘
```

- 레이아웃은 CSS Grid: `grid-template-columns: var(--sidebar-w) 1fr; grid-template-rows: var(--header-h) 1fr;`
- `main`은 `overflow: auto; min-height: 0;` — Grid 자식의 기본 `min-height: auto` 때문에 스크롤이 깨지는 흔한 함정을 피한다.
- 내비 항목은 `Link`로 만들고, 현재 경로의 첫 세그먼트와 일치하면 `nav__item--active` 클래스를 붙인다.
- 헤더 우측의 "연결 상태" 자리는 T-018이 SSE 표시등으로 채운다. 지금은 빈 `<div className="header__status" />`를 둔다.
- 폭 900px 미만에서는 사이드바를 헤더 아래 가로 탭으로 바꾼다(`@media (max-width: 900px)`).

### 4.4 문서 제목

경로가 바뀔 때 `document.title`을 갱신한다. `App`에서 `useEffect`로 처리한다.

- `/` → `control tower`
- `/files` → `파일 · control tower`
- `/sessions` → `세션 · control tower`
- `/sessions/:id` → `<세션 제목 또는 id> · control tower` (T-016에서 세부 채움)

## 5. 수용 기준

- [ ] 사이드바 링크로 4개 경로를 오갈 수 있고 주소창이 바뀐다.
- [ ] 뒤로가기/앞으로가기가 화면을 되돌린다.
- [ ] `/sessions/abc`를 직접 열거나 새로고침해도 같은 화면이 뜬다(404 HTML이 아니다).
- [ ] `Link`를 Cmd/Ctrl-클릭하면 새 탭이 열린다.
- [ ] `setParam("path", "docs/a.md")`가 다른 쿼리 파라미터를 지우지 않는다.
- [ ] 모르는 경로(`/nope`)에서 앱 안의 404 화면이 뜬다(브라우저 404가 아니다).
- [ ] 무한 렌더가 없다(React DevTools 또는 `console.count`로 확인).
- [ ] 900px 미만에서 레이아웃이 깨지지 않는다.
- [ ] `document.title`이 경로에 따라 바뀐다.
- [ ] `bunx tsc --noEmit` 통과.

## 6. 검증

```bash
bun run dev & sleep 2
for p in / /files /sessions /sessions/abc /nope; do
  printf '%s -> ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' "localhost:4317$p"
done   # 전부 200 (SPA 폴백)
kill %1
bunx tsc --noEmit
```

나머지는 브라우저에서 직접 확인한다: 내비게이션, 뒤로가기, 새 탭, 반응형, 무한 렌더 여부.

## 7. 완료 처리

1. `docs/STRUCTURE.md` — `src/web/{app.tsx,lib/router.ts,components/app-shell.tsx,pages/*}`를 `✅`(자리표시 페이지는 담당 T-ID를 메모)로.
2. `docs/ENDPOINTS.md` — 문서 끝의 클라이언트 라우트 목록을 실제 구현과 맞추고 `/files`의 쿼리 파라미터(`root`, `path`)를 명시한다.
3. `docs/CONVENTIONS.md` §10 — "라우팅은 `useSyncExternalStore` 기반 자체 라우터, 스냅샷은 문자열", "화면 상태는 URL에 담는다" 규칙 추가.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-011`
