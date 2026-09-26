import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { CodeBlock } from "./code-block";
import { HtmlPreview } from "./html-preview";
import { MarkdownEditor } from "./markdown-editor";
import { MarkdownPreview } from "./markdown-preview";
import { Button, EmptyState, ErrorBox, Spinner } from "./ui";
import { ApiError } from "../lib/api";
import { bytes } from "../lib/format";
import { useEditorFile } from "../hooks/use-editor-file";
import { useLiveChange } from "../hooks/use-live";
import { useDebouncedCallback } from "../lib/debounce";

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

/**
 * 파일 하나를 보고 고치는 오른쪽 패널. `/files` 와 `/workspace` 가 함께 쓴다.
 *
 * `path` 는 언제나 **루트 기준 전체 경로**다. 워크스페이스 화면처럼 사용자에게는 더 짧은
 * 경로를 보여주고 싶을 때 `displayPath` 로 표시만 갈아끼운다 — 링크·이미지 해석은
 * 전체 경로를 써야 하므로 표시와 실제를 나눈다.
 *
 * `reloadSignal` 은 바깥에서 "디스크가 바뀌었을 수 있다" 고 알리는 값이다. 워크스페이스의
 * pull 이나 새로고침처럼 SSE 로는 오지 않는 변경 뒤에 올린다. 아래 실시간 갱신과 같은
 * 규칙으로 처리한다 — 편집 중이면 읽지 않고 배너만 띄운다.
 */
export function FileView({
  root,
  path,
  displayPath,
  dirtyRef,
  reloadSignal,
}: {
  root: string;
  path: string | null;
  displayPath?: string;
  dirtyRef: RefObject<boolean>;
  reloadSignal?: number;
}) {
  const editor = useEditorFile(root, path);
  const [mode, setMode] = useViewMode();
  const { file, dirty } = editor;

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty, dirtyRef]);

  /**
   * 실시간 갱신 — 절대 규칙.
   *
   * **편집 중(dirty)이면 어떤 경우에도 다시 읽지 않는다.** 배너만 띄우고, 다시 읽을지는
   * 사용자가 정한다. 자동으로 읽으면 타이핑한 내용이 사라진다.
   *
   * dirty 가 아니어도 `reload()` 는 서버가 준 version 이 실제로 달라졌을 때만 draft 를
   * 갈아끼운다(use-editor-file). 같으면 아무 일도 없으므로 커서와 포커스가 유지된다.
   *
   * 그리고 `/api/events` 는 `~/.claude` 만 감시한다. 워크스페이스 파일 변경은 이
   * 이벤트로 오지 않으므로, 이 화면의 실시간성은 부수적이다.
   */
  const [maybeStale, setMaybeStale] = useState(false);
  const onLive = useDebouncedCallback(() => {
    if (dirtyRef.current) {
      setMaybeStale(true);
      return;
    }
    void editor.reload();
  }, 2000);
  useLiveChange(onLive, Boolean(path));

  /**
   * 바깥 신호는 디바운스 없이 바로 처리한다. 사람이 버튼을 눌러 생긴 변경이라 뭉칠 것이 없다.
   * 첫 렌더의 값은 신호가 아니다 — 파일을 막 열었을 때 두 번 읽지 않게 건너뛴다.
   */
  const seenSignal = useRef(reloadSignal);
  useEffect(() => {
    if (reloadSignal === undefined || reloadSignal === seenSignal.current) return;
    seenSignal.current = reloadSignal;
    if (!path) return;
    if (dirtyRef.current) {
      setMaybeStale(true);
      return;
    }
    void editor.reload();
    // editor.reload 는 root/path 에만 묶인 콜백이라 신호가 바뀔 때만 돌면 된다.
  }, [reloadSignal, path, dirtyRef, editor.reload]);

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

  // 미리보기는 마크다운과 HTML 에만, 편집은 쓰기 허용 확장자에만. 원문은 언제나 있다.
  const previewable = file.language === "markdown" || file.language === "html";
  const available = MODES.filter(
    (candidate) =>
      candidate.id === "source" ||
      (candidate.id === "preview" && previewable) ||
      (candidate.id === "edit" && file.editable),
  );
  const active: ViewMode = available.some((candidate) => candidate.id === mode) ? mode : "source";
  const directory = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";

  return (
    <div className="viewer">
      {maybeStale ? (
        <div className="live-banner">
          <span>디스크에서 변경되었을 수 있습니다. 편집 중이라 자동으로 읽지 않았습니다.</span>
          <Button
            onClick={() => {
              setMaybeStale(false);
              void editor.reload();
            }}
          >
            다시 읽기
          </Button>
        </div>
      ) : null}
      <div className="viewer__bar">
        <span className="viewer__path">
          {displayPath ?? file.path}
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
        마크다운 세 탭은 서버 응답이 아니라 draft 를 원본으로 삼는다. 그래서 편집 중인 내용을
        저장하기 전에 미리보기로 확인할 수 있다. 편집하지 않았다면 draft 는 디스크 내용과 같다.

        HTML 미리보기만 예외다 - iframe 이 /raw 에서 디스크의 파일을 직접 받는다(html-preview.tsx).
        HTML 은 편집 대상이 아니라 draft 와 디스크가 어긋날 일이 없다.
      */}
      {active === "edit" ? (
        <MarkdownEditor editor={editor} />
      ) : active === "preview" && file.language === "html" ? (
        <HtmlPreview root={root} path={file.path} version={file.version} />
      ) : active === "preview" ? (
        <div className="viewer__body viewer__body--rendered">
          <MarkdownPreview text={editor.draft} root={root} basePath={directory} />
        </div>
      ) : (
        // 원문 탭은 언제나 CodeBlock 을 거친다. 문법을 모르는 언어면 색 없는 한 덩어리가 나온다.
        <pre className="viewer__body code-surface">
          <CodeBlock text={editor.draft} language={file.language} />
        </pre>
      )}
    </div>
  );
}
