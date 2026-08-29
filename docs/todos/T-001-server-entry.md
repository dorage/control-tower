# T-001 — Bun.serve 진입점과 라우트 컴포지션

| | |
| --- | --- |
| **ID** | T-001 |
| **우선순위** | P0 |
| **영역** | core |
| **선행** | 없음 |
| **후행** | T-002, T-003, T-004, T-006~T-008, T-009 |

## 1. 목적

`Bun.serve()` 하나로 API와 SPA를 함께 서빙하는 서버를 띄운다. 라우트 모듈을 조합하는 방식을 확정해 이후 모든 라우트 작업이 같은 패턴을 따르게 한다.

## 2. 현재 상태

- `index.ts`는 `console.log("Hello via Bun!")` 스텁이다.
- `src/routes/`, `src/web/`은 비어 있다.
- `src/config.ts`에 `port`, `hostname`, `claudeDir`가 이미 정의돼 있다.
- `src/lib/http.ts`에 `json`, `notFound`, `badRequest`, `serverError`, `intParam`이 있다.

## 3. 산출물

| 파일 | 동작 |
| --- | --- |
| `index.ts` | 교체. 서버 기동 |
| `src/routes/index.ts` | 신규. 라우트 객체 컴포지션 |
| `src/routes/health.route.ts` | 신규. `/api/health` |
| `src/web/index.html` | 신규(플레이스홀더). T-009에서 확장 |
| `package.json` | `scripts` 추가 |

## 4. 상세 명세

### 4.1 라우트 모듈 패턴

각 라우트 모듈은 **경로 → 핸들러 레코드**를 named export 한다. Bun.serve의 `routes` 옵션에 그대로 펼쳐 넣을 수 있는 형태다.

```ts
// src/routes/health.route.ts
import { json } from "../lib/http";
import { config } from "../config";

const startedAt = Date.now();

export const healthRoutes = {
  "/api/health": {
    GET: () =>
      json({
        ok: true,
        uptimeMs: Date.now() - startedAt,
        version: "0.1.0",
        claudeDir: config.claudeDir,
      }),
  },
};
```

- 메서드별 객체(`{ GET: ..., PUT: ... }`)를 쓴다. 함수를 직접 주면 모든 메서드를 받게 되므로 쓰지 않는다. 명시하지 않은 메서드는 Bun이 405를 반환한다.
- 경로 파라미터는 `req.params.<name>`으로 읽는다. (예: `"/api/sessions/:id": { GET: (req) => ... }`)

### 4.2 컴포지션

```ts
// src/routes/index.ts
import index from "../web/index.html";
import { healthRoutes } from "./health.route";

export const routes = {
  ...healthRoutes,
  // 이후 작업에서 여기에 추가한다:
  // ...sessionRoutes, ...projectRoutes, ...statsRoutes,
  // ...historyRoutes, ...eventRoutes, ...fsRoutes,

  // SPA 폴백. 구체적인 경로가 먼저 매칭되므로 /api/* 를 가리지 않는다.
  "/*": index,
};
```

- `import index from "../web/index.html"`는 Bun의 HTML import다. 번들링·해싱·개발 중 HMR을 Bun이 처리한다.
- 새 라우트 모듈을 추가할 때 **반드시 이 파일에만** 손댄다.

### 4.3 진입점

```ts
// index.ts
import { config } from "./src/config";
import { routes } from "./src/routes";

const server = Bun.serve({
  port: config.port,
  hostname: config.hostname,
  routes,
  development: { hmr: true, console: true },
  error(error) {
    console.error("[control-tower]", error);
    return Response.json({ error: "internal error" }, { status: 500 });
  },
});

console.log(`[control-tower] listening on http://${server.hostname}:${server.port}`);
console.log(`[control-tower] watching ${config.claudeDir}`);
```

- `development`는 `Bun.env.NODE_ENV === "production"`이면 `false`가 되도록 한다:
  `development: Bun.env.NODE_ENV === "production" ? false : { hmr: true, console: true }`
- 매칭되는 라우트가 없을 때를 위한 `fetch` 폴백은 두지 않는다. `"/*"`가 모두 흡수한다.

### 4.4 플레이스홀더 HTML

T-009가 대체할 최소 골격. 지금은 스크립트를 붙이지 않는다.

```html
<!-- src/web/index.html -->
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>control tower</title>
  </head>
  <body>
    <div id="root">loading…</div>
  </body>
</html>
```

### 4.5 package.json scripts

```json
"scripts": {
  "dev": "bun --hot index.ts",
  "start": "bun index.ts",
  "typecheck": "tsc --noEmit"
}
```

`bun test`는 Bun 내장이므로 스크립트를 만들지 않는다.

## 5. 수용 기준

- [ ] `bun run dev`로 서버가 뜨고 리슨 주소가 로그에 찍힌다.
- [ ] `GET /api/health`가 200과 `{ ok: true, uptimeMs, version, claudeDir }`을 반환한다.
- [ ] `POST /api/health`가 405를 반환한다.
- [ ] `GET /`가 HTML을 반환하고 `<div id="root">`를 포함한다.
- [ ] `GET /아무경로`도 같은 HTML을 반환한다(SPA 폴백).
- [ ] `PORT=5000 bun run start`가 5000 포트에서 뜬다.
- [ ] `bunx tsc --noEmit` 통과.

## 6. 검증

```bash
bun run dev &
sleep 1
curl -s localhost:4317/api/health | head -c 200; echo
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:4317/api/health   # 405
curl -s localhost:4317/ | grep -q 'id="root"' && echo "spa ok"
curl -s localhost:4317/sessions/abc | grep -q 'id="root"' && echo "fallback ok"
kill %1
bunx tsc --noEmit
```

## 7. 완료 처리

1. `docs/STRUCTURE.md` — `index.ts`, `src/routes/*`, `src/web/index.html`을 `✅`로 바꾸고 `scripts` 추가 반영.
2. `docs/ENDPOINTS.md` — `/api/health`, `/`, `/*`를 `✅`로.
3. `docs/CONVENTIONS.md` — "라우트 모듈은 경로→핸들러 레코드를 named export 하고 `src/routes/index.ts`에서만 조합한다"를 §5에 추가.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-001`
