import { expect, test } from "bun:test";
import { HIGHLIGHT_MAX_CHARS, hasGrammar, highlight, normalizeLanguage, type TokenKind } from "./highlight";

/** 토큰을 종류별로 모은다. 순서가 아니라 "무엇이 무슨 색인가"만 보고 싶을 때. */
function of(text: string, language: string, kind: TokenKind): string[] {
  return highlight(text, language)
    .filter((token) => token.kind === kind)
    .map((token) => token.value);
}

function joined(text: string, language: string): string {
  return highlight(text, language)
    .map((token) => token.value)
    .join("");
}

const SAMPLES: Record<string, string> = {
  typescript: `import { readFile } from "node:fs";
// 한 줄 주석
/* 여러 줄
   주석 */
export async function load(path: string, retries = 3): Promise<Buffer | null> {
  const flag = true;
  if (!path.endsWith(".md")) return null;
  const size = 0x1f + 1_000 + 1.5e3;
  return \`\${path}:\${size}\` as unknown as Buffer;
}`,
  javascript: `const map = new Map();
map.set("a", 1).set('b', 2);
export default function main() { return map; }`,
  json: `{
  "name": "control-tower",
  "version": 1.2,
  "private": true,
  "nested": { "list": [1, null, false] }
}`,
  css: `:root {
  --bg: #ffffff; /* 배경 */
}
.tree__row--active:hover {
  padding: 8px 12px;
  background: var(--bg-subtle);
}
@media (max-width: 900px) { .files { display: none; } }`,
  html: `<!doctype html>
<!-- 주석 -->
<html lang="ko">
  <body class="a > b">
    <h1>안녕 &amp; 반가워</h1>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>`,
  xml: `<?xml version="1.0"?>
<root><item id="1">값</item></root>`,
  shell: `#!/usr/bin/env bash
set -euo pipefail
# 주석
NAME="\${1:-control-tower}"
if [ -f "$NAME" ]; then
  echo "found $NAME" >&2
fi`,
  python: `"""모듈 설명"""
import os

@dataclass
class Note:
    def load(self, path: str = "a.md") -> None:
        if path is None or True:
            print(f"{path}", 10, 0x1f)`,
  yaml: `# 주석
name: control tower
on:
  push:
    branches: [main]
jobs:
  - run: bun test
    env:
      FLAG: true
      COUNT: 3
`,
  toml: `# 주석
[package]
name = "control-tower"
version = "0.1.0"
edition = 2021
published = false
date = 2026-09-21

[deps.react]
version = "19"
`,
};

test("토큰을 이어 붙이면 입력과 같다", () => {
  for (const [language, text] of Object.entries(SAMPLES)) {
    expect(joined(text, language)).toBe(text);
  }
});

test("모르는 언어와 빈 본문도 원문을 잃지 않는다", () => {
  expect(highlight("아무 텍스트", "text")).toEqual([{ kind: "plain", value: "아무 텍스트" }]);
  expect(highlight("x = 1", "brainfuck")).toEqual([{ kind: "plain", value: "x = 1" }]);
  expect(highlight("", "typescript")).toEqual([]);
});

test("상한을 넘는 본문은 색칠하지 않고 통째로 돌려준다", () => {
  const long = "const a = 1;\n".repeat(Math.ceil(HIGHLIGHT_MAX_CHARS / 13) + 1);
  expect(long.length).toBeGreaterThan(HIGHLIGHT_MAX_CHARS);
  const tokens = highlight(long, "typescript");
  expect(tokens).toHaveLength(1);
  expect(tokens[0]?.value).toBe(long);
});

test("타입스크립트 - 주석·문자열·예약어·타입·호출", () => {
  const text = SAMPLES.typescript!;
  expect(of(text, "typescript", "comment")).toEqual(["// 한 줄 주석", "/* 여러 줄\n   주석 */"]);
  expect(of(text, "typescript", "string")).toContain('"node:fs"');
  expect(of(text, "typescript", "keyword")).toContain("export");
  expect(of(text, "typescript", "keyword")).toContain("async");
  expect(of(text, "typescript", "type")).toContain("Promise");
  expect(of(text, "typescript", "type")).toContain("string");
  expect(of(text, "typescript", "func")).toContain("load");
  expect(of(text, "typescript", "func")).toContain("endsWith");
  expect(of(text, "typescript", "number")).toContain("0x1f");
  expect(of(text, "typescript", "number")).toContain("true");
});

test("주석과 문자열 안의 문법은 해석하지 않는다", () => {
  expect(of('// const x = "a"', "typescript", "keyword")).toEqual([]);
  expect(of('const s = "// not a comment";', "typescript", "comment")).toEqual([]);
  expect(of('const s = "return 1";', "typescript", "keyword")).toEqual(["const"]);
});

test("닫히지 않은 주석·문자열도 끝까지 먹고 멈추지 않는다", () => {
  expect(joined('const s = "열린 채 끝남', "typescript")).toBe('const s = "열린 채 끝남');
  expect(of('const s = "열린 채 끝남', "typescript", "string")).toEqual(['"열린 채 끝남']);
  expect(of("/* 닫지 않은 주석", "typescript", "comment")).toEqual(["/* 닫지 않은 주석"]);
});

test("JSON - 키와 값의 문자열을 가른다", () => {
  const text = SAMPLES.json!;
  expect(of(text, "json", "property")).toContain('"name"');
  expect(of(text, "json", "string")).toContain('"control-tower"');
  expect(of(text, "json", "string")).not.toContain('"name"');
  expect(of(text, "json", "number")).toEqual(expect.arrayContaining(["1.2", "true", "null", "false"]));
});

test("CSS - 속성·선택자·변수·단위", () => {
  const text = SAMPLES.css!;
  expect(of(text, "css", "property")).toContain("padding");
  expect(of(text, "css", "property")).toContain("--bg");
  expect(of(text, "css", "tag")).toContain(".tree__row--active");
  expect(of(text, "css", "keyword")).toContain("@media");
  expect(of(text, "css", "func")).toContain("var");
  expect(of(text, "css", "number")).toContain("#ffffff");
  expect(of(text, "css", "number")).toContain("8px");
});

test("HTML - 태그 이름과 속성, 그리고 속성값 안의 꺾쇠", () => {
  const text = SAMPLES.html!;
  expect(of(text, "html", "tag")).toContain("html");
  expect(of(text, "html", "tag")).toContain("script");
  expect(of(text, "html", "property")).toContain("lang");
  expect(of(text, "html", "property")).toContain("src");
  // 값 안의 `>` 에서 태그가 끊기면 뒤가 전부 어긋난다.
  expect(of(text, "html", "string")).toContain('"a > b"');
  expect(of(text, "html", "comment")).toContain("<!-- 주석 -->");
  expect(of(text, "html", "number")).toContain("&amp;");
});

test("셸 - 변수·플래그·예약어", () => {
  const text = SAMPLES.shell!;
  expect(of(text, "shell", "property")).toContain("${1:-control-tower}");
  expect(of(text, "shell", "property")).toContain("$NAME");
  expect(of(text, "shell", "property")).toContain("-euo");
  expect(of(text, "shell", "keyword")).toEqual(expect.arrayContaining(["set", "if", "then", "fi"]));
  expect(of(text, "shell", "comment")).toContain("# 주석");
});

test("파이썬 - 삼중 따옴표와 데코레이터", () => {
  const text = SAMPLES.python!;
  expect(of(text, "python", "string")).toContain('"""모듈 설명"""');
  expect(of(text, "python", "func")).toContain("@dataclass");
  expect(of(text, "python", "keyword")).toEqual(expect.arrayContaining(["import", "class", "def", "if"]));
  expect(of(text, "python", "number")).toContain("None");
  expect(of(text, "python", "number")).toContain("self");
  expect(of(text, "python", "type")).toContain("Note");
});

test("YAML - 들여쓴 키와 목록 안의 키", () => {
  const text = SAMPLES.yaml!;
  const keys = of(text, "yaml", "property");
  expect(keys).toEqual(expect.arrayContaining(["name", "on", "push", "branches", "jobs", "run", "env", "FLAG"]));
  expect(of(text, "yaml", "comment")).toContain("# 주석");
  expect(of(text, "yaml", "number")).toContain("true");
  expect(of(text, "yaml", "number")).toContain("3");
});

test("TOML - 테이블과 점이 든 키", () => {
  const text = SAMPLES.toml!;
  expect(of(text, "toml", "tag")).toContain("[package]");
  expect(of(text, "toml", "tag")).toContain("[deps.react]");
  expect(of(text, "toml", "property")).toEqual(expect.arrayContaining(["name", "version", "edition"]));
  expect(of(text, "toml", "number")).toContain("2026-09-21");
  expect(of(text, "toml", "number")).toContain("false");
});

test("언어 이름의 별칭을 흡수한다", () => {
  expect(normalizeLanguage("TS")).toBe("typescript");
  expect(normalizeLanguage(" bash ")).toBe("shell");
  expect(normalizeLanguage("yml")).toBe("yaml");
  expect(normalizeLanguage(null)).toBe("");
  expect(normalizeLanguage("cobol")).toBe("cobol");

  expect(hasGrammar("tsx")).toBe(true);
  expect(hasGrammar("markdown")).toBe(false);
  expect(hasGrammar(null)).toBe(false);
});

test("이어지는 본문은 한 토큰으로 합친다", () => {
  // 토큰 하나가 DOM 노드 하나다. 글자마다 span 이 생기면 큰 파일에서 화면이 멈춘다.
  const tokens = highlight("사람이 읽는 문장이 그대로 들어 있는 경우", "typescript");
  expect(tokens.filter((token) => token.kind === "plain")).toHaveLength(1);
});
