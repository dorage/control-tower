import { test, expect } from "bun:test";
import { decodeProjectId, parseJsonl, stripAnsi, truncate } from "./text";

const ESC = String.fromCharCode(27);

// ---------------------------------------------------------------- stripAnsi

test("stripAnsi 가 색상 시퀀스를 제거한다", () => {
  expect(stripAnsi(`${ESC}[31mred${ESC}[0m`)).toBe("red");
});

test("stripAnsi 는 평문을 건드리지 않는다", () => {
  expect(stripAnsi("plain text — 한글 🎉")).toBe("plain text — 한글 🎉");
});

test("stripAnsi 가 커서·지우기 시퀀스도 제거한다", () => {
  expect(stripAnsi(`${ESC}[?25l${ESC}[2K`)).toBe("");
});

test("stripAnsi 가 여러 시퀀스를 모두 제거한다", () => {
  expect(stripAnsi(`${ESC}[1m${ESC}[32mok${ESC}[0m done${ESC}[0m`)).toBe("ok done");
});

// ---------------------------------------------------------------- truncate

test("truncate 가 상한을 넘으면 자르고 표시한다", () => {
  expect(truncate("abcdef", 3)).toEqual({ text: "abc", truncated: true });
});

test("truncate 는 상한과 같으면 자르지 않는다", () => {
  expect(truncate("abc", 3)).toEqual({ text: "abc", truncated: false });
});

test("truncate 는 빈 문자열을 그대로 둔다", () => {
  expect(truncate("", 10)).toEqual({ text: "", truncated: false });
});

// ---------------------------------------------------------------- parseJsonl

test("parseJsonl 이 여러 줄을 읽는다", () => {
  expect(parseJsonl('{"a":1}\n{"b":2}')).toEqual([{ a: 1 }, { b: 2 }]);
});

test("parseJsonl 이 깨진 줄을 건너뛴다", () => {
  expect(parseJsonl('{"a":1}\n{broken\n{"b":2}')).toEqual([{ a: 1 }, { b: 2 }]);
});

test("parseJsonl 이 빈 입력에 빈 배열을 준다", () => {
  expect(parseJsonl("")).toEqual([]);
});

test("parseJsonl 이 빈 줄과 공백 줄을 무시한다", () => {
  expect(parseJsonl('{"a":1}\n\n  \n')).toEqual([{ a: 1 }]);
});

/**
 * 트랜스크립트는 실행 중인 세션이 계속 append 하는 파일이다. 마지막 줄이 반쯤 쓰인
 * 상태로 읽히는 일이 실제로 자주 있으므로, 이 케이스가 조용히 넘어가야 한다.
 */
test("parseJsonl 이 반쯤 쓰인 마지막 줄을 버린다", () => {
  expect(parseJsonl('{"a":1}\n{"b":')).toEqual([{ a: 1 }]);
});

test("parseJsonl 이 CRLF 줄바꿈을 처리한다", () => {
  expect(parseJsonl('{"a":1}\r\n{"b":2}\r\n')).toEqual([{ a: 1 }, { b: 2 }]);
});

// ---------------------------------------------------------------- decodeProjectId

test("decodeProjectId 가 인코딩된 경로를 되돌린다", () => {
  expect(decodeProjectId("-home-dorage-workspace-app")).toBe("/home/dorage/workspace/app");
});

/**
 * 알려진 한계다. 고치는 것이 아니라 기록해 둔다 — 인코딩 자체가 되돌릴 수 없다.
 * 실제 경로가 필요한 곳(세션 요약)은 레코드의 `cwd` 를 우선으로 쓴다.
 */
test("decodeProjectId 는 이름 속 하이픈을 복원할 수 없다 (알려진 한계)", () => {
  expect(decodeProjectId("-home-u-my-app")).toBe("/home/u/my/app");
});

test("decodeProjectId 가 선행 하이픈이 없어도 동작한다", () => {
  expect(decodeProjectId("relative-path")).toBe("relative/path");
});
