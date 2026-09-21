import { useEffect, useRef, useState } from "react";
import {
  PUG_FRAME_HOST_PATH,
  parseReadyEvent,
  renderRequest,
} from "../lib/pug-frame-message";
import { Button } from "./ui";

/**
 * ```pug-frame 코드 블록을 화면으로 그린다.
 *
 * 그리는 일은 이 컴포넌트가 하지 않는다. `sandbox="allow-scripts"` iframe 에 호스트 페이지
 * (`/pug-frame`)를 띄우고 소스를 postMessage 로 넘긴다. pug 는 템플릿 안의 JS 를 실행하는
 * 언어라, 마크다운에서 온 소스를 이 창에서 컴파일하면 문서가 앱의 권한으로 코드를 돌리게 된다.
 * 출처가 불투명한 sandbox 안에서는 부모 창도 `/api/*` 도 닿지 않는다(CONVENTIONS §10).
 *
 * iframe 은 한 번 뜨면 내리지 않는다. "원문" 으로 바꿔도 숨기기만 한다 - 다시 띄우면
 * 2MB 스크립트를 다시 평가하고 ready 신호도 다시 기다려야 한다.
 */
export function PugFrameBlock({ source }: { source: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      // 이 블록의 iframe 이 보낸 것만 받는다. 한 문서에 블록이 여럿이면 iframe 도 여럿이다.
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      if (parseReadyEvent(event.data)) setReady(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    // 호스트 출처는 null 이라 targetOrigin 을 좁힐 수 없다. 소스 문자열 외에 담는 것이 없다.
    frameRef.current?.contentWindow?.postMessage(renderRequest(source), "*");
  }, [ready, source]);

  return (
    <div className="md__pug-frame">
      <div className="md__pug-frame-bar">
        <span className="md__pug-frame-label">pug-frame</span>
        <Button variant="ghost" onClick={() => setShowSource((value) => !value)}>
          {showSource ? "화면" : "원문"}
        </Button>
      </div>
      {showSource ? (
        <pre className="md__code md__pug-frame-source code-surface">
          <code className="lang-pug-frame">{source}</code>
        </pre>
      ) : null}
      <iframe
        ref={frameRef}
        className="md__pug-frame-view"
        hidden={showSource}
        src={PUG_FRAME_HOST_PATH}
        sandbox="allow-scripts"
        loading="lazy"
        title="pug-frame 미리보기"
      />
    </div>
  );
}
