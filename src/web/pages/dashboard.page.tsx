import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { HistoryEntry, ProjectSummary, Stats } from "../../domain/types";
import { BarBreakdown } from "../components/bar-breakdown";
import { QuickLinks } from "../components/quick-links";
import { SessionCard, SessionCardSkeleton } from "../components/session-list";
import { StatTile, StatTileRow } from "../components/stat-tile";
import { Button, EmptyState, ErrorBox, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { compactNumber, dateTime, relativeTime, tildePath } from "../lib/format";
import { Link } from "../lib/router";
import { useDebouncedCallback } from "../lib/debounce";
import { useLiveChange } from "../hooks/use-live";
import { useQuery } from "../hooks/use-query";

/**
 * A card that owns its own loading and error state.
 *
 * The dashboard pulls from four independent endpoints; one of them failing (no
 * `history.jsonl` on a fresh install, say) must not blank the page. So the error lives
 * inside the card, never around the grid.
 */
function Card<T>({
  title,
  state,
  action,
  children,
}: {
  title: string;
  state: { data: T | null; error: unknown; loading: boolean; reload: () => void };
  action?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  return (
    <section className="dash-card">
      <header className="dash-card__head">
        <h2>{title}</h2>
        {action}
      </header>
      {state.error ? (
        <ErrorBox error={state.error} onRetry={state.reload} />
      ) : state.data ? (
        children(state.data)
      ) : (
        <Spinner label={`${title} 불러오는 중`} />
      )}
    </section>
  );
}

function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

export function DashboardPage() {
  // Bumped by the refresh button; every query depends on it so they all refetch together.
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  // 세션이 진행 중이면 change 가 1.5초마다 온다. 3초로 묶어 그 이하로만 다시 그린다.
  const liveRefresh = useDebouncedCallback(refresh, 3000);
  useLiveChange(liveRefresh);

  // Five independent requests, all issued on mount - no waterfall.
  const stats = useQuery(() => api.stats(), [nonce]);
  const sessions = useQuery(() => api.sessions({ limit: 8 }), [nonce]);
  const projects = useQuery(() => api.projects({ limit: 6 }), [nonce]);
  const history = useQuery(() => api.history({ limit: 10 }), [nonce]);
  const telemetry = useQuery(() => api.telemetryStatus(), [nonce]);

  const collecting = telemetry.data?.collecting === true;
  const todayCost = useQuery(
    () =>
      collecting
        ? api.telemetryCost({ from: startOfToday(), to: Date.now(), bucket: "raw" })
        : Promise.resolve(null),
    [nonce, collecting],
  );

  const toolRows = useMemo(
    () => (stats.data?.tools ?? []).map((tool) => ({ key: tool.name, value: tool.count })),
    [stats.data],
  );

  // 호출 수만 보면 한 세션이 몰아 쓴 스킬과 여러 세션이 고르게 쓴 스킬을 구별할 수 없다.
  const skillRows = useMemo(
    () =>
      (stats.data?.skills ?? []).map((skill) => ({
        key: skill.name,
        value: skill.count,
        display: `${skill.count}회`,
        note: `${skill.sessions}세션`,
      })),
    [stats.data],
  );

  if (stats.error) {
    return (
      <div className="dashboard">
        <QuickLinks />
        <ErrorBox error={stats.error} onRetry={stats.reload} />
      </div>
    );
  }

  if (!stats.data) {
    return (
      <div className="dashboard">
        <QuickLinks />
        <Spinner label="대시보드 불러오는 중" />
      </div>
    );
  }

  const data: Stats = stats.data;

  if (data.sessions === 0) {
    return (
      <div className="dashboard">
        <QuickLinks />
        <EmptyState
          title="아직 세션 데이터가 없습니다"
          hint="CLAUDE_HOME 환경변수로 관찰 경로를 바꿀 수 있습니다."
        />
        <p className="dashboard__empty-actions">
          <Link to="/files" className="button">
            파일 탐색기로 가기
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <QuickLinks />
      <div className="dashboard__head">
        <span className="dashboard__updated" title={dateTime(data.updatedAt)}>
          {relativeTime(data.updatedAt)} 기준
        </span>
        <Button onClick={refresh}>새로고침</Button>
      </div>

      <StatTileRow>
        <StatTile
          label="실행 중"
          value={compactNumber(data.activeSessions)}
          tone={data.activeSessions > 0 ? "success" : "neutral"}
          dot={data.activeSessions > 0}
          to="/sessions"
        />
        <StatTile label="전체 세션" value={compactNumber(data.sessions)} to="/sessions" />
        <StatTile label="프로젝트" value={compactNumber(data.projects)} />
        <StatTile label="24시간 활동" value={compactNumber(data.activityLast24h)} />
        <StatTile
          label="토큰"
          value={compactNumber(data.usage.total)}
          hint={
            `입력 ${data.usage.input.toLocaleString()} · ` +
            `출력 ${data.usage.output.toLocaleString()} · ` +
            `캐시 읽기 ${data.usage.cacheRead.toLocaleString()} · ` +
            `캐시 생성 ${data.usage.cacheCreation.toLocaleString()}`
          }
        />
        {/*
          Cost only appears once telemetry is actually flowing. Rendering "$0.00" for
          someone who never configured it reads as "you spent nothing", which is worse
          than showing nothing at all. The grid is auto-fit, so four tiles lay out fine.
        */}
        {collecting && todayCost.data ? (
          <StatTile
            label="오늘 비용"
            value={`$${todayCost.data.total.toFixed(4)}`}
            tone="accent"
            to="/telemetry"
          />
        ) : null}
      </StatTileRow>

      <div className="dash-grid">
        <Card
          title="최근 세션"
          state={sessions}
          action={
            <Link to="/sessions" className="dash-card__link">
              모두 보기 →
            </Link>
          }
        >
          {(page) =>
            page.items.length === 0 ? (
              <p className="dash-card__empty">세션이 없습니다.</p>
            ) : (
              <div className="dash-card__sessions">
                {page.items.map((session) => (
                  <SessionCard key={session.id} session={session} compact />
                ))}
              </div>
            )
          }
        </Card>

        <Card title="프로젝트" state={projects}>
          {(page) =>
            page.items.length === 0 ? (
              <p className="dash-card__empty">프로젝트가 없습니다.</p>
            ) : (
              <ul className="dash-projects">
                {page.items.map((project: ProjectSummary) => (
                  <li key={project.id}>
                    <Link
                      to={`/sessions?projectId=${encodeURIComponent(project.id)}`}
                      className="dash-project"
                    >
                      <span className="dash-project__path" title={project.path}>
                        {tildePath(project.path)}
                      </span>
                      <span className="dash-project__meta">
                        {project.liveSessionCount > 0 ? (
                          <span className="dash-project__live">
                            실행 {project.liveSessionCount}
                          </span>
                        ) : null}
                        <span>{compactNumber(project.sessionCount)}세션</span>
                        <span>{compactNumber(project.usage.total)}토큰</span>
                        <span className="dash-project__time">
                          {relativeTime(project.lastActivityAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          }
        </Card>

        <Card title="자주 쓴 툴" state={stats}>
          {() => <BarBreakdown rows={toolRows} emptyHint="툴 사용 기록이 없습니다." />}
        </Card>

        <Card title="자주 쓴 스킬" state={stats}>
          {() => (
            <BarBreakdown
              rows={skillRows}
              emptyHint="스킬 사용 기록이 없습니다. 스킬을 쓴 세션이 없거나 아직 트랜스크립트에 남지 않았습니다."
            />
          )}
        </Card>

        <Card title="최근 프롬프트" state={history}>
          {(page) =>
            page.items.length === 0 ? (
              <p className="dash-card__empty">
                히스토리가 없습니다. <code>history.jsonl</code> 이 아직 없을 수 있습니다.
              </p>
            ) : (
              <ul className="dash-history">
                {page.items.map((entry: HistoryEntry, index: number) => (
                  <li key={`${entry.timestamp}-${index}`}>
                    <PromptRow entry={entry} />
                  </li>
                ))}
              </ul>
            )
          }
        </Card>
      </div>
    </div>
  );
}

/**
 * Prompt text is what the user typed. It is rendered as plain text - never markdown -
 * so a prompt containing backticks or a heading does not turn into formatting here.
 * `white-space: pre-wrap` in CSS keeps the line breaks.
 */
function PromptRow({ entry }: { entry: HistoryEntry }) {
  const body = (
    <>
      <span className="dash-history__text">{entry.display}</span>
      <span className="dash-history__meta">
        {entry.project ? (
          <span className="dash-history__project" title={entry.project}>
            {tildePath(entry.project)}
          </span>
        ) : null}
        <span title={dateTime(entry.timestamp)}>{relativeTime(entry.timestamp)}</span>
      </span>
    </>
  );

  if (!entry.sessionId) return <div className="dash-history__row">{body}</div>;
  return (
    <Link
      to={`/sessions/${encodeURIComponent(entry.sessionId)}`}
      className="dash-history__row dash-history__row--link"
    >
      {body}
    </Link>
  );
}

export { SessionCardSkeleton };
