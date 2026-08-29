import { json, withRoute } from "../lib/http";
import { getStats } from "../services/stats.service";

export const statsRoutes = {
  "/api/stats": {
    GET: withRoute(async () => json(await getStats())),
  },
};
