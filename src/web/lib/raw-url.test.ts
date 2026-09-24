import { test, expect } from "bun:test";
import { parseRawPath, rawUrl } from "./raw-url";

test("경로 구분자만 남기고 조각을 이스케이프한다", () => {
  expect(rawUrl("work", "site/index.html")).toBe("/raw/work/site/index.html");
  expect(rawUrl("work", "a b/c#d/e?f.html")).toBe("/raw/work/a%20b/c%23d/e%3Ff.html");
  expect(rawUrl("work", "/leading/slash.html")).toBe("/raw/work/leading/slash.html");
});

test("조립한 주소를 해석하면 원래 (root, path) 로 돌아온다", () => {
  const cases: Array<[string, string]> = [
    ["work", "index.html"],
    ["work-2", "docs/한글 폴더/그림 %.png"],
    ["r", "a b/c#d/e?f.html"],
    ["r", "100%/x.css"],
  ];
  for (const [root, path] of cases) {
    const url = rawUrl(root, path);
    const parsed = parseRawPath(new URL(url, "http://x").pathname);
    expect(parsed).toEqual({ root, path });
  }
});

test("형식이 아니면 null 이다", () => {
  expect(parseRawPath("/api/fs/file")).toBeNull();
  expect(parseRawPath("/raw/")).toBeNull();
  expect(parseRawPath("/raw/work")).toBeNull();
  expect(parseRawPath("/raw/work/")).toBeNull();
  // 잘못된 퍼센트 시퀀스
  expect(parseRawPath("/raw/work/%E0%A4%A")).toBeNull();
});

test("디코딩된 조각에 든 구분자는 위조로 보고 거절한다", () => {
  expect(parseRawPath("/raw/work/a%2Fb.html")).toBeNull();
  expect(parseRawPath("/raw/wo%2Frk/a.html")).toBeNull();
});

test("빈 조각(연속 슬래시)은 무시하고 나머지는 그대로 잇는다", () => {
  expect(parseRawPath("/raw/work//a//b.html")).toEqual({ root: "work", path: "a/b.html" });
});

test("탈출 시도는 해석 단계에서 막지 않는다 - resolvePath 의 일이다", () => {
  expect(parseRawPath("/raw/work/../x")).toEqual({ root: "work", path: "../x" });
  expect(parseRawPath("/raw/work/%2e%2e/x")).toEqual({ root: "work", path: "../x" });
});
