/**
 * 워크스페이스 파일을 **바이트 그대로** 내준다. 뷰어의 HTML 미리보기 iframe 이 문서와 그 옆의
 * CSS·스크립트·이미지를 여기서 받아 간다(T-031).
 *
 * 경로 검사는 `fs.service` 의 `resolveFile` 하나에 맡긴다 — JSON 읽기와 같은 관문, 같은 상한.
 * 이 모듈이 더하는 것은 응답 형태(콘텐츠 타입·헤더)뿐이다.
 *
 * 문서 하나를 열면 브라우저가 상대 주소를 같은 `/raw/<root>/…` 로 풀어 다시 들어오므로,
 * 이 함수는 HTML 뿐 아니라 어떤 확장자든 받는다. 콘텐츠 타입은 확장자로 정한다(`Bun.file().type`).
 * 내용을 들여다봐 타입을 고치지 않는다 — `nosniff` 를 같이 보내 브라우저도 그러지 못하게 한다.
 */
import { extname } from "node:path";
import { HttpError } from "../lib/http";
import { parseRawPath } from "../web/lib/raw-url";
import { resolveFile } from "./fs.service";

/**
 * 스크립트를 실행할 수 있는 문서 타입. 이 응답에는 CSP `sandbox` 를 붙여 **직접 주소로 열어도**
 * 출처가 불투명하게 한다.
 *
 * 화면의 iframe 은 이미 `sandbox="allow-scripts"` 라 부모 창과 `/api/*` 에 닿지 못한다. 그러나
 * 같은 주소를 새 탭으로 열면 문서는 이 서버의 출처로 돌아가고, 그 안의 스크립트가
 * `PUT /api/fs/file` 을 부를 수 있다. 헤더가 그 구멍을 막는다. iframe 속성과 헤더는 교집합으로
 * 적용되므로 두 목록을 같게 둔다(html-preview.tsx).
 */
const SANDBOXED_TYPES = new Set([".html", ".htm", ".xhtml", ".svg"]);

export const RAW_SANDBOX_FLAGS = "allow-scripts allow-forms allow-popups allow-modals";

export function isSandboxedDocument(name: string): boolean {
  return SANDBOXED_TYPES.has(extname(name).toLowerCase());
}

/** 응답 헤더. `type` 은 `Bun.file().type` 이 확장자로 고른 값이다. */
export function rawHeaders(name: string, type: string): Record<string, string> {
  const headers: Record<string, string> = {
    // Bun 은 모르는 확장자에 빈 문자열이 아니라 octet-stream 을 주지만, 방어적으로 한 번 더.
    "content-type": type || "application/octet-stream",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
  if (isSandboxedDocument(name)) {
    headers["content-security-policy"] = `sandbox ${RAW_SANDBOX_FLAGS}`;
  }
  return headers;
}

/** `/raw/<root>/<path>` 요청 하나를 응답으로. 실패는 HttpError 로 던진다(withRoute 가 처리). */
export async function serveRaw(pathname: string): Promise<Response> {
  const target = parseRawPath(pathname);
  if (!target) throw new HttpError(400, "expected /raw/<root>/<path>");

  const { absolute, relative } = await resolveFile(target.root, target.path);
  const name = relative.split("/").at(-1) ?? relative;
  const file = Bun.file(absolute);

  // 파일을 통째로 올리지 않고 스트리밍한다. 크기 상한은 resolveFile 이 이미 봤다.
  return new Response(file, { headers: rawHeaders(name, file.type) });
}
