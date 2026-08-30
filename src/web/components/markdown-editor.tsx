import { useCallback, useRef, type KeyboardEvent } from "react";
import type { EditorFile } from "../hooks/use-editor-file";
import { INDENT, indentLines, listMarkerOf, outdentLines } from "../lib/editing";
import { clockTime } from "../lib/format";
import { Button } from "./ui";

/**
 * `document.execCommand("insertText")` 는 deprecated 지만, 브라우저의 **실행 취소 스택에
 * 편집을 기록하는 유일한 방법**이다. `setDraft` 로 값을 직접 갈아끼우면 Cmd+Z 가 망가진다.
 * 대체 경로(`beforeinput` + 자체 undo 스택)는 훨씬 복잡하고, 주요 브라우저는 모두 이 호출을
 * 여전히 지원한다. 또 이 호출은 진짜 `input` 이벤트를 발생시키므로 React 의 onChange 가
 * 정상적으로 따라온다.
 */
function insert(textarea: HTMLTextAreaElement, text: string): void {
  textarea.focus();
  document.execCommand("insertText", false, text);
}

/** 선택된 줄 전체를 들여쓰거나 내어쓴다. 선택이 없으면 커서가 놓인 줄이 대상이다. */
function shiftIndent(textarea: HTMLTextAreaElement, outdent: boolean): void {
  const { selectionStart, selectionEnd, value } = textarea;

  if (!outdent && selectionStart === selectionEnd) {
    insert(textarea, INDENT);
    return;
  }

  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const newline = value.indexOf("\n", selectionEnd);
  const lineEnd = newline === -1 ? value.length : newline;

  const block = value.slice(lineStart, lineEnd);
  const next = outdent ? outdentLines(block) : indentLines(block);
  if (next === block) return;

  textarea.setSelectionRange(lineStart, lineEnd);
  insert(textarea, next);
  textarea.setSelectionRange(lineStart, lineStart + next.length);
}

/** 선택 영역을 토큰으로 감싼다. 선택이 없으면 토큰 사이에 커서를 둔다. */
function wrapSelection(textarea: HTMLTextAreaElement, token: string): void {
  const { selectionStart, selectionEnd, value } = textarea;
  const selected = value.slice(selectionStart, selectionEnd);

  insert(textarea, `${token}${selected}${token}`);

  const start = selectionStart + token.length;
  textarea.setSelectionRange(start, start + selected.length);
}

/** 목록 안에서 Enter 를 누르면 표식을 이어 쓴다. 빈 항목에서는 목록을 끝낸다. */
function continueList(textarea: HTMLTextAreaElement): boolean {
  const { selectionStart, selectionEnd, value } = textarea;
  if (selectionStart !== selectionEnd) return false;

  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const marker = listMarkerOf(value.slice(lineStart, selectionStart));
  if (!marker) return false;

  if (marker.empty) {
    // 표식만 있는 줄에서의 Enter 는 그 표식을 지우고 목록을 빠져나간다.
    textarea.setSelectionRange(lineStart, selectionStart);
    insert(textarea, "\n");
    return true;
  }

  insert(textarea, `\n${marker.next}`);
  return true;
}

export function MarkdownEditor({ editor }: { editor: EditorFile }) {
  const { file, draft, dirty, status, restorable } = editor;
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const readOnly = !file?.editable;

  const { save } = editor;
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // 한글 조합 중에는 어떤 키도 가로채지 않는다. 가로채면 글자가 깨지고 커서가 튄다.
      if (event.nativeEvent.isComposing) return;

      const textarea = event.currentTarget;
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === "s") {
        // 브라우저의 "페이지 저장" 대화상자를 막는다.
        event.preventDefault();
        void save();
        return;
      }
      if (textarea.readOnly) return;

      if (mod && event.key.toLowerCase() === "b") {
        event.preventDefault();
        wrapSelection(textarea, "**");
        return;
      }
      if (mod && event.key.toLowerCase() === "i") {
        event.preventDefault();
        wrapSelection(textarea, "*");
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        shiftIndent(textarea, event.shiftKey);
        return;
      }
      if (event.key === "Enter" && !mod && !event.shiftKey) {
        if (continueList(textarea)) event.preventDefault();
      }
    },
    [save],
  );

  return (
    <div className="editor">
      {restorable !== null ? (
        <div className="editor__banner" role="status">
          <span className="editor__banner-text">저장하지 않은 편집 내용이 있습니다.</span>
          <Button variant="primary" onClick={editor.restoreDraft}>
            복원
          </Button>
          <Button variant="ghost" onClick={editor.discardDraft}>
            버리기
          </Button>
        </div>
      ) : null}

      {status.kind === "conflict" ? (
        <div className="editor__banner editor__banner--danger" role="alert">
          <span className="editor__banner-text">
            디스크에서 파일이 변경되었습니다. 편집 내용은 그대로 남아 있습니다.
          </span>
          <Button variant="danger" onClick={() => void editor.overwrite()}>
            내 변경으로 덮어쓰기
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              // 되돌릴 수 없다. dirty 면 한 번 더 묻는다.
              if (dirty && !window.confirm("편집 내용을 버리고 디스크 내용을 불러올까요?")) return;
              void editor.reload();
            }}
          >
            디스크 내용 불러오기
          </Button>
          <Button variant="ghost" onClick={editor.dismissStatus}>
            닫기
          </Button>
        </div>
      ) : null}

      {status.kind === "error" ? (
        <div className="editor__banner editor__banner--danger" role="alert">
          <span className="editor__banner-text">
            저장하지 못했습니다: {status.error instanceof Error ? status.error.message : String(status.error)}
          </span>
          <Button variant="ghost" onClick={editor.dismissStatus}>
            닫기
          </Button>
        </div>
      ) : null}

      {readOnly ? (
        <div className="editor__banner" role="status">
          <span className="editor__banner-text">
            쓰기가 허용되지 않는 파일입니다. 읽기 전용으로 엽니다.
          </span>
        </div>
      ) : null}

      <textarea
        ref={areaRef}
        className="editor__input"
        value={draft}
        onChange={(event) => editor.setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        readOnly={readOnly}
        aria-label="마크다운 편집"
      />

      <div className="editor__status">
        <span className="editor__state">
          {status.kind === "saving"
            ? "저장 중…"
            : dirty
              ? "수정됨"
              : status.kind === "saved"
                ? `저장됨 ${clockTime(status.at)}`
                : ""}
        </span>
        <Button variant="ghost" disabled={!dirty} onClick={() => void editor.reload()}>
          되돌리기
        </Button>
        <Button
          variant="primary"
          disabled={readOnly || !dirty || status.kind === "saving"}
          onClick={() => void save()}
        >
          저장 (⌘S)
        </Button>
      </div>
    </div>
  );
}
