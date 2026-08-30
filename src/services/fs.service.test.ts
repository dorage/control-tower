import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, mkdir, readdir, writeFile, symlink, rm } from "node:fs/promises";
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

/** 쓰기 테스트는 서로의 파일을 밟지 않게 각자 이름을 쓴다. */
async function writeStatusOf(path: string, content: string, options?: object): Promise<number> {
  try {
    await fs.writeFile("work", path, content, options ?? {});
    return 200;
  } catch (error) {
    return (error as { status?: number }).status ?? 500;
  }
}

test("createIfMissing 으로 새 파일을 만들면 created 다", async () => {
  const result = await fs.writeFile("work", "docs/new.md", "hi", { createIfMissing: true });
  expect(result.created).toBe(true);
  expect(result.path).toBe("docs/new.md");
  expect(result.version).toBe(fs.versionOf(result.modifiedAt, result.size));
  expect(await Bun.file(join(base, "work/docs/new.md")).text()).toBe("hi");
});

test("createIfMissing 없이 없는 파일에 저장하면 404", async () => {
  expect(await writeStatusOf("docs/nope.md", "x")).toBe(404);
});

test("반환된 version 으로 곧바로 다시 저장할 수 있다", async () => {
  const first = await fs.writeFile("work", "docs/rt.md", "one", { createIfMissing: true });
  const second = await fs.writeFile("work", "docs/rt.md", "two two", { baseVersion: first.version });
  expect(second.created).toBe(false);
  const third = await fs.writeFile("work", "docs/rt.md", "three", { baseVersion: second.version });
  expect(third.created).toBe(false);
  expect(await Bun.file(join(base, "work/docs/rt.md")).text()).toBe("three");
});

test("기존 파일에 baseVersion 없이 저장하면 400", async () => {
  await fs.writeFile("work", "docs/nb.md", "x", { createIfMissing: true });
  expect(await writeStatusOf("docs/nb.md", "y")).toBe(400);
  expect(await Bun.file(join(base, "work/docs/nb.md")).text()).toBe("x");
});

test("baseVersion 불일치는 409 이고 currentVersion 을 준다", async () => {
  const saved = await fs.writeFile("work", "docs/conflict.md", "mine", { createIfMissing: true });
  // 다른 프로세스가 건드린 상황. 크기를 바꿔 mtime 해상도와 무관하게 version 이 달라지게 한다.
  await writeFile(join(base, "work/docs/conflict.md"), "someone else wrote this");

  const error = await fs
    .writeFile("work", "docs/conflict.md", "mine again", { baseVersion: saved.version })
    .then(() => null)
    .catch((thrown: unknown) => thrown as { status: number; extra?: Record<string, unknown> });

  expect(error?.status).toBe(409);
  expect(typeof error?.extra?.currentVersion).toBe("string");
  expect(error?.extra?.currentVersion).not.toBe(saved.version);
  // 충돌은 파일을 건드리지 않는다.
  expect(await Bun.file(join(base, "work/docs/conflict.md")).text()).toBe("someone else wrote this");
});

test("충돌 후 새 version 으로 다시 저장하면 성공한다", async () => {
  const current = await fs.readFile("work", "docs/conflict.md");
  const result = await fs.writeFile("work", "docs/conflict.md", "resolved", {
    baseVersion: current.version,
  });
  expect(result.created).toBe(false);
  expect(await Bun.file(join(base, "work/docs/conflict.md")).text()).toBe("resolved");
});

test("허용되지 않은 확장자는 403 이고 파일을 바꾸지 않는다", async () => {
  await writeFile(join(base, "work/docs/keep.ts"), "const x = 1");
  expect(await writeStatusOf("docs/keep.ts", "pwned", { baseVersion: "0:0" })).toBe(403);
  expect(await writeStatusOf("docs/keep.ts", "pwned", { createIfMissing: true })).toBe(403);
  expect(await Bun.file(join(base, "work/docs/keep.ts")).text()).toBe("const x = 1");
});

test("루트를 벗어나는 쓰기는 403 이고 대상 파일이 생기지 않는다", async () => {
  expect(await writeStatusOf("../outside/evil.md", "x", { createIfMissing: true })).toBe(403);
  expect(await writeStatusOf("escape/secret.md", "x", { createIfMissing: true })).toBe(403);
  expect(await Bun.file(join(base, "outside/evil.md")).exists()).toBe(false);
  expect(await Bun.file(join(base, "outside/secret.md")).text()).toBe("nope");
});

test("빈 문자열 저장이 파일을 0바이트로 만든다", async () => {
  const created = await fs.writeFile("work", "docs/empty.md", "not empty yet", {
    createIfMissing: true,
  });
  const emptied = await fs.writeFile("work", "docs/empty.md", "", { baseVersion: created.version });
  expect(emptied.size).toBe(0);
  expect(await Bun.file(join(base, "work/docs/empty.md")).text()).toBe("");
});

test("유니코드가 손상 없이 왕복한다", async () => {
  const text = "# 한글 제목 🎉\n\n- 이모지 🌱\n";
  const result = await fs.writeFile("work", "docs/uni.md", text, { createIfMissing: true });
  const read = await fs.readFile("work", "docs/uni.md");
  expect(read.content).toBe(text);
  // size 는 문자 수가 아니라 UTF-8 바이트 수다.
  expect(result.size).toBe(Buffer.byteLength(text, "utf8"));
  expect(read.version).toBe(result.version);
});

test("본문이 상한을 넘으면 413", async () => {
  const huge = "a".repeat(3 * 1024 * 1024);
  expect(await writeStatusOf("docs/huge.md", huge, { createIfMissing: true })).toBe(413);
});

test("쓰기 뒤에 임시 파일이 남지 않는다", async () => {
  const names = await readdir(join(base, "work/docs"));
  expect(names.filter((name) => name.includes(".tmp-"))).toEqual([]);
});
