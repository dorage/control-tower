import { config } from "../config";
import { ingestLogs, ingestMetrics } from "../services/telemetry.service";

/**
 * OTLP/HTTP receiver for Claude Code telemetry.
 *
 * Two deliberate departures from the `/api/*` contract in `src/lib/http.ts`:
 *
 * 1. **Always 200.** An OTLP client treats 4xx/5xx as retryable and will queue and
 *    resend. A payload we cannot parse is our problem, not the sender's, so failing
 *    loudly here would turn one bad export into a retry storm. Errors go to the log.
 * 2. **No `withRoute`.** That wrapper converts exceptions into status codes, which is
 *    exactly what must not happen (see 1).
 *
 * Note that 4317 is also the OTLP *gRPC* default port. We answer HTTP here, so the
 * sender must set `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`; without it the client speaks
 * gRPC to this port and fails silently.
 */
const ACCEPTED = new Response('{"partialSuccess":{}}', {
  headers: { "content-type": "application/json" },
});

function accepted(): Response {
  return ACCEPTED.clone();
}

async function ingest(req: Request, kind: "metrics" | "logs"): Promise<Response> {
  if (!config.telemetry.enabled) return accepted();
  try {
    const payload = await req.json();
    const written = kind === "metrics" ? ingestMetrics(payload) : ingestLogs(payload);
    if (config.logRequests) {
      console.log(`[control-tower] otlp ${kind} +${written}`);
    }
  } catch (error) {
    console.error(`[control-tower] otlp ${kind} rejected`, error);
  }
  return accepted();
}

/**
 * A GET here would otherwise fall through to the SPA wildcard and render the app, which
 * is a confusing answer for someone who opened this URL in a browser to check whether
 * telemetry is wired up. Answer with the one mistake that actually breaks the setup.
 */
function hint(): Response {
  return Response.json(
    {
      error: "method not allowed - this is an OTLP/HTTP receiver, send POST",
      hint:
        "claude must be configured with OTEL_EXPORTER_OTLP_PROTOCOL=http/json." +
        " Without it the OTLP default protocol is grpc, and this port speaks HTTP," +
        " so exports fail silently.",
      endpoints: ["POST /v1/metrics", "POST /v1/logs"],
      status: "/api/telemetry/status",
    },
    { status: 405, headers: { allow: "POST", "cache-control": "no-store" } },
  );
}

export const otlpRoutes = {
  "/v1/metrics": { POST: (req: Request) => ingest(req, "metrics"), GET: hint },
  "/v1/logs": { POST: (req: Request) => ingest(req, "logs"), GET: hint },
};
