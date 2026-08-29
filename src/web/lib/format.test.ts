import { test, expect } from "bun:test";
import { bytes, compactNumber, dateTime, duration, relativeTime } from "./format";

const MISSING = "-";

test("compactNumber", () => {
  expect(compactNumber(999)).toBe("999");
  expect(compactNumber(1234)).toBe("1.2K");
  expect(compactNumber(1_234_567)).toBe("1.2M");
});

test("bytes는 1024 기준", () => {
  expect(bytes(0)).toBe("0 B");
  expect(bytes(512)).toBe("512 B");
  expect(bytes(2048)).toBe("2.0 KB");
  expect(bytes(1_572_864)).toBe("1.5 MB");
});

test("duration", () => {
  expect(duration(0)).toBe("0초");
  expect(duration(45_000)).toBe("45초");
  expect(duration(3_725_000)).toBe("1시간 2분");
});

test("relativeTime", () => {
  const now = Date.now();
  expect(relativeTime(now)).toBe("방금");
  expect(relativeTime(now - 3 * 60_000)).toBe("3분 전");
  expect(relativeTime(now - 2 * 3_600_000)).toBe("2시간 전");
  expect(relativeTime(now - 26 * 3_600_000)).toBe("어제");
});

test("dateTime은 분까지 찍는다", () => {
  expect(dateTime(new Date(2026, 7, 29, 14, 3).getTime())).toBe("2026-08-29 14:03");
});

test("잘못된 입력은 던지지 않고 - 를 반환한다", () => {
  for (const value of [null, undefined, "", "nonsense", Number.NaN]) {
    expect(relativeTime(value as never)).toBe(MISSING);
    expect(dateTime(value as never)).toBe(MISSING);
  }
  expect(bytes(Number.NaN)).toBe(MISSING);
  expect(duration(Number.NaN)).toBe(MISSING);
  expect(compactNumber(Number.NaN)).toBe(MISSING);
});
