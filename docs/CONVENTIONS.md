# 컨벤션

> 모든 작업 완료 시 이 문서를 갱신한다. 새 규칙이 생겼거나 기존 규칙이 깨졌으면 여기에 반영한다.

## 1. 런타임·도구

- 런타임은 **Bun** 고정. `node`/`ts-node`/`npm`/`npx`를 쓰지 않는다.
- 실행 `bun <file>`, 설치 `bun install`, 스크립트 `bun run <script>`, 실행기 `bunx`.
- 서버는 `Bun.serve()`. Express 등 HTTP 프레임워크를 추가하지 않는다.
- 파일 IO는 `Bun.file` / `Bun.write` 우선. `node:fs`는 `Bun.file`로 불가능한 경우(디렉터리 순회 메타데이터, `rename` 등)에만 `node:fs/promises`를 명시적으로 import 한다.
- 환경변수는 `Bun.env`로 읽는다. `dotenv`를 쓰지 않는다(Bun이 `.env`를 자동 로드).
- 번들러/개발서버는 Bun의 HTML import. `vite`/`webpack`/`esbuild`를 쓰지 않는다.
- 테스트는 `bun test` (`import { test, expect } from "bun:test"`).

## 2. 의존성 정책

- 런타임 의존성은 최소로 유지한다. 새 의존성을 추가하려면 해당 작업 문서에 근거를 남긴다.
- 현재 허용된 런타임 의존성: `react`, `react-dom`.
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
- `LOG_REQUESTS=1`일 때만 `withRoute`가 요청 한 줄 로그를 남긴다. 기본은 끔.
- 자세한 규약은 [ENDPOINTS.md](./ENDPOINTS.md).

## 9. 보안

- 파일시스템 API는 **설정된 루트 밖으로 절대 나가지 않는다.** 경로 해석은 `src/services/fs.service.ts`의 단일 함수를 통해서만 한다(T-005).
- 심볼릭 링크는 실경로(`realpath`)로 해석한 뒤 루트 포함 여부를 재검사한다.
- 쓰기는 확장자 허용목록(기본 `.md`, `.markdown`)에 한정한다.
- 서버는 기본적으로 로컬 네트워크용이다. 인증은 범위 밖이며, 외부 노출 시 별도 작업으로 다룬다.

## 10. 프론트엔드

- 함수 컴포넌트 + 훅만. 클래스 컴포넌트 없음.
- 상태는 지역 상태 우선. 전역 상태 라이브러리를 추가하지 않는다. 공유가 필요하면 `useSyncExternalStore` 기반 작은 스토어를 `src/web/lib`에 둔다.
- 데이터 페칭은 `src/web/hooks/use-query.ts` 한 곳으로 모은다.
- CSS는 `src/web/styles.css` 한 파일 + CSS 커스텀 프로퍼티 토큰. CSS-in-JS나 Tailwind를 도입하지 않는다.
- 라이트/다크 모두 대응한다. 색은 항상 토큰(`var(--...)`)으로 쓴다.
- 사용자 입력에서 온 문자열을 `dangerouslySetInnerHTML`로 넣지 않는다. 마크다운 프리뷰는 자체 렌더러가 만든 React 엘리먼트로 출력한다(T-014).

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
