import { config } from "../config";
import { json } from "../lib/http";

const startedAt = Date.now();

export const healthRoutes = {
  "/api/health": {
    GET: () =>
      json({
        ok: true,
        uptimeMs: Date.now() - startedAt,
        version: "0.1.0",
        claudeDir: config.claudeDir,
      }),
  },
};
