# T-002 — HTTP 응답 규약·에러 처리·요청 로깅

| | |
| --- | --- |
| **ID** | T-002 |
| **우선순위** | P0 |
| **영역** | core |
| **선행** | T-001 |
| **후행** | T-003, T-004, T-006, T-007, T-008 |

## 1. 목적

모든 라우트가 공유할 응답 헬퍼·에러 변환·목록 봉투(envelope)·파라미터 파싱을 `src/lib/http.ts` 한 곳에 확정한다. 이후 라우트 작업이 에러 처리를 각자 재발명하지 않게 한다.

## 2. 현재 상태

`src/lib/http.ts`에 이미 있는 것:

```ts
json(data, init?)         // cache-control: no-store 를 붙인 Response.json
notFound(message?)        // 404 { error }
badRequest(message)       // 400 { error }
serverError(error)        // 500 { error }, [control-tower] 접두사로 콘솔 로그
intParam(url, name, fb)   // 정수 쿼리 파싱, 실패 시 fallback
```

여기에 부족한 것: 403/409/413, 범위 제한된 정수 파싱, 불리언 파싱, 예외를 삼키는 라우트 래퍼, 목록 봉투.

## 3. 산출물

| 파일 | 동작 |
| --- | --- |
| `src/lib/http.ts` | 확장 (기존 export는 시그니처 유지) |
| `src/lib/http.test.ts` | 신규 |
| `src/routes/health.route.ts` | `withRoute` 적용으로 수정 |

## 4. 상세 명세

### 4.1 추가 export

```ts
/** 허용되지 않은 경로/확장자. */
export function forbidden(message: string): Response;          // 403

/** 낙관적 잠금 충돌. extra 를 본문에 병합한다. */
export function conflict(message: string, extra?: Record<string, unknown>): Response;  // 409

/** 상한 초과. */
export function tooLarge(message: string): Response;           // 413

/** 목록 응답 봉투. */
export function page<T>(items: T[], total: number, offset: number, limit: number): Response;
// -> json({ total, offset, limit, items })

/** 범위를 강제하는 정수 쿼리 파싱. 범위를 벗어나면 clamp 한다. */
export function intRange(url: URL, name: string, fallback: number, min: number, max: number): number;

/** "1" | "true" 를 참으로 본다. 값이 없으면 fallback. */
export function boolParam(url: URL, name: string, fallback: boolean): boolean;

/** 필수 문자열 쿼리. 없거나 빈 문자열이면 null. */
export function stringParam(url: URL, name: string): string | null;

/** 라우트 핸들러를 감싸 예외를 500으로, HttpError 를 해당 코드로 변환한다. */
export function withRoute<T extends Request>(handler: (req: T) => Response | Promise<Response>): (req: T) => Promise<Response>;

/** 라우트에서 던져 상태 코드를 지정하는 에러. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>);
}
```

### 4.2 `withRoute` 동작

```ts
export function withRoute(handler) {
  return async (req) => {
    try {
      return await handler(req);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message, ...(error.extra ?? {}) }, { status: error.status });
      }
      return serverError(error);
    }
  };
}
```

- 라우트는 정상 경로에서 `json()`/`page()`를 반환하고, 예외 상황은 `throw new HttpError(...)`로 표현한다. 두 방식 중 하나로 통일한다.
- 모든 라우트 모듈은 핸들러를 `withRoute`로 감싼다.

### 4.3 `intRange` 동작

```ts
export function intRange(url, name, fallback, min, max) {
  const value = intParam(url, name, fallback);
  return Math.min(max, Math.max(min, value));
}
```

파싱 불가한 값은 400이 아니라 fallback으로 처리한다(읽기는 방어적으로 — CONVENTIONS §7).

### 4.4 요청 로깅

`Bun.env.LOG_REQUESTS`가 `1`일 때만 한 줄 로그를 남긴다. 기본은 끔(로컬 도구라 항상 켜면 시끄럽다).

```ts
// withRoute 내부, 응답 직전
if (Bun.env.LOG_REQUESTS === "1") {
  console.log(`[control-tower] ${req.method} ${new URL(req.url).pathname} ${response.status} ${Math.round(performance.now() - t0)}ms`);
}
```

`config.ts`에 `logRequests: Bun.env.LOG_REQUESTS === "1"`을 추가하고 그것을 참조한다.

### 4.5 health.route.ts 적용

```ts
export const healthRoutes = {
  "/api/health": { GET: withRoute(() => json({ ... })) },
};
```

## 5. 수용 기준

- [ ] 기존 `json`/`notFound`/`badRequest`/`serverError`/`intParam`의 시그니처와 동작이 그대로다.
- [ ] `forbidden`/`conflict`/`tooLarge`/`page`/`intRange`/`boolParam`/`stringParam`/`withRoute`/`HttpError`가 export 된다.
- [ ] `withRoute`로 감싼 핸들러가 일반 예외를 던지면 500 `{ error }`, `HttpError(409, "x", { currentVersion: "y" })`를 던지면 409 `{ error: "x", currentVersion: "y" }`를 반환한다.
- [ ] `intRange(url, "limit", 50, 1, 500)`이 `limit=9999`에 대해 500을 반환한다.
- [ ] `LOG_REQUESTS=1`일 때만 요청 로그가 찍힌다.
- [ ] `bun test src/lib/http.test.ts` 통과.

## 6. 검증

`src/lib/http.test.ts`가 최소한 다음을 덮는다.

```ts
import { test, expect } from "bun:test";
import { conflict, intRange, boolParam, withRoute, HttpError, page } from "./http";

test("conflict는 extra를 본문에 병합한다", async () => {
  const res = conflict("stale", { currentVersion: "1:2" });
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: "stale", currentVersion: "1:2" });
});

test("intRange는 범위를 clamp 한다", () => {
  const url = new URL("http://x/?limit=9999");
  expect(intRange(url, "limit", 50, 1, 500)).toBe(500);
  expect(intRange(url, "missing", 50, 1, 500)).toBe(50);
});

test("boolParam", () => {
  const url = new URL("http://x/?a=1&b=true&c=0");
  expect(boolParam(url, "a", false)).toBe(true);
  expect(boolParam(url, "b", false)).toBe(true);
  expect(boolParam(url, "c", true)).toBe(false);
  expect(boolParam(url, "d", true)).toBe(true);
});

test("withRoute가 HttpError를 상태 코드로 변환한다", async () => {
  const handler = withRoute(() => { throw new HttpError(403, "nope"); });
  const res = await handler(new Request("http://x/"));
  expect(res.status).toBe(403);
});

test("withRoute가 일반 예외를 500으로 변환한다", async () => {
  const handler = withRoute(() => { throw new Error("boom"); });
  expect((await handler(new Request("http://x/"))).status).toBe(500);
});

test("page 봉투", async () => {
  expect(await page([1, 2], 10, 0, 2).json()).toEqual({ total: 10, offset: 0, limit: 2, items: [1, 2] });
});
```

```bash
bun test src/lib/http.test.ts
bunx tsc --noEmit
```

## 7. 완료 처리

1. `docs/CONVENTIONS.md` §7/§8 — `withRoute` + `HttpError` 사용을 명시하고, 목록 봉투/상태 코드 표를 확정.
2. `docs/STRUCTURE.md` — `src/lib/http.ts` 항목을 `✅`로, `src/lib/http.test.ts` 추가, `LOG_REQUESTS` 환경변수 추가.
3. `docs/ENDPOINTS.md` — 공통 규약 절의 상태 코드 표가 구현과 일치하는지 확인.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-002`
