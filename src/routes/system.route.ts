import { intRange, json, withRoute } from "../lib/http";
import { getSystemMetrics, MAX_TOP } from "../services/system.service";

export const systemRoutes = {
  "/api/system": {
    GET: withRoute(async (req: Request) => {
      const limit = intRange(new URL(req.url), "limit", 20, 1, MAX_TOP);
      const metrics = await getSystemMetrics(limit);
      // 목록 봉투를 씌우지 않는다. 목록 두 개가 딸린 단건 스냅샷이지 목록 응답이 아니다.
      return json({
        ...metrics,
        topByCpu: metrics.topByCpu.slice(0, limit),
        topByMemory: metrics.topByMemory.slice(0, limit),
      });
    }),
  },
};
