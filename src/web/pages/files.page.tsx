import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { FsEntry } from "../../domain/types";
import { FileTree } from "../components/file-tree";
import { MarkdownEditor } from "../components/markdown-editor";
import { MarkdownPreview } from "../components/markdown-preview";
import { Button, EmptyState, ErrorBox, Spinner } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { bytes } from "../lib/format";
import { navigate, useLocation } from "../lib/router";
import { useEditorFile } from "../hooks/use-editor-file";
import { useQuery } from "../hooks/use-query";

export function FilesPage() {
  const { search } = useLocation();
  const root = search.get("root");
  const path = search.get("path");

  const [hidden, setHidden] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

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
    <div className="files">
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

type ViewMode = "preview" | "source" | "edit";

const MODES: { id: ViewMode; label: string }[] = [
  { id: "preview", label: "미리보기" },
  { id: "source", label: "원문" },
  { id: "edit", label: "편집" },
];

const MODE_KEY = "ct:view-mode";

function isViewMode(value: string | null): value is ViewMode {
  return value === "preview" || value === "source" || value === "edit";
}

/** 보기 방식은 개인 취향이라 URL 이 아니라 localStorage 에 남긴다. */
function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      const stored = window.localStorage.getItem(MODE_KEY);
      return isViewMode(stored) ? stored : "preview";
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

function FileView({
  root,
  path,
  dirtyRef,
}: {
  root: string;
  path: string | null;
  dirtyRef: RefObject<boolean>;
}) {
  const editor = useEditorFile(root, path);
  const [mode, setMode] = useViewMode();
  const { file, dirty } = editor;

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty, dirtyRef]);

  if (!path) return <EmptyState title="파일을 선택하세요" hint="왼쪽 트리에서 파일을 고르면 내용이 보입니다." />;
  if (editor.loadError) {
    const status = editor.loadError instanceof ApiError ? editor.loadError.status : 0;
    if (status === 413) {
      return <EmptyState title="파일이 너무 큽니다" hint="FS_MAX_READ_BYTES 상한을 넘었습니다." />;
    }
    return <ErrorBox error={editor.loadError} onRetry={() => void editor.reload()} />;
  }
  if (!file) return <Spinner />;

  if (file.encoding === "binary") {
    return (
      <EmptyState title="미리보기를 지원하지 않는 파일입니다" hint={`${file.name} · ${bytes(file.size)}`} />
    );
  }

  // 미리보기는 마크다운에만, 편집은 쓰기 허용 확장자에만. 원문은 언제나 있다.
  const available = MODES.filter(
    (candidate) =>
      candidate.id === "source" ||
      (candidate.id === "preview" && file.language === "markdown") ||
      (candidate.id === "edit" && file.editable),
  );
  const active: ViewMode = available.some((candidate) => candidate.id === mode) ? mode : "source";
  const directory = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";

  return (
    <div className="viewer">
      <div className="viewer__bar">
        <span className="viewer__path">
          {file.path}
          {dirty ? <span className="viewer__dot" title="저장하지 않은 변경" /> : null}
        </span>
        <span className="viewer__meta">
          {available.length > 1 ? (
            <span className="viewer__modes" role="group" aria-label="보기 방식">
              {available.map((candidate) => (
                <Button
                  key={candidate.id}
                  variant={active === candidate.id ? "primary" : undefined}
                  aria-pressed={active === candidate.id}
                  onClick={() => setMode(candidate.id)}
                >
                  {candidate.label}
                </Button>
              ))}
            </span>
          ) : null}
          {file.language} · {bytes(file.size)}
        </span>
      </div>

      {/*
        세 탭 모두 서버 응답이 아니라 draft 를 원본으로 삼는다. 그래서 편집 중인 내용을
        저장하기 전에 미리보기로 확인할 수 있다. 편집하지 않았다면 draft 는 디스크 내용과 같다.
      */}
      {active === "edit" ? (
        <MarkdownEditor editor={editor} />
      ) : active === "preview" ? (
        <div className="viewer__body viewer__body--rendered">
          <MarkdownPreview text={editor.draft} root={root} basePath={directory} />
        </div>
      ) : (
        <pre className="viewer__body">{editor.draft}</pre>
      )}
    </div>
  );
}
