import { test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let base: string;
let service: typeof import("./telemetry.service");
let repository: typeof import("../repositories/telemetry.repository");
let store: typeof import("../db/telemetry.db");

const METRICS = await Bun.file("test/fixtures/otlp-metrics.json").json();
const LOGS = await Bun.file("test/fixtures/otlp-logs.json").json();

const DAY = 86_400_000;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "ct-tel-"));
  // 사용자의 실제 텔레메트리 DB 를 절대 건드리지 않는다.
  process.env.TELEMETRY_DB = join(base, "telemetry.db");
  process.env.TEL_MAX_SERIES = "2000";
  service = await import("./telemetry.service");
  repository = await import("../repositories/telemetry.repository");
  store = await import("../db/telemetry.db");
});

afterAll(async () => {
  store.closeTelemetryDb();
  service.stopPruneSchedule();
  delete process.env.TELEMETRY_DB;
  delete process.env.TEL_MAX_SERIES;
  await rm(base, { recursive: true, force: true });
});

/** 매 테스트가 빈 DB 에서 시작하도록 파일을 갈아치운다. */
beforeEach(() => {
  store.closeTelemetryDb();
  repository.resetTelemetryCaches();
  process.env.TELEMETRY_DB = join(base, `t-${Math.random().toString(36).slice(2)}.db`);
});

function point(overrides: Partial<{ metric: string; type: string; qs: string; v: number; ts: number }>) {
  const { metric = "claude_code.token.usage", type = "input", qs = "main", v = 10, ts = Date.now() } =
    overrides;
  return {
    resourceMetrics: [
      {
        resource: { attributes: [{ key: "service.version", value: { stringValue: "2.1.251" } }] },
        scopeMetrics: [
          {
            metrics: [
              {
                name: metric,
                sum: {
                  aggregationTemporality: 1,
                  isMonotonic: true,
                  dataPoints: [
                    {
                      timeUnixNano: String(ts * 1_000_000),
                      asDouble: v,
                      attributes: [
                        { key: "session.id", value: { stringValue: "s-1" } },
                        { key: "type", value: { stringValue: type } },
                        { key: "model", value: { stringValue: "claude-opus-5" } },
                        { key: "query_source", value: { stringValue: qs } },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

// ------------------------------------------------------------------ 파싱

test("실측 메트릭 픽스처에서 11개 데이터포인트를 뽑는다", () => {
  const points = service.parseMetrics(METRICS);
  expect(points).toHaveLength(11);
  const tokenPoints = points.filter((p) => p.key.metric === "token.usage");
  expect(tokenPoints).toHaveLength(8);
  // claude_code. 접두사는 제거된다
  expect(points.every((p) => !p.key.metric.startsWith("claude_code."))).toBe(true);
});

test("메트릭 속성이 시리즈 키로 정규화된다", () => {
  const token = service
    .parseMetrics(METRICS)
    .find((p) => p.key.metric === "token.usage" && p.key.kind === "cacheRead" && p.key.querySource === "main");
  expect(token).toBeDefined();
  expect(token!.key.model).toBe("claude-haiku-4-5-20251001");
  expect(token!.value).toBe(13979);
});

test("asInt 가 문자열로 와도 숫자로 읽는다", () => {
  const payload = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: "claude_code.token.usage",
                sum: { dataPoints: [{ timeUnixNano: "1788180947363000000", asInt: "4242" }] },
              },
            ],
          },
        ],
      },
    ],
  };
  expect(service.parseMetrics(payload)[0]!.value).toBe(4242);
});

test("나노초 타임스탬프가 ms 로 정확히 변환된다", () => {
  const points = service.parseMetrics(METRICS);
  expect(points[0]!.ts).toBe(1788180947363);
});

test("실측 로그 픽스처에서 api_request 만 뽑는다", () => {
  const requests = service.parseLogs(LOGS);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((r) => r.key.metric === "api_request")).toBe(true);
  const first = requests[0]!;
  expect(first.input).toBe(897);
  expect(first.output).toBe(9);
  expect(first.costMicros).toBe(942);
  expect(first.durationMs).toBe(879);
  expect(first.key.querySource).toBe("generate_session_title");
});

test("event.timestamp ISO 를 타임스탬프로 쓴다", () => {
  const first = service.parseLogs(LOGS)[0]!;
  expect(new Date(first.ts).toISOString()).toBe("2026-08-31T12:55:45.320Z");
});

test("깨진 페이로드가 예외를 던지지 않는다", () => {
  for (const payload of [
    null,
    undefined,
    {},
    "nope",
    42,
    { resourceMetrics: null },
    { resourceMetrics: [null] },
    { resourceMetrics: [{ scopeMetrics: [{ metrics: [{}] }] }] },
    { resourceMetrics: [{ scopeMetrics: [{ metrics: [{ name: "x", sum: { dataPoints: [{}] } }] }] }] },
  ]) {
    expect(() => service.parseMetrics(payload as never)).not.toThrow();
    expect(() => service.parseLogs(payload as never)).not.toThrow();
  }
  expect(service.parseMetrics({ resourceMetrics: [{ scopeMetrics: [{ metrics: [{}] }] }] })).toEqual([]);
});

test("모르는 메트릭도 이름만 있으면 저장된다 (버려지지 않는다)", () => {
  const points = service.parseMetrics(point({ metric: "claude_code.brand.new.thing" }));
  expect(points[0]!.key.metric).toBe("brand.new.thing");
});

// ------------------------------------------------------------------ 저장

test("같은 속성 조합은 시리즈를 하나만 만든다", () => {
  service.ingestMetrics(point({ v: 1 }));
  service.ingestMetrics(point({ v: 2 }));
  service.ingestMetrics(point({ v: 3 }));
  expect(service.status().series).toBe(1);
  expect(service.status().points).toBe(3);
});

test("세션은 여러 번 들어와도 한 행이다", () => {
  service.ingestMetrics(point({ type: "input" }));
  service.ingestMetrics(point({ type: "output" }));
  expect(service.status().sessions).toBe(1);
  expect(service.status().series).toBe(2);
});

test("maxSeries 를 넘기면 __other__ 로 접힌다", async () => {
  store.closeTelemetryDb();
  repository.resetTelemetryCaches();
  process.env.TEL_MAX_SERIES = "3";
  for (const qs of ["a", "b", "c", "d", "e"]) service.ingestMetrics(point({ qs }));
  const status = service.status();
  // 3개까지 개별 시리즈, 그 뒤는 접힌 시리즈 1개
  expect(status.series).toBe(4);
  const folded = service.tokens({
    from: Date.now() - DAY,
    to: Date.now() + DAY,
    bucket: "raw",
    groupBy: "type",
  });
  expect(folded.items.some((item) => item.key === service.OTHER)).toBe(true);
  process.env.TEL_MAX_SERIES = "2000";
});

test("api_request 가 tel_request 로 들어간다", () => {
  service.ingestLogs(LOGS);
  const status = service.status();
  expect(status.requests).toBeGreaterThan(0);
  expect(status.collecting).toBe(true);
});

// ------------------------------------------------------------------ 조회

test("query_source 별 토큰 분포가 main 과 auxiliary 를 분리한다", () => {
  const now = Date.now();
  service.ingestMetrics(point({ qs: "main", v: 1000, ts: now }));
  service.ingestMetrics(point({ qs: "auxiliary", v: 7, ts: now }));
  const result = service.tokens({
    from: now - DAY,
    to: now + DAY,
    bucket: "raw",
    groupBy: "query_source",
  });
  expect(result.total).toBe(1007);
  expect(result.items).toEqual([
    { key: "main", value: 1000 },
    { key: "auxiliary", value: 7 },
  ]);
});

test("지연 백분위가 계산된다", () => {
  const now = Date.now();
  for (const ms of [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]) {
    service.ingestLogs({
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  attributes: [
                    { key: "event.name", value: { stringValue: "api_request" } },
                    { key: "event.timestamp", value: { stringValue: new Date(now).toISOString() } },
                    { key: "session.id", value: { stringValue: "s-1" } },
                    { key: "query_source", value: { stringValue: "main" } },
                    { key: "duration_ms", value: { intValue: ms } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  }
  const result = service.latencies({
    from: now - DAY,
    to: now + DAY,
    bucket: "raw",
    groupBy: "query_source",
  });
  expect(result.items).toHaveLength(1);
  const row = result.items[0]!;
  expect(row.count).toBe(10);
  expect(row.p50).toBe(500);
  expect(row.p95).toBe(1000);
  expect(row.max).toBe(1000);
});

test("데이터가 없으면 collecting=false 이고 since=null 이다", () => {
  const status = service.status();
  expect(status.collecting).toBe(false);
  expect(status.since).toBe(null);
  expect(status.port).toBeGreaterThan(0);
});

test("bucket=raw 이고 from 이 보존 범위 밖이면 hour 로 승격된다", () => {
  const now = Date.now();
  expect(service.effectiveBucket(now - DAY, "raw", now)).toEqual({ bucket: "raw", degraded: null });
  expect(service.effectiveBucket(now - 90 * DAY, "raw", now)).toEqual({
    bucket: "hour",
    degraded: "hour",
  });
  // hour/day 는 그대로 둔다
  expect(service.effectiveBucket(now - 900 * DAY, "day", now)).toEqual({
    bucket: "day",
    degraded: null,
  });
});

// ------------------------------------------------------------------ 보존

test("raw 를 hourly 로 롤업하면 합이 보존된다", () => {
  const now = Date.now();
  const old = now - 40 * DAY; // retainRawDays(30) 밖
  service.ingestMetrics(point({ v: 30, ts: old }));
  service.ingestMetrics(point({ v: 12, ts: old + 1000 }));
  service.ingestMetrics(point({ v: 5, ts: now })); // 보존 범위 안 — 남아야 한다

  // service.tokens 는 from 이 보존 범위를 벗어나면 hour 로 승격하므로(정상 동작),
  // 롤업 전 raw 합계는 저장소를 직접 조회해서 확인한다.
  const before = repository.breakdown("token.usage", "type", old - DAY, now + DAY, "raw").total;
  expect(before).toBe(47);

  service.prune(now);

  expect(service.status().points).toBe(1); // 최근 것만 raw 로 남는다
  const hourly = service.tokens({
    from: old - DAY,
    to: now + DAY,
    bucket: "hour",
    groupBy: "type",
  }).total;
  expect(hourly).toBe(42); // 롤업된 두 건의 합
});

test("보존 잡이 멱등하다 — 두 번 돌려도 합이 변하지 않는다", () => {
  const now = Date.now();
  service.ingestMetrics(point({ v: 100, ts: now - 40 * DAY }));

  service.prune(now);
  const once = service.tokens({
    from: now - 60 * DAY,
    to: now + DAY,
    bucket: "hour",
    groupBy: "type",
  }).total;
  service.prune(now);
  service.prune(now);
  const thrice = service.tokens({
    from: now - 60 * DAY,
    to: now + DAY,
    bucket: "hour",
    groupBy: "type",
  }).total;

  expect(once).toBe(100);
  expect(thrice).toBe(100);
});

test("보존 기간을 넘긴 요청이 삭제된다", () => {
  const now = Date.now();
  service.ingestLogs({
    resourceLogs: [
      {
        scopeLogs: [
          {
            logRecords: [
              {
                attributes: [
                  { key: "event.name", value: { stringValue: "api_request" } },
                  {
                    key: "event.timestamp",
                    value: { stringValue: new Date(now - 500 * DAY).toISOString() },
                  },
                  { key: "session.id", value: { stringValue: "s-old" } },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  expect(service.status().requests).toBe(1);
  const report = service.prune(now);
  expect(report.deletedRequests).toBe(1);
  expect(service.status().requests).toBe(0);
});

test("hardLimit 을 넘기면 오래된 raw 가 강제 삭제되고 파일이 줄어든다", () => {
  const now = Date.now();
  for (let day = 0; day < 60; day += 1) {
    for (let i = 0; i < 200; i += 1) {
      service.ingestMetrics(point({ v: i, qs: `q${i % 20}`, ts: now - day * DAY + i }));
    }
  }
  const before = repository.dbBytes();
  expect(before).toBeGreaterThan(200_000);

  process.env.TEL_HARD_LIMIT_BYTES = String(Math.floor(before / 2));
  const report = repository.prune(now);
  delete process.env.TEL_HARD_LIMIT_BYTES;

  expect(report.forcedRawDays).toBeGreaterThan(0);
  expect(report.bytesAfter).toBeLessThan(before);
});

test("auto_vacuum 이 incremental(2) 이다", () => {
  service.ingestMetrics(point({}));
  const row = store.telemetryDb().prepare("pragma auto_vacuum").get() as { auto_vacuum: number };
  expect(row.auto_vacuum).toBe(2);
});

test("TELEMETRY_ENABLED=0 이면 status 가 비활성으로 답한다", async () => {
  process.env.TELEMETRY_ENABLED = "0";
  const status = service.status();
  expect(status.enabled).toBe(false);
  expect(status.collecting).toBe(false);
  delete process.env.TELEMETRY_ENABLED;
});
