import { memo, useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { SessionSummary } from "../../domain/types";
import { compactNumber, dateTime, dayGroup, duration, relativeTime, tildePath } from "../lib/format";
import { Link } from "../lib/router";
import { Badge } from "./ui";

/** 제목이 없는 세션이 흔하다. 첫 프롬프트 → id 앞자리 순으로 물러선다. */
export function sessionTitle(session: SessionSummary): string {
  if (session.title) return session.title;
  if (session.firstPrompt) {
    const line = session.firstPrompt.split("\n").find((part) => part.trim()) ?? session.firstPrompt;
    return line.length > 80 ? `${line.slice(0, 80)}…` : line;
  }
  return session.id.slice(0, 8);
}

/**
 * 클립보드 버튼. 카드 전체가 링크이므로 기본 동작과 전파를 모두 막지 않으면
 * 복사와 동시에 화면이 넘어간다.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      // 보안 컨텍스트가 아니면 clipboard 가 없다. 조용히 무시한다.
      void navigator.clipboard?.writeText(value).then(() => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1200);
      });
    },
    [value],
  );

  return (
    <button type="button" className="copy" title={label} aria-label={label} onClick={onClick}>
      {copied ? "복사됨" : "복사"}
    </button>
  );
}

/**
 * 이 세션이 거쳐 간 스킬. 서버가 처음 쓴 순서로 주므로 여기서 다시 정렬하지 않는다.
 *
 * 카드는 훑어보는 화면이라 앞의 몇 개만 보이고 나머지는 개수로 접는다. 두 번 이상
 * 불린 스킬만 횟수를 붙인다 — 대부분 1회라서 "×1" 이 줄마다 붙으면 잡음이 된다.
 */
function SkillChips({ session, limit = 4 }: { session: SessionSummary; limit?: number }) {
  const skills = session.skillUsage;
  if (skills.length === 0) return null;
  const shown = skills.slice(0, limit);
  const hidden = skills.length - shown.length;

  return (
    <div className="session-card__skills" title={skills.map((skill) => skill.name).join(", ")}>
      {shown.map((skill) => (
        <span key={skill.name} className="skill-chip">
          {skill.name}
          {skill.count > 1 ? <span className="skill-chip__count">×{skill.count}</span> : null}
        </span>
      ))}
      {hidden > 0 ? <span className="skill-chip skill-chip--more">+{hidden}</span> : null}
    </div>
  );
}

function LiveDot({ session }: { session: SessionSummary }) {
  if (session.live?.alive === true) {
    return (
      <span className="session-card__live session-card__live--on" title="실행 중">
        <span className="session-card__dot" aria-hidden="true" />
        실행 중
      </span>
    );
  }
  if (session.live && session.live.alive === false) {
    return (
      <span className="session-card__live" title="등록만 남은 세션">
        <span className="session-card__dot" aria-hidden="true" />
        종료됨
      </span>
    );
  }
  return null;
}

/**
 * 세션 카드. 대시보드(T-017)가 `compact` 로 재사용한다.
 *
 * 카드 전체가 링크라서 안에 다른 링크를 중첩하지 않는다. 프로젝트 필터·복사처럼
 * 이동이 아닌 동작은 버튼으로 두고 각자 기본 동작을 막는다.
 */
export const SessionCard = memo(function SessionCard({
  session,
  compact = false,
  onSelectProject,
}: {
  session: SessionSummary;
  compact?: boolean;
  onSelectProject?: (projectId: string) => void;
}) {
  const title = sessionTitle(session);

  return (
    <Link to={`/sessions/${encodeURIComponent(session.id)}`} className="session-card">
      <div className="session-card__head">
        <span className="session-card__title">{title}</span>
        <span className="session-card__time" title={dateTime(session.lastActivityAt)}>
          {relativeTime(session.lastActivityAt)}
        </span>
      </div>

      <div className="session-card__path">
        {onSelectProject ? (
          <button
            type="button"
            className="session-card__project"
            title="이 프로젝트만 보기"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelectProject(session.projectId);
            }}
          >
            {tildePath(session.projectPath)}
          </button>
        ) : (
          <span className="session-card__project session-card__project--plain">
            {tildePath(session.projectPath)}
          </span>
        )}
        {session.gitBranch ? <span className="session-card__branch">{session.gitBranch}</span> : null}
      </div>

      <SkillChips session={session} limit={compact ? 3 : 6} />

      {compact ? null : (
        <>
          <div className="session-card__counts">
            <span>메시지 {compactNumber(session.counts.userMessages + session.counts.assistantMessages)}</span>
            <span>툴 {compactNumber(session.counts.toolUses)}</span>
            <span>{session.durationMs === null ? "-" : duration(session.durationMs)}</span>
            <span>{compactNumber(session.usage.total)} 토큰</span>
          </div>

          <div className="session-card__badges">
            <LiveDot session={session} />
            {session.models.map((model) => (
              <Badge key={model}>{model}</Badge>
            ))}
            {session.kind ? <Badge>{session.kind}</Badge> : null}
            {session.counts.errors > 0 ? (
              <Badge tone="danger">오류 {session.counts.errors}</Badge>
            ) : null}
            {session.counts.sidechainRecords > 0 ? <Badge tone="accent">서브에이전트</Badge> : null}
            <span className="session-card__id">
              {session.id.slice(0, 8)}
              <CopyButton value={session.id} label="세션 id 복사" />
            </span>
          </div>
        </>
      )}

      {compact ? <LiveDot session={session} /> : null}
    </Link>
  );
});

export function SessionCardSkeleton() {
  return <div className="session-card session-card--skeleton" aria-hidden="true" />;
}

/**
 * 서버가 이미 lastActivityAt 내림차순으로 준다. 여기서 다시 정렬하지 않고
 * 묶음 이름이 바뀌는 지점에만 구분선을 끼운다.
 */
export function SessionList({
  sessions,
  onSelectProject,
}: {
  sessions: SessionSummary[];
  onSelectProject?: (projectId: string) => void;
}) {
  const rows: ReactNode[] = [];
  let group: string | null = null;

  for (const session of sessions) {
    const next = dayGroup(session.lastActivityAt);
    if (next !== group) {
      group = next;
      rows.push(
        <li key={`group-${next}-${session.id}`} className="session-list__group">
          {next}
        </li>,
      );
    }
    rows.push(
      <li key={session.id}>
        <SessionCard session={session} onSelectProject={onSelectProject} />
      </li>,
    );
  }

  return <ul className="session-list">{rows}</ul>;
}
