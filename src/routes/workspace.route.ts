import type { WorkspaceGitAction } from "../domain/workspace";
import { HttpError, json, page, stringParam, withRoute } from "../lib/http";
import { listRepos, readGitStatus, runGitAction } from "../services/workspace.service";

const ACTIONS: readonly WorkspaceGitAction[] = ["pull", "commit", "push"];

function isAction(value: unknown): value is WorkspaceGitAction {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

/** 체크아웃은 절대경로가 아니라 목록 API 가 준 id 쌍으로만 가리킨다. 경로는 서버가 다시 찾는다. */
function requireIds(url: URL): { repo: string; wt: string } {
  const repo = stringParam(url, "repo");
  const wt = stringParam(url, "wt");
  if (!repo) throw new HttpError(400, "repo is required");
  if (!wt) throw new HttpError(400, "wt is required");
  return { repo, wt };
}

function parseActionBody(body: unknown): { repo: string; wt: string; action: WorkspaceGitAction } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new HttpError(400, "body must be a json object");
  }
  const { repo, wt, action } = body as Record<string, unknown>;
  if (typeof repo !== "string" || repo === "") throw new HttpError(400, "repo is required");
  if (typeof wt !== "string" || wt === "") throw new HttpError(400, "wt is required");
  if (!isAction(action)) throw new HttpError(400, `action must be one of ${ACTIONS.join(", ")}`);
  return { repo, wt, action };
}

export const workspaceRoutes = {
  "/api/workspace/repos": {
    GET: withRoute(async () => {
      const items = await listRepos();
      return page(items, items.length, 0, items.length);
    }),
  },

  "/api/workspace/git": {
    GET: withRoute(async (req: Request) => {
      const { repo, wt } = requireIds(new URL(req.url));
      return json(await readGitStatus(repo, wt));
    }),
    POST: withRoute(async (req: Request) => {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw new HttpError(400, "invalid json body");
      }
      const { repo, wt, action } = parseActionBody(body);
      return json(await runGitAction(repo, wt, action));
    }),
  },
};
