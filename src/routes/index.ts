import index from "../web/index.html";
import { fsRoutes } from "./fs.route";
import { healthRoutes } from "./health.route";
import { historyRoutes } from "./history.route";
import { projectRoutes } from "./project.route";
import { sessionRoutes } from "./session.route";
import { statsRoutes } from "./stats.route";

/** 라우트 모듈은 여기서만 조합한다. 새 모듈은 이 파일에만 추가한다. */
export const routes = {
  ...healthRoutes,
  ...statsRoutes,
  ...projectRoutes,
  ...sessionRoutes,
  ...historyRoutes,
  ...fsRoutes,

  // SPA 폴백. 구체적인 경로가 먼저 매칭되므로 /api/* 를 가리지 않는다.
  "/*": index,
};
