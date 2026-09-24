/**
 * 파일을 **그대로** 내주는 경로 `/raw/<root>/<path>` 의 조립과 해석.
 *
 * 쿼리(`?root=&path=`)가 아니라 경로에 싣는 이유는 하나다 — 브라우저가 HTML 안의
 * 상대 주소(`./style.css`, `img/a.png`)를 문서 URL 기준으로 풀기 때문이다. 문서가
 * `/raw/work/site/index.html` 에서 열리면 `./style.css` 는 `/raw/work/site/style.css` 가 되어
 * 같은 경로 규칙으로 다시 들어온다. 쿼리 방식이면 이 해석이 깨진다.
 *
 * 조각(segment)마다 `encodeURIComponent` 를 건다. 파일 이름에 `#`·`?`·`%`·공백이 있어도
 * 경로 구분자 `/` 만 남기고 전부 이스케이프되므로, 해석 쪽은 조각 단위로 한 번만 디코딩한다.
 * 서버 라우트와 화면이 이 파일을 같이 쓴다(pug-frame-message 와 같은 배치).
 */

export const RAW_PREFIX = "/raw/";

export interface RawTarget {
  root: string;
  path: string;
}

/** 화면이 iframe `src` 로 쓸 주소. `path` 는 루트 기준 상대경로다. */
export function rawUrl(root: string, path: string): string {
  const encodedPath = path
    .split("/")
    .filter((segment) => segment !== "")
    .map(encodeURIComponent)
    .join("/");
  return `${RAW_PREFIX}${encodeURIComponent(root)}/${encodedPath}`;
}

/**
 * 요청 pathname → (root, path). 형식이 아니면 null.
 *
 * `URL.pathname` 은 퍼센트 인코딩을 **풀지 않고** 준다. 그래서 여기서 조각별로 한 번
 * 디코딩한다 — 그 뒤로는 어디서도 다시 디코딩하지 않는다(CONVENTIONS 9, 이중 디코딩 금지).
 * 디코딩된 조각에 `/` 가 들어 있으면(`%2F`) 경로 구분자 위조이므로 거절한다. `..` 같은
 * 탈출은 여기서 보지 않는다 — 그것은 `resolvePath` 의 일이다.
 */
export function parseRawPath(pathname: string): RawTarget | null {
  if (!pathname.startsWith(RAW_PREFIX)) return null;
  const rest = pathname.slice(RAW_PREFIX.length);
  const segments: string[] = [];
  for (const encoded of rest.split("/")) {
    if (encoded === "") continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(encoded);
    } catch {
      return null;
    }
    if (decoded.includes("/")) return null;
    segments.push(decoded);
  }
  const [root, ...path] = segments;
  if (!root || path.length === 0) return null;
  return { root, path: path.join("/") };
}
