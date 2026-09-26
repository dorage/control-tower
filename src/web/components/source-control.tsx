import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceCheckout, WorkspaceGitAction, WorkspaceGitStatus } from "../../domain/workspace";
import { useQuery } from "../hooks/use-query";
import { api, ApiError } from "../lib/api";
import { Button } from "./ui";

interface Outcome {
  tone: "success" | "danger";
  text: string;
  /** git 이 남긴 말. 실패했을 때 사람이 터미널로 가야 할지 판단하는 근거다 */
  output: string;
}

/** 한 줄 요약. 숫자는 항상 보여 준다 - "변경 0" 이 곧 커밋할 것이 없다는 뜻이다. */
function summarize(status: WorkspaceGitStatus): string {
  const tracking = status.upstream ? `${status.upstream} ↑${status.ahead} ↓${status.behind}` : "추적 브랜치 없음";
  return `변경 ${status.changed} · ${tracking}`;
}

/** main 으로 곧장 올리는 것은 자동 배포를 부른다. 한 번은 묻는다. */
function isProtected(branch: string | null): boolean {
  return branch === "main" || branch === "master";
}

function describeError(error: unknown): Outcome {
  if (error instanceof ApiError) {
    const output = typeof error.detail.output === "string" ? error.detail.output : "";
    return { tone: "danger", text: error.message, output };
  }
  return { tone: "danger", text: error instanceof Error ? error.message : String(error), output: "" };
}

/**
 * 브랜치 줄과 파일 트리 사이의 소스 컨트롤 - pull · commit · push.
 *
 * 워크스페이스 파일 변경은 SSE 로 오지 않으므로(file-view 참고), 동작이 끝나면 `onChanged` 로
 * 페이지에 알려 트리와 저장소 목록을 다시 읽게 한다. 상태 자체도 `refreshToken` 에 묶여 그때 같이 읽힌다.
 */
export function SourceControl({
  repoId,
  checkout,
  refreshToken,
  onChanged,
  confirmLeave,
}: {
  repoId: string;
  checkout: WorkspaceCheckout;
  refreshToken: number;
  onChanged: () => void;
  /** 저장하지 않은 편집이 있으면 pull 전에 묻는다. pull 이 그 파일을 덮을 수 있다 */
  confirmLeave: () => boolean;
}) {
  const status = useQuery(() => api.workspaceGitStatus(repoId, checkout.id), [repoId, checkout.id, refreshToken]);
  const [busy, setBusy] = useState<WorkspaceGitAction | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  /** 늦게 온 응답이 그사이 고른 다른 체크아웃의 결과로 보이지 않게 한다. */
  const targetRef = useRef(`${repoId}/${checkout.id}`);
  useEffect(() => {
    targetRef.current = `${repoId}/${checkout.id}`;
    setOutcome(null);
    setBusy(null);
  }, [repoId, checkout.id]);

  const run = useCallback(
    async (action: WorkspaceGitAction) => {
      if (action === "pull" && !confirmLeave()) return;
      if (action === "push" && isProtected(status.data?.branch ?? checkout.branch)) {
        if (!window.confirm(`${status.data?.branch ?? checkout.branch} 에 바로 push 합니다. 계속할까요?`)) return;
      }
      const target = targetRef.current;
      setBusy(action);
      setOutcome(null);
      try {
        const result = await api.workspaceGit({ repo: repoId, wt: checkout.id, action });
        if (targetRef.current !== target) return;
        setOutcome({ tone: "success", text: result.message, output: result.output });
        onChanged();
      } catch (error) {
        if (targetRef.current !== target) return;
        setOutcome(describeError(error));
      } finally {
        if (targetRef.current === target) setBusy(null);
      }
    },
    [repoId, checkout.id, checkout.branch, status.data, confirmLeave, onChanged],
  );

  const changed = status.data?.changed ?? 0;
  const label = (action: WorkspaceGitAction, idle: string, working: string) => (busy === action ? working : idle);

  return (
    <section className="files__scm" aria-label="소스 컨트롤">
      <div className="files__scm-status" role="status">
        {status.data
          ? summarize(status.data)
          : status.error
            ? "상태를 읽지 못했습니다"
            : "상태 읽는 중…"}
      </div>
      <div className="files__scm-actions">
        <Button disabled={busy !== null} onClick={() => void run("pull")}>
          {label("pull", "Pull", "Pull 중…")}
        </Button>
        <Button
          disabled={busy !== null || changed === 0}
          title={changed === 0 ? "커밋할 변경이 없습니다" : "메시지는 지금 시각(KST)으로 채웁니다"}
          onClick={() => void run("commit")}
        >
          {label("commit", "Commit", "Commit 중…")}
        </Button>
        <Button disabled={busy !== null} onClick={() => void run("push")}>
          {label("push", "Push", "Push 중…")}
        </Button>
      </div>
      {status.data?.self ? (
        <div className="files__scm-note">
          이 서버 자신의 저장소입니다. pull 로 받은 코드는 <code>bun run restart</code> 를 해야 떠오릅니다.
        </div>
      ) : null}
      {outcome ? (
        <div className={`files__scm-result files__scm-result--${outcome.tone}`}>
          <div>{outcome.text}</div>
          {outcome.output ? <pre className="files__scm-output">{outcome.output}</pre> : null}
        </div>
      ) : null}
    </section>
  );
}
