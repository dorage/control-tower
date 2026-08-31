import { GROUP_BY_COLUMN, type Bucket, type GroupBy } from "../domain/telemetry";
import { HttpError, intParam, json, stringParam, withRoute } from "../lib/http";
import {
  cost,
  latencies,
  series,
  status,
  tokens,
  type RangedQuery,
} from "../services/telemetry.service";

const DAY_MS = 86_400_000;
const BUCKETS: Bucket[] = ["raw", "hour", "day"];

function parseQuery(url: URL): RangedQuery {
  const to = intParam(url, "to", Date.now());
  const from = intParam(url, "from", to - DAY_MS);
  if (from >= to) throw new HttpError(400, "from must be before to");

  const rawBucket = stringParam(url, "bucket") ?? "hour";
  if (!BUCKETS.includes(rawBucket as Bucket)) {
    throw new HttpError(400, `bucket must be one of ${BUCKETS.join(", ")}`);
  }
  const rawGroupBy = stringParam(url, "groupBy") ?? "model";
  if (!(rawGroupBy in GROUP_BY_COLUMN)) {
    throw new HttpError(400, `groupBy must be one of ${Object.keys(GROUP_BY_COLUMN).join(", ")}`);
  }
  return {
    from,
    to,
    bucket: rawBucket as Bucket,
    groupBy: rawGroupBy as GroupBy,
  };
}

export const telemetryRoutes = {
  "/api/telemetry/status": {
    GET: withRoute(() => json(status())),
  },
  "/api/telemetry/tokens": {
    GET: withRoute((req: Request) => json(tokens(parseQuery(new URL(req.url))))),
  },
  "/api/telemetry/cost": {
    GET: withRoute((req: Request) => json(cost(parseQuery(new URL(req.url))))),
  },
  "/api/telemetry/timeseries": {
    GET: withRoute((req: Request) => {
      const url = new URL(req.url);
      const metric = stringParam(url, "metric") ?? "token.usage";
      return json(series(metric, parseQuery(url)));
    }),
  },
  "/api/telemetry/latency": {
    GET: withRoute((req: Request) => json(latencies(parseQuery(new URL(req.url))))),
  },
};
