import { useCallback, useEffect, useState } from "react";
import type { SessionSummary } from "../../domain/types";
import { SessionCardSkeleton, SessionList } from "../components/session-list";
import { Button, EmptyState, ErrorBox, Spinner } from "../components/ui";
import { useQuery } from "../hooks/use-query";
import { api } from "../lib/api";
import { tildePath } from "../lib/format";
import { setParams, useLocation } from "../lib/router";

const PAGE_SIZE = 50;

export function SessionsPage() {
  const { search } = useLocation();
  const q = search.get("q") ?? "";
  const projectId = search.get("projectId");

  const [draft, setDraft] = useState(q);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<SessionSummary[]>([]);

  // 뒤로가기나 붙여넣은 링크로 URL 이 밖에서 바뀌면 입력창을 맞춘다.
  useEffect(() => {
    setDraft(q);
  }, [q]);

  // 타이핑마다 push 하면 뒤로가기가 글자 단위로 되돌아간다. 300ms 뒤에 replace 한다.
  useEffect(() => {
    if (draft === q) return;
    const timer = setTimeout(() => setParams({ q: draft || null }, { replace: true }), 300);
    return () => clearTimeout(timer);
  }, [draft, q]);

  // 필터가 바뀌면 누적분을 버리고 처음부터 다시 읽는다.
  useEffect(() => {
    setOffset(0);
    setItems([]);
  }, [q, projectId]);

  const projects = useQuery(() => api.projects({ limit: 1000 }), []);
  const sessions = useQuery(
    () => api.sessions({ q: q || null, projectId, limit: PAGE_SIZE, offset }),
    [q, projectId, offset],
  );

  // 오래된 응답은 useQuery 가 이미 버린다. 여기서는 이어 붙이기만 한다.
  const pageData = sessions.data;
  useEffect(() => {
    if (!pageData) return;
    setItems((previous) => {
      if (pageData.offset === 0) return pageData.items;
      // 같은 페이지를 다시 읽는 경우(재시도)가 있어 id 로 한 번 거른다.
      const seen = new Set(previous.map((session) => session.id));
      return [...previous, ...pageData.items.filter((session) => !seen.has(session.id))];
    });
  }, [pageData]);

  const selectProject = useCallback((id: string) => setParams({ projectId: id, q: null }), []);
  const resetFilters = useCallback(() => setParams({ projectId: null, q: null }), []);

  const total = pageData?.total ?? 0;
  const filtered = Boolean(q || projectId);
  const firstLoad = sessions.loading && items.length === 0;
  const hasMore = items.length < total;

  return (
    <div className="sessions">
      <div className="sessions__bar">
        <input
          type="search"
          className="sessions__search"
          placeholder="제목·프롬프트·경로 검색"
          aria-label="세션 검색"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <select
          className="sessions__project"
          aria-label="프로젝트 필터"
          value={projectId ?? ""}
          onChange={(event) => setParams({ projectId: event.target.value || null })}
        >
          <option value="">전체 프로젝트</option>
          {(projects.data?.items ?? []).map((project) => (
            <option key={project.id} value={project.id}>
              {tildePath(project.path)} ({project.sessionCount})
            </option>
          ))}
        </select>
        <span className="sessions__total">
          {sessions.data ? `총 ${total}개` : ""}
          {filtered ? (
            <Button variant="ghost" onClick={resetFilters}>
              필터 해제
            </Button>
          ) : null}
        </span>
      </div>

      {sessions.error ? <ErrorBox error={sessions.error} onRetry={sessions.reload} /> : null}

      {firstLoad ? (
        <div className="session-list">
          {Array.from({ length: 5 }, (_, index) => (
            <SessionCardSkeleton key={index} />
          ))}
        </div>
      ) : null}

      {!firstLoad && !sessions.error && items.length === 0 ? (
        filtered ? (
          <div className="sessions__empty">
            <EmptyState title="조건에 맞는 세션이 없습니다" hint="검색어나 프로젝트 필터를 바꿔 보세요." />
            <Button onClick={resetFilters}>필터 초기화</Button>
          </div>
        ) : (
          <NoSessions />
        )
      ) : null}

      {items.length > 0 ? <SessionList sessions={items} onSelectProject={selectProject} /> : null}

      {items.length > 0 ? (
        <div className="sessions__more">
          {sessions.loading ? (
            <Spinner />
          ) : hasMore ? (
            <Button onClick={() => setOffset(items.length)}>더 보기</Button>
          ) : (
            <span className="sessions__end">전체 {total}개</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** CLAUDE_HOME 경로를 안내해야 해서 이 상황에서만 health 를 읽는다. */
function NoSessions() {
  const health = useQuery(() => api.health(), []);
  return (
    <EmptyState
      title="세션이 없습니다"
      hint={
        health.data
          ? `관찰 중인 경로: ${health.data.claudeDir} · CLAUDE_HOME 환경변수로 바꿀 수 있습니다.`
          : "CLAUDE_HOME 환경변수로 관찰 경로를 바꿀 수 있습니다."
      }
    />
  );
}
