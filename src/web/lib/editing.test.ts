import { test, expect } from "bun:test";
import { indentLines, listMarkerOf, outdentLines } from "./editing";

test("불릿 표식을 이어 쓴다", () => {
  expect(listMarkerOf("- 하나")).toEqual({ next: "- ", empty: false });
  expect(listMarkerOf("* 하나")).toEqual({ next: "* ", empty: false });
  expect(listMarkerOf("  + 하나")).toEqual({ next: "  + ", empty: false });
});

test("순서 목록은 번호를 올린다", () => {
  expect(listMarkerOf("1. 하나")).toEqual({ next: "2. ", empty: false });
  expect(listMarkerOf("  9) 아홉")).toEqual({ next: "  10) ", empty: false });
});

test("체크박스는 해제 상태로 이어 쓴다", () => {
  expect(listMarkerOf("- [ ] 할 일")).toEqual({ next: "- [ ] ", empty: false });
  expect(listMarkerOf("- [x] 끝난 일")).toEqual({ next: "- [ ] ", empty: false });
});

test("표식만 있는 줄은 empty 다", () => {
  expect(listMarkerOf("- ")?.empty).toBe(true);
  expect(listMarkerOf("- [ ] ")?.empty).toBe(true);
  expect(listMarkerOf("  1. ")?.empty).toBe(true);
});

test("목록이 아닌 줄은 null", () => {
  expect(listMarkerOf("본문")).toBeNull();
  expect(listMarkerOf("# 제목")).toBeNull();
  expect(listMarkerOf("> 인용")).toBeNull();
  expect(listMarkerOf("-없는공백")).toBeNull();
  expect(listMarkerOf("")).toBeNull();
});

test("들여쓰기는 빈 줄을 건드리지 않는다", () => {
  expect(indentLines("a\n\nb")).toBe("  a\n\n  b");
});

test("내어쓰기는 한 단위만 걷어낸다", () => {
  expect(outdentLines("    a\n  b\nc")).toBe("  a\nb\nc");
  expect(outdentLines("\ta")).toBe("a");
  expect(outdentLines(" a")).toBe("a");
});

test("들여쓰기와 내어쓰기는 서로를 되돌린다", () => {
  const block = "- 하나\n  - 둘\n\n- 셋";
  expect(outdentLines(indentLines(block))).toBe(block);
});
