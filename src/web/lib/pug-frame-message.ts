/**
 * 미리보기(부모 창)와 pug-frame 호스트(sandbox iframe) 사이의 postMessage 규약.
 *
 * 호스트는 `sandbox="allow-scripts"` 만 가진 iframe 이라 출처(origin)가 불투명(`null`)이다.
 * 그래서 양쪽 모두 `targetOrigin` 을 `"*"` 로 보내고, 출처 대신 **보낸 창(`event.source`)** 이
 * 기대한 창인지로 상대를 가린다. 그 위에서 데이터는 `unknown` 으로 받아 여기서 좁힌다.
 *
 * 이 파일은 부모 번들과 호스트 번들 양쪽에 들어간다. 브라우저 API 를 쓰지 않는다 - 테스트가
 * `bun test` 에서 그대로 돌아야 한다.
 */

/** 호스트 페이지 경로. 미리보기가 iframe 의 `src` 로 쓴다. */
export const PUG_FRAME_HOST_PATH = "/pug-frame";
/** 호스트 스크립트 경로. 호스트 페이지가 `<script type="module">` 로 읽는다. */
export const PUG_FRAME_HOST_SCRIPT_PATH = "/pug-frame/host.js";

/** 부모 → 호스트. 이 소스를 그려라. */
export interface PugFrameRenderRequest {
  type: "pug-frame:render";
  source: string;
}

/** 호스트 → 부모. 스크립트가 떠서 메시지를 받을 준비가 됐다. */
export interface PugFrameReadyEvent {
  type: "pug-frame:ready";
}

export function renderRequest(source: string): PugFrameRenderRequest {
  return { type: "pug-frame:render", source };
}

export function readyEvent(): PugFrameReadyEvent {
  return { type: "pug-frame:ready" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 호스트가 받은 메시지를 좁힌다. 규약에 맞지 않으면 `null` - 던지지 않는다. */
export function parseRenderRequest(data: unknown): PugFrameRenderRequest | null {
  if (!isRecord(data)) return null;
  if (data.type !== "pug-frame:render") return null;
  if (typeof data.source !== "string") return null;
  return { type: "pug-frame:render", source: data.source };
}

/** 부모가 받은 메시지를 좁힌다. 규약에 맞지 않으면 `null` - 던지지 않는다. */
export function parseReadyEvent(data: unknown): PugFrameReadyEvent | null {
  if (!isRecord(data)) return null;
  if (data.type !== "pug-frame:ready") return null;
  return { type: "pug-frame:ready" };
}
