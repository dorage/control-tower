import { intRange, page, stringParam, withRoute } from "../lib/http";
import { getHistory } from "../services/history.service";

export const historyRoutes = {
  "/api/history": {
    GET: withRoute(async (req: Request) => {
      const url = new URL(req.url);
      const limit = intRange(url, "limit", 100, 1, 1000);
      // history.jsonl 의 project 는 절대경로다. projectId(디렉터리명)와 혼동하지 않도록 이름을 나눈다.
      const entries = await getHistory({
        projectPath: stringParam(url, "project"),
        sessionId: stringParam(url, "sessionId"),
        limit,
      });
      return page(entries, entries.length, 0, limit);
    }),
  },
};
