# T-029 — 마크다운 미리보기의 pug-frame 렌더링

- **ID** — T-029
- **우선순위** — P2
- **영역** — web-files
- **선행** — T-014
- **후행** — 없음

## 1. 목적

마크다운 문서 안의 ` ```pug-frame ` 코드 블록을 코드가 아니라 **화면**으로 보여준다. pug-frame 은
Pug 문법 위에 와이어프레임 의미를 얹은 DSL 이고(https://github.com/dorage/pug-frame), 이 저장소의
문서들도 화면 설계를 그 문법으로 적는다. 지금은 미리보기 탭에서 그 블록이 회색 코드 상자로만 보여,
와이어프레임을 보려면 Obsidian 이나 다른 뷰어를 따로 열어야 한다.

완수 조건 - `/files` 나 `/workspace` 에서 pug-frame 블록이 든 `.md` 를 열면 미리보기 탭에
프레임(mobile/tablet/desktop)이 그려지고, 팬·줌·`p-focus` 이동이 동작한다. 편집 탭에서 고친 내용이
저장 전에 미리보기에 따라온다. 블록이 없는 화면의 첫 로딩은 무거워지지 않는다.

## 2. 전제와 판단

### 2.1 렌더러는 `@pug-frame/canvas` 를 그대로 쓴다

pug-frame 저장소는 세 패키지를 npm 에 `0.1.0` 으로 배포한다(`npm view` 로 확인, 2026-09-21).
`@pug-frame/render` 는 소스 → HTML/CSS 문자열, `@pug-frame/canvas` 는 그 위에 팬·줌·`p-*`
인터랙션을 얹어 DOM 노드 하나에 그리는 바닐라 뷰어다(`pugFrameCanvas(el, { pugframe }).render()`).
React 컴포넌트는 없다. Obsidian 플러그인도 같은 canvas 를 컨테이너 div 에 붙여 쓴다
(`plugins/obsidian/src/main.ts`).

CONVENTIONS §2 는 런타임 의존성을 `react`/`react-dom` 으로 묶어 두었다. 이 작업은 `@pug-frame/canvas`
를 더한다. 근거 - pug 렉서·파서·코드 생성기와 Tailwind v4 컴파일러, lucide 아이콘을 다시 쓰는 것은
이 도구의 범위가 아니고, 배포본은 외부 import 없는 자기완결 번들이라 의존성 트리를 늘리지 않는다.

### 2.2 메인 창에서 그리지 않는다 - sandbox iframe 에 가둔다

처음에는 Obsidian 플러그인처럼 미리보기 안의 `<div ref>` 에 canvas 를 붙이려 했다. 두 가지 사실이
그 길을 막았다.

- **pug 는 템플릿 안의 JS 를 실행한다.** `- code`, `#{expr}` 은 컴파일 시점에 함수가 되어 돈다
  (`packages/render/src/compile.ts` 가 `pug-code-gen` 의 출력을 `pug-runtime/wrap` 으로 감싼다).
  마크다운에서 온 소스를 메인 창에서 컴파일하면, 문서가 이 앱의 권한으로 `fetch("/api/fs/file",
  { method: "PUT" })` 같은 코드를 돌릴 수 있다. 출력 HTML 을 sanitize 해도 소용없다 - 실행이 먼저다.
  CONVENTIONS §10 이 `dangerouslySetInnerHTML` 을 금지한 이유(XSS 가 구조적으로 없어야 한다)와
  정확히 같은 위협이다. 세션 타임라인은 에이전트가 쓴 마크다운을 그리므로 더 그렇다.
- **`Bun.serve` 의 HTML import 는 동적 `import()` 를 별도 조각으로 나누지 않는다.** 실측 -
  `import("@pug-frame/canvas")` 하나를 넣은 진입점을 `development: false` 로 서빙하면 메인 조각이
  1.96MB 가 된다(`bun build --splitting` 은 나누지만 `Bun.serve` 에는 그 스위치가 없다). 현재
  메인 번들은 0.47MB 다. 블록이 없는 화면까지 다섯 배 무거워지는 것은 받아들이지 않는다.

그래서 canvas 는 `sandbox="allow-scripts"` 만 가진 iframe 안의 **별도 페이지**(`/pug-frame`)에서
돈다. `allow-same-origin` 이 없으므로 iframe 의 출처는 불투명(`null`)이다 - 부모 창의 DOM 도, 쿠키도,
`/api/*` 의 응답도 읽을 수 없다(우리 서버는 CORS 헤더를 내지 않으므로 `fetch` 는 막힌다. PUT 은
preflight 에서 죽는다). 소스는 부모가 `postMessage` 로 넘긴다. 이 격리가 §10 의 규칙을 pug-frame
에도 지키는 방법이고, 같은 구조가 번들 분리까지 해결한다 - 호스트 페이지는 자기 스크립트를 따로 가진다.

되돌리기 - 이 작업은 라우트 두 개와 컴포넌트 하나를 더할 뿐, 기존 미리보기의 다른 블록에는 손대지
않는다. `markdown-preview.tsx` 의 `lang === "pug-frame"` 분기 한 줄을 지우면 이전 동작(코드 상자)이다.

### 2.3 호스트 스크립트는 `Bun.build` 로 직접 묶어 CORS 헤더를 붙여 내준다

호스트 페이지도 HTML import 로 만들고 싶었지만 안 된다. **모듈 스크립트는 언제나 CORS 모드로
받는다.** 출처가 `null` 인 iframe 이 `<script type="module" src="/chunk-xxx.js">` 를 읽으려면 응답에
`Access-Control-Allow-Origin: *` 가 있어야 하는데, `Bun.serve` 가 내주는 조각 파일에는 헤더를 붙일 방법이
없다. 그래서 `services/pug-frame.service.ts` 가 `Bun.build({ target: "browser" })` 로
`src/web/pug-frame-host.ts` 를 묶어 문자열로 들고, `routes/pug-frame.route.ts` 가 헤더를 붙여 내준다.

- 프로세스당 한 번 묶고 캐시한다. 실측(라즈베리파이 5) 첫 요청 979ms, 이후 46ms, `If-None-Match`
  재검증 304 는 2ms.
- `--hot` 서버는 호스트 소스를 고쳐도 다시 묶지 않는다. 캐시는 모듈 스코프에 있고 그 모듈은 호스트 파일을
  import 하지 않기 때문이다. `bun run restart` 로 띄우면 된다 - docs/README.md 에 적었다.
- 실패한 빌드는 캐시에 남기지 않는다. 다음 요청이 다시 시도한다.
- 스크립트는 npm 공개 패키지와 우리 호스트 코드뿐이라 `*` 로 열어도 새는 것이 없다.

### 2.4 부모와 호스트의 말 맞추기

`src/web/lib/pug-frame-message.ts` 하나를 양쪽 번들이 같이 쓴다. 규약은 둘뿐이다.

- 호스트 → 부모 `{ type: "pug-frame:ready" }` - 스크립트가 떠서 듣기 시작했다. 부모는 이것을 받은 뒤에야
  소스를 보낸다. 먼저 보내면 듣는 이가 없어 버려진다.
- 부모 → 호스트 `{ type: "pug-frame:render", source }` - 이 소스를 그려라. 타이핑마다 오지만 호스트는
  "가장 마지막 것" 만 그린다(그리는 중에 온 것은 다음 한 번으로 접는다).

출처가 불투명해 `targetOrigin` 은 양쪽 다 `"*"` 다. 대신 **보낸 창이 기대한 창인지**(`event.source ===
frame.contentWindow`, 호스트 쪽은 `=== window.parent`)로 상대를 가리고, 데이터는 `unknown` 으로 받아
파서로 좁힌다(§3 외부 데이터 규칙). 한 문서에 블록이 여럿이면 iframe 도 여럿이고, 각 블록은 자기
iframe 이 보낸 메시지만 받는다.

### 2.5 화면

- 블록은 상단 바(`pug-frame` 라벨 + "원문" 토글) 와 480px 높이의 뷰포트다. 아래 모서리를 끌어 높이를
  바꿀 수 있다(`resize: vertical`).
- "원문" 은 iframe 을 내리지 않고 숨긴다. 다시 띄우면 2MB 스크립트 평가와 ready 대기를 반복한다.
- `loading="lazy"` 로 화면 밖 블록은 스크롤해 내려올 때 뜬다. 타임라인처럼 블록이 많은 곳을 위해서다.
- 세션 타임라인(`root === null`)에서도 그린다. 격리가 있으니 출처에 따라 다르게 다룰 이유가 없다.
- 호스트 페이지의 배경색은 `styles.css` 의 `--bg-subtle` 값을 그대로 옮겼다. iframe 은 부모의 CSS
  변수를 물려받지 못한다. 프레임 자체의 색(검은 테두리·흰 배경)은 pug-frame 의 것이다.
- 파싱 실패는 canvas 가 뷰포트 안에 붉은 안내로 남긴다. 던지지 않는다.

## 3. 산출물

- `src/web/lib/pug-frame-message.ts` · `.test.ts` - 규약과 파서
- `src/web/pug-frame-host.ts` - iframe 안에서 도는 canvas 호스트 (메인 번들 밖)
- `src/services/pug-frame.service.ts` · `.test.ts` - 호스트 페이지 HTML, `Bun.build` 캐시
- `src/routes/pug-frame.route.ts` - `GET /pug-frame`, `GET /pug-frame/host.js`
- `src/web/components/pug-frame-block.tsx` - 블록 컴포넌트
- `src/web/components/markdown-preview.tsx` - `lang === "pug-frame"` 분기
- `src/web/styles.css` - `.md__pug-frame*`
- `package.json` - `@pug-frame/canvas ^0.1.0`

## 4. 수용 기준

- [x] `/pug-frame/host.js` 응답에 `access-control-allow-origin: *` 와 `etag` 가 있고, `If-None-Match` 에 304 를 준다 (스모크 실측).
- [x] 메인 번들에 canvas 가 들어가지 않는다 (정적 빌드 0.47MB → 0.48MB).
- [x] 규약 밖 postMessage(`null`, 문자열, 다른 도구의 메시지)에 파서가 던지지 않고 `null` 을 준다.
- [x] `bunx tsc --noEmit` 통과. 새 테스트 7종.
- [ ] 브라우저에서 sandbox iframe 이 모듈 스크립트를 읽고 프레임을 그린다 - 이 기계에 브라우저가 없어 사용자 확인으로 남긴다. 확인 경로: `/files` 에서 아래 예시가 든 `.md` 를 열어 미리보기 탭을 본다.

```pug-frame
mobile#main-1
    header
        div Rescene
    body
        div Ilsan!
        button(p-focus='main-2') Next
    footer
        div 2026.07.07

mobile#main-2
    header
        div Rescene
    body
        div Yaho!
        button(p-focus='main-1') Prev
```

## 5. 범위 밖

- 소스의 문법 강조("원문" 은 기존 코드 상자다).
- 블록 높이를 내용에 맞추기. canvas 는 무한 캔버스라 "내용 높이" 가 없다.
- `@pug-frame/render` 의 정적 HTML 출력. `p-focus`·툴팁·Tailwind 유틸리티가 빠져 canvas 보다 못하다.
