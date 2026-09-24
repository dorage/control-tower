import { rawUrl } from "../lib/raw-url";

/**
 * HTML 파일을 격리된 iframe 에서 그린다(T-031). `/files` 와 `/workspace` 의 뷰어가 미리보기 탭에서 쓴다.
 *
 * `srcdoc` 이 아니라 `/raw/<root>/<path>` 를 `src` 로 연다. 문서 안의 상대 주소(`./style.css`,
 * `img/a.png`)가 문서 URL 기준으로 풀려야 옆에 둔 파일이 같이 뜨기 때문이다. 대가로 미리보기는
 * **디스크의 내용**이다 — HTML 은 쓰기 허용 확장자가 아니라(기본 `.md` 만) 편집 중인 초안이
 * 있을 수 없으므로 어긋날 것이 없다.
 *
 * `sandbox` 에 `allow-same-origin` 을 **넣지 않는다.** 그러면 문서의 출처가 불투명해져 부모 창의
 * localStorage 도, 이 서버의 `/api/*` 도 부를 수 없다. 워크스페이스의 HTML 은 남의 저장소에서
 * 왔을 수도 있고 LLM 이 만든 것일 수도 있어, 앱의 권한으로 돌게 두지 않는다 — pug-frame 호스트와
 * 같은 판단이다. 플래그 목록은 서버가 붙이는 CSP `sandbox` 헤더(raw.service)와 같게 유지한다.
 *
 * 알려진 한계: 출처가 불투명하면 `<script type="module" src="./x.js">` 와 문서 안 `fetch()` 는
 * CORS 로 거절된다(같은 서버인데도 교차 출처가 된다). 인라인 스크립트, 일반 `<script src>`,
 * CDN 스크립트, CSS, 이미지는 정상이다. 이 서버가 raw 응답에 `Access-Control-Allow-Origin: *`
 * 를 붙이면 풀리지만, 그러면 브라우저의 다른 사이트가 이 사용자의 파일을 읽어 갈 수 있어 하지 않는다.
 *
 * `version` 을 key 로 삼아 디스크가 바뀌면(뷰어가 다시 읽어 version 이 달라지면) iframe 을 새로 만든다.
 * `src` 가 같으면 React 가 속성을 다시 쓰지 않아 iframe 이 재로드되지 않는다.
 */
export function HtmlPreview({ root, path, version }: { root: string; path: string; version: string }) {
  return (
    <iframe
      key={version}
      className="html-preview"
      src={rawUrl(root, path)}
      sandbox="allow-scripts allow-forms allow-popups allow-modals"
      title={`${path} 미리보기`}
    />
  );
}
