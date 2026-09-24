import { test, expect } from "bun:test";
import { RAW_SANDBOX_FLAGS, isSandboxedDocument, rawHeaders } from "./raw.service";

/**
 * 경로가 실제로 열리는지는 fs.service.test 가 본다(루트 픽스처가 거기 있다).
 * 여기서는 루트가 필요 없는 응답 형태만 본다.
 */

test("스크립트를 실행할 수 있는 문서 타입만 sandbox 대상이다", () => {
  for (const name of ["a.html", "A.HTM", "x.xhtml", "logo.svg"]) {
    expect(isSandboxedDocument(name)).toBe(true);
  }
  for (const name of ["style.css", "app.js", "photo.png", "data.json", "README.md", "noext"]) {
    expect(isSandboxedDocument(name)).toBe(false);
  }
});

test("HTML 응답에는 CSP sandbox 가 붙고, 그 플래그는 iframe 속성과 같은 목록이다", () => {
  const headers = rawHeaders("index.html", "text/html;charset=utf-8");
  expect(headers["content-security-policy"]).toBe(`sandbox ${RAW_SANDBOX_FLAGS}`);
  // allow-same-origin 이 들어가면 문서가 이 서버의 출처로 돌아가 /api 를 부를 수 있다.
  expect(RAW_SANDBOX_FLAGS).not.toContain("allow-same-origin");
});

test("HTML 이 아닌 자원에는 CSP 가 없고, 타입 추측 금지와 캐시 금지는 항상 붙는다", () => {
  const headers = rawHeaders("style.css", "text/css;charset=utf-8");
  expect(headers["content-security-policy"]).toBeUndefined();
  expect(headers["content-type"]).toBe("text/css;charset=utf-8");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["cache-control"]).toBe("no-store");
});

test("타입을 모르면 octet-stream 으로 떨어진다", () => {
  expect(rawHeaders("blob.unknownext", "")["content-type"]).toBe("application/octet-stream");
});
