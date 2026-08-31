# TODO — AppendOnlyLog

이 파일은 **추가 전용 로그(Append-Only Log)** 이다.

## 규칙

1. **한 줄에 하나의 이벤트.** 줄바꿈을 포함하지 않는다.
2. **기존 줄을 수정·삭제하지 않는다.** 상태가 바뀌면 새 줄을 append 한다.
3. **항상 파일 끝에 추가한다.** 중간 삽입 금지.
4. 현재 상태는 위에서 아래로 이벤트를 접어(fold) 계산한다. 같은 `ID`의 마지막 상태 이벤트가 현재 상태다.
5. 시각은 UTC ISO-8601(`YYYY-MM-DDTHH:MM:SSZ`). 타임스탬프는 단조 증가한다.
6. **`## LOG` 아래만 로그다.** 그 위의 규칙·예시는 문서 설명이며 도구가 파싱 대상으로 삼지 않는다.

## 라인 문법

```
<TIMESTAMP> <OP> <ID> [<PRIORITY> <AREA>] "<TITLE>" [<DOC_PATH>]
```

- `OP` — `ADD` | `START` | `DONE` | `BLOCK` | `UNBLOCK` | `DROP` | `NOTE`
- `ID` — `T-<3자리>`. 한 번 발급되면 재사용하지 않는다.
- `PRIORITY` — `P0`(선행/필수) | `P1`(핵심) | `P2`(개선). `ADD`에만 기록.
- `AREA` — `core` | `api-session` | `api-fs` | `api-telemetry` | `web-core` | `web-files` | `web-session` | `quality` | `docs`. `ADD`에만 기록.
- `TITLE` — 큰따옴표로 감싼 한 줄 요약.
- `DOC_PATH` — 자기완결적 작업 문서 경로. `ADD`에만 기록.
- `ADD` 외의 OP는 `"<TITLE>"` 자리에 메모를 쓸 수 있고 생략해도 된다.

## 예시

```
2026-08-29T00:00:00Z ADD T-001 P0 core "제목" docs/todos/T-001-slug.md
2026-08-29T01:00:00Z START T-001
2026-08-29T02:00:00Z BLOCK T-001 "T-002 선행 필요"
2026-08-29T03:00:00Z UNBLOCK T-001
2026-08-29T04:00:00Z DONE T-001 "문서 3종 갱신 완료"
```

## LOG

2026-08-29T00:00:00Z ADD T-001 P0 core "Bun.serve 진입점과 라우트 컴포지션" docs/todos/T-001-server-entry.md
2026-08-29T00:00:01Z ADD T-002 P0 core "HTTP 응답 규약·에러 처리·요청 로깅" docs/todos/T-002-http-contract.md
2026-08-29T00:00:02Z ADD T-003 P0 api-session "세션·프로젝트·통계·히스토리 조회 API" docs/todos/T-003-session-api.md
2026-08-29T00:00:03Z ADD T-004 P1 api-session "SSE 실시간 변경 이벤트 API" docs/todos/T-004-events-sse.md
2026-08-29T00:00:04Z ADD T-005 P0 api-fs "파일시스템 루트 설정과 안전한 경로 해석" docs/todos/T-005-fs-path-safety.md
2026-08-29T00:00:05Z ADD T-006 P0 api-fs "디렉터리 목록·트리 조회 API" docs/todos/T-006-fs-list-api.md
2026-08-29T00:00:06Z ADD T-007 P0 api-fs "파일 내용 읽기 API" docs/todos/T-007-fs-read-api.md
2026-08-29T00:00:07Z ADD T-008 P0 api-fs "마크다운 저장 API와 충돌 감지" docs/todos/T-008-fs-write-api.md
2026-08-29T00:00:08Z ADD T-009 P0 web-core "프론트엔드 셸과 번들 파이프라인" docs/todos/T-009-web-shell.md
2026-08-29T00:00:09Z ADD T-010 P0 web-core "API 클라이언트와 데이터 훅" docs/todos/T-010-web-api-client.md
2026-08-29T00:00:10Z ADD T-011 P1 web-core "클라이언트 라우터와 앱 레이아웃" docs/todos/T-011-web-router-layout.md
2026-08-29T00:00:11Z ADD T-012 P0 web-files "파일 탐색기 트리 패널" docs/todos/T-012-web-file-tree.md
2026-08-29T00:00:12Z ADD T-013 P0 web-files "마크다운 에디터 뷰" docs/todos/T-013-web-markdown-editor.md
2026-08-29T00:00:13Z ADD T-014 P1 web-files "마크다운 렌더링·프리뷰" docs/todos/T-014-web-markdown-preview.md
2026-08-29T00:00:14Z ADD T-015 P0 web-session "세션 목록 뷰" docs/todos/T-015-web-session-list.md
2026-08-29T00:00:15Z ADD T-016 P0 web-session "세션 타임라인 뷰" docs/todos/T-016-web-session-timeline.md
2026-08-29T00:00:16Z ADD T-017 P1 web-session "대시보드 뷰" docs/todos/T-017-web-dashboard.md
2026-08-29T00:00:17Z ADD T-018 P1 web-core "SSE 기반 실시간 반영" docs/todos/T-018-web-live-updates.md
2026-08-29T00:00:18Z ADD T-019 P1 quality "테스트 스위트와 타입 체크" docs/todos/T-019-tests.md
2026-08-29T00:00:19Z ADD T-020 P1 docs "문서 동기화 루틴(컨벤션·구조·엔드포인트)" docs/todos/T-020-doc-sync.md
2026-08-29T08:01:23Z START T-001
2026-08-29T08:01:23Z DONE T-001 "Bun.serve 기동, /api/health, SPA 폴백"
2026-08-29T08:03:02Z START T-002
2026-08-29T08:03:02Z DONE T-002 "withRoute/HttpError, 403·409·413 헬퍼, 목록 봉투, 요청 로깅"
2026-08-29T08:04:29Z START T-005
2026-08-29T08:04:29Z DONE T-005 "루트 레지스트리와 resolvePath, 탈출 7종 방어 테스트"
2026-08-29T08:06:48Z START T-006
2026-08-29T08:06:48Z DONE T-006 "/api/fs/roots·list·tree"
2026-08-29T08:07:47Z START T-007
2026-08-29T08:07:47Z DONE T-007 "GET /api/fs/file, 바이너리 판정과 크기 상한"
2026-08-29T08:09:22Z START T-009
2026-08-29T08:09:22Z DONE T-009 "React 마운트, CSS 토큰, 공통 프리미티브"
2026-08-29T08:10:52Z START T-010
2026-08-29T08:10:52Z DONE T-010 "api/format/use-query. 세션 함수는 T-003 대기"
2026-08-29T08:12:20Z START T-011
2026-08-29T08:12:20Z DONE T-011 "미니 라우터, 앱 셸, 자리표시 페이지 4종"
2026-08-29T08:14:32Z START T-012
2026-08-29T08:14:32Z DONE T-012 "지연 로딩 파일 트리와 읽기 전용 뷰어"
2026-08-29T08:18:27Z START T-014
2026-08-29T08:18:27Z NOTE T-014 "읽기 전용 범위라 T-013(에디터) 없이 뷰어에 직접 붙였다. 에디터 통합은 T-013이 이어받는다"
2026-08-29T08:18:27Z DONE T-014 "마크다운 파서와 프리뷰"
2026-08-29T13:46:00Z START T-003
2026-08-29T13:46:00Z DONE T-003 "stats·projects·sessions·sessions/:id·timeline·history 라우트, 서비스 위 얇은 어댑터"
2026-08-29T13:50:00Z START T-015
2026-08-29T13:50:00Z DONE T-015 "세션 카드·날짜 구분선·디바운스 검색·프로젝트 필터·더 보기"
2026-08-29T13:54:00Z START T-016
2026-08-29T13:54:00Z NOTE T-016 "MarkdownPreview 의 root/basePath 를 옵셔널로 넓혔다. 루트가 없으면 상대 링크는 비활성 텍스트로 남는다"
2026-08-29T13:54:00Z DONE T-016 "타임라인 렌더러와 상세 화면. 접힌 블록은 펼치기 전에 렌더하지 않는다"
2026-08-30T22:00:00Z START T-008
2026-08-30T22:01:00Z DONE T-008 "writeFileAtomic·writeFile·PUT /api/fs/file. 확장자·탈출·409·413·원자성 테스트 12종"
2026-08-30T22:02:00Z START T-013
2026-08-30T22:03:00Z NOTE T-013 "T-014 가 남긴 뷰어와 합쳐 미리보기·원문·편집 3탭으로 만들었다. 세 탭 모두 draft 를 원본으로 삼아 저장 전에 미리보기로 확인할 수 있다"
2026-08-30T22:04:00Z NOTE T-013 "구현·타입체크·단위 테스트 완료. 브라우저 시나리오(IME 조합, Cmd+Z, 초안 복원 배너, beforeunload)는 이 환경에 브라우저가 없어 미검증"
2026-08-31T13:20:00Z ADD T-021 P1 api-telemetry "OTLP 텔레메트리 수신기와 저장소" docs/todos/T-021-telemetry-otlp-receiver.md
2026-08-31T13:20:01Z ADD T-022 P2 web-session "텔레메트리 대시보드" docs/todos/T-022-web-telemetry-dashboard.md
2026-08-31T13:20:02Z NOTE T-021 "실측 근거: http/json 은 평범한 JSON POST 라 의존성 0. tel_point 33.9 B/행, tel_request 44.1 B/행. 보존 raw 30일/hourly 400일/daily 3650일/request 400일 → 최악 1.06 GiB (상한 5 GiB 의 21%)"
2026-08-31T13:20:03Z NOTE T-021 "포트 4317 이 OTLP gRPC 기본 포트와 동일. /v1/metrics·/v1/logs 를 4317 에서 겸용하되 OTEL_EXPORTER_OTLP_PROTOCOL=http/json 누락 시 조용히 실패하는 함정을 문서화한다"
2026-08-31T13:20:04Z NOTE T-004 "범위 추가: ChangeEvent 에 changedSessions/addedSessions/removedSessions 델타를 넣는다. fb-watchman 은 채택하지 않는다 — aarch64 prebuilt 부재로 소스 빌드 필요, fingerprint 맵 diff 로 의존성 0에 동일 효과"
2026-08-31T13:20:05Z NOTE T-017 "범위 추가: 조건부 '오늘 비용' 타일(T-021 수집 시에만 렌더). 미수집 시 타일을 그리지 않는다 — $0.00 은 오해를 만든다"
2026-08-31T13:20:06Z NOTE T-020 "선행을 T-022 까지로 확장. check-docs 에 AREA 유효성 검사 추가, 4317 경고와 *.db gitignore 를 수용 기준에 포함"
