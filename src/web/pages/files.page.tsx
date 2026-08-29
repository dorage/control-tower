import { useCallback, useEffect, useState } from "react";
import type { FsEntry } from "../../domain/types";
import { FileTree } from "../components/file-tree";
import { MarkdownPreview } from "../components/markdown-preview";
import { Button, EmptyState, ErrorBox, Spinner } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { bytes } from "../lib/format";
import { navigate, useLocation } from "../lib/router";
import { useQuery } from "../hooks/use-query";

export function FilesPage() {
  const { search } = useLocation();
  const root = search.get("root");
  const path = search.get("path");

  const [hidden, setHidden] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const roots = useQuery(() => api.fsRoots(), []);

  // 루트가 URL 에 없으면 첫 번째 루트로 채운다. 뒤로가기 기록을 남기지 않는다.
  useEffect(() => {
    if (root || !roots.data) return;
    const first = roots.data.items[0];
    if (first) navigate(`/files?root=${encodeURIComponent(first.id)}`, { replace: true });
  }, [root, roots.data]);

  const select = useCallback(
    (entry: FsEntry) => {
      if (!root) return;
      const query = new URLSearchParams({ root, path: entry.path });
      navigate(`/files?${query.toString()}`);
    },
    [root],
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
    <div className="files">
      <div className="files__side">
        <div className="files__toolbar">
          {roots.data.items.length > 1 ? (
            <select
              className="files__root"
              value={root}
              aria-label="루트 선택"
              onChange={(event) => navigate(`/files?root=${encodeURIComponent(event.target.value)}`)}
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
        <FileView root={root} path={path} />
      </div>
    </div>
  );
}

type ViewMode = "source" | "preview";

const MODE_KEY = "ct:view-mode";

/** 보기 방식은 개인 취향이라 URL 이 아니라 localStorage 에 남긴다. */
function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      return window.localStorage.getItem(MODE_KEY) === "source" ? "source" : "preview";
    } catch {
      // 사생활 보호 모드 등에서 접근이 막힐 수 있다. 기본값으로 계속 동작한다.
      return "preview";
    }
  });
  const update = useCallback((next: ViewMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      // 저장 실패는 무시한다.
    }
  }, []);
  return [mode, update];
}

function FileView({ root, path }: { root: string; path: string | null }) {
  const file = useQuery(() => (path ? api.fsFile(root, path) : Promise.resolve(null)), [root, path]);
  const [mode, setMode] = useViewMode();

  if (!path) return <EmptyState title="파일을 선택하세요" hint="왼쪽 트리에서 파일을 고르면 내용이 보입니다." />;
  if (file.error) {
    const status = file.error instanceof ApiError ? file.error.status : 0;
    if (status === 413) {
      return <EmptyState title="파일이 너무 큽니다" hint="FS_MAX_READ_BYTES 상한을 넘었습니다." />;
    }
    return <ErrorBox error={file.error} onRetry={file.reload} />;
  }
  if (!file.data) return <Spinner />;

  const { data } = file;
  if (data.encoding === "binary") {
    return (
      <EmptyState title="미리보기를 지원하지 않는 파일입니다" hint={`${data.name} · ${bytes(data.size)}`} />
    );
  }

  const isMarkdown = data.language === "markdown";
  const rendered = isMarkdown && mode === "preview";
  const directory = data.path.includes("/") ? data.path.slice(0, data.path.lastIndexOf("/")) : "";

  return (
    <div className="viewer">
      <div className="viewer__bar">
        <span className="viewer__path">{data.path}</span>
        <span className="viewer__meta">
          {isMarkdown ? (
            <span className="viewer__modes" role="group" aria-label="보기 방식">
              <Button
                variant={rendered ? undefined : "primary"}
                aria-pressed={!rendered}
                onClick={() => setMode("source")}
              >
                원문
              </Button>
              <Button
                variant={rendered ? "primary" : undefined}
                aria-pressed={rendered}
                onClick={() => setMode("preview")}
              >
                미리보기
              </Button>
            </span>
          ) : null}
          {data.language} · {bytes(data.size)}
        </span>
      </div>
      {rendered ? (
        <div className="viewer__body viewer__body--rendered">
          <MarkdownPreview text={data.content ?? ""} root={root} basePath={directory} />
        </div>
      ) : (
        <pre className="viewer__body">{data.content}</pre>
      )}
    </div>
  );
}
