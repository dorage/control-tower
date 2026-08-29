import { config } from "./src/config";
import { routes } from "./src/routes";

const server = Bun.serve({
  port: config.port,
  hostname: config.hostname,
  routes,
  development: Bun.env.NODE_ENV === "production" ? false : { hmr: true, console: true },
  error(error) {
    console.error("[control-tower]", error);
    return Response.json({ error: "internal error" }, { status: 500 });
  },
});

console.log(`[control-tower] listening on http://${server.hostname}:${server.port}`);
console.log(`[control-tower] watching ${config.claudeDir}`);
