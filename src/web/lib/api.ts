import type {
  FsEntry,
  FsFile,
  FsRoot,
  FsWriteResult,
  HistoryEntry,
  ProjectSummary,
  SessionSummary,
  Stats,
  Timeline,
} from "../../domain/types";
import type { SystemMetrics } from "../../domain/system";
import type { Bucket, GroupBy, TelemetryStatus } from "../../domain/telemetry";

export interface Page<T> {
  total: number;
  offset: number;
  limit: number;
  items: T[];
}

/** 서버가 준 상태 코드와 추가 필드를 보존하는 에러. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { accept: "application/json", ...(init?.headers ?? {}) },
  });

  const text = await response.text();
  let body: unknown = null;
  let unparsable = false;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // 비-JSON 응답(프록시 에러 페이지, SPA 폴백 HTML)도 앱을 죽이지 않는다.
      unparsable = true;
    }
  }

  if (!response.ok) {
    const record = (body ?? {}) as Record<string, unknown>;
    const message =
      typeof record.error === "string" ? record.error : `${response.status} ${response.statusText}`;
    throw new ApiError(response.status, message, record);
  }

  /**
   * 200 인데 JSON 이 아니면 조용히 null 을 돌려주지 않고 던진다.
   *
   * 서버가 모르는 경로에는 SPA 폴백이 앱 HTML 을 200 으로 돌려준다(CONVENTIONS §5). null 을
   * 돌려주면 화면은 `data === null` 을 로딩으로 읽어 **영원히 스피너**가 된다. 실제로 새
   * API 를 추가하고 서버를 재시작하지 않았을 때 이 경로를 밟았다.
   */
  if (unparsable) {
    throw new ApiError(
      response.status,
      "서버가 JSON 이 아닌 응답을 보냈습니다. 이 API 를 모르는 버전이 떠 있는지 확인하세요.",
    );
  }
  return body as T;
}

/** 쿼리는 언제나 URLSearchParams 로 조립한다. 문자열 템플릿으로 붙이지 않는다. */
function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export interface DirectoryListing {
  root: string;
  path: string;
  parent: string | null;
  items: FsEntry[];
}

export interface SessionListOptions {
  projectId?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
}

export interface TimelineOptions {
  limit?: number;
  offset?: number;
  events?: boolean;
  sidechain?: boolean;
}

export interface TelemetryRange {
  from: number;
  to: number;
  bucket?: Bucket;
  groupBy?: GroupBy;
}

export interface TelemetryBreakdown {
  items: Array<{ key: string; value: number }>;
  total: number;
  /** 서버가 요청한 해상도를 낮췄으면 그 해상도. 에러가 아니다. */
  degraded: Bucket | null;
}

export interface TelemetryTimeseries {
  buckets: number[];
  series: Array<{ key: string; values: number[] }>;
  degraded: Bucket | null;
}

export interface TelemetryLatency {
  items: Array<{
    key: string;
    count: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
  }>;
}

export const api = {
  health: () =>
    request<{ ok: boolean; uptimeMs: number; version: string; claudeDir: string }>("/api/health"),

  stats: () => request<Stats>("/api/stats"),

  system: (opts: { limit?: number } = {}) =>
    request<SystemMetrics>(`/api/system${query({ ...opts })}`),

  projects: (opts: { limit?: number; offset?: number } = {}) =>
    request<Page<ProjectSummary>>(`/api/projects${query({ ...opts })}`),

  sessions: (opts: SessionListOptions = {}) =>
    request<Page<SessionSummary>>(`/api/sessions${query({ ...opts })}`),

  session: (id: string) => request<SessionSummary>(`/api/sessions/${encodeURIComponent(id)}`),

  timeline: (id: string, opts: TimelineOptions = {}) =>
    request<Timeline>(`/api/sessions/${encodeURIComponent(id)}/timeline${query({ ...opts })}`),

  history: (opts: { project?: string | null; sessionId?: string | null; limit?: number } = {}) =>
    request<Page<HistoryEntry>>(`/api/history${query({ ...opts })}`),

  telemetryStatus: () => request<TelemetryStatus>("/api/telemetry/status"),

  telemetryTokens: (opts: TelemetryRange) =>
    request<TelemetryBreakdown>(`/api/telemetry/tokens${query({ ...opts })}`),

  telemetryCost: (opts: TelemetryRange) =>
    request<TelemetryBreakdown>(`/api/telemetry/cost${query({ ...opts })}`),

  telemetryTimeseries: (opts: TelemetryRange & { metric?: string }) =>
    request<TelemetryTimeseries>(`/api/telemetry/timeseries${query({ ...opts })}`),

  telemetryLatency: (opts: TelemetryRange) =>
    request<TelemetryLatency>(`/api/telemetry/latency${query({ ...opts })}`),

  fsRoots: () => request<{ items: FsRoot[] }>("/api/fs/roots"),

  fsList: (root: string, path: string, opts: { hidden?: boolean } = {}) =>
    request<DirectoryListing>(`/api/fs/list${query({ root, path, ...opts })}`),

  fsTree: (root: string, path: string, opts: { depth?: number; hidden?: boolean } = {}) =>
    request<FsEntry>(`/api/fs/tree${query({ root, path, ...opts })}`),

  fsFile: (root: string, path: string) => request<FsFile>(`/api/fs/file${query({ root, path })}`),

  fsSave: (input: {
    root: string;
    path: string;
    content: string;
    baseVersion?: string;
    createIfMissing?: boolean;
  }) =>
    request<FsWriteResult>("/api/fs/file", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
};
