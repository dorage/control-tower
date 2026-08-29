# T-003 — 세션·프로젝트·통계·히스토리 조회 API

| | |
| --- | --- |
| **ID** | T-003 |
| **우선순위** | P0 |
| **영역** | api-session |
| **선행** | T-001, T-002 |
| **후행** | T-015, T-016, T-017 |

## 1. 목적

이미 구현된 서비스 계층(`session/project/stats/history.service.ts`)을 HTTP로 노출한다. 새 도메인 로직을 만들지 않는다 — 순수하게 얇은 어댑터다.

## 2. 현재 상태 (읽고 시작할 것)

`src/services/session.service.ts`

```ts
listSessions(options?: { projectId?: string|null; query?: string|null; limit?: number; offset?: number })
  : Promise<{ total: number; offset: number; limit: number; sessions: SessionSummary[] }>

getSession(sessionId: string): Promise<SessionSummary | null>

getTimeline(sessionId: string, options?: { limit?: number; offset?: number; includeEvents?: boolean; includeSidechain?: boolean })
  : Promise<Timeline | null>
```

`src/services/project.service.ts` — `listProjects(): Promise<ProjectSummary[]>`
`src/services/stats.service.ts` — `getStats(): Promise<Stats>`
`src/services/history.service.ts` — `getHistory(options?: { projectPath?: string|null; sessionId?: string|null; limit?: number }): Promise<HistoryEntry[]>`

주의: `listSessions`는 `{ ..., sessions }`를 돌려주지만 HTTP 봉투는 `items`다. 라우트에서 `page(result.sessions, result.total, offset, limit)`로 변환한다.

## 3. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/routes/session.route.ts` | `/api/sessions`, `/api/sessions/:id`, `/api/sessions/:id/timeline` |
| `src/routes/project.route.ts` | `/api/projects` |
| `src/routes/stats.route.ts` | `/api/stats` |
| `src/routes/history.route.ts` | `/api/history` |
| `src/routes/index.ts` | 위 4개 모듈 spread 추가 |

## 4. 상세 명세

### 4.1 `GET /api/sessions`

| 파라미터 | 파싱 | 기본 | 범위 |
| --- | --- | --- | --- |
| `projectId` | `stringParam` | null | – |
| `q` | `stringParam` | null | – |
| `limit` | `intRange` | 50 | 1..500 |
| `offset` | `intRange` | 0 | 0..2^31 |

```ts
export const sessionRoutes = {
  "/api/sessions": {
    GET: withRoute(async (req) => {
      const url = new URL(req.url);
      const limit = intRange(url, "limit", 50, 1, 500);
      const offset = intRange(url, "offset", 0, 0, 2_147_483_647);
      const result = await listSessions({
        projectId: stringParam(url, "projectId"),
        query: stringParam(url, "q"),
        limit,
        offset,
      });
      return page(result.sessions, result.total, offset, limit);
    }),
  },
  ...
};
```

### 4.2 `GET /api/sessions/:id`

```ts
"/api/sessions/:id": {
  GET: withRoute(async (req) => {
    const summary = await getSession(req.params.id);
    if (!summary) throw new HttpError(404, `session not found: ${req.params.id}`);
    return json(summary);
  }),
},
```

- `req.params.id`는 URL 디코딩된 값이다. 세션 id는 UUID 형태이므로 추가 정제는 하지 않는다.

### 4.3 `GET /api/sessions/:id/timeline`

| 파라미터 | 파싱 | 기본 | 범위 |
| --- | --- | --- | --- |
| `limit` | `intRange` | 200 | 1..1000 |
| `offset` | `intRange` | 0 | 0..2^31 |
| `events` | `boolParam` | false | – |
| `sidechain` | `boolParam` | true | – |

```ts
const timeline = await getTimeline(req.params.id, {
  limit, offset,
  includeEvents: boolParam(url, "events", false),
  includeSidechain: boolParam(url, "sidechain", true),
});
if (!timeline) throw new HttpError(404, `session not found: ${req.params.id}`);
return json(timeline);
```

`Timeline`은 이미 `{ sessionId, total, offset, limit, entries }` 형태다. 봉투로 감싸지 말고 그대로 반환한다(ENDPOINTS.md와 일치).

### 4.4 `GET /api/projects`

`listProjects()`는 배열을 반환한다. 페이지네이션 파라미터는 라우트에서 적용한다.

| 파라미터 | 기본 | 범위 |
| --- | --- | --- |
| `limit` | 200 | 1..1000 |
| `offset` | 0 | 0.. |

```ts
const all = await listProjects();
return page(all.slice(offset, offset + limit), all.length, offset, limit);
```

### 4.5 `GET /api/stats`

파라미터 없음. `json(await getStats())`.

### 4.6 `GET /api/history`

| 파라미터 | 서비스 인자 | 기본 |
| --- | --- | --- |
| `project` | `projectPath` | null |
| `sessionId` | `sessionId` | null |
| `limit` | `limit` | 100 (1..1000) |

`getHistory`는 배열을 반환한다. `page(entries, entries.length, 0, limit)`로 감싼다. `history.jsonl`의 `project`는 **절대경로**이므로 파라미터 이름을 `project`로 두고 그 값을 그대로 넘긴다(`projectId`와 혼동 금지).

### 4.7 index.ts 등록

```ts
export const routes = {
  ...healthRoutes,
  ...statsRoutes,
  ...projectRoutes,
  ...sessionRoutes,
  ...historyRoutes,
  "/*": index,
};
```

## 5. 수용 기준

- [ ] 6개 엔드포인트가 모두 200을 반환한다(데이터가 비어 있어도 200 + 빈 배열).
- [ ] 존재하지 않는 세션 id에 대해 `/api/sessions/:id`와 `.../timeline`이 404 `{ error }`를 반환한다.
- [ ] `?limit=9999`가 500(sessions) / 1000(timeline)으로 clamp 된다.
- [ ] `?events=1`일 때 타임라인에 `kind: "event"` 엔트리가 나타난다.
- [ ] `?sidechain=0`일 때 `isSidechain: true` 엔트리가 사라진다.
- [ ] 목록 응답이 모두 `{ total, offset, limit, items }` 형태다.
- [ ] 라우트가 repository를 직접 import 하지 않는다.
- [ ] `bunx tsc --noEmit` 통과.

## 6. 검증

```bash
bun run dev & sleep 1
B=localhost:4317
curl -s $B/api/stats | head -c 300; echo
curl -s "$B/api/sessions?limit=2" | head -c 400; echo
SID=$(curl -s "$B/api/sessions?limit=1" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "session=$SID"
curl -s "$B/api/sessions/$SID" | head -c 200; echo
curl -s "$B/api/sessions/$SID/timeline?limit=3" | head -c 400; echo
curl -s "$B/api/sessions/$SID/timeline?limit=3&events=1&sidechain=0" | head -c 200; echo
curl -s -o /dev/null -w '%{http_code}\n' "$B/api/sessions/does-not-exist"   # 404
curl -s "$B/api/projects?limit=3" | head -c 300; echo
curl -s "$B/api/history?limit=3" | head -c 300; echo
kill %1
```

`$CLAUDE_HOME`에 데이터가 없는 환경이라면 `CLAUDE_HOME=/tmp/empty bun run dev`로 띄워 모든 목록이 빈 배열 + 200인지도 확인한다.

## 7. 완료 처리

1. `docs/ENDPOINTS.md` — `/api/stats`, `/api/projects`, `/api/sessions*`, `/api/history`를 `✅`로 바꾸고 실제 파라미터 기본값/범위를 구현과 맞춘다.
2. `docs/STRUCTURE.md` — `src/routes/{session,project,stats,history}.route.ts`를 `✅`로.
3. `docs/CONVENTIONS.md` — 목록은 `page()` 봉투, 단건은 `json()`, 이미 봉투 형태인 도메인 객체(`Timeline`)는 그대로 반환한다는 규칙을 §8에 추가.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-003`
