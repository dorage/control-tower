import index from "../web/index.html";
import { healthRoutes } from "./health.route";

/** 라우트 모듈은 여기서만 조합한다. 새 모듈은 이 파일에만 추가한다. */
export const routes = {
  ...healthRoutes,

  // SPA 폴백. 구체적인 경로가 먼저 매칭되므로 /api/* 를 가리지 않는다.
  "/*": index,
};
