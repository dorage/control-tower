# 컨벤션

> 모든 작업 완료 시 이 문서를 갱신한다. 새 규칙이 생겼거나 기존 규칙이 깨졌으면 여기에 반영한다.

## 1. 런타임·도구

- 런타임은 **Bun** 고정. `node`/`ts-node`/`npm`/`npx`를 쓰지 않는다.
- 실행 `bun <file>`, 설치 `bun install`, 스크립트 `bun run <script>`, 실행기 `bunx`.
- 서버는 항상 핫 리로드(`bun --hot`)로 띄운다. `dev`/`start` 스크립트 둘 다에 플래그가 박혀 있다. 핫 리로드가 곤란한 경우에만 `start:prod`를 쓴다.
- 서버는 `Bun.serve()`. Express 등 HTTP 프레임워크를 추가하지 않는다.
- 파일 IO는 `Bun.file` / `Bun.write` 우선. `node:fs`는 `Bun.file`로 불가능한 경우에만 `node:fs/promises`를 명시적으로 import 한다. 현재 허용된 예외: `fs.repository.ts`의 디렉터리 순회·stat, `fs.service.ts`의 `realpath`.
- 환경변수는 `Bun.env`로 읽는다. `dotenv`를 쓰지 않는다(Bun이 `.env`를 자동 로드).
- 번들러/개발서버는 Bun의 HTML import. `vite`/`webpack`/`esbuild`를 쓰지 않는다.
- 테스트는 `bun test` (`import { test, expect } from "bun:test"`).

## 2. 의존성 정책

- 런타임 의존성은 최소로 유지한다. 새 의존성을 추가하려면 해당 작업 문서에 근거를 남긴다.
- 현재 허용된 런타임 의존성: `react`, `react-dom`.
- 마크다운 라이브러리와 sanitizer 를 추가하지 않았다. 파서가 HTML 문자열을 만들지 않고 React 엘리먼트를 직접 만들기 때문에 sanitize 할 대상 자체가 없고, 필요한 문법이 문서 작업용으로 한정돼 있어 자체 파서(`lib/markdown.ts`)로 충분하다.
- 브라우저에서만 필요한 라이브러리는 `src/web` 아래에서만 import 한다. 서버 코드가 브라우저 전용 모듈을 import 하지 않는다.

## 3. 언어·타입

- TypeScript strict. `tsconfig.json`의 플래그를 완화하지 않는다.
- `noUncheckedIndexedAccess`가 켜져 있다. 인덱스 접근 결과는 항상 `undefined` 가능성을 처리한다.
- `verbatimModuleSyntax`가 켜져 있다. 타입만 import 할 때는 반드시 `import type { X } from "..."`.
- `any` 금지. 외부에서 들어오는 값은 `unknown`으로 받고 좁힌다.
- 외부 데이터(디스크의 JSON/JSONL, HTTP 요청 body)는 **반드시 런타임 검증 후** 도메인 타입으로 변환한다. 검증 헬퍼는 각 repository 내부의 `str()` / `num()` 같은 작은 함수로 지역화한다.
- 확장자 포함 import(`allowImportingTsExtensions`)는 사용하지 않는다. 기존 코드와 동일하게 확장자 없이 상대경로로 import 한다. (예: `import { config } from "../config"`)

## 4. 파일·디렉터리 네이밍

- 파일명은 **kebab-case**.
- 역할 접미사를 붙인다.
  - `*.repository.ts` — 디스크/외부 소스 읽기·쓰기
  - `*.service.ts` — 도메인 로직, 집계, 캐시
  - `*.route.ts` — HTTP 핸들러
  - `*.test.ts` — 테스트 (대상 파일과 같은 디렉터리)
  - `*.page.tsx` — 라우트 단위 화면 컴포넌트
  - `use-*.ts` — React 훅
- 디렉터리는 단수/복수 혼용하지 않는다. 기존 관례 유지: `repositories`, `services`, `routes`, `lib`, `domain`, `web`.

## 5. 계층 규칙 (의존 방향)

```
route  →  service  →  repository  →  disk
   ↘         ↘            ↘
        lib / domain(types)
```

- 역방향 import 금지. repository가 service를 부르지 않는다.
- route는 repository를 직접 부르지 않는다. 반드시 service를 경유한다.
- `src/domain/types.ts`는 타입만 export 한다. 로직을 두지 않는다.
- `src/lib/*`는 도메인 지식이 없는 순수 유틸만 둔다. 유일한 예외는 `http.ts`가 요청 로깅 스위치 하나 때문에 `config.ts`를 import 하는 것이다(`config.ts`는 잎 모듈이라 순환이 없다).
- `src/web/*`는 서버 코드를 import 하지 않는다. 단, `src/domain/types.ts`의 **타입만** `import type`으로 공유한다.
- 라우트 모듈은 **경로 → 메서드별 핸들러 레코드**를 named export 한다(`export const xRoutes = { "/api/x": { GET: ... } }`). 함수를 직접 주지 않는다 — 명시하지 않은 메서드에 대해 Bun이 405를 돌려주게 하기 위해서다.
- 라우트 조합은 `src/routes/index.ts`에서**만** 한다. 새 라우트 모듈을 추가할 때 다른 파일을 건드리지 않는다.

## 6. 코드 스타일

- 들여쓰기 2칸, 세미콜론 사용, 큰따옴표 문자열.
- 한 줄 최대 110자 내외.
- 함수는 `export function` 우선. 화살표 함수는 콜백/짧은 헬퍼에만.
- 기본 export를 쓰지 않는다. 예외: React 페이지/컴포넌트 파일과 `index.html` import.
- 주석은 **왜**를 적는다. 무엇을 하는지는 코드로 드러낸다. 기존 코드처럼 짧은 한 줄 주석(`/** ... */`)을 선호한다.
- 주석·문서·커밋 메시지는 한국어, 식별자와 로그 메시지는 영어.
- 조기 반환(early return)으로 중첩을 줄인다.

## 7. 에러 처리

- **읽기는 방어적으로.** 디스크의 파일이 사라지거나 반쯤 쓰인 상태를 정상 경로로 취급한다. 손상된 JSONL 줄은 건너뛰고 전체를 실패시키지 않는다.
- 상한 검사는 데이터를 읽기 **전에** `stat`으로 한다. 다 읽은 뒤 거절하는 것은 상한이 아니다.
- 텍스트 디코딩은 `TextDecoder("utf-8", { fatal: false })`. 잘못된 인코딩이 500 을 만들지 않게 한다.
- **쓰기는 엄격하게.** 경로·권한·충돌 검증에 실패하면 즉시 에러 응답을 반환한다.
- 라우트에서 예외를 흘리지 않는다. 모든 핸들러는 `src/lib/http.ts`의 `withRoute`로 감싼다. 일반 예외는 500으로, `HttpError(status, message, extra?)`는 그 상태 코드와 `{ error, ...extra }` 본문으로 변환된다.
- 정상 경로는 `json()`/`page()`를 **반환**하고, 예외 상황은 `throw new HttpError(...)`로 **던진다**. 두 방식을 한 핸들러 안에서 섞지 않는다.
- 쿼리 파싱 실패(`limit=abc`)는 400이 아니라 기본값으로 처리한다 — 읽기는 방어적으로.
- 사용자 입력 오류는 400, 없는 리소스는 404, 낙관적 잠금 충돌은 409, 허용되지 않은 경로/확장자는 403.
- 서버 로그 접두사는 `[control-tower]`.

## 8. HTTP 규약

- 응답은 항상 JSON(`Content-Type: application/json`). 에러 응답은 `{ "error": "<message>" }`.
- 캐시 금지 헤더(`cache-control: no-store`)를 기본으로 붙인다. `src/lib/http.ts`의 `json()`이 처리한다.
- 목록 응답은 `{ total, offset, limit, items }` 형태의 봉투(envelope)를 쓴다.
- 쿼리 파라미터는 camelCase (`projectId`, `sessionId`).
- 응답 헬퍼는 `src/lib/http.ts`로 통일한다: `json` / `notFound`(404) / `badRequest`(400) / `forbidden`(403) / `conflict`(409) / `tooLarge`(413) / `serverError`(500) / `page`(목록 봉투).
- 쿼리 파싱도 같은 파일로 통일한다: `intParam` / `intRange`(clamp) / `boolParam` / `stringParam`(빈 문자열은 null).
- 목록은 `page()` 봉투로, 단건은 `json()`으로 응답한다. **이미 봉투 형태인 도메인 객체(`Timeline`)는 그대로 반환한다** — 봉투를 두 번 씌우지 않는다.
- 서비스가 도메인에 맞는 필드명(`listSessions`의 `sessions`)을 쓰더라도 HTTP 봉투의 필드는 언제나 `items`다. 변환은 라우트에서 한다.
- 경로 파라미터를 쓰는 핸들러는 `Bun.BunRequest<"/api/…/:id">`로 타입을 받는다. `req.params`는 이미 URL 디코딩된 값이다.
- `LOG_REQUESTS=1`일 때만 `withRoute`가 요청 한 줄 로그를 남긴다. 기본은 끔.
- 자세한 규약은 [ENDPOINTS.md](./ENDPOINTS.md).

## 9. 보안

- 파일시스템 API는 **설정된 루트 밖으로 절대 나가지 않는다.** 디스크에 닿는 모든 경로는 `src/services/fs.service.ts`의 `resolvePath(rootId, relPath)` 하나만 통과한다. 이 함수를 우회하는 경로 조립을 어디에도 두지 않는다.
- `resolvePath` 절차(순서를 지킨다): ① `rootId` 없으면 400 → ② 미등록 루트면 403 → ③ `\0` 포함이면 400 → ④ 절대경로면 400 → ⑤ `resolve()`로 `..` 정규화 → ⑥ `candidate === root.path || candidate.startsWith(root.path + sep)` 포함 검사(구분자를 붙이지 않으면 `/home/u/work-secret`이 `/home/u/work`를 통과한다) → ⑦ `realpath` 결과로 ⑥을 한 번 더(없는 파일이면 부모 기준, 부모도 없으면 404).
- 쿼리 파라미터는 `URLSearchParams`가 이미 퍼센트 디코딩한다. `decodeURIComponent`를 **중복 호출하지 않는다** — 이중 디코딩은 `%252e%252e` 우회를 만든다.
- 쓰기는 확장자 허용목록(기본 `.md`, `.markdown`)에 한정한다. 판정은 `isEditable(name)` 하나로 한다.
- 낙관적 잠금 키는 `versionOf(modifiedAt, size)`로만 만든다. 읽기와 쓰기가 같은 함수를 쓰지 않으면 `mtimeMs` 소수점 때문에 미묘하게 어긋난다.
- 서버는 기본적으로 로컬 네트워크용이다. 인증은 범위 밖이며, 외부 노출 시 별도 작업으로 다룬다.

## 10. 프론트엔드

- 함수 컴포넌트 + 훅만. 클래스 컴포넌트 없음.
- 목록 행처럼 클릭 가능한 요소는 `<button type="button">`으로 만든다. `div + onClick` 금지 — 포커스와 Enter 가 공짜로 따라온다.
- 트리·목록은 필요한 시점에만 읽는다(지연 로딩). 결과는 컴포넌트 지역 `Map` 캐시에 담고 불변 갱신한다.
- 상태는 지역 상태 우선. 전역 상태 라이브러리를 추가하지 않는다. 공유가 필요하면 `useSyncExternalStore` 기반 작은 스토어를 `src/web/lib`에 둔다.
- 라우팅은 `lib/router.ts`의 자체 라우터(History API + `useSyncExternalStore`). 라우팅 라이브러리를 추가하지 않는다.
- 외부 스토어의 스냅샷은 **문자열 같은 원시값**을 반환한다. 매 호출마다 새 객체를 만들면 참조 비교가 항상 실패해 무한 렌더가 된다. 객체 변환은 훅 안의 `useMemo`가 한다.
- 공유·복원할 가치가 있는 화면 상태(선택된 파일, 검색어, 필터, 페이지 오프셋)는 URL에 담는다. 개인 취향에 가까운 상태(펼침 집합, 숨김 토글, 보기 방식)는 컴포넌트 지역 상태나 `localStorage`에 둔다.
- **검색 입력은 300ms 디바운스 후 `replace`로 URL에 반영한다.** 타이핑마다 `push`하면 뒤로가기가 글자 단위로 되돌아간다.
- 여러 파라미터를 함께 바꿔야 하면(필터를 켜면서 오프셋을 0으로 되돌리는 등) `setParam`을 두 번 부르지 않고 `setParams`로 한 번에 바꾼다. 나눠 갱신하면 중간 상태로 요청이 한 번 더 나간다.
- **페이지네이션은 "더 보기" 버튼이다.** 무한 스크롤을 쓰지 않는다 — 스크롤 위치 복원 문제가 없고 구현이 단순하다. 필터가 바뀌면 오프셋을 0으로 되돌리고 누적분을 버린다. 이어 붙일 때 id로 한 번 거른다(재시도가 같은 페이지를 두 번 붙이지 않도록).
- **접힌 콘텐츠는 펼치기 전에는 렌더하지 않는다.** `<details>`의 `open` 상태로 조건부 렌더하고, 자식을 함수(`children: () => ReactNode`)로 받아 엘리먼트 생성 자체를 미룬다. 타임라인 200개 엔트리에 붙은 툴 입출력을 모두 그리면 DOM 노드가 수천 개가 된다.
- **긴 목록은 서버 페이지네이션 + `React.memo`로 버틴다. 가상 스크롤을 도입하지 않는다.** 부족하면 페이지 크기를 줄인다. `memo`가 실제로 듣도록 props로 넘기는 객체(필터 등)는 `useMemo`로 참조를 고정한다.
- 데이터 페칭은 `src/web/hooks/use-query.ts` 한 곳으로 모은다. 컴포넌트가 `fetch`를 직접 부르지 않는다.
- 브라우저는 서버 타입을 재정의하지 않는다. `src/domain/types.ts`에서 `import type`으로 가져온다.
- 쿼리 문자열은 `URLSearchParams`로만 조립한다. 문자열 템플릿으로 붙이지 않는다.
- HTTP 에러는 `ApiError(status, message, detail)`로 던진다. 상태 코드와 서버가 준 추가 필드(`currentVersion` 등)를 잃지 않기 위해서다.
- 포맷터는 잘못된 입력에 대해 던지지 않고 `"-"`를 반환한다. 세션 데이터에는 타임스탬프가 없는 레코드가 흔하다.
- 트랜스크립트에서 온 JSON 문자열(툴 입력 등)은 서버가 `MAX_BLOCK_CHARS`에서 잘랐을 수 있다. **`JSON.parse` 실패는 정상 경로다** — 요약을 포기하고 넘어가되 화면을 죽이지 않는다.
- 카드처럼 통째로 링크인 요소 안의 보조 동작(복사, 필터)은 `<button>`으로 두고 핸들러에서 `preventDefault()`와 `stopPropagation()`을 **둘 다** 부른다. 하나만으로는 링크가 함께 발동한다.
- CSS는 `src/web/styles.css` 한 파일 + CSS 커스텀 프로퍼티 토큰. CSS-in-JS나 Tailwind를 도입하지 않는다.
- 라이트/다크 모두 대응한다. 색은 항상 토큰(`var(--...)`)으로 쓴다. hex 리터럴은 `:root`와 `@media (prefers-color-scheme: dark)` 블록 안에만 존재한다.
- 확정된 색 토큰: `--bg` `--bg-subtle` `--bg-raised` `--border` `--border-strong` `--text` `--text-muted` `--text-faint` `--accent` `--accent-soft` `--danger` `--danger-soft` `--success` `--warning`. 그 외 토큰: `--mono` `--sans` `--radius` `--gap` `--sidebar-w` `--header-h`.
- 클래스 네이밍은 BEM 축약형 `블록__요소--변형` (예: `tree__row--active`, `editor__toolbar`).
- 로딩/빈 상태/에러는 화면마다 새로 그리지 않고 `components/ui.tsx`의 `Spinner`/`EmptyState`/`ErrorBox`를 쓴다.
- 사용자 입력에서 온 문자열을 `dangerouslySetInnerHTML`로 넣지 않는다. **어디에서도 쓰지 않는다.** 마크다운은 `lib/markdown.ts`가 AST 로 파싱하고 `components/markdown-preview.tsx`가 React 엘리먼트로 만든다. HTML 문자열을 거치지 않으므로 XSS 위험이 구조적으로 없고 sanitizer 도 필요 없다.
- 링크와 이미지 URL 은 스킴 허용목록(`https?:` `mailto:` `#` `/` `./` `../`)으로 거른다. 통과하지 못하면 링크로 만들지 않고 원문 텍스트(이미지는 `alt`)로 남긴다.
- 외부 링크에는 `target="_blank" rel="noopener noreferrer"` 를 붙인다.
- 지원하지 않는 마크다운 문법은 원문 그대로 텍스트로 출력한다. 문서를 깨뜨리지 않는 쪽을 택한다.

## 11. 테스트

- 대상 파일 옆에 `*.test.ts`.
- 순수 함수(`src/lib`, 파싱/집계 로직)와 경로 보안 로직은 반드시 테스트한다.
- 디스크에 의존하는 테스트는 임시 디렉터리를 만들어 쓰고 정리한다. 사용자의 실제 `~/.claude`를 건드리지 않는다.

## 12. 문서화 의무

모든 작업은 완료 시점에 다음 세 문서를 확인·갱신한다.

- `docs/CONVENTIONS.md` — 새 규칙/패턴이 생겼는가
- `docs/STRUCTURE.md` — 파일/디렉터리가 늘거나 계층이 바뀌었는가
- `docs/ENDPOINTS.md` — 엔드포인트가 추가/변경되었는가

그리고 `docs/TODO.md`에 `DONE` 줄을 append 한다.
