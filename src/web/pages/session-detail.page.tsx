import { useEffect, useMemo } from "react";
import { CopyButton, sessionTitle } from "../components/session-list";
import { TimelineView, type BlockFilters } from "../components/timeline";
import { Badge, Button, EmptyState, ErrorBox, Spinner } from "../components/ui";
import { useQuery } from "../hooks/use-query";
import { ApiError, api } from "../lib/api";
import { compactNumber, dateTime, duration, tildePath } from "../lib/format";
import { Link, setParams, useLocation } from "../lib/router";

const PAGE_SIZE = 200;

/** 토글 하나를 뒤집는 쿼리 조각. 서버 필터는 total 과 페이지 경계를 바꾸므로 from 을 0으로 되돌린다. */
function toggle(name: string, next: boolean, resetOffset: boolean): Record<string, string | null> {
  return { [name]: next ? "1" : "0", ...(resetOffset ? { from: null } : {}) };
}

export function SessionDetailPage({ id }: { id: string }) {
  const { search } = useLocation();

  // 기본값: 이벤트는 끔, 나머지는 켬. URL 에 없으면 기본값을 쓴다.
  const events = search.get("events") === "1";
  const sidechain = search.get("sidechain") !== "0";
  const thinking = search.get("thinking") !== "0";
  const tools = search.get("tools") !== "0";
  const from = Math.max(0, Number.parseInt(search.get("from") ?? "", 10) || 0);

  const session = useQuery(() => api.session(id), [id]);
  const timeline = useQuery(
    () => api.timeline(id, { limit: PAGE_SIZE, offset: from, events, sidechain }),
    [id, from, events, sidechain],
  );
  const health = useQuery(() => api.health(), []);

  // 참조가 매번 바뀌면 TimelineEntryView 의 memo 가 무력해진다.
  const filters = useMemo<BlockFilters>(() => ({ thinking, tools }), [thinking, tools]);

  const summary = session.data;
  useEffect(() => {
    if (summary) document.title = `${sessionTitle(summary)} · control tower`;
  }, [summary]);

  // #entry-42 로 들어오면 데이터가 도착한 뒤에야 대상 노드가 생긴다.
  const entries = timeline.data?.entries;
  useEffect(() => {
    if (!entries || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [entries]);

  if (session.error) {
    const status = session.error instanceof ApiError ? session.error.status : 0;
    if (status === 404) {
      return (
        <div className="session-detail__missing">
          <EmptyState title="없는 세션입니다" hint={id} />
          <Link to="/sessions" className="button">
            세션 목록으로
          </Link>
        </div>
      );
    }
    return <ErrorBox error={session.error} onRetry={session.reload} />;
  }
  if (!summary) return <Spinner label="세션을 읽는 중…" />;

  const total = timeline.data?.total ?? 0;
  const shown = entries?.length ?? 0;
  const transcriptPath = health.data
    ? `${health.data.claudeDir}/projects/${summary.projectId}/${summary.id}.jsonl`
    : null;

  return (
    <div className="session-detail">
      <header className="session-detail__head">
        <Link to="/sessions" className="session-detail__back">
          ← 세션 목록
        </Link>

        <h1 className="session-detail__title">
          {sessionTitle(summary)}
          {summary.live?.alive === true ? <Badge tone="success">실행 중</Badge> : null}
        </h1>

        <div className="session-detail__meta">
          <span>{tildePath(summary.projectPath)}</span>
          {summary.gitBranch ? <span>{summary.gitBranch}</span> : null}
          {summary.models.map((model) => (
            <span key={model}>{model}</span>
          ))}
          <span>{summary.durationMs === null ? "-" : duration(summary.durationMs)}</span>
          <span title={dateTime(summary.lastActivityAt)}>{dateTime(summary.lastActivityAt)}</span>
        </div>

        <div className="session-detail__counts">
          <span>메시지 {summary.counts.userMessages + summary.counts.assistantMessages}</span>
          <span>툴 {summary.counts.toolUses}</span>
          {summary.counts.errors > 0 ? (
            <span className="session-detail__errors">오류 {summary.counts.errors}</span>
          ) : null}
          <span>{compactNumber(summary.usage.total)} 토큰</span>
          <span className="session-detail__id">
            {summary.id}
            <CopyButton value={summary.id} label="세션 id 복사" />
          </span>
        </div>

        {transcriptPath ? <div className="session-detail__source">{transcriptPath}</div> : null}
      </header>

      <div className="session-detail__filters">
        <label className="toggle">
          <input
            type="checkbox"
            checked={thinking}
            onChange={(event) => setParams(toggle("thinking", event.target.checked, false))}
          />
          사고 과정
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={tools}
            onChange={(event) => setParams(toggle("tools", event.target.checked, false))}
          />
          툴 입출력
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={events}
            onChange={(event) => setParams(toggle("events", event.target.checked, true))}
          />
          시스템 이벤트
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={sidechain}
            onChange={(event) => setParams(toggle("sidechain", event.target.checked, true))}
          />
          서브에이전트
        </label>
        <span className="session-detail__range">
          {shown === 0 ? "0" : `${from + 1}-${from + shown}`} / {total}
        </span>
      </div>

      {timeline.error ? <ErrorBox error={timeline.error} onRetry={timeline.reload} /> : null}
      {timeline.loading && !entries ? <Spinner label="타임라인을 읽는 중…" /> : null}
      {entries && entries.length === 0 ? (
        <EmptyState title="표시할 엔트리가 없습니다" hint="필터를 바꿔 보세요." />
      ) : null}
      {entries && entries.length > 0 ? <TimelineView entries={entries} filters={filters} /> : null}

      {total > PAGE_SIZE ? (
        <div className="session-detail__pager">
          <Button
            disabled={from === 0}
            onClick={() => setParams({ from: from <= PAGE_SIZE ? null : String(from - PAGE_SIZE) })}
          >
            이전 {PAGE_SIZE}개
          </Button>
          <Button
            disabled={from + shown >= total}
            onClick={() => setParams({ from: String(from + PAGE_SIZE) })}
          >
            다음 {PAGE_SIZE}개
          </Button>
        </div>
      ) : null}
    </div>
  );
}
