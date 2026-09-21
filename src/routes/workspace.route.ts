import { page, withRoute } from "../lib/http";
import { listRepos } from "../services/workspace.service";

export const workspaceRoutes = {
  /**
   * 저장소 전체를 한 번에 준다. 페이지네이션 파라미터를 받지 않는다 — 워크스페이스에
   * 담긴 저장소는 수십 개 규모라 자를 이유가 없고, 화면은 드롭다운 하나로 전부를 쓴다.
   * 그래도 목록이므로 봉투는 규약대로 씌운다.
   */
  "/api/workspace/repos": {
    GET: withRoute(async () => {
      const items = await listRepos();
      return page(items, items.length, 0, items.length);
    }),
  },
};
