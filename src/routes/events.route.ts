import { subscribe } from "../services/watch.service";

const PING_MS = 25_000;

export const eventRoutes = {
  "/api/events": {
    GET: (req: Request): Response => {
      const encoder = new TextEncoder();
      let unsubscribe: (() => void) | null = null;
      let ping: ReturnType<typeof setInterval> | null = null;

      // Idempotent: called from abort, from cancel, and after a failed enqueue.
      function cleanup(): void {
        unsubscribe?.();
        unsubscribe = null;
        if (ping) clearInterval(ping);
        ping = null;
      }

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (frame: string): void => {
            try {
              controller.enqueue(encoder.encode(frame));
            } catch {
              // Consumer already went away; release the subscription now rather than
              // waiting for abort, which may never fire.
              cleanup();
            }
          };

          send(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);

          unsubscribe = subscribe((event) => {
            send(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
          });

          ping = setInterval(() => send(": ping\n\n"), PING_MS);
          ping.unref?.();

          req.signal.addEventListener("abort", () => {
            cleanup();
            try {
              controller.close();
            } catch {
              // already closed
            }
          });
        },
        cancel() {
          cleanup();
        },
      });

      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        },
      });
    },
  },
};
