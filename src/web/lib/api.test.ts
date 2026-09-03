import { test, expect, afterEach } from "bun:test";
import { api, ApiError } from "./api";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function respondWith(body: string, init?: ResponseInit): void {
  const stub = async () => new Response(body, init);
  // Bun 의 fetch 에는 preconnect 가 달려 있다. 스텁에 그대로 얹어 타입을 맞춘다.
  globalThis.fetch = Object.assign(stub, { preconnect: realFetch.preconnect });
}

test("정상 JSON 은 그대로 돌려준다", async () => {
  respondWith(JSON.stringify({ sessions: 3 }), {
    headers: { "content-type": "application/json" },
  });
  const stats = await api.stats();
  expect(stats.sessions).toBe(3);
});

/**
 * 이 규칙이 없으면 화면이 영원히 스피너를 돈다.
 *
 * 서버가 모르는 경로에는 SPA 폴백이 앱 HTML 을 200 으로 돌려준다. 조용히 null 을 돌려주면
 * `useQuery` 의 data 가 null 로 남아 로딩과 구별되지 않는다. 새 API 를 배포하고 서버를
 * 재시작하지 않았을 때 실제로 밟은 경로다.
 */
test("200 인데 JSON 이 아니면 던진다", async () => {
  respondWith("<!doctype html><html><body>app</body></html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });
  const promise = api.system();
  await expect(promise).rejects.toThrow(ApiError);
  await expect(promise).rejects.toThrow(/JSON/);
});

test("에러 응답은 상태 코드와 서버가 준 추가 필드를 보존한다", async () => {
  respondWith(JSON.stringify({ error: "stale", currentVersion: "1:2" }), { status: 409 });
  try {
    await api.fsSave({ root: "r", path: "a.md", content: "x" });
    throw new Error("던졌어야 한다");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(409);
    expect(apiError.message).toBe("stale");
    expect(apiError.detail.currentVersion).toBe("1:2");
  }
});

test("본문 없는 200 은 던지지 않는다", async () => {
  respondWith("", { status: 200 });
  expect(await api.stats()).toBeNull();
});
