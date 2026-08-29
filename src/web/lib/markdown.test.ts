import { test, expect } from "bun:test";
import { parseMarkdown, safeHref } from "./markdown";

test("제목", () => {
  expect(parseMarkdown("# 안녕")[0]).toMatchObject({ type: "heading", level: 1 });
  expect(parseMarkdown("###### 여섯")[0]).toMatchObject({ type: "heading", level: 6 });
});

test("코드 펜스 안은 파싱하지 않는다", () => {
  const blocks = parseMarkdown("```ts\n# not a heading\n**not bold**\n| a | b |\n```");
  expect(blocks).toHaveLength(1);
  expect(blocks[0]).toMatchObject({ type: "code", lang: "ts" });
  expect((blocks[0] as { text: string }).text).toContain("# not a heading");
  expect((blocks[0] as { text: string }).text).toContain("**not bold**");
});

test("닫히지 않은 펜스는 끝까지 코드", () => {
  expect(parseMarkdown("```\nabc")[0]).toMatchObject({ type: "code", text: "abc" });
});

test("체크박스 목록", () => {
  const list = parseMarkdown("- [ ] 할 일\n- [x] 완료")[0] as { items: Array<{ checked: boolean | null }> };
  expect(list.items.map((item) => item.checked)).toEqual([false, true]);
});

test("순서 있는 목록은 시작 번호를 보존한다", () => {
  expect(parseMarkdown("3. 셋\n4. 넷")[0]).toMatchObject({ type: "list", ordered: true, start: 3 });
});

test("중첩 목록", () => {
  const list = parseMarkdown("- 하나\n  - 하나-하나\n- 둘")[0] as { items: Array<{ blocks: unknown[] }> };
  expect(list.items).toHaveLength(2);
  expect(list.items[0]!.blocks).toHaveLength(2);
});

test("GFM 표", () => {
  const table = parseMarkdown("| a | b |\n| --- | ---: |\n| 1 | 2 |")[0];
  expect(table).toMatchObject({ type: "table", align: ["left", "right"] });
  expect((table as { rows: unknown[] }).rows).toHaveLength(1);
});

test("정렬 행이 없으면 표가 아니다", () => {
  expect(parseMarkdown("| a | b |\n| 1 | 2 |")[0]).toMatchObject({ type: "paragraph" });
});

test("인용은 내부를 재귀 파싱한다", () => {
  const quote = parseMarkdown("> # 제목\n> 본문")[0] as { blocks: Array<{ type: string }> };
  expect(quote.blocks[0]).toMatchObject({ type: "heading" });
  expect(quote.blocks[1]).toMatchObject({ type: "paragraph" });
});

test("수평선", () => {
  expect(parseMarkdown("---")[0]).toMatchObject({ type: "hr" });
  expect(parseMarkdown("***")[0]).toMatchObject({ type: "hr" });
});

test("짝이 맞지 않는 강조는 리터럴", () => {
  const para = parseMarkdown("**열림만")[0] as { children: Array<{ type: string; value?: string }> };
  expect(para.children[0]).toMatchObject({ type: "text", value: "**열림만" });
});

test("인라인 코드 안은 리터럴", () => {
  const para = parseMarkdown("`**x**`")[0] as { children: Array<{ type: string; value?: string }> };
  expect(para.children[0]).toMatchObject({ type: "code", value: "**x**" });
});

test("강조·취소선·링크", () => {
  const para = parseMarkdown("**굵게** *기울임* ~~취소~~ [텍스트](https://example.com)")[0] as {
    children: Array<{ type: string }>;
  };
  const types = para.children.map((child) => child.type);
  expect(types).toContain("strong");
  expect(types).toContain("em");
  expect(types).toContain("del");
  expect(types).toContain("link");
});

test("위험한 스킴은 링크가 되지 않는다", () => {
  expect(safeHref("javascript:alert(1)")).toBeNull();
  expect(safeHref("data:text/html;base64,x")).toBeNull();
  expect(safeHref("vbscript:x")).toBeNull();
  expect(safeHref("https://example.com")).toBe("https://example.com");
  expect(safeHref("./other.md")).toBe("./other.md");

  const para = parseMarkdown("[클릭](javascript:alert(1))")[0] as {
    children: Array<{ type: string; value?: string }>;
  };
  expect(para.children.every((child) => child.type !== "link")).toBe(true);
});

test("위험한 이미지는 alt 텍스트만 남는다", () => {
  const para = parseMarkdown("![그림](data:text/html;base64,x)")[0] as {
    children: Array<{ type: string; value?: string }>;
  };
  expect(para.children).toEqual([{ type: "text", value: "그림" }]);
});

test("원시 HTML 은 텍스트로 남는다", () => {
  const para = parseMarkdown("<img src=x onerror=alert(1)>")[0] as {
    children: Array<{ type: string; value?: string }>;
  };
  expect(para.children[0]).toMatchObject({ type: "text" });
  expect(para.children.map((child) => child.value).join("")).toContain("onerror");
});

test("자동 링크", () => {
  const para = parseMarkdown("<https://example.com>")[0] as { children: Array<{ type: string }> };
  expect(para.children[0]).toMatchObject({ type: "link" });
});

test("줄 끝 스페이스 2개는 줄바꿈", () => {
  const para = parseMarkdown("한 줄  \n다음 줄")[0] as { children: Array<{ type: string }> };
  expect(para.children.some((child) => child.type === "break")).toBe(true);
});

test("이 저장소의 문서가 예외 없이 파싱된다", async () => {
  for (const path of ["docs/TODO.md", "docs/ENDPOINTS.md", "docs/CONVENTIONS.md", "docs/STRUCTURE.md"]) {
    const blocks = parseMarkdown(await Bun.file(path).text());
    expect(blocks.length).toBeGreaterThan(0);
  }
});
