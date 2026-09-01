import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, mkdir, readdir, chmod, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FsEntry } from "../domain/types";

let base: string;
let fs: typeof import("./fs.service");

/** 읽기 상한(config.fsMaxReadBytes 기본값)을 넘기려면 실제로 이만큼 써야 한다. */
const MAX_READ_BYTES = 2 * 1024 * 1024;

/** fs.service 의 TREE_WIDTH_LIMIT. 상수는 export 되지 않으므로 여기에 값을 복제한다. */
const TREE_WIDTH_LIMIT = 2000;

/**
 * `Bun.write` 는 없는 부모 디렉터리를 만들어 주므로 파일마다 `mkdir` 을 부르지 않는다.
 * 빈 디렉터리만 `mkdir` 이 필요하다.
 */
beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "ct-fs-"));
  await mkdir(join(base, "work-secret"), { recursive: true });
  await mkdir(join(base, "other/work"), { recursive: true });
  await Bun.write(join(base, "work/docs/a.md"), "# a");
  await Bun.write(join(base, "outside/secret.md"), "nope");
  await symlink(join(base, "outside"), join(base, "work/escape"));

  // 목록·트리 전용 고정 트리. docs/ 는 쓰기 테스트가 계속 건드리므로 정렬을 여기서 본다.
  await Bun.write(join(base, "work/tree/.hidden/h.md"), "hidden dir");
  await Bun.write(join(base, "work/tree/.hiddenfile.md"), "hidden file");
  await Bun.write(join(base, "work/tree/2-two.md"), "two");
  await Bun.write(join(base, "work/tree/10-ten.md"), "ten");
  await Bun.write(join(base, "work/tree/beta.txt"), "plain text");
  // NUL 이 앞쪽 8000바이트 안에 있으면 바이너리다. PNG 시그니처 뒤에 NUL 을 둔다.
  await Bun.write(join(base, "work/tree/binary.bin"), new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]));
  await Bun.write(join(base, "work/tree/Alpha/leaf.md"), "leaf");
  await Bun.write(join(base, "work/tree/Alpha/nested/deep.md"), "deep");
  await Bun.write(join(base, "work/tree/zebra/z.md"), "z");

  // 읽을 수 없는 디렉터리. 트리가 이것 하나로 죽지 않는지 본다.
  await Bun.write(join(base, "work/locked/unreachable.md"), "locked");
  await chmod(join(base, "work/locked"), 0o000);

  // 디렉터리는 읽히는데 파일만 못 읽는 경우. stat 은 통과하고 바이트 읽기에서 EACCES 가 난다.
  await Bun.write(join(base, "work/unreadable/f.md"), "secret");
  await chmod(join(base, "work/unreadable/f.md"), 0o000);

  // 트리 너비 상한(2000)을 넘기는 디렉터리. 2001개 생성에 실측 64ms 라 픽스처로 둘 만하다.
  await Promise.all(
    Array.from({ length: TREE_WIDTH_LIMIT + 1 }, (_, i) =>
      Bun.write(join(base, `work/wide/f${i}.md`), "x"),
    ),
  );

  // 없는 루트는 조용히 빠지고, 같은 basename 의 루트는 id 가 갈라진다.
  process.env.WORKSPACE_ROOTS = [
    join(base, "work"),
    join(base, "does-not-exist"),
    join(base, "other/work"),
  ].join(":");
  // getRoots() 가 첫 호출 결과를 캐시하므로, 환경변수를 세운 뒤에 모듈을 들인다.
  fs = await import("./fs.service");
});

afterAll(async () => {
  // 0o000 인 채로는 rm 이 안쪽을 지우지 못한다.
  await chmod(join(base, "work/locked"), 0o755).catch(() => {});
  await rm(base, { recursive: true, force: true });
});

async function statusOf(rootId: string, path: string): Promise<number> {
  try {
    await fs.resolvePath(rootId, path);
    return 200;
  } catch (error) {
    return (error as { status?: number }).status ?? 500;
  }
}

test("루트 목록은 존재하는 루트만 담고, 같은 이름은 id 가 갈라진다", async () => {
  const roots = await fs.listRoots();
  // does-not-exist 는 빠지고, basename 이 겹치는 other/work 는 work-2 가 된다.
  expect(roots.map((root) => root.id)).toEqual(["work", "work-2"]);
  expect(roots.map((root) => root.name)).toEqual(["work", "work"]);
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

test("languageOf 는 Bun 이 다루는 확장자를 덮고 나머지는 text 로 떨어진다", () => {
  expect(fs.languageOf("a.md")).toBe("markdown");
  expect(fs.languageOf("a.tsx")).toBe("typescript");
  // 같은 언어의 모듈 변종들. 이것들이 text 로 떨어지면 뷰어 라벨이 쓸모없다.
  expect(fs.languageOf("a.mts")).toBe("typescript");
  expect(fs.languageOf("a.cts")).toBe("typescript");
  expect(fs.languageOf("a.mjs")).toBe("javascript");
  expect(fs.languageOf("a.cjs")).toBe("javascript");
  expect(fs.languageOf("a.jsonc")).toBe("json");
  expect(fs.languageOf("a.json5")).toBe("json");
  expect(fs.languageOf("a.xml")).toBe("xml");
  // 확장자 판정은 대소문자를 무시한다.
  expect(fs.languageOf("A.MD")).toBe("markdown");
  expect(fs.languageOf("a.bin")).toBe("text");
  expect(fs.languageOf("noext")).toBe("text");
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
  await Bun.write(join(base, "work/docs/conflict.md"), "someone else wrote this");

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
  await Bun.write(join(base, "work/docs/keep.ts"), "const x = 1");
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

// --------------------------------------------------------------- 목록·트리

/** 트리 노드에서 이름으로 자식을 찾는다. 없으면 테스트가 읽기 쉬운 곳에서 죽는다. */
function child(node: FsEntry, name: string): FsEntry {
  const found = node.children?.find((entry) => entry.name === name);
  if (!found) throw new Error(`no child ${name} in [${node.children?.map((c) => c.name).join(", ")}]`);
  return found;
}

async function listStatusOf(path: string): Promise<number> {
  try {
    await fs.listDirectory("work", path);
    return 200;
  } catch (error) {
    return (error as { status?: number }).status ?? 500;
  }
}

async function readStatusOf(path: string): Promise<number> {
  try {
    await fs.readFile("work", path);
    return 200;
  } catch (error) {
    return (error as { status?: number }).status ?? 500;
  }
}

test("목록은 디렉터리를 먼저, 그다음 이름을 자연 정렬한다", async () => {
  const listing = await fs.listDirectory("work", "tree");
  // 2 가 10 보다 앞이다(사전순이면 반대). 대소문자는 무시한다.
  expect(listing.items.map((item) => item.name)).toEqual([
    "Alpha",
    "zebra",
    "2-two.md",
    "10-ten.md",
    "beta.txt",
    "binary.bin",
  ]);
});

test("숨김 항목은 기본으로 빠지고 hidden 으로만 보인다", async () => {
  const hiddenOff = await fs.listDirectory("work", "tree");
  expect(hiddenOff.items.some((item) => item.name.startsWith("."))).toBe(false);

  const hiddenOn = await fs.listDirectory("work", "tree", { hidden: true });
  const names = hiddenOn.items.map((item) => item.name);
  expect(names).toContain(".hidden");
  expect(names).toContain(".hiddenfile.md");
  expect(names.length).toBe(hiddenOff.items.length + 2);
});

test("목록 항목은 루트 기준 경로와 편집 가능 여부를 담는다", async () => {
  const listing = await fs.listDirectory("work", "tree");

  const md = listing.items.find((item) => item.name === "2-two.md");
  expect(md?.path).toBe("tree/2-two.md");
  expect(md?.type).toBe("file");
  expect(md?.editable).toBe(true);
  expect(md?.size).toBe(3);

  const dir = listing.items.find((item) => item.name === "Alpha");
  expect(dir?.path).toBe("tree/Alpha");
  expect(dir?.type).toBe("dir");
  // 디렉터리는 확장자와 무관하게 편집 대상이 아니다.
  expect(dir?.editable).toBe(false);

  expect(listing.items.find((item) => item.name === "beta.txt")?.editable).toBe(false);
});

test("루트 목록의 경로에는 앞에 구분자가 붙지 않는다", async () => {
  const listing = await fs.listDirectory("work", "");
  expect(listing.root).toBe("work");
  expect(listing.path).toBe("");
  expect(listing.parent).toBeNull();
  expect(listing.items.find((item) => item.name === "docs")?.path).toBe("docs");
});

test("parent 는 한 단계 아래에서 빈 문자열, 두 단계 아래에서 상위 경로다", async () => {
  expect((await fs.listDirectory("work", "tree")).parent).toBe("");
  expect((await fs.listDirectory("work", "tree/Alpha")).parent).toBe("tree");
  expect((await fs.listDirectory("work", "tree/Alpha/nested")).parent).toBe("tree/Alpha");
});

test("파일을 목록하면 400, 없는 경로는 404, 읽을 수 없으면 403", async () => {
  expect(await listStatusOf("tree/2-two.md")).toBe(400);
  expect(await listStatusOf("tree/ghost")).toBe(404);
  expect(await listStatusOf("locked")).toBe(403);
  // 루트 밖을 가리키는 심볼릭 링크는 목록으로도 열 수 없다.
  expect(await listStatusOf("escape")).toBe(403);
});

test("트리는 기본 깊이 2 까지 펼치고 그 아래는 hasChildren 으로만 알린다", async () => {
  const tree = await fs.buildTree("work", "tree");
  expect(tree.name).toBe("tree");
  expect(tree.path).toBe("tree");
  expect(tree.type).toBe("dir");

  const alpha = child(tree, "Alpha");
  expect(alpha.children?.map((entry) => entry.name)).toEqual(["nested", "leaf.md"]);

  // 깊이 경계. 실제로 비어 있는지 확인하려면 IO 가 한 번 더 들어서 확인하지 않는다.
  const nested = child(alpha, "nested");
  expect(nested.hasChildren).toBe(true);
  expect(nested.children).toBeUndefined();

  expect(child(tree, "zebra").children?.map((entry) => entry.name)).toEqual(["z.md"]);
  // 파일은 어느 깊이에서도 children 도 hasChildren 도 갖지 않는다.
  expect(child(tree, "10-ten.md").children).toBeUndefined();
  expect(child(tree, "10-ten.md").hasChildren).toBeUndefined();
});

test("트리 depth 는 1..5 로 갇힌다", async () => {
  const shallow = await fs.buildTree("work", "tree", { depth: 1 });
  expect(child(shallow, "Alpha").hasChildren).toBe(true);
  expect(child(shallow, "Alpha").children).toBeUndefined();

  // 0 과 음수도 1 로 올라온다.
  expect(child(await fs.buildTree("work", "tree", { depth: 0 }), "Alpha").hasChildren).toBe(true);
  expect(child(await fs.buildTree("work", "tree", { depth: -5 }), "Alpha").hasChildren).toBe(true);

  const deep = await fs.buildTree("work", "tree", { depth: 99 });
  expect(child(child(deep, "Alpha"), "nested").children?.map((e) => e.name)).toEqual(["deep.md"]);
});

test("트리도 숨김 항목을 기본으로 감춘다", async () => {
  const off = await fs.buildTree("work", "tree", { depth: 1 });
  expect(off.children?.some((entry) => entry.name === ".hidden")).toBe(false);
  const on = await fs.buildTree("work", "tree", { depth: 1, hidden: true });
  expect(on.children?.some((entry) => entry.name === ".hidden")).toBe(true);
});

test("루트 자신의 트리는 루트 이름을 쓰고 path 는 빈 문자열이다", async () => {
  const tree = await fs.buildTree("work", "", { depth: 1 });
  expect(tree.name).toBe("work");
  expect(tree.path).toBe("");
  expect(tree.children?.map((entry) => entry.name)).toContain("tree");
});

test("읽을 수 없는 하위 디렉터리는 빈 children 이 되고 트리는 살아남는다", async () => {
  const tree = await fs.buildTree("work", "", { depth: 2 });
  expect(child(tree, "locked").children).toEqual([]);
  // 나머지 가지는 그대로다.
  expect(child(tree, "tree").children?.length).toBeGreaterThan(0);
});

test("파일로는 트리를 만들 수 없다", async () => {
  const status = await fs
    .buildTree("work", "tree/2-two.md")
    .then(() => 200)
    .catch((error: { status?: number }) => error.status ?? 500);
  expect(status).toBe(400);
});

// --------------------------------------------------------------- 읽기

test("바이너리 파일은 content 없이 메타데이터만 준다", async () => {
  const file = await fs.readFile("work", "tree/binary.bin");
  expect(file.encoding).toBe("binary");
  expect(file.content).toBeNull();
  expect(file.editable).toBe(false);
  // 바이너리면 확장자로 추정한 언어를 신뢰하지 않는다.
  expect(file.language).toBe("text");
  expect(file.size).toBe(6);
});

test("텍스트지만 쓰기 불가 확장자는 내용을 주되 editable=false 다", async () => {
  const file = await fs.readFile("work", "tree/beta.txt");
  expect(file.encoding).toBe("utf-8");
  expect(file.content).toBe("plain text");
  expect(file.editable).toBe(false);
  expect(file.language).toBe("text");
  expect(file.name).toBe("beta.txt");
});

test("마크다운은 편집 가능하고 version 이 versionOf 와 일치한다", async () => {
  const file = await fs.readFile("work", "tree/Alpha/leaf.md");
  expect(file.root).toBe("work");
  expect(file.editable).toBe(true);
  expect(file.language).toBe("markdown");
  expect(file.path).toBe("tree/Alpha/leaf.md");
  expect(file.version).toBe(fs.versionOf(file.modifiedAt, file.size));
});

test("디렉터리·빈 경로·없는 파일 읽기", async () => {
  expect(await readStatusOf("tree")).toBe(400);
  expect(await readStatusOf("")).toBe(400);
  expect(await readStatusOf("tree/ghost.md")).toBe(404);
});

test("상한을 넘는 파일은 바이트를 읽기 전에 413 이다", async () => {
  const path = join(base, "work/oversize.md");
  await Bun.write(path, "a".repeat(MAX_READ_BYTES + 1));
  expect(await readStatusOf("oversize.md")).toBe(413);
  await Bun.file(path).delete();
});

test("쓸 수 없는 디렉터리에 저장하면 403 이다", async () => {
  expect(await writeStatusOf("locked/new.md", "x", { createIfMissing: true })).toBe(403);
});

test("한 디렉터리의 항목이 너무 많으면 앞쪽만 담고 truncated 를 세운다", async () => {
  const wide = await fs.buildTree("work", "wide", { depth: 1 });
  expect(wide.children?.length).toBe(TREE_WIDTH_LIMIT);
  expect(wide.truncated).toBe(true);
  // 상한 아래의 디렉터리는 표시가 붙지 않는다.
  expect((await fs.buildTree("work", "tree", { depth: 1 })).truncated).toBeUndefined();
});

test("stat 은 되는데 읽을 수 없는 파일은 403 이다", async () => {
  expect(await readStatusOf("unreadable/f.md")).toBe(403);
});
