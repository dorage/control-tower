import { boolParam, HttpError, intRange, json, stringParam, withRoute } from "../lib/http";
import { buildTree, listDirectory, listRoots, readFile, writeFile } from "../services/fs.service";

/**
 * `path` 는 `stringParam` 이 아니라 직접 읽는다. 빈 문자열은 "루트 자신"이라는 유효한 값이고,
 * `stringParam` 은 그것을 null 로 바꾼다.
 *
 * `URLSearchParams` 가 이미 퍼센트 디코딩을 했으므로 `decodeURIComponent` 를 덧붙이지 않는다.
 */
function requireRoot(url: URL): string {
  const root = stringParam(url, "root");
  if (!root) throw new HttpError(400, "root is required");
  return root;
}

interface WriteRequest {
  root: string;
  path: string;
  content: string;
  baseVersion?: string;
  createIfMissing?: boolean;
}

/**
 * 본문 검증. 값의 존재가 아니라 **타입**을 본다 - `content: ""` 는 파일을 비우는
 * 정당한 편집이므로 통과시키고, `content: null` 은 거절한다.
 */
function parseWriteBody(body: unknown): WriteRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new HttpError(400, "body must be a json object");
  }
  const record = body as Record<string, unknown>;

  const { root, path, content, baseVersion, createIfMissing } = record;
  if (typeof root !== "string" || root === "") throw new HttpError(400, "root is required");
  if (typeof path !== "string" || path === "") throw new HttpError(400, "path is required");
  if (typeof content !== "string") throw new HttpError(400, "content must be a string");
  if (baseVersion !== undefined && typeof baseVersion !== "string") {
    throw new HttpError(400, "baseVersion must be a string");
  }
  if (createIfMissing !== undefined && typeof createIfMissing !== "boolean") {
    throw new HttpError(400, "createIfMissing must be a boolean");
  }

  return { root, path, content, baseVersion, createIfMissing };
}

export const fsRoutes = {
  "/api/fs/roots": {
    GET: withRoute(async () => json({ items: await listRoots() })),
  },

  "/api/fs/list": {
    GET: withRoute(async (req: Request) => {
      const url = new URL(req.url);
      return json(
        await listDirectory(requireRoot(url), url.searchParams.get("path") ?? "", {
          hidden: boolParam(url, "hidden", false),
        }),
      );
    }),
  },

  "/api/fs/file": {
    GET: withRoute(async (req: Request) => {
      const url = new URL(req.url);
      const path = stringParam(url, "path");
      if (!path) throw new HttpError(400, "path is required");
      return json(await readFile(requireRoot(url), path));
    }),

    PUT: withRoute(async (req: Request) => {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw new HttpError(400, "invalid json body");
      }
      const { root, path, content, baseVersion, createIfMissing } = parseWriteBody(body);
      return json(await writeFile(root, path, content, { baseVersion, createIfMissing }));
    }),
  },

  "/api/fs/tree": {
    GET: withRoute(async (req: Request) => {
      const url = new URL(req.url);
      return json(
        await buildTree(requireRoot(url), url.searchParams.get("path") ?? "", {
          depth: intRange(url, "depth", 2, 1, 5),
          hidden: boolParam(url, "hidden", false),
        }),
      );
    }),
  },
};
