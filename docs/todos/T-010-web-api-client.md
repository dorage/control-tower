# T-010 — API 클라이언트와 데이터 훅

| | |
| --- | --- |
| **ID** | T-010 |
| **우선순위** | P0 |
| **영역** | web-core |
| **선행** | T-003, T-006, T-007, T-008, T-009 |
| **후행** | T-011 ~ T-018 |

## 1. 목적

화면들이 `fetch`를 각자 부르지 않게 한다. 엔드포인트 호출·에러 변환·로딩 상태를 두 파일로 모은다. 서버 타입은 **재정의하지 않고** `src/domain/types.ts`에서 `import type`으로 가져온다.

## 2. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/web/lib/api.ts` | fetch 래퍼 + 엔드포인트별 함수 |
| `src/web/lib/format.ts` | 숫자/시간/바이트 포맷터 |
| `src/web/hooks/use-query.ts` | 비동기 로딩 훅 |
| `src/web/lib/format.test.ts` | 포맷터 테스트 |

## 3. 상세 명세

### 3.1 `api.ts` — 기반

```ts
import type {
  SessionSummary, ProjectSummary, Stats, Timeline, HistoryEntry,
  FsRoot, FsEntry, FsFile, FsWriteResult,
} from "../../domain/types";

export interface Page<T> { total: number; offset: number; limit: number; items: T[] }

/** 서버가 준 상태 코드와 추가 필드를 보존하는 에러. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail: Record<string, unknown> = {},
  ) { super(message); this.name = "ApiError"; }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { accept: "application/json", ...(init?.headers ?? {}) },
  });

  const text = await response.text();
  let body: unknown = null;
  if (text) { try { body = JSON.parse(text); } catch { /* 비-JSON 응답 */ } }

  if (!response.ok) {
    const record = (body ?? {}) as Record<string, unknown>;
    const message = typeof record.error === "string" ? record.error : `${response.status} ${response.statusText}`;
    throw new ApiError(response.status, message, record);
  }
  return body as T;
}

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}
```

- `query()`가 `URLSearchParams`로 인코딩하므로 `path`에 `/`나 공백이 들어가도 안전하다. **문자열 템플릿으로 쿼리를 직접 조립하지 않는다.**
- `path` 값이 빈 문자열("루트 자신")인 경우가 있는데, 위 `query()`는 빈 문자열을 생략한다. 이는 서버 기본값(`""`)과 같으므로 문제 없다.

### 3.2 `api.ts` — 엔드포인트

```ts
export const api = {
  health: () => request<{ ok: boolean; uptimeMs: number; version: string; claudeDir: string }>("/api/health"),

  stats: () => request<Stats>("/api/stats"),

  projects: (opts: { limit?: number; offset?: number } = {}) =>
    request<Page<ProjectSummary>>(`/api/projects${query(opts)}`),

  sessions: (opts: { projectId?: string | null; q?: string | null; limit?: number; offset?: number } = {}) =>
    request<Page<SessionSummary>>(`/api/sessions${query(opts)}`),

  session: (id: string) =>
    request<SessionSummary>(`/api/sessions/${encodeURIComponent(id)}`),

  timeline: (id: string, opts: { limit?: number; offset?: number; events?: boolean; sidechain?: boolean } = {}) =>
    request<Timeline>(`/api/sessions/${encodeURIComponent(id)}/timeline${query(opts)}`),

  history: (opts: { project?: string | null; sessionId?: string | null; limit?: number } = {}) =>
    request<Page<HistoryEntry>>(`/api/history${query(opts)}`),

  fsRoots: () => request<{ items: FsRoot[] }>("/api/fs/roots"),

  fsList: (root: string, path: string, opts: { hidden?: boolean } = {}) =>
    request<{ root: string; path: string; parent: string | null; items: FsEntry[] }>(
      `/api/fs/list${query({ root, path, ...opts })}`),

  fsTree: (root: string, path: string, opts: { depth?: number; hidden?: boolean } = {}) =>
    request<FsEntry>(`/api/fs/tree${query({ root, path, ...opts })}`),

  fsFile: (root: string, path: string) =>
    request<FsFile>(`/api/fs/file${query({ root, path })}`),

  fsSave: (input: { root: string; path: string; content: string; baseVersion?: string; createIfMissing?: boolean }) =>
    request<FsWriteResult>("/api/fs/file", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
};
```

세션 id에 `/`가 들어갈 일은 없지만 `encodeURIComponent`를 습관적으로 건다.

### 3.3 `use-query.ts`

```ts
export interface QueryState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  /** 캐시된 data 를 유지한 채 다시 불러온다. */
  reload: () => void;
}

/**
 * deps 가 바뀌면 다시 실행한다. 이전 요청의 늦은 응답은 버린다.
 * fetcher 는 deps 로만 바뀌어야 한다 — 렌더마다 새로 만든 함수를 넣어도
 * deps 가 같으면 재실행하지 않는다.
 */
export function useQuery<T>(fetcher: () => Promise<T>, deps: unknown[]): QueryState<T>;
```

구현 요점:

1. `useState`로 `{ data, error, loading }`을 하나의 객체로 관리한다(부분 갱신 시 상태 불일치를 막는다).
2. `fetcher`는 `useRef`에 담아 최신 값을 쓰되, `useEffect`의 deps에는 넣지 않는다. deps는 호출자가 준 `deps`와 `reloadToken`뿐이다.
3. **경쟁 상태 처리**: effect마다 `let cancelled = false`를 두고 cleanup에서 `true`로 만든다. 응답 처리 전에 `if (cancelled) return`.
4. `reload()`는 `setReloadToken((n) => n + 1)`. 이때 `data`를 지우지 않는다(깜빡임 방지). `loading`만 true로 만든다.
5. 첫 로드에서는 `loading: true`, `data: null`로 시작한다.

이 훅은 캐시/중복 제거를 하지 않는다. 로컬 도구이고 요청이 싸다. React Query 같은 라이브러리를 추가하지 않는다(CONVENTIONS §2).

### 3.4 `format.ts`

```ts
/** 1234567 -> "1.2M", 1234 -> "1.2K", 999 -> "999" */
export function compactNumber(value: number): string;

/** 2048 -> "2.0 KB", 1536000 -> "1.5 MB". 1000 이 아니라 1024 기준. */
export function bytes(value: number): string;

/** 3_725_000 -> "1시간 2분", 45_000 -> "45초", 0 -> "0초" */
export function duration(ms: number): string;

/** ISO 또는 epoch ms -> "방금", "3분 전", "2시간 전", "어제", "3월 4일" */
export function relativeTime(value: string | number | null | undefined): string;

/** ISO 또는 epoch ms -> "2026-08-29 14:03" (로컬 시간). null 이면 "-" */
export function dateTime(value: string | number | null | undefined): string;
```

- 잘못된 입력(`null`, `""`, `NaN`, 파싱 불가한 문자열)에 대해 **던지지 않고** `"-"`를 반환한다. 세션 데이터에는 타임스탬프가 없는 레코드가 흔하다.
- `relativeTime`은 7일이 넘으면 절대 날짜로 넘어간다.
- 로케일 하드코딩 대신 `Intl.NumberFormat`/`Intl.DateTimeFormat`를 쓰되, 상대 시간 문구는 한국어 고정으로 직접 만든다.

## 4. 수용 기준

- [ ] `api.*` 함수들이 `src/domain/types.ts`의 타입을 재사용한다(웹 쪽에 중복 인터페이스 정의가 없다).
- [ ] 404 응답이 `ApiError`로 던져지고 `status === 404`, `message`가 서버의 `error` 문자열이다.
- [ ] 409 응답의 `currentVersion`이 `error.detail.currentVersion`으로 읽힌다.
- [ ] 비-JSON 500 응답에서도 `ApiError`가 던져지고 앱이 죽지 않는다.
- [ ] `useQuery`의 deps를 빠르게 연속 변경해도 마지막 요청 결과만 반영된다.
- [ ] `reload()`가 기존 `data`를 유지한 채 `loading`을 true로 만든다.
- [ ] `format.*`이 `null`/`NaN`/빈 문자열에 대해 `"-"`를 반환하고 던지지 않는다.
- [ ] `bun test src/web/lib/format.test.ts` 통과, `bunx tsc --noEmit` 통과.

## 5. 검증

```ts
// src/web/lib/format.test.ts
import { test, expect } from "bun:test";
import { compactNumber, bytes, duration, relativeTime, dateTime } from "./format";

test("compactNumber", () => {
  expect(compactNumber(999)).toBe("999");
  expect(compactNumber(1234)).toBe("1.2K");
  expect(compactNumber(1_234_567)).toBe("1.2M");
});

test("bytes는 1024 기준", () => {
  expect(bytes(0)).toBe("0 B");
  expect(bytes(2048)).toBe("2.0 KB");
});

test("duration", () => {
  expect(duration(45_000)).toBe("45초");
  expect(duration(3_725_000)).toBe("1시간 2분");
});

test("잘못된 입력은 던지지 않고 - 를 반환한다", () => {
  for (const value of [null, undefined, "", "nonsense", Number.NaN]) {
    expect(relativeTime(value as never)).toBe("-");
    expect(dateTime(value as never)).toBe("-");
  }
});
```

경쟁 상태는 브라우저에서 확인한다: 세션 목록 검색창에 빠르게 타이핑했을 때 마지막 질의 결과만 남는지 본다(T-015 이후).

```bash
bun test src/web/lib/format.test.ts
bunx tsc --noEmit
```

## 6. 완료 처리

1. `docs/STRUCTURE.md` — `src/web/lib/{api,format}.ts`, `src/web/hooks/use-query.ts`를 `✅`로.
2. `docs/CONVENTIONS.md` §10 — "브라우저는 서버 타입을 `import type`으로 재사용한다", "데이터 페칭은 `useQuery` 한 곳", "쿼리 문자열은 `URLSearchParams`로만 조립" 규칙 추가.
3. `docs/ENDPOINTS.md` — 클라이언트가 기대하는 응답 형태와 실제 명세가 어긋나면 명세를 고친다.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-010`
