import { test, expect } from "bun:test";
import { quickLinkHref } from "./quick-links";

test("지금 페이지를 연 호스트를 그대로 쓰고 포트만 갈아끼운다", () => {
  expect(quickLinkHref({ label: "FreshRSS", port: 8080 }, { protocol: "http:", hostname: "100.64.0.1" })).toBe(
    "http://100.64.0.1:8080",
  );
  expect(quickLinkHref({ label: "FreshRSS", port: 8080 }, { protocol: "http:", hostname: "localhost" })).toBe(
    "http://localhost:8080",
  );
});

test("https 로 연 페이지의 바로가기는 https 를 유지한다", () => {
  expect(quickLinkHref({ label: "X", port: 9000 }, { protocol: "https:", hostname: "pi.ts.net" })).toBe(
    "https://pi.ts.net:9000",
  );
});

/** file:// 로 열린 경우까지 따라가면 `file://host:8080` 같은 깨진 주소가 나온다. */
test("http/https 가 아니면 http 로 떨어뜨린다", () => {
  expect(quickLinkHref({ label: "X", port: 8080 }, { protocol: "file:", hostname: "" })).toBe("http://:8080");
});

test("서브경로가 있으면 포트 뒤에 붙인다", () => {
  expect(
    quickLinkHref({ label: "X", port: 8080, path: "/i/" }, { protocol: "http:", hostname: "100.64.0.1" }),
  ).toBe("http://100.64.0.1:8080/i/");
});
