/**
 * pug-frame 호스트 페이지와 그 스크립트 번들.
 *
 * 호스트(`src/web/pug-frame-host.ts`)는 메인 번들과 따로 묶는다. 이유는 그 파일 머리에 있다.
 * `Bun.serve` 의 HTML import 로 묶으면 조각 파일에 CORS 헤더를 붙일 수 없어, 출처가 불투명한
 * sandbox iframe 이 모듈 스크립트를 읽지 못한다(모듈 스크립트는 언제나 CORS 모드로 받는다).
 * 그래서 우리가 `Bun.build` 로 묶어 헤더를 직접 붙여 내준다.
 *
 * 번들은 프로세스당 한 번 만든다(이 기계에서 실측 0.7초). `--hot` 으로 떠 있는 서버는 호스트
 * 소스를 고쳐도 다시 묶지 않으므로 `bun run restart` 가 필요하다 - docs/README.md 에 적었다.
 */
import { PUG_FRAME_HOST_SCRIPT_PATH } from "../web/lib/pug-frame-message";

export interface HostBundle {
  code: string;
  /** 내용 해시. 브라우저가 `If-None-Match` 로 재검증할 때 쓴다. */
  etag: string;
}

const HOST_ENTRY = new URL("../web/pug-frame-host.ts", import.meta.url).pathname;

async function buildHost(entry: string): Promise<HostBundle> {
  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "esm",
    minify: Bun.env.NODE_ENV === "production",
    sourcemap: "none",
  });
  if (!result.success) {
    throw new Error(`pug-frame host build failed:\n${result.logs.map(String).join("\n")}`);
  }
  const output = result.outputs.find((artifact) => artifact.kind === "entry-point");
  if (!output) throw new Error("pug-frame host build produced no entry point");
  const code = await output.text();
  return { code, etag: `"${Bun.hash(code).toString(16)}"` };
}

let cached: Promise<HostBundle> | null = null;

/**
 * 호스트 스크립트 번들. 첫 호출에 묶고 이후는 같은 것을 돌려준다.
 * 실패한 시도는 캐시에 남기지 않아 다음 요청이 다시 묶는다.
 */
export function hostBundle(entry: string = HOST_ENTRY): Promise<HostBundle> {
  if (entry !== HOST_ENTRY) return buildHost(entry);
  if (cached === null) {
    cached = buildHost(entry).catch((error: unknown) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}

/**
 * 호스트 페이지 HTML. 사용자 입력이 하나도 들어가지 않는 고정 문자열이다.
 *
 * 색은 `src/web/styles.css` 의 `--bg-subtle` 값을 그대로 옮겼다. iframe 은 부모의 CSS 변수를
 * 물려받지 못하므로 토큰을 참조할 수 없다. 두 곳의 값이 어긋나면 iframe 테두리 안쪽만 색이
 * 달라져 눈에 바로 띈다.
 */
export function hostPage(): string {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>pug-frame</title>
    <style>
      :root { --bg-subtle: #f6f7f9; }
      @media (prefers-color-scheme: dark) { :root { --bg-subtle: #14171c; } }
      html, body { margin: 0; height: 100%; background: var(--bg-subtle); }
      /* canvas 가 position 을 relative 로, overflow 를 hidden 으로 덮어쓴다(inline 값이 없으면).
         inset 으로 크기를 잡으면 그 순간 높이가 0 이 되어 그린 것이 모두 잘린다. 너비·높이를 직접 준다. */
      #stage { width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="stage"></div>
    <script type="module" src="${PUG_FRAME_HOST_SCRIPT_PATH}"></script>
  </body>
</html>
`;
}
