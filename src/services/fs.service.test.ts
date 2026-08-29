import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let base: string;
let fs: typeof import("./fs.service");

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "ct-fs-"));
  await mkdir(join(base, "work/docs"), { recursive: true });
  await mkdir(join(base, "work-secret"), { recursive: true });
  await mkdir(join(base, "outside"), { recursive: true });
  await writeFile(join(base, "work/docs/a.md"), "# a");
  await writeFile(join(base, "outside/secret.md"), "nope");
  await symlink(join(base, "outside"), join(base, "work/escape"));
  process.env.WORKSPACE_ROOTS = join(base, "work");
  // config 는 모듈 최상단에서 환경변수를 읽으므로, 설정 이후에 평가되도록 동적 import 한다.
  fs = await import("./fs.service");
});

afterAll(() => rm(base, { recursive: true, force: true }));

async function statusOf(rootId: string, path: string): Promise<number> {
  try {
    await fs.resolvePath(rootId, path);
    return 200;
  } catch (error) {
    return (error as { status?: number }).status ?? 500;
  }
}

test("루트 목록은 존재하는 루트만 담는다", async () => {
  const roots = await fs.listRoots();
  expect(roots.map((root) => root.id)).toEqual(["work"]);
});

test("정상 경로를 해석한다", async () => {
  expect((await fs.resolvePath("work", "")).relative).toBe("");
  expect((await fs.resolvePath("work", "docs/a.md")).relative).toBe("docs/a.md");
  expect((await fs.resolvePath("work", "./docs/a.md")).relative).toBe("docs/a.md");
});

test("루트 안에 머무는 .. 는 허용한다", async () => {
  expect((await fs.resolvePath("work", "docs/../docs/a.md")).relative).toBe("docs/a.md");
});

test("존재하지 않는 파일은 부모가 있으면 허용한다", async () => {
  expect((await fs.resolvePath("work", "docs/new.md")).relative).toBe("docs/new.md");
});

test("루트 탈출을 모두 막는다", async () => {
  expect(await statusOf("work", "../outside/secret.md")).toBe(403);
  expect(await statusOf("work", "../../etc/passwd")).toBe(403);
  expect(await statusOf("work", "../work-secret")).toBe(403);
  expect(await statusOf("work", "escape/secret.md")).toBe(403);
  expect(await statusOf("work", "/etc/passwd")).toBe(400);
  expect(await statusOf("work", "a\0.md")).toBe(400);
  expect(await statusOf("nope", "a")).toBe(403);
  expect(await statusOf("", "a")).toBe(400);
  expect(await statusOf("work", "nope/new.md")).toBe(404);
});

test("접두사가 겹치는 형제 루트로 새지 않는다", async () => {
  const resolved = await fs.resolvePath("work", "docs");
  expect(resolved.absolute.startsWith(join(base, "work") + "/")).toBe(true);
});

test("isEditable 은 확장자 대소문자를 무시한다", () => {
  expect(fs.isEditable("a.md")).toBe(true);
  expect(fs.isEditable("a.MD")).toBe(true);
  expect(fs.isEditable("a.markdown")).toBe(true);
  expect(fs.isEditable("a.ts")).toBe(false);
  expect(fs.isEditable("noext")).toBe(false);
});

test("languageOf", () => {
  expect(fs.languageOf("a.md")).toBe("markdown");
  expect(fs.languageOf("a.tsx")).toBe("typescript");
  expect(fs.languageOf("a.bin")).toBe("text");
});

test("versionOf 는 mtime 소수점을 자른다", () => {
  expect(fs.versionOf(1.9, 10)).toBe("1:10");
  expect(fs.versionOf(1756400000000, 2481)).toBe("1756400000000:2481");
});
