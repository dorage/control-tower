/**
 * OTLP/JSON is the protobuf JSON mapping, so the shape is fixed but every field is
 * optional from our point of view: a newer Claude Code may add metrics we do not know.
 * Nothing here is validated by a schema library - the parser reads defensively.
 */

export interface OtlpAnyValue {
  stringValue?: string;
  /** Integers may arrive as a JSON string (protobuf int64 mapping) or as a number. */
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
}

export interface OtlpAttribute {
  key?: string;
  value?: OtlpAnyValue;
}

export interface OtlpDataPoint {
  timeUnixNano?: string;
  startTimeUnixNano?: string;
  /** Observed in practice: even token counts arrive as asDouble. */
  asDouble?: number;
  asInt?: string | number;
  attributes?: OtlpAttribute[];
}

export interface OtlpMetric {
  name?: string;
  unit?: string;
  sum?: { dataPoints?: OtlpDataPoint[]; aggregationTemporality?: number; isMonotonic?: boolean };
  gauge?: { dataPoints?: OtlpDataPoint[] };
  histogram?: { dataPoints?: OtlpDataPoint[] };
}

export interface OtlpResource {
  attributes?: OtlpAttribute[];
}

export interface OtlpMetricsPayload {
  resourceMetrics?: Array<{
    resource?: OtlpResource;
    scopeMetrics?: Array<{ metrics?: OtlpMetric[] }>;
  }>;
}

export interface OtlpLogRecord {
  timeUnixNano?: string;
  observedTimeUnixNano?: string;
  body?: OtlpAnyValue;
  attributes?: OtlpAttribute[];
}

export interface OtlpLogsPayload {
  resourceLogs?: Array<{
    resource?: OtlpResource;
    scopeLogs?: Array<{ logRecords?: OtlpLogRecord[] }>;
  }>;
}

/** The attribute combination that identifies one time series. All parts may be null. */
export interface SeriesKey {
  /** Metric name with the `claude_code.` prefix stripped, e.g. `token.usage`. */
  metric: string;
  /** The `type` attribute: input/output/cacheRead/cacheCreation, added/removed, user/cli. */
  kind: string | null;
  model: string | null;
  querySource: string | null;
  speed: string | null;
  effort: string | null;
  agent: string | null;
  skill: string | null;
}

export interface SessionFacts {
  sessionUuid: string;
  version: string | null;
  entrypoint: string | null;
  terminal: string | null;
}

export interface ParsedPoint {
  ts: number;
  session: SessionFacts | null;
  key: SeriesKey;
  value: number;
}

export interface ParsedRequest {
  ts: number;
  session: SessionFacts | null;
  key: SeriesKey;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  costMicros: number;
  durationMs: number;
}

export interface TelemetryStatus {
  enabled: boolean;
  collecting: boolean;
  /** Oldest retained sample, or null when nothing has been received. */
  since: string | null;
  dbBytes: number;
  softLimitBytes: number;
  hardLimitBytes: number;
  series: number;
  sessions: number;
  points: number;
  requests: number;
  /** Echoed so the setup instructions on screen can name the real port. */
  port: number;
}

export type Bucket = "raw" | "hour" | "day";

export type GroupBy = "type" | "model" | "query_source" | "speed" | "effort" | "agent" | "skill";

export const GROUP_BY_COLUMN: Record<GroupBy, string> = {
  type: "kind",
  model: "model",
  query_source: "query_source",
  speed: "speed",
  effort: "effort",
  agent: "agent",
  skill: "skill",
};

/** Series that absorb everything past `maxSeries`. */
export const OTHER = "__other__";
