import { useCallback, useEffect, useRef, useState } from "react";
import type { FsEntry } from "../../domain/types";
import { FileTree } from "../components/file-tree";
import { FileView } from "../components/file-view";
import { Button, EmptyState, ErrorBox, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { navigate, useLocation } from "../lib/router";
import { useQuery } from "../hooks/use-query";
import { useTreeCollapse } from "../hooks/use-tree-collapse";

export function FilesPage() {
  const { search } = useLocation();
  const root = search.get("root");
  const path = search.get("path");

  const [hidden, setHidden] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const tree = useTreeCollapse(path);

  const roots = useQuery(() => api.fsRoots(), []);

  /**
   * 편집 중인지는 뷰어 안쪽 상태지만, 파일을 바꾸는 것은 바깥쪽 일이다.
   * 상태를 끌어올리면 타이핑마다 페이지 전체가 다시 그려지므로 ref 로만 공유한다.
   */
  const dirtyRef = useRef(false);

  // 루트가 URL 에 없으면 첫 번째 루트로 채운다. 뒤로가기 기록을 남기지 않는다.
  useEffect(() => {
    if (root || !roots.data) return;
    const first = roots.data.items[0];
    if (first) navigate(`/files?root=${encodeURIComponent(first.id)}`, { replace: true });
  }, [root, roots.data]);

  /** 저장하지 않은 편집이 있으면 이동 전에 확인한다. 취소하면 URL 을 바꾸지 않는다. */
  const confirmLeave = useCallback(() => {
    if (!dirtyRef.current) return true;
    return window.confirm("저장하지 않은 변경이 있습니다. 이동할까요?");
  }, []);

  const select = useCallback(
    (entry: FsEntry) => {
      if (!root || entry.path === path) return;
      if (!confirmLeave()) return;
      const query = new URLSearchParams({ root, path: entry.path });
      navigate(`/files?${query.toString()}`);
    },
    [root, path, confirmLeave],
  );

  if (roots.error) return <ErrorBox error={roots.error} onRetry={roots.reload} />;
  if (!roots.data) return <Spinner label="루트를 읽는 중…" />;
  if (roots.data.items.length === 0) {
    return (
      <EmptyState
        title="탐색할 루트가 없습니다"
        hint="WORKSPACE_ROOTS 환경변수에 디렉터리를 지정하고 서버를 다시 띄우세요."
      />
    );
  }
  if (!root) return <Spinner label="루트를 고르는 중…" />;

  return (
    <div className={tree.collapsed ? "files files--collapsed" : "files"}>
      <div className="files__side">
        <div className="files__toolbar">
          {roots.data.items.length > 1 ? (
            <select
              className="files__root"
              value={root}
              aria-label="루트 선택"
              onChange={(event) => {
                if (!confirmLeave()) return;
                navigate(`/files?root=${encodeURIComponent(event.target.value)}`);
              }}
            >
              {roots.data.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          ) : null}
          <label className="files__toggle">
            <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} />
            숨김
          </label>
          <Button variant="ghost" onClick={() => setRefreshToken((token) => token + 1)}>
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
        <FileTree
          root={root}
          selectedPath={path}
          hidden={hidden}
          refreshToken={refreshToken}
          onSelect={select}
        />
      </div>

      <div className="files__view">
        <FileView root={root} path={path} dirtyRef={dirtyRef} />
      </div>
    </div>
  );
}

