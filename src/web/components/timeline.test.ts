import { test, expect } from "bun:test";
import { toolSummary } from "./timeline";

test("알려진 툴은 요약 한 줄을 뽑는다", () => {
  expect(toolSummary("Read", '{"file_path":"/tmp/a.md"}')).toBe("/tmp/a.md");
  expect(toolSummary("Bash", '{"command":"ls -la\\nsecond line"}')).toBe("ls -la");
  expect(toolSummary("Grep", '{"pattern":"foo","path":"src"}')).toBe("foo");
});

test("모르는 툴은 요약하지 않는다", () => {
  expect(toolSummary("SomeNewTool", '{"file_path":"/tmp/a.md"}')).toBeNull();
});

/** 서버가 MAX_BLOCK_CHARS 에서 자르면 input 이 깨진 JSON 으로 들어온다. */
test("깨진 입력에서도 던지지 않는다", () => {
  expect(toolSummary("Bash", '{"command":"ls -la","desc"')).toBeNull();
  expect(toolSummary("Bash", "")).toBeNull();
  expect(toolSummary("Bash", "null")).toBeNull();
  expect(toolSummary("Bash", "[]")).toBeNull();
  expect(toolSummary("Bash", '{"command":42}')).toBeNull();
  expect(toolSummary("Bash", '{"command":"   "}')).toBeNull();
});

test("긴 한 줄은 잘라 준다", () => {
  const long = "x".repeat(400);
  const summary = toolSummary("Bash", JSON.stringify({ command: long }));
  expect(summary).not.toBeNull();
  expect(summary!.length).toBeLessThanOrEqual(141);
  expect(summary!.endsWith("…")).toBe(true);
});
