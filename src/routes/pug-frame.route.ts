/**
 * pug-frame 호스트 페이지와 스크립트. `/api/*` 가 아니라 화면 자원이다.
 *
 * `/pug-frame/host.js` 에는 `Access-Control-Allow-Origin: *` 가 붙는다. 이 스크립트를 읽는
 * 쪽은 `sandbox="allow-scripts"` iframe 이라 출처가 `null` 이고, 모듈 스크립트는 언제나 CORS
 * 모드로 받으므로 이 헤더가 없으면 로드가 거부된다. 스크립트는 공개 저장소의 패키지 코드와
 * 우리 호스트 코드뿐이라 누구에게 보여도 새는 것이 없다.
 */
import { withRoute } from "../lib/http";
import { hostBundle, hostPage } from "../services/pug-frame.service";
import { PUG_FRAME_HOST_PATH, PUG_FRAME_HOST_SCRIPT_PATH } from "../web/lib/pug-frame-message";

export const pugFrameRoutes = {
  [PUG_FRAME_HOST_PATH]: {
    GET: withRoute(
      () =>
        new Response(hostPage(), {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        }),
    ),
  },
  [PUG_FRAME_HOST_SCRIPT_PATH]: {
    GET: withRoute(async (req) => {
      const bundle = await hostBundle();
      const headers = {
        "content-type": "text/javascript; charset=utf-8",
        "access-control-allow-origin": "*",
        // 2MB 다. 매번 받지 않게 재검증만 시킨다.
        "cache-control": "no-cache",
        etag: bundle.etag,
      };
      if (req.headers.get("if-none-match") === bundle.etag) {
        return new Response(null, { status: 304, headers });
      }
      return new Response(bundle.code, { headers });
    }),
  },
};
