# 프로젝트 구조

> 모든 작업 완료 시 이 문서를 갱신한다. 상태 표기: `✅ 구현됨` / `⬜ 예정(T-xxx)`

## 트리

```
control-tower/
├── index.ts                        ✅        서버 진입점 (Bun.serve 기동)
├── package.json                    ✅        scripts: dev / start / typecheck
├── tsconfig.json                   ✅
├── CLAUDE.md                       ✅        Bun 사용 규약 (에이전트용)
├── README.md                       ✅
├── docs/
│   ├── README.md                   ✅        문서 지도 · 작업 절차
│   ├── TODO.md                     ✅        AppendOnlyLog
│   ├── CONVENTIONS.md              ✅
│   ├── STRUCTURE.md                ✅        (이 문서)
│   ├── ENDPOINTS.md                ✅
│   └── todos/T-0xx-*.md            ✅        작업 단위별 자기완결 명세
└── src/
    ├── config.ts                   ✅        환경변수 → 설정 객체, 경로 상수
    ├── domain/
    │   └── types.ts                ✅        디스크 원본 타입 + 도메인 타입
    ├── lib/                                  도메인 지식 없는 순수 유틸
    │   ├── http.ts                 ✅        응답 헬퍼 · 쿼리 파싱 · HttpError · withRoute
    │   ├── http.test.ts             ✅
    │   └── text.ts                 ✅        stripAnsi/truncate/parseJsonl/decodeProjectId
    ├── repositories/                         디스크 읽기·쓰기
    │   ├── history.repository.ts   ✅        ~/.claude/history.jsonl
    │   ├── live-session.repository.ts ✅     ~/.claude/sessions/<pid>.json
    │   ├── transcript.repository.ts   ✅     ~/.claude/projects/<project>/<id>.jsonl (LRU 캐시)
    │   └── fs.repository.ts        ✅        readDirectory/statEntry/readFileBytes
    ├── services/                             도메인 로직·집계
    │   ├── history.service.ts      ✅
    │   ├── live.service.ts         ✅
    │   ├── project.service.ts      ✅
    │   ├── session.service.ts      ✅        요약·타임라인 생성, 요약 캐시
    │   ├── stats.service.ts        ✅
    │   ├── watch.service.ts        ✅        폴링 기반 변경 감지 + 구독
    │   ├── fs.service.ts           ✅        resolvePath · listDirectory/buildTree · isEditable/languageOf/versionOf
    │   └── fs.service.test.ts       ✅        경로 탈출 방어 테스트
    ├── routes/                               HTTP 핸들러 (Bun.serve routes 조각)
    │   ├── index.ts                ✅        라우트 컴포지션 (여기서만 조합)
    │   ├── health.route.ts         ✅        /api/health
    │   ├── session.route.ts        ⬜ T-003
    │   ├── project.route.ts        ⬜ T-003
    │   ├── stats.route.ts          ⬜ T-003
    │   ├── history.route.ts        ⬜ T-003
    │   ├── events.route.ts         ⬜ T-004  SSE
    │   └── fs.route.ts             ✅        /api/fs/roots · list · tree · file
    └── web/                                  브라우저 번들 (서버 코드 import 금지)
        ├── index.html              ✅        T-001 골격, T-009에서 확장
        ├── main.tsx                ⬜ T-009  React 루트 마운트
        ├── app.tsx                 ⬜ T-011  라우팅 + 셸
        ├── styles.css              ⬜ T-009  CSS 토큰 · 라이트/다크
        ├── lib/
        │   ├── api.ts              ⬜ T-010  fetch 래퍼 + 엔드포인트 함수
        │   ├── router.ts           ⬜ T-011  history API 기반 미니 라우터
        │   ├── format.ts           ⬜ T-010  숫자/시간/바이트 포맷
        │   └── markdown.ts         ⬜ T-014  마크다운 → React 엘리먼트
        ├── hooks/
        │   ├── use-query.ts        ⬜ T-010  비동기 데이터 로딩
        │   └── use-live.ts         ⬜ T-018  SSE 구독
        ├── components/
        │   ├── app-shell.tsx       ⬜ T-011  사이드바 + 콘텐츠 레이아웃
        │   ├── file-tree.tsx       ⬜ T-012
        │   ├── markdown-editor.tsx ⬜ T-013
        │   ├── markdown-preview.tsx ⬜ T-014
        │   ├── session-list.tsx    ⬜ T-015
        │   ├── timeline.tsx        ⬜ T-016
        │   └── ui.tsx              ⬜ T-009  공통 프리미티브(Spinner/Empty/ErrorBox/Badge)
        └── pages/
            ├── dashboard.page.tsx      ⬜ T-017
            ├── files.page.tsx          ⬜ T-012/013
            ├── sessions.page.tsx       ⬜ T-015
            └── session-detail.page.tsx ⬜ T-016
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
| `PORT` | `4317` | 리슨 포트 |
| `HOST` | `0.0.0.0` | 리슨 호스트 |
| `CLAUDE_HOME` | `$HOME/.claude` | 관찰 대상 Claude 데이터 디렉터리 |
| `WATCH_INTERVAL_MS` | `1500` | 변경 감지 폴링 주기 |
| `MAX_BLOCK_CHARS` | `4000` | 타임라인 블록당 최대 문자 수 |
| `LOG_REQUESTS` | `0` | `1`이면 요청당 한 줄 로그 |
| `WORKSPACE_ROOTS` | `$HOME/workspace` | 탐색 허용 루트. `:` 구분. 없는 경로는 조용히 제외 |
| `FS_MAX_READ_BYTES` | `2097152` | 파일 읽기/쓰기 본문 상한 |
| `FS_WRITABLE_EXTENSIONS` | `.md,.markdown` | 쓰기 허용 확장자 |
