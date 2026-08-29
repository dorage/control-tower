import { test, expect } from "bun:test";
import {
  boolParam,
  conflict,
  forbidden,
  HttpError,
  intRange,
  page,
  stringParam,
  tooLarge,
  withRoute,
} from "./http";

test("conflict는 extra를 본문에 병합한다", async () => {
  const res = conflict("stale", { currentVersion: "1:2" });
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: "stale", currentVersion: "1:2" });
});

test("forbidden/tooLarge 상태 코드", () => {
  expect(forbidden("nope").status).toBe(403);
  expect(tooLarge("big").status).toBe(413);
});

test("intRange는 범위를 clamp 한다", () => {
  const url = new URL("http://x/?limit=9999&low=-5&junk=abc");
  expect(intRange(url, "limit", 50, 1, 500)).toBe(500);
  expect(intRange(url, "low", 50, 1, 500)).toBe(1);
  expect(intRange(url, "junk", 50, 1, 500)).toBe(50);
  expect(intRange(url, "missing", 50, 1, 500)).toBe(50);
});

test("boolParam", () => {
  const url = new URL("http://x/?a=1&b=true&c=0");
  expect(boolParam(url, "a", false)).toBe(true);
  expect(boolParam(url, "b", false)).toBe(true);
  expect(boolParam(url, "c", true)).toBe(false);
  expect(boolParam(url, "d", true)).toBe(true);
});

test("stringParam은 빈 문자열을 null로 본다", () => {
  const url = new URL("http://x/?a=x&b=");
  expect(stringParam(url, "a")).toBe("x");
  expect(stringParam(url, "b")).toBeNull();
  expect(stringParam(url, "c")).toBeNull();
});

test("withRoute가 HttpError를 상태 코드로 변환한다", async () => {
  const handler = withRoute(() => {
    throw new HttpError(403, "nope");
  });
  const res = await handler(new Request("http://x/"));
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: "nope" });
});

test("withRoute가 HttpError의 extra를 본문에 병합한다", async () => {
  const handler = withRoute(() => {
    throw new HttpError(409, "stale", { currentVersion: "1:2" });
  });
  const res = await handler(new Request("http://x/"));
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: "stale", currentVersion: "1:2" });
});

test("withRoute가 일반 예외를 500으로 변환한다", async () => {
  const handler = withRoute(() => {
    throw new Error("boom");
  });
  expect((await handler(new Request("http://x/"))).status).toBe(500);
});

test("page 봉투", async () => {
  expect(await page([1, 2], 10, 0, 2).json()).toEqual({ total: 10, offset: 0, limit: 2, items: [1, 2] });
});

test("json은 no-store 헤더를 붙인다", () => {
  expect(page([], 0, 0, 0).headers.get("cache-control")).toBe("no-store");
});
