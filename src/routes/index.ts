import index from "../web/index.html";
import { eventRoutes } from "./events.route";
import { fsRoutes } from "./fs.route";
import { healthRoutes } from "./health.route";
import { historyRoutes } from "./history.route";
import { otlpRoutes } from "./otlp.route";
import { projectRoutes } from "./project.route";
import { pugFrameRoutes } from "./pug-frame.route";
import { sessionRoutes } from "./session.route";
import { statsRoutes } from "./stats.route";
import { systemRoutes } from "./system.route";
import { telemetryRoutes } from "./telemetry.route";
import { workspaceRoutes } from "./workspace.route";

/** 라우트 모듈은 여기서만 조합한다. 새 모듈은 이 파일에만 추가한다. */
export const routes = {
  ...healthRoutes,
  ...systemRoutes,
  ...statsRoutes,
  ...projectRoutes,
  ...sessionRoutes,
  ...historyRoutes,
  ...fsRoutes,
  ...workspaceRoutes,
  ...eventRoutes,
  ...telemetryRoutes,

  // OTLP 수신. /api/* 규약을 따르지 않는다 — otlp.route.ts 의 주석 참조.
  ...otlpRoutes,

  // pug-frame 호스트 페이지와 스크립트. 화면 자원이라 /api 규약 밖이다 - pug-frame.route.ts 참조.
  ...pugFrameRoutes,

  // SPA 폴백. 구체적인 경로가 먼저 매칭되므로 /api/* 를 가리지 않는다.
  "/*": index,
};
