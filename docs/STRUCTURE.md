# 프로젝트 구조

> 모든 작업 완료 시 이 문서를 갱신한다. 상태 표기: `✅ 구현됨` / `⬜ 예정(T-xxx)`

## 트리

```
control-tower/
├── index.ts                        ✅        서버 진입점 (Bun.serve 기동)
├── package.json                    ✅        scripts: dev / start(둘 다 --hot) / start:prod / typecheck
├── tsconfig.json                   ✅        lib: ESNext + DOM (브라우저 코드용)
├── CLAUDE.md                       ✅        Bun 사용 규약 (에이전트용)
├── README.md                       ✅
├── docs/
│   ├── README.md                   ✅        문서 지도 · 작업 절차
│   ├── TODO.md                     ✅        AppendOnlyLog
│   ├── CONVENTIONS.md              ✅
│   ├── STRUCTURE.md                ✅        (이 문서)
│   ├── ENDPOINTS.md                ✅
│   └── todos/T-0xx-*.md            ✅        작업 단위별 자기완결 명세
├── test/
│   └── fixtures/otlp-*.json        ✅        실측 OTLP 페이로드 (식별 정보는 더미로 치환)
└── src/
    ├── config.ts                   ✅        환경변수 → 설정 객체, 경로 상수
    ├── domain/
    │   ├── types.ts                ✅        디스크 원본 타입 + 도메인 타입
    │   └── telemetry.ts            ✅        OTLP 원본 타입 + 시리즈 키·조회 타입
    ├── db/
    │   └── telemetry.db.ts         ✅        bun:sqlite 핸들·스키마·PRAGMA (auto_vacuum=incremental)
    ├── lib/                                  도메인 지식 없는 순수 유틸
    │   ├── http.ts                 ✅        응답 헬퍼 · 쿼리 파싱 · HttpError · withRoute
    │   ├── http.test.ts             ✅
    │   └── text.ts                 ✅        stripAnsi/truncate/parseJsonl/decodeProjectId
    ├── repositories/                         디스크 읽기·쓰기
    │   ├── history.repository.ts   ✅        ~/.claude/history.jsonl
    │   ├── live-session.repository.ts ✅     ~/.claude/sessions/<pid>.json
    │   ├── transcript.repository.ts   ✅     ~/.claude/projects/<project>/<id>.jsonl (LRU 캐시)
    │   ├── telemetry.repository.ts ✅        텔레메트리 insert·집계 조회·롤업·보존·크기 차단기
    │   └── fs.repository.ts        ✅        readDirectory/statEntry/readFileBytes/writeFileAtomic
    ├── services/                             도메인 로직·집계
    │   ├── history.service.ts      ✅
    │   ├── live.service.ts         ✅
    │   ├── project.service.ts      ✅
    │   ├── session.service.ts      ✅        요약·타임라인 생성, 요약 캐시
    │   ├── stats.service.ts        ✅
    │   ├── watch.service.ts        ✅        폴링 기반 변경 감지 + 구독 + 세션별 변경 델타
    │   ├── watch.service.test.ts    ✅        diffState · 델타 통합 테스트
    │   ├── telemetry.service.ts    ✅        OTLP 파싱 · 카디널리티 가드 · 보존 스케줄 · 조회
    │   ├── telemetry.service.test.ts ✅      파싱·가드·롤업 멱등·크기 차단기 테스트
    │   ├── fs.service.ts           ✅        resolvePath · listDirectory/buildTree/readFile/writeFile · isEditable/languageOf/versionOf
    │   └── fs.service.test.ts       ✅        경로 탈출 방어 · 저장 충돌·원자성 테스트
    ├── routes/                               HTTP 핸들러 (Bun.serve routes 조각)
    │   ├── index.ts                ✅        라우트 컴포지션 (여기서만 조합)
    │   ├── health.route.ts         ✅        /api/health
    │   ├── session.route.ts        ✅        /api/sessions · /:id · /:id/timeline
    │   ├── project.route.ts        ✅        /api/projects
    │   ├── stats.route.ts          ✅        /api/stats
    │   ├── history.route.ts        ✅        /api/history
    │   ├── events.route.ts         ✅        /api/events (SSE)
    │   ├── telemetry.route.ts      ✅        /api/telemetry/status · tokens · cost · timeseries · latency
    │   ├── otlp.route.ts           ✅        POST /v1/metrics · /v1/logs (OTLP 수신, /api 규약 예외)
    │   └── fs.route.ts             ✅        /api/fs/roots · list · tree · file(GET/PUT)
    └── web/                                  브라우저 번들 (서버 코드 import 금지)
        ├── index.html              ✅        스크립트·스타일 연결
        ├── main.tsx                ✅        React 루트 마운트
        ├── css.d.ts                ✅        CSS 부수효과 import 선언
        ├── app.tsx                 ✅        라우트 → 화면 매핑 + document.title
        ├── styles.css              ✅        CSS 토큰 · 라이트/다크 · 컴포넌트 스타일
        ├── lib/
        │   ├── debounce.ts         ✅        useDebouncedCallback (실시간 갱신 묶기)
        │   ├── api.ts              ✅        fetch 래퍼 + ApiError + fs·세션·프로젝트·통계·히스토리·텔레메트리
        │   ├── router.ts           ✅        useSyncExternalStore 기반 미니 라우터 · setParam(s)
        │   ├── format.ts           ✅        숫자/시간/바이트 포맷 · tildePath · dayGroup
        │   ├── format.test.ts       ✅
        │   ├── markdown.ts         ✅        마크다운 → AST
        │   ├── markdown.test.ts     ✅
        │   ├── editing.ts          ✅        목록 이어쓰기 · 들여쓰기/내어쓰기 (순수 문자열 연산)
        │   └── editing.test.ts      ✅
        ├── hooks/
        │   ├── use-query.ts        ✅        비동기 데이터 로딩(경쟁 상태 처리)
        │   ├── use-editor-file.ts  ✅        파일 로드/더티/저장 상태 기계 · 초안 보존
        │   └── use-live.ts         ✅        SSE 구독 (모듈 스코프 EventSource 하나, 참조 계수)
        ├── components/
        │   ├── app-shell.tsx       ✅        헤더 + 사이드바 + 콘텐츠 Grid
        │   ├── file-tree.tsx       ✅        지연 로딩 트리 + 키보드 조작
        │   ├── markdown-editor.tsx ✅        textarea 에디터 · 편집 보조 · 충돌/초안 배너
        │   ├── markdown-preview.tsx ✅       AST → React 엘리먼트. root 없이도 쓸 수 있다
        │   ├── session-list.tsx    ✅        세션 카드(compact 지원)·날짜 구분선·복사 버튼
        │   ├── timeline.tsx        ✅        엔트리·블록 렌더. 접힌 블록은 펼치기 전엔 안 그린다
        │   ├── timeline.test.ts    ✅        toolSummary (잘린 JSON 방어)
        │   ├── stat-tile.tsx       ✅        수치 타일 (링크형/비링크형)
        │   ├── bar-breakdown.tsx   ✅        가로 막대 분포 (CSS 폭, 라이브러리 없음)
        │   ├── stacked-timeline.tsx ✅       시계열 누적 막대 (인라인 SVG)
        │   └── ui.tsx              ✅        Spinner/EmptyState/ErrorBox/Badge/Button
        └── pages/
            ├── dashboard.page.tsx      ✅        타일 + 최근 세션·프로젝트·툴 막대·최근 프롬프트
            ├── files.page.tsx          ✅        좌 트리 / 우 뷰어(미리보기·원문·편집 3탭)
            ├── sessions.page.tsx       ✅        검색·프로젝트 필터·"더 보기"
            ├── session-detail.page.tsx ✅        헤더 + 필터 토글 4종 + 타임라인 페이지네이션
            └── telemetry.page.tsx      ✅        토큰·비용 분포/추이/지연 + 미수집 설정 안내
```

## 계층 규칙

```
routes  →  services  →  repositories  →  디스크
   ↘           ↘             ↘
          lib  ·  domain/types
```

- 역방향 import 금지.
- `routes`는 `repositories`를 직접 부르지 않는다.
- `web`은 서버 모듈을 값으로 import 하지 않는다. `domain/types`의 타입만 `import type`으로 공유한다.
- `lib`은 아무것도 import 하지 않는다(런타임 전역 제외). 예외: `http.ts` → `config.ts`(요청 로깅 스위치).

## 데이터 소스

| 소스 | 경로 | 읽는 곳 |
| --- | --- | --- |
| 세션 트랜스크립트 | `$CLAUDE_HOME/projects/<projectId>/<sessionId>.jsonl` | `transcript.repository.ts` |
| 실행 중 세션 | `$CLAUDE_HOME/sessions/<pid>.json` | `live-session.repository.ts` |
| 프롬프트 히스토리 | `$CLAUDE_HOME/history.jsonl` | `history.repository.ts` |
| 워크스페이스 파일 | `$WORKSPACE_ROOTS`의 각 루트 | `fs.repository.ts` (T-005) |

`projectId`는 절대경로를 `/` → `-`로 치환한 형태다(`-home-dorage-workspace-app`). 역변환은 손실이 있어 best-effort이며, 트랜스크립트의 `cwd` 필드가 있으면 그쪽을 우선한다.

## 설정 (환경변수)

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | `4317` | 리슨 포트. **⚠️ OTLP gRPC 의 기본 포트와 같다** — 이 포트에서 OTLP/HTTP 를 겸용하므로 보내는 쪽이 `OTEL_EXPORTER_OTLP_PROTOCOL=http/json` 을 반드시 지정해야 한다. 빠뜨리면 조용히 실패한다 (`docs/ENDPOINTS.md` 텔레메트리 절) |
| `HOST` | `0.0.0.0` | 리슨 호스트 |
| `CLAUDE_HOME` | `$HOME/.claude` | 관찰 대상 Claude 데이터 디렉터리 |
| `WATCH_INTERVAL_MS` | `1500` | 변경 감지 폴링 주기 |
| `MAX_BLOCK_CHARS` | `4000` | 타임라인 블록당 최대 문자 수 |
| `LOG_REQUESTS` | `0` | `1`이면 요청당 한 줄 로그 |
| `WORKSPACE_ROOTS` | `$HOME/workspace` | 탐색 허용 루트. `:` 구분. 없는 경로는 조용히 제외 |
| `FS_MAX_READ_BYTES` | `2097152` | 파일 읽기/쓰기 본문 상한 |
| `FS_WRITABLE_EXTENSIONS` | `.md,.markdown` | 쓰기 허용 확장자 |
| `TELEMETRY_ENABLED` | `1` | `0`이면 OTLP 수신을 끈다. DB 파일도 만들지 않는다 |
| `TELEMETRY_DB` | `$HOME/.control-tower/telemetry.db` | 텔레메트리 저장소. **`CLAUDE_HOME` 아래에 두면 안 된다** — 우리가 감시하는 디렉터리에 우리 파일을 쓰면 매 insert 마다 핑거프린트가 움직여 무한 change 이벤트가 된다 |
| `TEL_RETAIN_RAW_DAYS` | `30` | 원본 데이터포인트 보존 |
| `TEL_RETAIN_HOURLY_DAYS` | `400` | 시간 롤업 보존 |
| `TEL_RETAIN_DAILY_DAYS` | `3650` | 일 롤업 보존 |
| `TEL_RETAIN_REQUEST_DAYS` | `400` | 요청 단위 행 보존 |
| `TEL_MAX_SERIES` | `2000` | 시리즈 카디널리티 상한. 초과분은 `__other__` 로 접힌다 |
| `TEL_SOFT_LIMIT_BYTES` | `1610612736` (1.5 GiB) | 넘으면 경고 로그 |
| `TEL_HARD_LIMIT_BYTES` | `4294967296` (4 GiB) | 넘으면 보존 기간을 무시하고 오래된 raw 삭제 |
| `TEL_PRUNE_INTERVAL_MS` | `3600000` | 보존 잡 주기. SD 카드 쓰기를 아끼려고 1시간 |
