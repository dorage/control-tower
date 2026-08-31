import { config } from "../config";
import {
  OTHER,
  type Bucket,
  type GroupBy,
  type OtlpAnyValue,
  type OtlpAttribute,
  type OtlpLogsPayload,
  type OtlpMetricsPayload,
  type ParsedPoint,
  type ParsedRequest,
  type SeriesKey,
  type SessionFacts,
  type TelemetryStatus,
} from "../domain/telemetry";
import {
  breakdown,
  counts,
  dbBytes,
  insertPoints,
  insertRequests,
  latency,
  prune,
  timeseries,
  type Breakdown,
  type LatencyRow,
  type Timeseries,
} from "../repositories/telemetry.repository";

const METRIC_PREFIX = "claude_code.";

// ------------------------------------------------------------------ OTLP reading

function scalar(value: OtlpAnyValue | undefined): string | null {
  if (!value) return null;
  if (typeof value.stringValue === "string") return value.stringValue;
  if (value.intValue !== undefined) return String(value.intValue);
  if (value.doubleValue !== undefined) return String(value.doubleValue);
  if (value.boolValue !== undefined) return String(value.boolValue);
  return null;
}

/** OTLP attributes are a key/value list; everything downstream wants a flat record. */
export function attributesOf(attributes: OtlpAttribute[] | undefined): Record<string, string> {
  const flat: Record<string, string> = {};
  if (!Array.isArray(attributes)) return flat;
  for (const attribute of attributes) {
    if (!attribute || typeof attribute.key !== "string") continue;
    const value = scalar(attribute.value);
    if (value !== null) flat[attribute.key] = value;
  }
  return flat;
}

function numberOf(raw: string | number | undefined): number | null {
  if (raw === undefined) return null;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Nanoseconds arrive as a 19-digit string. Parsing it as a float loses ~256ns of
 * precision at that magnitude, which is four orders of magnitude below the millisecond
 * we round to, so it is safe.
 */
function msFromNano(nano: string | undefined): number | null {
  if (typeof nano !== "string" || nano === "") return null;
  const value = Number(nano);
  return Number.isFinite(value) ? Math.round(value / 1e6) : null;
}

function sessionFactsOf(
  attributes: Record<string, string>,
  resource: Record<string, string>,
): SessionFacts | null {
  const sessionUuid = attributes["session.id"];
  if (!sessionUuid) return null;
  return {
    sessionUuid,
    version: attributes["app.version"] ?? resource["service.version"] ?? null,
    entrypoint: attributes["app.entrypoint"] ?? null,
    terminal: attributes["terminal.type"] ?? null,
  };
}

function seriesKeyOf(metric: string, attributes: Record<string, string>): SeriesKey {
  return {
    metric,
    kind: attributes.type ?? null,
    model: attributes.model ?? null,
    querySource: attributes.query_source ?? null,
    speed: attributes.speed ?? null,
    effort: attributes.effort ?? null,
    agent: attributes["agent.name"] ?? null,
    skill: attributes["skill.name"] ?? null,
  };
}

// ------------------------------------------------------------------ parsing

/** Pure. Unknown metrics and malformed points are skipped, never thrown. */
export function parseMetrics(payload: OtlpMetricsPayload): ParsedPoint[] {
  const points: ParsedPoint[] = [];
  for (const resourceMetric of payload?.resourceMetrics ?? []) {
    const resource = attributesOf(resourceMetric?.resource?.attributes);
    for (const scopeMetric of resourceMetric?.scopeMetrics ?? []) {
      for (const metric of scopeMetric?.metrics ?? []) {
        const name = typeof metric?.name === "string" ? metric.name : null;
        if (!name) continue;
        const short = name.startsWith(METRIC_PREFIX) ? name.slice(METRIC_PREFIX.length) : name;
        const dataPoints =
          metric.sum?.dataPoints ?? metric.gauge?.dataPoints ?? metric.histogram?.dataPoints ?? [];
        for (const point of dataPoints) {
          if (!point) continue;
          const value = numberOf(point.asDouble) ?? numberOf(point.asInt);
          if (value === null) continue;
          const ts = msFromNano(point.timeUnixNano) ?? Date.now();
          const attributes = attributesOf(point.attributes);
          points.push({
            ts,
            session: sessionFactsOf(attributes, resource),
            key: seriesKeyOf(short, attributes),
            value,
          });
        }
      }
    }
  }
  return points;
}

/**
 * Pure. Only `api_request` becomes a row - it is the one event that is a per-request
 * time series. Everything else (prompts, responses, tool results, hooks) is either
 * already in the transcript or not worth a table yet.
 */
export function parseLogs(payload: OtlpLogsPayload): ParsedRequest[] {
  const requests: ParsedRequest[] = [];
  for (const resourceLog of payload?.resourceLogs ?? []) {
    const resource = attributesOf(resourceLog?.resource?.attributes);
    for (const scopeLog of resourceLog?.scopeLogs ?? []) {
      for (const record of scopeLog?.logRecords ?? []) {
        if (!record) continue;
        const attributes = attributesOf(record.attributes);
        const body = scalar(record.body) ?? "";
        const name =
          attributes["event.name"] ??
          (body.startsWith(METRIC_PREFIX) ? body.slice(METRIC_PREFIX.length) : body);
        if (name !== "api_request") continue;

        const iso = attributes["event.timestamp"];
        const parsedIso = iso ? Date.parse(iso) : Number.NaN;
        const ts = Number.isFinite(parsedIso)
          ? parsedIso
          : (msFromNano(record.timeUnixNano) ?? Date.now());

        const costMicros =
          numberOf(attributes.cost_usd_micros) ??
          Math.round((numberOf(attributes.cost_usd) ?? 0) * 1e6);

        requests.push({
          ts,
          session: sessionFactsOf(attributes, resource),
          key: seriesKeyOf("api_request", attributes),
          input: numberOf(attributes.input_tokens) ?? 0,
          output: numberOf(attributes.output_tokens) ?? 0,
          cacheRead: numberOf(attributes.cache_read_tokens) ?? 0,
          cacheCreation: numberOf(attributes.cache_creation_tokens) ?? 0,
          costMicros: Math.round(costMicros),
          durationMs: Math.round(numberOf(attributes.duration_ms) ?? 0),
        });
      }
    }
  }
  return requests;
}

// ------------------------------------------------------------------ prune scheduling

let pruneTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Started on first ingest rather than at boot: an installation that never configures
 * telemetry should never open the database or hold a timer.
 */
function ensurePruneScheduled(): void {
  if (pruneTimer) return;
  pruneTimer = setInterval(() => {
    try {
      prune();
    } catch (error) {
      console.error("[control-tower] telemetry prune failed", error);
    }
  }, config.telemetry.pruneIntervalMs);
  pruneTimer.unref?.();
}

export function stopPruneSchedule(): void {
  if (pruneTimer) clearInterval(pruneTimer);
  pruneTimer = null;
}

// ------------------------------------------------------------------ ingest

export function ingestMetrics(payload: unknown): number {
  const points = parseMetrics(payload as OtlpMetricsPayload);
  if (points.length === 0) return 0;
  const written = insertPoints(points);
  ensurePruneScheduled();
  return written;
}

export function ingestLogs(payload: unknown): number {
  const requests = parseLogs(payload as OtlpLogsPayload);
  if (requests.length === 0) return 0;
  const written = insertRequests(requests);
  ensurePruneScheduled();
  return written;
}

// ------------------------------------------------------------------ queries

export function status(): TelemetryStatus {
  const settings = config.telemetry;
  if (!settings.enabled) {
    return {
      enabled: false,
      collecting: false,
      since: null,
      dbBytes: 0,
      softLimitBytes: settings.softLimitBytes,
      hardLimitBytes: settings.hardLimitBytes,
      series: 0,
      sessions: 0,
      points: 0,
      requests: 0,
      port: config.port,
    };
  }
  const summary = counts();
  return {
    enabled: true,
    collecting: summary.points > 0 || summary.requests > 0,
    since: summary.since === null ? null : new Date(summary.since).toISOString(),
    dbBytes: dbBytes(),
    softLimitBytes: settings.softLimitBytes,
    hardLimitBytes: settings.hardLimitBytes,
    series: summary.series,
    sessions: summary.sessions,
    points: summary.points,
    requests: summary.requests,
    port: config.port,
  };
}

export interface RangedQuery {
  from: number;
  to: number;
  bucket: Bucket;
  groupBy: GroupBy;
}

/**
 * Raw samples only exist inside the retention window. Asking for a wider range is not an
 * error and must not return an empty chart - promote to hourly and say so.
 */
export function effectiveBucket(from: number, bucket: Bucket, now = Date.now()): {
  bucket: Bucket;
  degraded: Bucket | null;
} {
  if (bucket !== "raw") return { bucket, degraded: null };
  const rawFloor = now - config.telemetry.retainRawDays * 86_400_000;
  if (from >= rawFloor) return { bucket: "raw", degraded: null };
  return { bucket: "hour", degraded: "hour" };
}

export function tokens(query: RangedQuery): Breakdown & { degraded: Bucket | null } {
  const { bucket, degraded } = effectiveBucket(query.from, query.bucket);
  return { ...breakdown("token.usage", query.groupBy, query.from, query.to, bucket), degraded };
}

export function cost(query: RangedQuery): Breakdown & { degraded: Bucket | null } {
  const { bucket, degraded } = effectiveBucket(query.from, query.bucket);
  return { ...breakdown("cost.usage", query.groupBy, query.from, query.to, bucket), degraded };
}

export function series(
  metric: string,
  query: RangedQuery,
): Timeseries & { degraded: Bucket | null } {
  const { bucket, degraded } = effectiveBucket(query.from, query.bucket);
  return { ...timeseries(metric, query.groupBy, query.from, query.to, bucket), degraded };
}

export function latencies(query: RangedQuery): { items: LatencyRow[] } {
  return { items: latency(query.groupBy, query.from, query.to) };
}

export { OTHER, prune };
