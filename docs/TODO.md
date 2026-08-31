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
2026-08-31T13:44:00Z START T-004
2026-08-31T13:44:01Z NOTE T-004 "config.claudeDir 와 paths 를 getter 로 바꿨다. bun test 가 모듈 레지스트리를 공유해서, 최상단에서 env 를 한 번만 읽으면 테스트가 임시 CLAUDE_HOME 을 지정할 수 없다. workspaceRoots 에 이미 있던 선례와 같은 이유"
2026-08-31T13:44:02Z NOTE T-004 "tick() 이 ChangeEvent | null 을 반환하게 해서 테스트 seam 을 하나로 줄였다. 리스너 등록용 seam 을 따로 두지 않는다"
2026-08-31T13:44:03Z DONE T-004 "세션별 델타(changed/added/removed) + GET /api/events. 실측 검증: append→changedSessions=[해당 세션], 신규→addedSessions. 구독 해지 후 CPU 1 jiffy(=타이머 정지). 테스트 10종"
2026-08-31T13:44:04Z START T-021
2026-08-31T13:44:05Z NOTE T-021 "식별 정보(user.email·user.id·account_uuid·organization.id)를 tel_session 에 정규화하지 않고 아예 저장하지 않는다. 단일 사용자 로컬 도구에서 이 값을 읽는 화면이 없어, 한 번만 저장하는 것보다 버리는 것이 낫다. 명세보다 강한 선택"
2026-08-31T13:44:06Z NOTE T-021 "tel_session 의 project_id 컬럼을 넣지 않았다. OTLP 페이로드에 프로젝트 정보가 없어 항상 NULL 이 되는 컬럼이다. started_at 대신 first_seen/last_seen 을 둔다"
2026-08-31T13:44:07Z NOTE T-021 "config.telemetry 전체를 getter 로 뒀다. maxSeries·hardLimitBytes 를 런타임에 바꾸는 테스트가 필요했고, 값 하나 읽는 비용이 그 값이 막는 쿼리보다 훨씬 싸다"
2026-08-31T13:44:08Z NOTE T-021 "GET /v1/metrics 가 정의되지 않은 메서드라 SPA 폴백으로 새어 앱 HTML 을 반환했다(PUT /api/health 는 정상적으로 405). 405 + 설정 힌트로 바꿨다 — 텔레메트리를 디버깅하는 사람이 브라우저로 여는 주소다"
2026-08-31T13:44:09Z NOTE T-021 "실측 정정: PROTOCOL 누락 시 claude --debug 에도 흔적이 남지 않는다. 완전히 조용하다. 유일한 진단은 status.collecting=false 이고, 그래서 status 에 port 를 넣었다"
2026-08-31T13:44:10Z NOTE T-021 "OTLP 정수 값이 asInt 가 아니라 asDouble 로 온다(897 도 asDouble). aggregationTemporality=1(DELTA) 확인. 손으로 만든 픽스처로는 못 잡을 차이라 실측 페이로드를 test/fixtures 에 고정했다 — 식별 정보는 더미로 치환"
2026-08-31T13:44:11Z DONE T-021 "POST /v1/metrics·/v1/logs + bun:sqlite 저장소 + GET /api/telemetry/{status,tokens,cost,timeseries,latency}. 실제 claude 왕복 검증: query_source main 22969 vs auxiliary 907(오버헤드 3.8%), cost $0.0205, 지연 백분위. 깨진 페이로드 10종 전부 200. 테스트 22종"
2026-08-31T21:56:00Z NOTE T-013 "서버 측 왕복 재검증: 저장 후 즉시 재저장 200(409 아님), 외부 변경 후 저장 409+currentVersion, 비허용 확장자 403, editing.ts 순수 로직 8종 통과"
2026-08-31T21:56:01Z DONE T-013 "미리보기·원문·편집 3탭 에디터. 브라우저 전용 항목(IME 조합, Cmd+Z, 초안 복원 배너, beforeunload, 파일 전환 확인, 5000줄 타이핑 성능)은 이 환경에 브라우저가 없어 끝까지 미검증 — 실사용 시 확인 필요"
2026-08-31T22:10:00Z START T-017
2026-08-31T22:10:01Z NOTE T-017 "SessionCard 는 T-015 가 이미 compact prop 과 함께 export 해 둬서 재사용만 했다. 막대는 bar-breakdown.tsx 로 빼서 T-022 와 공유한다"
2026-08-31T22:10:02Z NOTE T-017 "Link 가 title 을 받도록 넓혔다. 토큰 타일이 hover 로 input/output/cache 분해를 보여주려면 필요했다"
2026-08-31T22:10:03Z DONE T-017 "타일 5종(비용은 조건부) + 카드 4종. 카드 단위 에러 격리. 실데이터 확인: 세션 14·프로젝트 4·툴 Bash 437"
2026-08-31T22:10:04Z START T-018
2026-08-31T22:10:05Z NOTE T-018 "ChangeEvent 를 watch.service 에서 domain/types.ts 로 옮겼다. 작업 문서는 서비스에서 import type 하라고 했지만 그러면 CONVENTIONS §5(웹은 domain 타입만)를 뚫는다. 도메인으로 옮기면 둘 다 만족한다"
2026-08-31T22:10:06Z NOTE T-018 "탭 복귀 시 빈 델타를 가진 가짜 ChangeEvent 를 만들지 않고 null 을 보낸다. 델타로 거르는 타임라인이 빈 배열을 '할 일 없음' 으로 읽기 때문"
2026-08-31T22:10:07Z NOTE T-018 "작업 문서는 '어느 세션이 바뀐지 알 수 없으니 항상 재조회' 를 전제했는데, T-004 의 changedSessions 덕분에 남의 세션 변경으로 타임라인을 다시 그리지 않는다"
2026-08-31T22:10:08Z DONE T-018 "단일 EventSource(번들 내 /api/events 참조 1개로 확인) + 연결 표시등 + 화면별 디바운스. 편집 중 dirty 는 절대 다시 읽지 않는다. 브라우저 전용 항목(표시등 색, 스크롤 보존, 탭 전환)은 미검증"
2026-08-31T22:10:09Z START T-022
2026-08-31T22:10:10Z NOTE T-022 "차트 라이브러리 없이 CSS 폭(막대)과 인라인 SVG rect(누적 시계열)로 그렸다. 색은 인덱스 기반 6칸 고정 — 무작위면 새로고침마다 바뀌어 읽을 수 없다"
2026-08-31T22:10:11Z NOTE T-022 "미수집 상태를 에러가 아니라 정상적인 첫 상태로 다룬다. settings.json 은 사용자 소유라 대신 고치지 않고 복사용으로만 보여주며, 포트는 status.port 를 쓴다"
2026-08-31T22:10:12Z DONE T-022 "/telemetry 화면. 6개 소스 병렬·카드 단위 에러 격리. 실데이터 확인: query_source main 22969 vs auxiliary 907, degraded 승격 동작"
2026-08-31T22:13:00Z START T-019
2026-08-31T22:13:01Z NOTE T-019 "작업 문서의 '설정 뒤 동적 import' 지침은 더 이상 필요 없다. T-004 에서 config.claudeDir/paths 를 getter 로 바꿔서 정적 import 로도 임시 CLAUDE_HOME 이 먹는다"
2026-08-31T22:13:02Z NOTE T-019 "테스트가 두 번 틀렸다. ai-title 레코드의 필드는 title 이 아니라 aiTitle 이고(실제 트랜스크립트로 확인), getTimeline 의 옵션은 events/sidechain 이 아니라 includeEvents/includeSidechain 이다(그 이름은 라우트 쿼리 파라미터다). 구현이 아니라 테스트를 고쳤다"
2026-08-31T22:13:03Z NOTE T-019 "격리 검증: bun test 중 바뀐 유일한 트랜스크립트는 다른 worktree 에서 동시 실행 중인 세션(bb66677d)의 것이었다. 대조군(테스트 없이 동일 시간 대기)으로 가려냈다. 테스트는 임시 홈만 쓴다"
2026-08-31T22:13:04Z NOTE T-019 "format.ts 의 % Lines 0.00 은 커버리지 없음이 아니라 전부 export 순수 함수라 최상단 실행 줄이 없어 그렇게 잡히는 것이다(% Funcs 90). fs.service.ts 59.76% 는 실제로 낮고, 목록·트리 경로가 비어 있다 — CONVENTIONS §11.1 에 기록"
2026-08-31T22:13:05Z DONE T-019 "text.test.ts 16종·session.service.test.ts 19종·test/helpers.ts. 137 pass 0 fail, 3.2초, 임시 디렉터리 잔여 0, 2회 연속 동일. package.json test/check 스크립트"
2026-08-31T22:16:00Z START T-020
2026-08-31T22:16:01Z NOTE T-020 "check-docs.ts 가 첫 실행에서 실전 누락을 하나 잡았다 — STRUCTURE 트리에 text.test.ts 를 넣는 치환이 트리 문자(└ vs ├) 때문에 조용히 실패해 있었다. 스크립트를 만든 값을 즉시 했다"
2026-08-31T22:16:02Z NOTE T-020 "감사에서 발견: 서비스와 웹 클라이언트에 같은 이름의 TimelineOptions 가 있고 필드명이 다르다(includeEvents/includeSidechain vs events/sidechain). 이름을 통일하지 않고 CONVENTIONS §8 에 이유와 주의를 명시했다 — 웹은 HTTP 쿼리 이름을, 서비스는 도메인을 따르는 것이 각각 옳다"
2026-08-31T22:16:03Z NOTE T-020 "node:fs 규칙이 §1 에 이미 있는데 §2 에 중복으로 쓸 뻔했다. 한 곳으로 통합하고 실제 사용처(db/*.db.ts, scripts, test 포함)에 맞게 확장"
2026-08-31T22:16:04Z DONE T-020 "scripts/check-docs.ts + check/check:docs 스크립트 + 루트 README 재작성. 엔드포인트 18종 실호출 감사, 상태 코드 규약 확인, CONVENTIONS 위반 grep 9종 전부 통과. bun run check 통과"
