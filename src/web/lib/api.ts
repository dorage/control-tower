import type { FsEntry, FsFile, FsRoot, FsWriteResult } from "../../domain/types";

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
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // 비-JSON 응답(프록시 에러 페이지 등)도 앱을 죽이지 않는다.
    }
  }

  if (!response.ok) {
    const record = (body ?? {}) as Record<string, unknown>;
    const message =
      typeof record.error === "string" ? record.error : `${response.status} ${response.statusText}`;
    throw new ApiError(response.status, message, record);
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

export const api = {
  health: () =>
    request<{ ok: boolean; uptimeMs: number; version: string; claudeDir: string }>("/api/health"),

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

  // 세션·프로젝트·통계·히스토리 함수는 T-003 이 엔드포인트를 만들 때 여기에 추가한다.
};
