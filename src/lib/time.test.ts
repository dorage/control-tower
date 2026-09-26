import { test, expect } from "bun:test";
import { formatTimestamp, KST } from "./time";

test("KST 로 YYYY-MM-DD HH:MM:SS 를 만든다 - UTC 자정은 KST 09시", () => {
  expect(formatTimestamp(new Date("2026-09-26T00:00:00Z"), KST)).toBe("2026-09-26 09:00:00");
});

test("날짜 경계를 넘긴다 - UTC 15시 이후는 KST 다음 날", () => {
  expect(formatTimestamp(new Date("2026-12-31T15:30:05Z"), KST)).toBe("2027-01-01 00:30:05");
});

test("한 자리 값은 0 으로 채운다", () => {
  expect(formatTimestamp(new Date("2026-01-02T03:04:05Z"), "UTC")).toBe("2026-01-02 03:04:05");
});
