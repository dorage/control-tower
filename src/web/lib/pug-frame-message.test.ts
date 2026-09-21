import { test, expect } from "bun:test";
import {
  parseReadyEvent,
  parseRenderRequest,
  readyEvent,
  renderRequest,
} from "./pug-frame-message";

test("renderRequest 는 parseRenderRequest 를 통과한다", () => {
  const source = "mobile#a\n    body\n        div 안녕";
  expect(parseRenderRequest(renderRequest(source))).toEqual({
    type: "pug-frame:render",
    source,
  });
});

test("readyEvent 는 parseReadyEvent 를 통과한다", () => {
  expect(parseReadyEvent(readyEvent())).toEqual({ type: "pug-frame:ready" });
});

test("규약 밖 메시지는 null 이고 던지지 않는다", () => {
  const junk: unknown[] = [
    null,
    undefined,
    "pug-frame:render",
    42,
    [],
    {},
    { type: "pug-frame:render" }, // source 없음
    { type: "pug-frame:render", source: 7 }, // source 가 문자열이 아님
    { type: "pug-frame:ready", source: "x" }, // 반대 방향 메시지
    { type: "webpackOk" }, // 다른 도구가 뿌리는 메시지
  ];
  for (const data of junk) {
    expect(parseRenderRequest(data)).toBeNull();
  }
  for (const data of junk.filter((d) => !(typeof d === "object" && d && "type" in d && d.type === "pug-frame:ready"))) {
    expect(parseReadyEvent(data)).toBeNull();
  }
  expect(parseReadyEvent({ type: "pug-frame:render", source: "x" })).toBeNull();
});

test("parseRenderRequest 는 규약 밖 필드를 흘려보내지 않는다", () => {
  const parsed = parseRenderRequest({ type: "pug-frame:render", source: "s", extra: 1 });
  expect(parsed).toEqual({ type: "pug-frame:render", source: "s" });
});
