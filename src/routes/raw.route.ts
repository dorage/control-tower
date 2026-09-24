/**
 * 워크스페이스 파일을 그대로 내주는 경로. `/api/*` 가 아니라 화면 자원이다(pug-frame 과 같은 분류).
 *
 * `/raw/*` 와일드카드 하나로 받고 경로 해석은 서비스가 한다. `/api/fs/file?root=&path=` 처럼
 * 쿼리로 받지 않는 이유는 raw-url.ts 머리에 있다 — 문서 안의 상대 주소가 문서 URL 을 기준으로
 * 풀려야 옆의 CSS·이미지가 따라온다.
 */
import { withRoute } from "../lib/http";
import { serveRaw } from "../services/raw.service";

export const rawRoutes = {
  "/raw/*": {
    GET: withRoute((req: Request) => serveRaw(new URL(req.url).pathname)),
  },
};
