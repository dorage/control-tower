#!/usr/bin/env bun
/**
 * 문서와 코드가 어긋났는지 본다. 종료 코드 0 = 통과, 1 = 불일치.
 *
 * 이 스크립트는 **휴리스틱**이다. 문서가 옳은지가 아니라 빠진 것이 없는지만 본다.
 * 통과했다고 문서가 정확하다는 뜻이 아니므로 사람의 감사를 대체하지 않는다.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

interface Problem {
  where: string;
  message: string;
}

const problems: Problem[] = [];
const fail = (where: string, message: string): void => void problems.push({ where, message });

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function exists(path: string): boolean {
  try {
    statSync(join(ROOT, path));
    return true;
  } catch {
    return false;
  }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

const endpointsDoc = read("docs/ENDPOINTS.md");
const structureDoc = read("docs/STRUCTURE.md");
const todoDoc = read("docs/TODO.md");
const rootReadme = read("README.md");

// ---------------------------------------------------------------- 1. 라우트 ↔ ENDPOINTS

const ROUTE_PATH = /"(\/(?:api|v1)\/[^"]*)"\s*:\s*\{/g;
for (const file of walk("src/routes")) {
  if (!file.endsWith(".route.ts")) continue;
  const source = read(file);
  for (const match of source.matchAll(ROUTE_PATH)) {
    const path = match[1]!;
    // `:id` 같은 파라미터는 문서에 그대로 나오므로 리터럴 비교로 충분하다.
    if (!endpointsDoc.includes(path)) {
      fail(file, `ENDPOINTS.md 에 ${path} 가 없다`);
    }
  }
}

// ---------------------------------------------------------------- 2. 파일 ↔ STRUCTURE

const sourceFiles = [...walk("src"), "index.ts"].filter(
  (file) => file.endsWith(".ts") || file.endsWith(".tsx"),
);
for (const file of sourceFiles) {
  const name = file.split("/").pop()!;
  if (!structureDoc.includes(name)) {
    fail(file, `STRUCTURE.md 에 ${name} 이 없다`);
  }
}

// ---------------------------------------------------------------- 3. 환경변수 ↔ STRUCTURE

const config = read("src/config.ts");
for (const match of config.matchAll(/Bun\.env\.([A-Z0-9_]+)/g)) {
  const name = match[1]!;
  if (name === "HOME" || name === "NODE_ENV") continue; // 우리가 정의한 변수가 아니다
  if (!structureDoc.includes(name)) {
    fail("src/config.ts", `STRUCTURE.md 환경변수 표에 ${name} 이 없다`);
  }
}

// ---------------------------------------------------------------- 4. TODO 로그

/**
 * `## LOG` 는 줄 전체가 일치할 때만 시작점이다.
 *
 * 규칙 6번 자체가 `` `## LOG` 아래만 로그다 `` 라는 문구를 담고 있어서, 부분문자열로
 * 찾으면 규칙 절 중간을 시작점으로 잡는다. 그러면 위쪽 예시 블록의 가짜 경로
 * (`docs/todos/T-001-slug.md`)와 예시 타임스탬프가 실제 로그로 잡혀 거짓 위반이 쏟아진다.
 */
const todoLines = todoDoc.split("\n");
const logStart = todoLines.findIndex((line) => line.trim() === "## LOG");
if (logStart < 0) {
  fail("docs/TODO.md", "`## LOG` 줄을 찾을 수 없다");
}

const LINE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) (ADD|START|DONE|BLOCK|UNBLOCK|DROP|NOTE) (T-\d{3})(.*)$/;
const AREAS = new Set([
  "core",
  "api-session",
  "api-fs",
  "api-telemetry",
  "web-core",
  "web-files",
  "web-session",
  "quality",
  "docs",
]);

const added = new Map<string, string>();
const lastOp = new Map<string, string>();
let previous = "";

for (let i = logStart + 1; i < todoLines.length; i += 1) {
  const line = todoLines[i]!;
  if (!line.trim()) continue;
  const where = `docs/TODO.md:${i + 1}`;

  const match = LINE.exec(line);
  if (!match) {
    fail(where, `로그 문법 위반: ${line.slice(0, 60)}`);
    continue;
  }
  const [, timestamp, op, id, rest] = match as unknown as [string, string, string, string, string];

  if (timestamp < previous) fail(where, `타임스탬프 역행: ${timestamp} < ${previous}`);
  previous = timestamp;

  if (op === "ADD") {
    const addMatch = /^ (P[012]) (\S+) "(.+)" (\S+)$/.exec(rest);
    if (!addMatch) {
      fail(where, `ADD 형식 위반: ${rest.slice(0, 50)}`);
      continue;
    }
    const [, , area, , docPath] = addMatch as unknown as [string, string, string, string, string];
    if (!AREAS.has(area)) fail(where, `정의되지 않은 AREA: ${area}`);
    if (!exists(docPath)) fail(where, `작업 문서가 없다: ${docPath}`);
    if (added.has(id)) fail(where, `${id} 가 두 번 ADD 되었다`);
    added.set(id, docPath);
  } else if (!added.has(id)) {
    fail(where, `${id} 는 ADD 없이 ${op} 되었다`);
  }

  if (op !== "NOTE") lastOp.set(id, op);
}

// 작업 문서가 있는데 로그에 없는 경우
for (const file of readdirSync(join(ROOT, "docs/todos"))) {
  const id = file.slice(0, 5);
  if (!added.has(id)) fail(`docs/todos/${file}`, `TODO.md 에 ${id} 의 ADD 줄이 없다`);
}

// ---------------------------------------------------------------- 5. 미완료 표기

const done = new Set([...lastOp].filter(([, op]) => op === "DONE").map(([id]) => id));
for (const [doc, text] of [
  ["docs/ENDPOINTS.md", endpointsDoc],
  ["docs/STRUCTURE.md", structureDoc],
] as const) {
  for (const match of text.matchAll(/⬜[^\n|]*?(T-\d{3})/g)) {
    const id = match[1]!;
    if (done.has(id)) fail(doc, `${id} 는 DONE 인데 아직 ⬜ 로 표기돼 있다`);
  }
}

// ---------------------------------------------------------------- 6. README

if (/bun init|Hello via Bun/i.test(rootReadme)) {
  fail("README.md", "`bun init` 기본 문구가 남아 있다");
}

// ---------------------------------------------------------------- 결과

if (problems.length === 0) {
  const routes = [...endpointsDoc.matchAll(/### `(GET|POST|PUT|DELETE) ([^`]+)`/g)].length;
  console.log(
    `문서-코드 일치 확인: 소스 ${sourceFiles.length}개 · 엔드포인트 ${routes}개 · ` +
      `작업 ${added.size}개(DONE ${done.size}) — 문제 없음`,
  );
  process.exit(0);
}

for (const problem of problems) {
  console.error(`${problem.where}  ${problem.message}`);
}
console.error(`\n${problems.length}건의 불일치`);
process.exit(1);
