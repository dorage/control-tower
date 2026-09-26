import { useCallback, useEffect, useRef, useState } from "react";
import type { FsEntry } from "../../domain/types";
import type { WorkspaceCheckout, WorkspaceRepo } from "../../domain/workspace";
import { FileTree } from "../components/file-tree";
import { FileView } from "../components/file-view";
import { SourceControl } from "../components/source-control";
import { Button, EmptyState, ErrorBox, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { tildePath } from "../lib/format";
import { navigate, setParams, useLocation } from "../lib/router";
import { useQuery } from "../hooks/use-query";
import { useTreeCollapse } from "../hooks/use-tree-collapse";

/** 드롭다운 한 줄. main 은 브랜치가 아니라 "원래 작업 트리" 라는 뜻이라 "기본" 으로 적는다. */
function checkoutLabel(checkout: WorkspaceCheckout): string {
  const head = checkout.branch ?? "detached";
  const name = checkout.kind === "main" ? "기본" : checkout.name;
  return `${name} · ${head}${checkout.locked === null ? "" : " 🔒"}`;
}

function findCheckout(repo: WorkspaceRepo, id: string | null): WorkspaceCheckout | null {
  // 없는 id 는 조용히 main 으로 떨어진다. 링크가 낡았다고 화면을 비울 이유가 없다.
  return (id ? repo.checkouts.find((checkout) => checkout.id === id) : null) ?? repo.checkouts[0] ?? null;
}

export function WorkspacePage() {
  const { search } = useLocation();
  const repoId = search.get("repo");
  const checkoutId = search.get("wt");
  /** 체크아웃 디렉터리 기준 상대경로. 저장소를 옮겨도 URL 이 짧게 유지된다. */
  const path = search.get("path");

  const [hidden, setHidden] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const tree = useTreeCollapse(path);

  const repos = useQuery(() => api.workspaceRepos(), []);
  const items = repos.data?.items ?? null;

  /**
   * 편집 중인지는 뷰어 안쪽 상태지만, 파일을 바꾸는 것은 바깥쪽 일이다.
   * 상태를 끌어올리면 타이핑마다 페이지 전체가 다시 그려지므로 ref 로만 공유한다.
   */
  const dirtyRef = useRef(false);

  const repo = items && repoId ? (items.find((item) => item.id === repoId) ?? null) : null;
  const checkout = repo ? findCheckout(repo, checkoutId) : null;
  const relPath = checkout?.relPath ?? null;
  /** 파일 API 는 루트 기준 전체 경로를 받는다. 화면에는 체크아웃 기준으로 보여준다. */
  const fullPath = path === null ? null : relPath ? `${relPath}/${path}` : path;

  // 저장소가 URL 에 없으면 첫 번째로 채운다. 뒤로가기 기록을 남기지 않는다.
  useEffect(() => {
    if (repoId || !items) return;
    const first = items[0];
    if (first) navigate(`/workspace?repo=${encodeURIComponent(first.id)}`, { replace: true });
  }, [repoId, items]);

  /** 저장하지 않은 편집이 있으면 이동 전에 확인한다. 취소하면 URL 을 바꾸지 않는다. */
  const confirmLeave = useCallback(() => {
    if (!dirtyRef.current) return true;
    return window.confirm("저장하지 않은 변경이 있습니다. 이동할까요?");
  }, []);

  const select = useCallback(
    (entry: FsEntry) => {
      const prefix = relPath ? `${relPath}/` : "";
      const next = entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.path;
      if (next === path) return;
      if (!confirmLeave()) return;
      setParams({ path: next });
    },
    [relPath, path, confirmLeave],
  );

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
    repos.reload();
  }, [repos]);

  if (repos.error) return <ErrorBox error={repos.error} onRetry={repos.reload} />;
  if (!items) return <Spinner label="저장소를 찾는 중…" />;
  if (items.length === 0) {
    return (
      <EmptyState
        title="git 저장소가 없습니다"
        hint="WORKSPACE_ROOTS 아래 깊이 2까지 .git 디렉터리를 찾습니다."
      />
    );
  }
  if (!repoId) return <Spinner label="저장소를 고르는 중…" />;
  if (!repo) return <EmptyState title="없는 저장소" hint={repoId} />;
  if (!checkout) return <EmptyState title="체크아웃이 없습니다" hint={repo.path} />;

  // 루트 밖의 체크아웃은 파일 API 가 열지 못한다. 목록에는 두되 트리와 뷰어를 비운다.
  const checkoutRoot = checkout.root;

  return (
    <div className={tree.collapsed ? "files files--collapsed" : "files"}>
      <div className="files__side">
        <div className="files__toolbar">
          <select
            className="files__root"
            value={repo.id}
            aria-label="저장소 선택"
            onChange={(event) => {
              if (!confirmLeave()) return;
              setParams({ repo: event.target.value, wt: null, path: null });
            }}
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <label className="files__toggle">
            <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} />
            숨김
          </label>
          <Button variant="ghost" onClick={refresh}>
            새로고침
          </Button>
          <Button
            variant="ghost"
            className="files__collapse"
            aria-expanded={!tree.collapsed}
            onClick={tree.toggle}
          >
            {tree.collapsed ? "트리 펼치기" : "트리 접기"}
          </Button>
        </div>

        <div className="files__toolbar files__toolbar--secondary">
          <select
            className="files__root"
            value={checkout.id}
            aria-label="체크아웃 선택"
            onChange={(event) => {
              if (!confirmLeave()) return;
              setParams({ wt: event.target.value, path: null });
            }}
          >
            {repo.checkouts.map((item) => (
              <option key={item.id} value={item.id}>
                {checkoutLabel(item)}
              </option>
            ))}
          </select>
        </div>

        <div className="files__meta" title={checkout.path}>
          {checkout.branch ?? "detached"} · {checkout.head?.slice(0, 7) ?? "-"} ·{" "}
          {tildePath(checkout.path)}
        </div>

        {/* 루트 밖 체크아웃은 서버가 git 을 돌려 주지 않는다(403). 파일과 같은 기준이다. */}
        {checkoutRoot === null ? null : (
          <SourceControl
            repoId={repo.id}
            checkout={checkout}
            refreshToken={refreshToken}
            onChanged={refresh}
            confirmLeave={confirmLeave}
          />
        )}

        {checkoutRoot === null ? (
          <EmptyState title="이 체크아웃은 워크스페이스 루트 밖에 있습니다" hint={checkout.path} />
        ) : (
          <FileTree
            root={checkoutRoot}
            basePath={relPath ?? ""}
            selectedPath={fullPath}
            hidden={hidden}
            refreshToken={refreshToken}
            onSelect={select}
          />
        )}
      </div>

      <div className="files__view">
        {checkoutRoot === null ? (
          <EmptyState
            title="열 수 없는 체크아웃입니다"
            hint="WORKSPACE_ROOTS 안에 있는 체크아웃만 파일을 읽을 수 있습니다."
          />
        ) : (
          <FileView
            root={checkoutRoot}
            path={fullPath}
            displayPath={path ?? undefined}
            dirtyRef={dirtyRef}
            reloadSignal={refreshToken}
          />
        )}
      </div>
    </div>
  );
}
