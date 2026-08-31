import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "../../domain/types";
import { CopyButton, sessionTitle } from "../components/session-list";
import { TimelineView } from "../components/timeline";
import { Badge, Button, EmptyState, ErrorBox, Spinner } from "../components/ui";
import { useQuery } from "../hooks/use-query";
import { useLiveChange } from "../hooks/use-live";
import { useDebouncedCallback } from "../lib/debounce";
import { ApiError, api } from "../lib/api";
import { compactNumber, dateTime, duration, tildePath } from "../lib/format";
import { Link, setParams, useLocation } from "../lib/router";

const PAGE_SIZE = 200;

/**
 * 토글 하나를 뒤집는 쿼리 조각.
 *
 * 네 토글이 모두 서버 필터라 total 과 페이지 경계가 함께 바뀐다. 그래서 항상 from 을
 * 0으로 되돌린다 - 안 그러면 "301-500 / 120" 같은 빈 페이지에 남는다.
 */
function toggle(name: string, next: boolean): Record<string, string | null> {
  return { [name]: next ? "1" : "0", from: null };
}

export function SessionDetailPage({ id }: { id: string }) {
  const { search } = useLocation();

  /**
   * 기본값은 "대화만": 사고 과정·툴 입출력·시스템 이벤트를 모두 끈다.
   *
   * 트랜스크립트는 대부분이 툴 왕복이다(실측 735줄 중 사람이 쓴 프롬프트 2줄, 모델의
   * 답변 20줄, 나머지 713줄이 툴·사고 과정·주입된 컨텍스트). 읽으러 온 사람이 찾는 것은
   * 자기가 뭘 시켰고 모델이 뭐라 답했는지이므로, 그것만 남긴 화면을 기본으로 준다.
   * 필요하면 토글로 되살릴 수 있고, 선택은 URL 에 남아 그대로 공유된다.
   */
  const events = search.get("events") === "1";
  const sidechain = search.get("sidechain") === "1";
  const thinking = search.get("thinking") === "1";
  const tools = search.get("tools") === "1";
  const from = Math.max(0, Number.parseInt(search.get("from") ?? "", 10) || 0);

  const session = useQuery(() => api.session(id), [id]);
  // 블록 필터도 서버에 넘긴다. 클라이언트에서 걸러 내면 남는 블록이 없는 엔트리가
  // total 에는 세어지고 화면에는 없어서, 페이지 표시와 실제 개수가 어긋난다.
  const timeline = useQuery(
    () => api.timeline(id, { limit: PAGE_SIZE, offset: from, events, sidechain, thinking, tools }),
    [id, from, events, sidechain, thinking, tools],
  );
  const health = useQuery(() => api.health(), []);

  /**
   * 실시간 갱신 — 읽던 자리를 흔들지 않는 것이 전부다.
   *
   * 1. 이 세션이 바뀌지 않았으면 아무것도 하지 않는다. T-004 가 changedSessions 를
   *    주기 전에는 "무엇이 바뀌었는지 모르니 항상 재조회"였는데, 이제 남의 세션이
   *    움직였다고 내 화면을 다시 그리는 일이 없다. (event === null 은 탭이 숨겨져
   *    있던 동안을 뜻하므로 그때만 무조건 갱신한다.)
   * 2. 마지막 페이지를 보고 있을 때만 자동으로 다시 읽는다. 앞 페이지를 읽는 중이면
   *    배너만 띄운다 — 읽던 위치가 통째로 바뀌면 방해다.
   * 3. 맨 아래에 있었으면 새 내용 아래로 따라 내리고, 아니면 스크롤을 그대로 둔다.
   */
  const [staleBanner, setStaleBanner] = useState(false);
  const stickToBottom = useRef(false);
  // 페이지네이션 상태를 디바운스 콜백이 stale closure 없이 읽게 한다.
  const timelineRef = useRef<{ shown: number; total: number }>({ shown: 0, total: 0 });

  const onLive = useDebouncedCallback((event: ChangeEvent | null) => {
    if (event && !event.changedSessions.includes(id) && !event.addedSessions.includes(id)) return;

    const atLastPage = from + (timelineRef.current?.shown ?? 0) >= (timelineRef.current?.total ?? 0);
    if (!atLastPage) {
      setStaleBanner(true);
      return;
    }
    const main = document.querySelector(".main");
    stickToBottom.current = main
      ? main.scrollTop + main.clientHeight >= main.scrollHeight - 50
      : false;
    timeline.reload();
  }, 2000);
  useLiveChange(onLive);

  // 자동 갱신 뒤, 맨 아래에 있었던 경우에만 따라 내린다.
  const timelineData = timeline.data;
  useEffect(() => {
    if (!timelineData || !stickToBottom.current) return;
    stickToBottom.current = false;
    const main = document.querySelector(".main");
    if (main) main.scrollTop = main.scrollHeight;
  }, [timelineData]);

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
  timelineRef.current = { shown, total };
  const transcriptPath = health.data
    ? `${health.data.claudeDir}/projects/${summary.projectId}/${summary.id}.jsonl`
    : null;

  return (
    <div className="session-detail">
      {staleBanner ? (
        <div className="live-banner">
          <span>새 메시지가 있습니다.</span>
          <Button
            onClick={() => {
              setStaleBanner(false);
              setParams({ from: String(Math.max(0, total - PAGE_SIZE)) });
            }}
          >
            최신으로
          </Button>
        </div>
      ) : null}
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
        <span className="session-detail__filters-label">대화 외에 함께 보기</span>
        <label className="toggle">
          <input
            type="checkbox"
            checked={thinking}
            onChange={(event) => setParams(toggle("thinking", event.target.checked))}
          />
          사고 과정
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={tools}
            onChange={(event) => setParams(toggle("tools", event.target.checked))}
          />
          툴 입출력
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={events}
            onChange={(event) => setParams(toggle("events", event.target.checked))}
          />
          시스템 이벤트
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={sidechain}
            onChange={(event) => setParams(toggle("sidechain", event.target.checked))}
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
        <EmptyState title="주고받은 말이 없습니다" hint="토글을 켜면 툴 입출력과 시스템 이벤트를 볼 수 있습니다." />
      ) : null}
      {entries && entries.length > 0 ? <TimelineView entries={entries} /> : null}

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
