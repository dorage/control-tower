import { boolParam, HttpError, intRange, json, page, stringParam, withRoute } from "../lib/http";
import { getSession, getTimeline, listSessions } from "../services/session.service";

/** offset 의 상한. 32비트 정수를 넘기면 서비스 쪽 slice 가 의미를 잃는다. */
const MAX_OFFSET = 2_147_483_647;

export const sessionRoutes = {
  "/api/sessions": {
    GET: withRoute(async (req: Request) => {
      const url = new URL(req.url);
      const limit = intRange(url, "limit", 50, 1, 500);
      const offset = intRange(url, "offset", 0, 0, MAX_OFFSET);
      const result = await listSessions({
        projectId: stringParam(url, "projectId"),
        query: stringParam(url, "q"),
        limit,
        offset,
      });
      // 서비스는 `sessions`, HTTP 봉투는 `items` 다. 변환은 여기서만 한다.
      return page(result.sessions, result.total, offset, limit);
    }),
  },

  "/api/sessions/:id": {
    GET: withRoute(async (req: Bun.BunRequest<"/api/sessions/:id">) => {
      const summary = await getSession(req.params.id);
      if (!summary) throw new HttpError(404, `session not found: ${req.params.id}`);
      return json(summary);
    }),
  },

  "/api/sessions/:id/timeline": {
    GET: withRoute(async (req: Bun.BunRequest<"/api/sessions/:id/timeline">) => {
      const url = new URL(req.url);
      const timeline = await getTimeline(req.params.id, {
        limit: intRange(url, "limit", 200, 1, 1000),
        offset: intRange(url, "offset", 0, 0, MAX_OFFSET),
        includeEvents: boolParam(url, "events", false),
        includeSidechain: boolParam(url, "sidechain", false),
        includeThinking: boolParam(url, "thinking", false),
        includeTools: boolParam(url, "tools", false),
      });
      if (!timeline) throw new HttpError(404, `session not found: ${req.params.id}`);
      // Timeline 은 이미 { total, offset, limit, entries } 봉투다. 다시 감싸지 않는다.
      return json(timeline);
    }),
  },
};
