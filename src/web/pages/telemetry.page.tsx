import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Bucket } from "../../domain/telemetry";
import { BarBreakdown } from "../components/bar-breakdown";
import { StackedTimeline } from "../components/stacked-timeline";
import { Button, ErrorBox, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { bytes, compactNumber, dateTime } from "../lib/format";
import { useQuery } from "../hooks/use-query";

const DAY_MS = 86_400_000;

/**
 * 기간 → 버킷 해상도.
 *
 * raw 는 export 간격(기본 10초)이라 24시간까지만 의미가 있다. 그보다 넓으면 서버가
 * 어차피 hour 로 승격하므로(degraded) 처음부터 맞춰 보낸다.
 */
const RANGES = [
  { id: "24h", label: "24시간", ms: DAY_MS, bucket: "raw" as Bucket },
  { id: "7d", label: "7일", ms: 7 * DAY_MS, bucket: "hour" as Bucket },
  { id: "30d", label: "30일", ms: 30 * DAY_MS, bucket: "hour" as Bucket },
  { id: "all", label: "전체", ms: 3650 * DAY_MS, bucket: "day" as Bucket },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

function Card({
  title,
  note,
  children,
  wide = false,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={wide ? "dash-card dash-card--wide" : "dash-card"}>
      <header className="dash-card__head">
        <h2>{title}</h2>
        {note}
      </header>
      {children}
    </section>
  );
}

/** 카드 하나가 실패해도 나머지는 그린다. */
function Loaded<T>({
  state,
  title,
  children,
}: {
  state: { data: T | null; error: unknown; reload: () => void };
  title: string;
  children: (data: T) => ReactNode;
}) {
  if (state.error) return <ErrorBox error={state.error} onRetry={state.reload} />;
  if (!state.data) return <Spinner label={`${title} 불러오는 중`} />;
  return <>{children(state.data)}</>;
}

export function TelemetryPage() {
  const [rangeId, setRangeId] = useState<RangeId>("24h");
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  const range = RANGES.find((item) => item.id === rangeId) ?? RANGES[0];
  const { from, to, bucket } = useMemo(() => {
    const now = Date.now();
    return { from: now - range.ms, to: now, bucket: range.bucket };
  }, [range, nonce]);

  const status = useQuery(() => api.telemetryStatus(), [nonce]);
  const collecting = status.data?.collecting === true;

  // 수집 전에는 요청을 보내지 않는다. 빈 차트 여섯 개를 그릴 이유가 없다.
  const enabled = collecting;
  const tokensBySource = useQuery(
    () => (enabled ? api.telemetryTokens({ from, to, bucket, groupBy: "query_source" }) : Promise.resolve(null)),
    [enabled, from, to, bucket],
  );
  const tokensByType = useQuery(
    () => (enabled ? api.telemetryTokens({ from, to, bucket, groupBy: "type" }) : Promise.resolve(null)),
    [enabled, from, to, bucket],
  );
  const costByModel = useQuery(
    () => (enabled ? api.telemetryCost({ from, to, bucket, groupBy: "model" }) : Promise.resolve(null)),
    [enabled, from, to, bucket],
  );
  const costSeries = useQuery(
    () =>
      enabled
        ? api.telemetryTimeseries({ from, to, bucket, groupBy: "model", metric: "cost.usage" })
        : Promise.resolve(null),
    [enabled, from, to, bucket],
  );
  const latency = useQuery(
    () => (enabled ? api.telemetryLatency({ from, to, groupBy: "query_source" }) : Promise.resolve(null)),
    [enabled, from, to],
  );

  if (status.error) return <div className="dashboard"><ErrorBox error={status.error} onRetry={status.reload} /></div>;
  if (!status.data) return <div className="dashboard"><Spinner label="텔레메트리 상태 확인 중" /></div>;

  if (!collecting) return <SetupGuide port={status.data.port} enabled={status.data.enabled} />;

  const since = status.data.since ? Date.parse(status.data.since) : null;
  // 수집 시작 이전을 고른 경우, 없는 게 정상이다. 버그로 오해하지 않도록 말해 준다.
  const truncated = since !== null && from < since;
  const dbRatio = status.data.dbBytes / Math.max(status.data.hardLimitBytes, 1);

  return (
    <div className="dashboard">
      <div className="telemetry__head">
        <div className="telemetry__ranges" role="group" aria-label="기간">
          {RANGES.map((item) => (
            <Button
              key={item.id}
              onClick={() => setRangeId(item.id)}
              variant={item.id === rangeId ? "primary" : "ghost"}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="telemetry__meta">
          {since !== null ? (
            <span title={dateTime(since)}>수집 시작 {dateTime(since)}</span>
          ) : null}
          <span
            className={
              dbRatio > 0.9
                ? "telemetry__db telemetry__db--danger"
                : status.data.dbBytes > status.data.softLimitBytes
                  ? "telemetry__db telemetry__db--warn"
                  : "telemetry__db"
            }
            title={`소프트 한계 ${bytes(status.data.softLimitBytes)}`}
          >
            DB {bytes(status.data.dbBytes)} / {bytes(status.data.hardLimitBytes)}
          </span>
          <Button onClick={refresh}>새로고침</Button>
        </div>
      </div>

      {truncated ? (
        <p className="telemetry__truncated">
          {dateTime(since)} 이전은 수집되지 않았습니다. 그 이전 구간은 비어 있는 것이 정상입니다.
        </p>
      ) : null}

      <div className="dash-grid">
        <Card
          title="토큰 분포 (query_source)"
          note={<Degraded value={tokensBySource.data?.degraded ?? null} />}
        >
          <Loaded state={tokensBySource} title="토큰 분포">
            {(data) =>
              data ? (
                <>
                  <BarBreakdown
                    rows={data.items.map((item) => ({
                      key: item.key,
                      value: item.value,
                      display: compactNumber(item.value),
                    }))}
                    total={data.total}
                    showPercent
                  />
                  <p className="telemetry__hint">
                    main 이 실제 작업, 나머지(auxiliary·generate_session_title·sdk)가 오버헤드다.
                  </p>
                </>
              ) : null
            }
          </Loaded>
        </Card>

        <Card title="비용 추이" note={<Degraded value={costSeries.data?.degraded ?? null} />}>
          <Loaded state={costSeries} title="비용 추이">
            {(data) =>
              data ? (
                <StackedTimeline
                  buckets={data.buckets}
                  series={data.series}
                  formatValue={(value) => `$${value.toFixed(4)}`}
                  formatBucket={(ms) => dateTime(ms)}
                />
              ) : null
            }
          </Loaded>
        </Card>

        <Card title="토큰 종류" note={<Degraded value={tokensByType.data?.degraded ?? null} />}>
          <Loaded state={tokensByType} title="토큰 종류">
            {(data) =>
              data ? (
                <BarBreakdown
                  rows={data.items.map((item) => ({
                    key: item.key,
                    value: item.value,
                    display: compactNumber(item.value),
                  }))}
                  total={data.total}
                  showPercent
                />
              ) : null
            }
          </Loaded>
        </Card>

        <Card title="모델별 비용" note={<Degraded value={costByModel.data?.degraded ?? null} />}>
          <Loaded state={costByModel} title="모델별 비용">
            {(data) =>
              data ? (
                <BarBreakdown
                  rows={data.items.map((item) => ({
                    key: item.key,
                    value: item.value,
                    display: `$${item.value.toFixed(4)}`,
                  }))}
                  total={data.total}
                  showPercent
                />
              ) : null
            }
          </Loaded>
        </Card>

        <Card title="요청 지연 (duration_ms)" wide>
          <Loaded state={latency} title="요청 지연">
            {(data) =>
              !data || data.items.length === 0 ? (
                <p className="bar-breakdown__empty">이 기간에 요청 기록이 없습니다.</p>
              ) : (
                <div className="telemetry__table-wrap">
                  <table className="telemetry__table">
                    <thead>
                      <tr>
                        <th>query_source</th>
                        <th>건수</th>
                        <th>p50</th>
                        <th>p95</th>
                        <th>p99</th>
                        <th>최대</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((row) => (
                        <tr key={row.key}>
                          <td>{row.key}</td>
                          <td>{row.count.toLocaleString()}</td>
                          <td>{ms(row.p50)}</td>
                          <td>{ms(row.p95)}</td>
                          <td>{ms(row.p99)}</td>
                          <td>{ms(row.max)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </Loaded>
        </Card>
      </div>
    </div>
  );
}

function ms(value: number): string {
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function Degraded({ value }: { value: Bucket | null }) {
  if (!value) return null;
  return (
    <span className="dash-card__note" title="원본 해상도의 보존 기간을 벗어난 구간입니다">
      시간 단위로만 남아 있음
    </span>
  );
}

/**
 * 텔레메트리는 사용자가 `~/.claude/settings.json` 을 직접 고쳐야 흐른다. 그래서 이
 * 화면은 아무 설정도 안 한 사람에게 **정상적인 첫 상태**로 비어 있다. 에러가 아니다.
 *
 * settings.json 은 사용자 소유이고 다른 설정이 들어 있으므로 우리가 대신 고치지 않는다.
 * 붙여넣을 수 있게 보여주기만 한다. 포트는 하드코딩하지 않고 서버가 알려준 값을 쓴다.
 */
function SetupGuide({ port, enabled }: { port: number; enabled: boolean }) {
  const snippet = JSON.stringify(
    {
      env: {
        CLAUDE_CODE_ENABLE_TELEMETRY: "1",
        OTEL_METRICS_EXPORTER: "otlp",
        OTEL_LOGS_EXPORTER: "otlp",
        OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
        OTEL_EXPORTER_OTLP_ENDPOINT: `http://localhost:${port}`,
        OTEL_METRIC_EXPORT_INTERVAL: "10000",
      },
    },
    null,
    2,
  );
  const [copied, setCopied] = useState(false);

  return (
    <div className="dashboard telemetry-setup">
      <h2>텔레메트리가 아직 수집되지 않았습니다</h2>
      {enabled ? null : (
        <p className="telemetry-setup__off">
          이 서버는 <code>TELEMETRY_ENABLED=0</code> 으로 실행 중입니다. 먼저 이 값을 지우고
          다시 시작해야 합니다.
        </p>
      )}
      <p>
        <code>~/.claude/settings.json</code> 의 <code>env</code> 에 다음을 넣고 claude 를 새로
        시작하세요.
      </p>
      <pre className="telemetry-setup__code">{snippet}</pre>
      <Button
        onClick={() => {
          void navigator.clipboard?.writeText(snippet).then(() => setCopied(true));
        }}
      >
        {copied ? "복사됨" : "복사"}
      </Button>
      <p className="telemetry-setup__warn">
        ⚠️ <code>OTEL_EXPORTER_OTLP_PROTOCOL</code> 을 빼면 기본값이 gRPC 가 되어 이 HTTP
        서버에 닿지 못하고 <strong>완전히 조용히</strong> 실패합니다. <code>claude --debug</code>
        에도 흔적이 남지 않습니다.
      </p>
      <p className="telemetry-setup__note">
        수집은 소급되지 않습니다. 켠 시점부터의 데이터만 쌓입니다. 과거 분석은 세션 화면이
        담당합니다.
      </p>
    </div>
  );
}
