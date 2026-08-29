import { intRange, page, withRoute } from "../lib/http";
import { listProjects } from "../services/project.service";

export const projectRoutes = {
  "/api/projects": {
    GET: withRoute(async (req: Request) => {
      const url = new URL(req.url);
      const limit = intRange(url, "limit", 200, 1, 1000);
      const offset = intRange(url, "offset", 0, 0, 2_147_483_647);
      // 프로젝트 수는 수백 단위라 전부 만든 뒤 잘라도 된다.
      const all = await listProjects();
      return page(all.slice(offset, offset + limit), all.length, offset, limit);
    }),
  },
};
