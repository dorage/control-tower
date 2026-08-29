import { boolParam, HttpError, intRange, json, stringParam, withRoute } from "../lib/http";
import { buildTree, listDirectory, listRoots } from "../services/fs.service";

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
