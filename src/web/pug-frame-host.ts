/**
 * pug-frame 호스트. `sandbox="allow-scripts"` iframe 안에서만 돈다.
 *
 * 이 파일은 메인 번들(`main.tsx`)에 들어가지 않는다. `services/pug-frame.service.ts` 가
 * `Bun.build` 로 따로 묶어 `/pug-frame/host.js` 로 내준다. 이유는 둘이다.
 *
 * - `@pug-frame/canvas` 는 pug 컴파일러와 Tailwind 컴파일러를 품어 2MB 가 넘는다. 메인
 *   번들(0.47MB)에 넣으면 pug-frame 블록이 없는 화면도 그만큼 무거워진다. `Bun.serve` 의
 *   HTML import 는 동적 `import()` 를 별도 조각으로 나누지 않는다(실측, T-029).
 * - pug 는 템플릿 안의 JS(`- code`, `#{expr}`)를 **실행하는** 언어다. 마크다운에서 온 소스를
 *   메인 창에서 컴파일하면 문서가 앱의 권한으로 코드를 돌리는 셈이다. 출처가 불투명한 sandbox
 *   iframe 에 가두면 부모 창과 `/api/*` 어느 쪽에도 닿지 못한다.
 *
 * 소스는 부모가 postMessage 로 보낸다. 그리기는 "가장 마지막 것만" 이다 - 타이핑마다
 * 오는 요청을 전부 그리지 않고, 그리는 중에 온 것은 다음 한 번으로 접는다.
 */
import { pugFrameCanvas } from "@pug-frame/canvas";
import { parseRenderRequest, readyEvent } from "./lib/pug-frame-message";

const stage = document.getElementById("stage");
if (!stage) throw new Error("#stage not found");

const canvas = pugFrameCanvas(stage, { controls: true });

let pending: string | null = null;
let drawing = false;

async function drain(): Promise<void> {
  if (drawing) return;
  drawing = true;
  try {
    while (pending !== null) {
      const source = pending;
      pending = null;
      // canvas.render 는 던지지 않는다. 실패는 뷰포트 안에 붉은 안내로 남는다.
      await canvas.render(source);
    }
  } finally {
    drawing = false;
  }
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  // 부모 창이 보낸 것만 받는다. 출처는 확인할 수 없다(우리 자신이 null 출처다).
  if (event.source !== window.parent) return;
  const request = parseRenderRequest(event.data);
  if (!request) return;
  pending = request.source;
  void drain();
});

// 부모는 이 신호를 받고 나서야 소스를 보낸다. 먼저 보내면 아직 듣는 이가 없어 버려진다.
window.parent.postMessage(readyEvent(), "*");
