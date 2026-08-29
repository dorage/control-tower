import { config } from "../config";
import { json, withRoute } from "../lib/http";

const startedAt = Date.now();

export const healthRoutes = {
  "/api/health": {
    GET: withRoute(() =>
      json({
        ok: true,
        uptimeMs: Date.now() - startedAt,
        version: "0.1.0",
        claudeDir: config.claudeDir,
      }),
    ),
  },
};
