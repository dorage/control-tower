# T-031 — HTML 파일을 격리된 iframe 에서 그린다

- **ID** — T-031
- **우선순위** — P2
- **영역** — web-files
- **선행** — T-007, T-028, T-029
- **후행** — 없음

## 1. 목적

파일 화면(`/files`)과 워크스페이스 화면(`/workspace`)에서 `.html` 을 열면 원문(색칠한 소스)만
보인다. HTML 은 읽으라고 쓴 파일이 아니라 **보라고** 쓴 파일이다. 마크다운에 미리보기 탭이
있듯 HTML 에도 미리보기 탭을 두고, 브라우저 탭에서 여는 것과 같은 모습으로 그린다.

마스터 요청 원문 - "파일과 워크스페이스 파일뷰에서 html의 경우 iframe으로 렌더링시키면 좋겠어."

완수 조건

- `/files` 와 `/workspace` 어디서든 `.html` 을 고르면 미리보기 탭이 기본으로 뜨고 iframe 이 뷰어 본문을 채운다
- 문서 옆에 둔 `./style.css`, `img/a.png` 같은 상대 자원이 함께 뜬다
- 문서 안 스크립트가 이 앱의 권한(`/api/*`, localStorage)을 얻지 못한다
- 디스크에서 파일이 바뀌면 iframe 이 다시 그려진다

## 2. 전제와 판단

### 2.1 `srcdoc` 이 아니라 `/raw/<root>/<path>` 를 `src` 로 연다

가장 짧은 길은 이미 받아 둔 파일 내용을 `<iframe srcdoc={content}>` 에 넣는 것이다. 서버를
건드리지 않는다. 그러나 `srcdoc` 문서의 URL 은 `about:srcdoc` 이라 `./style.css` 를 풀 기준이
없다 — 옆에 둔 CSS·이미지·스크립트가 전부 깨진다. LLM 이 만든 페이지는 자기완결적인 경우가
많지만 여러 파일로 나눠 둔 것도 있고, 사람이 만든 사이트 초안은 대개 나눠져 있다.

그래서 파일을 **그대로** 내주는 경로 `GET /raw/<root>/<path>` 를 하나 만들고 그것을 `src` 로
연다. 문서가 `/raw/work/site/index.html` 에서 열리면 `./style.css` 는 브라우저가
`/raw/work/site/style.css` 로 풀어 같은 경로로 다시 들어온다. **쿼리(`?root=&path=`)로 받으면
이 해석이 깨지므로** 경로에 싣는다. 조립과 해석은 `src/web/lib/raw-url.ts` 하나가 맡고 서버
라우트와 화면이 같이 쓴다(pug-frame-message 와 같은 배치).

대가 - 미리보기는 **디스크의 내용**이다. 마크다운 미리보기처럼 편집 중 초안을 보여 주지
못한다. HTML 은 쓰기 허용 확장자(기본 `.md`)가 아니라 초안이 있을 수 없으므로 지금은 어긋날
것이 없다. `.html` 을 쓰기 허용에 넣는 날 이 결정을 다시 본다.

### 2.2 경로 검사는 새로 만들지 않는다

CONVENTIONS 9 - 디스크에 닿는 모든 경로는 `resolvePath` 하나만 통과한다. `readFile` 이 그
뒤에 하던 "파일이고, 존재하고, 상한 안" 검사를 `resolveFile` 로 떼어 내 `readFile` 과 `/raw`
가 같이 쓴다. 두 경로가 서로 다른 검사를 하면 한쪽으로만 열리는 파일이 생기고, 그 차이가
곧 구멍이다. 상한(`FS_MAX_READ_BYTES`, 기본 2MB)도 그대로 따른다 — 그래서 2MB 를 넘는 이미지는
미리보기에서 깨진다. 지금 워크스페이스에 그런 파일이 있다는 근거가 없어 상한을 나누지 않았다.

### 2.3 문서는 출처 `null` 로 돈다 — iframe 속성과 응답 헤더 둘 다

pug-frame(T-029)과 같은 위협 모델이다. 워크스페이스의 HTML 은 남의 저장소에서 왔을 수도, LLM 이
만든 것일 수도 있다. 그 안의 스크립트가 앱의 권한으로 돌면 `PUT /api/fs/file` 로 다른 파일을
고칠 수 있다. 막는 장치는 둘이다.

- iframe 에 `sandbox="allow-scripts allow-forms allow-popups allow-modals"`. `allow-same-origin`
  을 **넣지 않는다.** 그러면 문서의 출처가 불투명(`null`)해져 부모 창의 localStorage 도, 이
  서버의 `/api/*` 도 부를 수 없다.
- `/raw` 가 `.html`·`.htm`·`.xhtml`·`.svg` 응답에 `content-security-policy: sandbox <같은 플래그>`
  를 붙인다. iframe 속성만으로는 **같은 주소를 새 탭으로 열었을 때** 문서가 이 서버의 출처로
  돌아간다. 헤더가 있으면 어디서 열어도 출처가 `null` 이다. 두 플래그 목록은 교집합으로
  적용되므로 같게 두고 테스트로 고정했다.

실측(헤드리스 Chromium, §4) - 직접 열기와 iframe 모두 `self.origin === "null"`, 문서 안
`fetch("/api/health")` 는 `TypeError` 로 거절. `location.origin` 은 URL 에서 나오는 값이라
sandbox 여부와 무관하게 서버 주소를 돌려준다 — 출처를 볼 때는 `self.origin` 을 봐야 한다.

### 2.4 `Access-Control-Allow-Origin: *` 를 붙이지 않는다 — 알려진 한계

출처 `null` 문서에서 `<script type="module" src="./x.js">` 와 문서 안 `fetch("./data.json")`
은 CORS 로 거절된다(같은 서버인데도 교차 출처가 된다). pug-frame 호스트 스크립트는 이 헤더를
붙여 풀었지만 그것은 **공개 패키지 코드**라 누구에게 보여도 새는 것이 없었다. `/raw` 는 이
사용자의 파일이다. 여기에 `*` 를 붙이면 브라우저의 다른 사이트가 `http://<이 서버>/raw/...`
를 읽어 갈 수 있다 — 로컬 도구를 노리는 흔한 공격 경로다. `Origin: null` 만 허용하는 것도
답이 아니다. 어느 사이트든 sandbox iframe 을 만들면 `Origin: null` 을 보낼 수 있다.

그래서 인라인 스크립트, 일반 `<script src>`, CDN 스크립트(CDN 은 자기가 `*` 를 보낸다), CSS,
이미지는 정상이고 모듈 스크립트와 문서 안 `fetch` 만 동작하지 않는다. html-preview.tsx 머리와
ENDPOINTS 에 적었다.

### 2.5 `version` 을 key 로 삼아 다시 그린다

뷰어는 SSE 로 변경 신호를 받으면 파일을 다시 읽고, `use-editor-file` 은 서버 `version` 이
실제로 달라졌을 때만 상태를 바꾼다. iframe 의 `src` 는 그대로라 React 가 속성을 다시 쓰지
않고, 브라우저도 다시 받지 않는다. `key={file.version}` 을 두면 version 이 바뀔 때 iframe 이
새 엘리먼트로 만들어져 다시 받는다. 응답은 `cache-control: no-store` 라 캐시가 끼지 않는다.

## 3. 변경 목록

- `src/web/lib/raw-url.ts` (+test) - `rawUrl`·`parseRawPath`. 조각별 `encodeURIComponent`,
  해석은 한 번만 디코딩(이중 디코딩 금지), 디코딩 결과에 `/` 가 있으면 위조로 거절
- `src/services/fs.service.ts` - `resolveFile` 추출, `readFile` 이 그것을 쓴다
- `src/services/raw.service.ts` (+test) - `serveRaw`·`rawHeaders`·`isSandboxedDocument`
- `src/routes/raw.route.ts`, `src/routes/index.ts` - `GET /raw/*`
- `src/web/components/html-preview.tsx` - sandbox iframe
- `src/web/components/file-view.tsx` - `language === "html"` 에 미리보기 탭, 그 탭은 HtmlPreview
- `src/web/styles.css` - `.html-preview` (본문을 채우고 바탕은 흰색)
- `src/services/fs.service.test.ts` - `/raw` 가 같은 관문을 지나는지(탈출 403·디렉터리 400·없음 404·상한 413·공백/`#` 이름)
- 문서 - README 기능 줄, ENDPOINTS 화면 자원 절, STRUCTURE, 이 문서, TODO

## 4. 확인 방법

- `bun run check` - tsc, 테스트, check-docs
- 서버를 띄우고 `curl -si http://localhost:4317/raw/<root>/<path>.html` - `Content-Security-Policy: sandbox …` 와 `X-Content-Type-Options: nosniff` 가 보여야 한다
- 브라우저에서 `/files?root=<root>&path=<path>.html` - 미리보기·원문 두 버튼, iframe 이 본문을 채운다. 개발자 도구 콘솔에서 iframe 문서를 골라 `self.origin` 을 치면 `"null"`
- 헤드리스 Chromium 으로 같은 것을 자동 확인한 스크립트는 작업 임시 폴더에 두었다(job d2b55b14 `tmp/verify.ts`). 라이브러리 준비는 메모리 `headless-chromium-on-this-pi` 를 따른다

실측(라즈베리파이 5, 프로덕션 모드, 포트 4339, 픽스처 `site/index.html` + `./style.css`)

- 직접 열기 - `self.origin` `"null"`, `h1` 색 `rgb(255, 0, 0)` (상대 CSS 적용)
- 뷰어 - `iframe.html-preview` `src="/raw/ws/site/index.html"`, 580×711 로 본문을 채움, 안쪽 `self.origin` `"null"`, `fetch("/api/health")` 거절, CSS 적용, 원문 탭으로 바꾸면 iframe 0개
- 탈출 - `/raw/ws/../smoke.log`, `%2e%2e`, `--path-as-is` 전부 400. `URL` 파서가 점 조각을 먼저 정규화해 형식이 깨진다. 경계 자체는 `resolvePath` 가 지키고, 파서를 거치지 않는 테스트가 403 을 확인한다

## 5. 관찰 - 이 작업이 만든 것이 아니다

프로덕션 모드에서 `PUT /api/health`, `PUT /pug-frame`, `PUT /raw/…` 가 모두 `200` + 앱 HTML 이다.
CONVENTIONS 5 는 "GET 이 아닌 메서드만 405 를 기대할 수 있다(실측 `PUT /api/health` → 405)"
고 적었는데 지금 Bun 1.4.0 에서는 그 실측이 재현되지 않는다 — SPA 폴백 `"/*": index` 가 메서드를
가리지 않고 받는 것으로 보인다. 별개 작업으로 다룬다.
