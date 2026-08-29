import { config } from "../config";

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, {
    ...init,
    headers: { "cache-control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function notFound(message = "not found"): Response {
  return json({ error: message }, { status: 404 });
}

export function badRequest(message: string): Response {
  return json({ error: message }, { status: 400 });
}

/** 허용되지 않은 경로/확장자. */
export function forbidden(message: string): Response {
  return json({ error: message }, { status: 403 });
}

/** 낙관적 잠금 충돌. extra 를 본문에 병합한다. */
export function conflict(message: string, extra?: Record<string, unknown>): Response {
  return json({ error: message, ...(extra ?? {}) }, { status: 409 });
}

/** 상한 초과. */
export function tooLarge(message: string): Response {
  return json({ error: message }, { status: 413 });
}

export function serverError(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[control-tower]", error);
  return json({ error: message }, { status: 500 });
}

/** 목록 응답 봉투. */
export function page<T>(items: T[], total: number, offset: number, limit: number): Response {
  return json({ total, offset, limit, items });
}

export function intParam(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** 범위를 강제하는 정수 쿼리 파싱. 파싱 불가는 400이 아니라 fallback (읽기는 방어적으로). */
export function intRange(url: URL, name: string, fallback: number, min: number, max: number): number {
  const value = intParam(url, name, fallback);
  return Math.min(max, Math.max(min, value));
}

/** "1" | "true" 를 참으로 본다. 값이 없으면 fallback. */
export function boolParam(url: URL, name: string, fallback: boolean): boolean {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

/** 필수 문자열 쿼리. 없거나 빈 문자열이면 null. */
export function stringParam(url: URL, name: string): string | null {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return null;
  return raw;
}

/** 라우트에서 던져 상태 코드를 지정하는 에러. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** 라우트 핸들러를 감싸 예외를 500으로, HttpError 를 해당 코드로 변환한다. */
export function withRoute<T extends Request>(
  handler: (req: T) => Response | Promise<Response>,
): (req: T) => Promise<Response> {
  return async (req: T) => {
    const startedAt = performance.now();
    let response: Response;
    try {
      response = await handler(req);
    } catch (error) {
      response =
        error instanceof HttpError
          ? json({ error: error.message, ...(error.extra ?? {}) }, { status: error.status })
          : serverError(error);
    }
    if (config.logRequests) {
      const elapsed = Math.round(performance.now() - startedAt);
      console.log(
        `[control-tower] ${req.method} ${new URL(req.url).pathname} ${response.status} ${elapsed}ms`,
      );
    }
    return response;
  };
}
