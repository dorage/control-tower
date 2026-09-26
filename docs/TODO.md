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
2026-08-31T22:34:00Z ADD T-023 P2 web-session "세션별·전체 스킬 사용 집계와 표시" docs/todos/T-023-skill-usage.md
2026-08-31T22:34:01Z START T-023
2026-08-31T22:34:02Z NOTE T-023 "실측: Skill 툴 호출 레코드 자체에는 attributionSkill 이 없고 그 뒤 레코드들에 붙는다. 붙는 구간도 연속이 아니라 사이의 tool_result 레코드에는 없다. 그래서 마지막으로 본 스킬 이름과 다를 때만 새 호출로 센다"
2026-08-31T22:34:03Z NOTE T-023 "사용자가 /skill-name 을 직접 치면 Skill 툴 호출이 아예 없다(attributionSkill 만 남는다). 툴 호출만 세면 슬래시 명령으로 쓴 스킬이 통째로 사라진다"
2026-08-31T22:34:04Z NOTE T-023 "호출 수와 세션 수를 함께 준다. 한 세션이 12번 몰아 쓴 것과 12개 세션이 각각 쓴 것은 다른 이야기인데 호출 수만 보면 구별되지 않는다"
2026-08-31T22:34:05Z NOTE T-023 "텔레메트리에 이미 skill.name 차원이 있지만(T-021) 그것은 선택 기능이다. 켜지 않은 사람도 보이도록 트랜스크립트에서 뽑았다"
2026-08-31T22:34:06Z DONE T-023 "SessionSummary.skillUsage + Stats.skills + 대시보드 자주 쓴 스킬 카드 + 세션 카드·상세 스킬 칩. 실데이터 확인: update-config 2회/2세션. 테스트 9종 추가(146 pass), bun run check 통과. 한계는 ENDPOINTS 에 명시 — 같은 스킬을 슬래시 명령으로 연달아 부르면 한 번으로 접힌다"
2026-09-01T00:11:00Z NOTE T-013 "사용자가 브라우저에서 직접 확인. IME 조합·Cmd+Z·초안 복원 배너·beforeunload·파일 전환 확인·타이핑 성능 모두 이상 없음"
2026-09-01T00:11:01Z DONE T-013 "브라우저 검증까지 완료. 남은 미검증 항목 없음"
2026-09-01T00:11:02Z NOTE T-018 "사용자가 브라우저에서 직접 확인. 연결 표시등 색·스크롤 보존·탭 전환 모두 이상 없음"
2026-09-01T00:11:03Z DONE T-018 "브라우저 검증까지 완료. 남은 미검증 항목 없음"
2026-09-01T00:11:04Z NOTE T-023 "사용자가 집계 한계를 확인하고 수용. 슬래시 명령으로 같은 스킬을 연달아 부르면 한 번으로 접히는 동작은 고치지 않고 ENDPOINTS 기재로 남긴다"
2026-09-01T00:11:05Z DONE T-023 "확인 완료. 알려진 한계는 수용"
2026-09-01T01:43:20Z START T-019
2026-09-01T01:43:21Z NOTE T-019 "남겨둔 fs.service.ts 커버리지를 올렸다. 참조: bun.com/docs/runtime/file-io(픽스처를 Bun.write/Bun.file 로 만든다)와 file-types(languageOf 가 덮을 확장자 목록)"
2026-09-01T01:43:22Z NOTE T-019 "실측: Bun.write 는 없는 부모 디렉터리를 만들어 준다 - 파일마다 mkdir 을 부르지 않는다. 반대로 Bun.file(dir).exists() 는 디렉터리에 false 라 존재 확인에 쓸 수 없다"
2026-09-01T01:43:23Z NOTE T-019 "경계를 흉내내지 않고 실제로 만들었다. EACCES 는 chmod(0o000) 으로, 트리 너비 상한은 2001개 파일로. 2001개 생성은 실측 64ms 라 픽스처로 둘 만했다. chmod 는 afterAll 에서 되돌린다 - 안 그러면 rm 이 실패한다"
2026-09-01T01:43:24Z NOTE T-019 "languageOf 를 Bun 이 다루는 확장자에 맞췄다(.mts/.cts/.mjs/.cjs/.jsonc/.json5/.xml). language 는 뷰어 라벨과 마크다운 탭 판정에만 쓰여서 위험이 없다. .wasm/.node 는 넣지 않았다 - 바이너리라 readFile 이 어차피 text 로 되돌린다"
2026-09-01T01:43:25Z NOTE T-019 "테스트가 실전 결함을 하나 잡았다: buildTree 가 walk 에서 join(absolute, name) 으로 내려가 resolvePath 를 건너뛴다. 루트 안의 심볼릭 링크가 루트 밖을 가리키면 트리에 그 아래 파일 이름·크기가 그대로 실린다. list/read/write 는 셋 다 403 이라 내용은 새지 않지만 이름은 샌다. 파일 머리말의 '모든 경로는 resolvePath 를 통과한다' 와 어긋난다. 고치는 방식(심볼릭 링크 디렉터리를 아예 건너뛸지, 자식마다 realpath 로 재검사할지)에 선택이 걸려 있어 T-019 에서 고치지 않고 보고만 한다"
2026-09-01T01:43:26Z DONE T-019 "fs.service.ts 75.00/59.76 → 100.00/99.60, fs.repository.ts 75.00/51.43 → 100.00/100.00. 목록·트리·읽기 테스트 22종 추가(146 → 166 pass), 2.93초로 느려지지 않았고 임시 디렉터리 잔여 0. CONVENTIONS 11.1 표와 픽스처 지침 갱신"
2026-09-01T02:05:00Z NOTE T-019 "CLAUDE.md 의 '‘bun 내부 구현을 사용하면 이 파일에 문구를 추가한다’ 규칙을 이번 작업에서 놓쳤다. Bun.write/Bun.file().delete()/.bytes() 로 바꿔 놓고 APIs 절에 적지 않았다. 실측한 함정(Bun.write 의 부모 디렉터리 자동 생성, Bun.file(dir).exists() 가 false)까지 함께 적었다"
2026-09-01T13:42:00Z ADD T-024 P2 web-core "대시보드 상단 서비스 바로가기 줄" docs/todos/T-024-web-quick-links.md
2026-09-01T13:42:01Z START T-024
2026-09-01T13:50:00Z NOTE T-024 "호스트는 window.location 에서 읽는다. 상수로 박으면 tailscale IP 로 열 때와 localhost 로 열 때 중 하나가 반드시 틀린다. 포트만 다르다는 전제는 서비스가 전부 한 대에 떠 있기 때문에 성립한다"
2026-09-01T13:50:01Z NOTE T-024 "환경변수로 빼지 않았다. 값을 브라우저로 내려보낼 API 가 하나 더 필요한데 항목이 label·port 두 칸뿐이다. 사람마다 목록이 달라지는 시점에 /api/quick-links 로 옮긴다"
2026-09-01T13:50:02Z NOTE T-024 "대시보드 네 갈래(에러·로딩·빈 상태·정상) 모두에 넣었다. /api/stats 가 실패한 상황이야말로 다른 서비스로 건너갈 일이 생기는 때다"
2026-09-01T13:50:03Z DONE T-024 "FreshRSS(8080) 바로가기 1건으로 시작. quickLinkHref 테스트 4종 추가(166 → 170 pass), bun run check 통과. 번들에 컴포넌트가 실렸는지 실서버(4319)에서 확인. 브라우저 육안 확인은 사용자 몫으로 남긴다"
2026-09-02T10:05:00Z ADD T-025 P2 web-session "세션 뷰 기본값을 대화만으로" docs/todos/T-025-session-view-dialogue-default.md
2026-09-02T10:05:01Z START T-025
2026-09-02T10:05:02Z NOTE T-025 "잡음의 절반은 attachment 였다. 실측(세션 61f3bacc): 전체 229 엔트리 중 event 112, attachment 40. events=0 이 attachment 를 남기고 있었으니 토글을 다 끄는 것만으로는 목적을 달성하지 못한다. 그래서 isConversational 은 그대로 두고 필터용 isDialogue(user/assistant)를 따로 뒀다 - kind 와 블록 모양을 정하는 일과 무엇을 남길지 정하는 일은 다르다"
2026-09-02T10:05:03Z NOTE T-025 "툴 결과만 든 user 엔트리를 지우는 서버 필터를 만들지 않았다. tools 를 끄면 블록이 전부 사라지고 TimelineEntryView 가 빈 엔트리에 null 을 반환해 이미 없어진다. 실측으로 81 엔트리 중 텍스트가 남는 것은 4 개였다"
2026-09-02T10:05:04Z NOTE T-025 "API 의 sidechain 기본값은 1 로 남겼다. API 는 전체를 주고 화면은 읽기 편한 것을 주는 것이 각각 자연스럽고, 화면이 네 값을 항상 명시해 보내므로 어긋나지 않는다. ENDPOINTS 에 그 이유를 적었다"
2026-09-02T10:05:05Z DONE T-025 "네 토글 기본값 끔 + events 범위 확장. 세션 61f3bacc 실측 229 → 77 엔트리, 렌더되는 것은 4 개(유저 프롬프트 1 + 답변 3). 테스트 2종 추가(170 → 172 pass), bun run check 통과. 브라우저 육안 확인은 사용자 몫"
2026-09-02T13:40:00Z ADD T-026 P2 core "호스트 CPU·메모리·상위 프로세스 모니터링" docs/todos/T-026-system-performance.md
2026-09-02T13:40:01Z START T-026
2026-09-02T13:40:02Z NOTE T-026 "ps 를 부르지 않았다. ps 의 %cpu 는 프로세스 수명 전체의 평균이라 '지금 무엇이 먹고 있나' 에 답하지 못한다. 지금의 사용률은 누적 시간의 차이라 두 시점이 필요하고, 그 차이를 우리가 계산한다. 폴링마다 프로세스를 띄우지 않는 것도 이유다 - 이 기계는 SD 카드에서 돈다"
2026-09-02T13:40:03Z NOTE T-026 "실측: claude 프로세스의 comm 이 실행 파일 이름이 아니라 버전 문자열(2.1.258)이다. comm 만 보여주면 상위 목록의 절반이 무엇인지 알 수 없다. 그렇다고 229개 전부 cmdline 을 읽으면 폴링마다 파일 수가 두 배가 되므로, 화면에 실제로 나가는 상위 20개씩만 읽는다"
2026-09-02T13:40:04Z NOTE T-026 "페이지 크기를 4096 으로 박지 않고 계산한다 - /proc/self/status 의 VmRSS(kB) 나누기 /proc/self/stat 의 rss(페이지). aarch64 에 16 KiB 페이지 커널이 있다. getconf 를 띄우지 않으려는 것이고, 2의 거듭제곱이 아니면 4096 으로 떨어진다. CLK_TCK 는 반대로 상수 100 으로 뒀다 - 사용자 공간에서 사실상 고정이다"
2026-09-02T13:40:05Z NOTE T-026 "프로세스별 cpuPercent 는 top 과 같은 기준(코어 1개 = 100%)으로 뒀다. 기계 전체 대비로 환산하면 4코어에서 한 프로세스가 코어 하나를 꽉 잡고 있어도 25% 로 보여 사실이 사라진다. 전체 사용률(0..100)과 자릿수가 다른 이유를 ENDPOINTS 에 적었다"
2026-09-02T13:40:06Z NOTE T-026 "성능 화면은 CONVENTIONS 10.1 의 '분석 화면은 자동 갱신하지 않는다' 의 예외다. 1분 전 CPU 사용률은 볼 이유가 없다. 대신 탭이 숨겨지면 폴링을 멈추고 돌아오면 즉시 한 번 부른다(use-poll.ts) - SSE 를 끊는 것과 같은 이유다"
2026-09-02T13:40:07Z NOTE T-026 "감사에서 발견(T-026 이 만든 것이 아니다): CONVENTIONS 5 의 실측 기록 'PUT /api/health -> 405' 가 Bun 1.4.0 에서 더 이상 맞지 않는다. 정의하지 않은 메서드가 405 가 아니라 SPA 폴백으로 새어 200 + HTML 이 나간다(/api/health, /api/stats, /api/system 모두 동일). 규약 문장 자체는 '폴백으로 새는 경우가 있다' 를 이미 담고 있어 지침은 유효하다. 실측 예시만 어긋나므로 별개 작업으로 다룬다"
2026-09-02T13:40:08Z DONE T-026 "GET /api/system + /system 화면 + 대시보드 시스템 카드. 실측(라즈베리파이 5, 4코어, 229 프로세스): 첫 호출 410ms 구간, 이후 캐시 히트 23ms. 테스트 33종 추가(172 -> 205 pass, 3.85초), bun run check 통과. 번들에 페이지와 스타일이 실렸는지 실서버(4321)에서 확인. 브라우저 육안 확인은 사용자 몫으로 남긴다"
2026-09-03T12:00:00Z ADD T-027 P2 core "origin/main 추적 자동 배포" docs/todos/T-027-auto-deploy.md
2026-09-03T12:00:01Z START T-027
2026-09-03T12:00:02Z NOTE T-027 "webhook 을 고르지 않았다. 즉시 반응하지만 밖으로 포트를 열어야 하고 이 프로젝트는 인증이 범위 밖이다(CONVENTIONS 9). GitHub Actions self-hosted runner 도 아웃바운드만 쓰지만 러너가 상시 떠 있어야 한다. 폴링은 이미 systemd 위에 있는 이 기계에 개념을 하나도 더하지 않고, 저장소가 공개라 자격증명도 없다. 값은 1분 지연인데 단일 사용자 로컬 도구에서 문제가 되지 않는다"
2026-09-03T12:00:03Z NOTE T-027 "control-tower.service 에서 --hot 을 뺐다. 자동 배포와 --hot 을 같이 쓰면 T-026 에서 겪은 상태가 반복된다 - 새로 생긴 파일을 못 따라가 라우트는 등록됐는데 핸들러가 돌지 않는다. NODE_ENV 는 그대로 두어 Bun.serve 의 development.hmr 은 살렸다. 기존 유닛은 .bak-20260903 으로 백업"
2026-09-03T12:00:04Z NOTE T-027 "실패한 커밋 SHA 를 파일에 적어 두는 것이 꼭 필요했다. 없으면 깨진 main 을 1분마다 받아 검사(5.3초)하고 되돌리기를 반복한다 - SD 카드에 쓰기도 그만큼 늘어난다"
2026-09-03T12:00:05Z NOTE T-027 "배포 스크립트를 저장소 밖(~/.local/bin)에서 실행한다. 저장소 안의 파일을 직접 돌리면 배포가 자기 자신을 갱신하는 셈이다. 대신 스크립트를 고쳤을 때 사본을 다시 만드는 것은 사람 몫이라 절차를 docs/README.md 에 적었다"
2026-09-03T12:00:06Z NOTE T-027 "헬스체크가 /api/health 하나만 본다. 특정 API 만 죽은 상태는 못 잡는다 - T-026 사고 때 health 는 계속 200 이었다. 다만 배포마다 프로세스를 새로 띄우므로 그 상태 자체가 생기지 않는다. 알려진 한계로 문서에 적고 넘어간다"
2026-09-03T12:00:07Z DONE T-027 "scripts/deploy.sh + 유닛 2개 + control-tower.service 에서 --hot 제거. 문법·유닛 검증 통과. 타이머 활성화와 첫 배포는 사용자 손에 남긴다 - 원본 체크아웃의 main 을 움직이고 서버를 재시작하는 일이라 사람이 보면서 시작하는 편이 낫다"
2026-09-03T12:20:00Z NOTE T-027 "타이머를 켜자마자 실전 결함 두 개가 나왔다. 첫째, 원본 체크아웃에 추적되지 않는 파일이 있어 매분 '작업 트리가 깨끗하지 않다'로 넘어갔다. --untracked-files=no 로 바꾸고, 넘어갈 때 무엇이 수정됐는지 세 줄까지 찍게 했다. 받아온 커밋이 그런 파일과 부딪히면 merge 가 실패하므로 안전망은 남는다. 둘째, 이 기계는 /var/log/journal 이 없어 journalctl --user 가 아무것도 못 보여준다 - 문서에 적어둔 확인 명령이 무용지물이었다. 실제로 배포한 기록만 ~/.cache/control-tower-deploy.log 에 남기고, 1분마다 찍히는 스킵은 systemctl status 로만 본다"
2026-09-03T10:36:00Z NOTE T-026 "머지 후 화면이 로딩만 계속된다는 보고. 원인은 코드가 아니라 5일 동안 --hot 으로 떠 있던 서버 프로세스였다. 라우트 경로는 등록됐는데(없는 경로처럼 SPA 폴백 HTML 이 나오지 않았다) 핸들러가 실행되지 않아 12초 뒤 빈 응답으로 연결이 끊긴다. strace 로 그 12초 동안 /proc/<pid>/stat 읽기가 0건임을 확인했다. 같은 코드를 새 프로세스(prod·--hot 둘 다)로 띄우면 440ms 에 200 이다. 대응은 재시작이고, --hot 의 한계를 docs/README.md 실행 절에 적었다"
2026-09-03T10:36:01Z NOTE T-026 "같은 보고에서 화면 쪽 결함 두 개가 드러났다. 첫째, api.ts 의 request 가 200 인데 JSON 이 아니면 조용히 null 을 돌려줘서 useQuery 가 로딩과 구별하지 못했다 - 서버를 재시작하지 않아 SPA 폴백 HTML 을 받는 사람은 에러 대신 영원한 스피너를 본다. 이제 ApiError 를 던진다. 둘째, 폴링이 진행 중인 요청을 앞질러 매번 error 를 지웠다 - 응답이 주기보다 느리면 실패가 화면에 영영 드러나지 않는다. state.loading 이면 tick 을 건너뛴다"
2026-09-03T10:36:02Z DONE T-026 "재시작으로 해결되는 문제였지만, 그것이 에러가 아니라 무한 로딩으로 보인 것은 우리 결함이었다. api.test.ts 4종 추가(205 -> 209 pass)"
2026-09-21T12:56:22Z ADD T-028 P2 web-files "워크스페이스 메뉴 — git 저장소와 worktree 를 묶어 탐색" docs/todos/T-028-workspace-view.md
2026-09-21T12:56:23Z START T-028
2026-09-21T12:56:24Z NOTE T-028 "git 을 띄우지 않고 .git 아래 텍스트 파일을 직접 읽는다. 필요한 것은 HEAD·브랜치·worktree 목록·잠금 사유 넷뿐이고 형식은 gitrepository-layout(5) 공개 규격이다. 저장소가 여섯 개면 목록 한 번에 git 프로세스가 여섯 번인데, 화면을 열 때마다 도는 경로에서 그럴 이유가 없다 - /proc 를 ps 대신 읽는 것과 같은 판단이다"
2026-09-21T12:56:25Z NOTE T-028 "새 API 는 저장소 목록 하나뿐이고 파일 접근은 기존 /api/fs/* 를 그대로 쓴다. 목록은 체크아웃마다 (root, relPath) 만 알려 주고 화면이 그 둘로 기존 API 를 부른다 - resolvePath 를 우회하는 경로 조립을 하나도 늘리지 않기 위해서다. 대가로 루트 밖 체크아웃은 열 수 없어 root: null 로 표시하고 화면에서 안내한다. 감추지 않는 쪽을 택했다"
2026-09-21T12:56:26Z NOTE T-028 "main 은 브랜치가 아니라 git 의 main working tree 다. main 작업 트리가 develop 을 보고 있을 수 있어 드롭다운에는 '기본 · <브랜치>' 로 적는다"
2026-09-21T12:56:27Z NOTE T-028 "workspace.service.test 는 WORKSPACE_ROOTS 를 세우는 대신 listRepos(roots) 로 루트를 주입한다. getRoots() 가 프로세스당 한 번만 계산되고 bun test 가 모듈 레지스트리를 공유해서, 다른 테스트 파일이 먼저 자기 루트를 캐시해 두면 환경변수도 동적 import 도 듣지 않는다. 같은 이유로 fs.service 의 locate 도 루트 목록을 인자로 받는 동기 함수로 뒀다"
2026-09-21T12:59:08Z NOTE T-028 "감사에서 발견(T-028 이 만든 것이 아니다): bun run check 가 이 작업 전부터 두 군데서 깨져 있다. (1) telemetry.service.test 의 'hardLimit 을 넘기면...' 가 5초 상한을 넘겨 실패한다 - 손대지 않은 원본 체크아웃에서도 같다(실측 10.3초). (2) check-docs 가 TODO.md:189 의 타임스탬프 역행을 잡는다(2026-09-03T10:36:00Z < 12:20:00Z). TODO 는 추가 전용이라 그 줄을 고칠 수 없다. 둘 다 별개 작업으로 다룬다"
2026-09-21T12:59:09Z NOTE T-028 "실측 사고: 스모크 서버를 pkill -f 'bun index.ts' 로 껐더니 systemd 의 control-tower.service(같은 명령줄)까지 죽었다. Restart=always 라 즉시 되살아났지만(재시작 카운터 1) 운영 서비스를 건드린 것은 맞다. 앞으로 스모크 프로세스는 PID 를 잡아 두고 그 PID 만 끈다"
2026-09-21T12:59:10Z DONE T-028 "GET /api/workspace/repos + /workspace 화면. 실측(WORKSPACE_ROOTS=~/workspace): 저장소 6개·체크아웃 16개를 git 프로세스 없이 돌려준다. 테스트 14종 추가(208 -> 222 pass), tsc 통과, check-docs 는 위 NOTE 의 기존 위반 1건만 남는다. 브라우저 육안 확인은 사용자 몫으로 남긴다"
2026-09-21T15:50:00Z ADD T-029 P2 web-files "마크다운 미리보기의 pug-frame 렌더링 — 격리된 iframe 에서 그린다" docs/todos/T-029-pug-frame-preview.md
2026-09-21T15:50:01Z START T-029
2026-09-21T15:50:02Z NOTE T-029 "Obsidian 플러그인처럼 미리보기 div 에 canvas 를 붙이는 길을 버렸다. pug 는 템플릿 안의 JS(- code, #{expr})를 컴파일 시점에 실행한다(render/compile.ts 가 pug-code-gen 출력을 pug-runtime/wrap 으로 감싼다). 마크다운에서 온 소스를 메인 창에서 컴파일하면 문서가 앱의 권한으로 PUT /api/fs/file 을 부를 수 있다 - 출력 HTML 을 걸러도 소용없다. CONVENTIONS 10 이 dangerouslySetInnerHTML 을 막은 것과 같은 위협이라 sandbox=allow-scripts iframe(출처 null)에 가뒀다"
2026-09-21T15:50:03Z NOTE T-029 "Bun.serve 의 HTML import 는 동적 import() 를 별도 조각으로 나누지 않는다. 실측 - import('@pug-frame/canvas') 하나 든 진입점을 development:false 로 서빙하면 메인 조각이 1.96MB(현재 메인 번들 0.47MB). bun build --splitting 은 나누지만 Bun.serve 에는 스위치가 없다. iframe 격리가 이 문제도 같이 푼다 - 호스트 페이지는 자기 스크립트를 따로 가진다"
2026-09-21T15:50:04Z NOTE T-029 "호스트 스크립트를 HTML import 로 못 묶는다. 모듈 스크립트는 언제나 CORS 모드로 받는데 출처 null 문서가 읽으려면 Access-Control-Allow-Origin 이 필요하고, Bun.serve 가 내주는 조각 파일에는 헤더를 붙일 수 없다. 그래서 pug-frame.service 가 Bun.build 로 직접 묶어 프로세스당 한 번 캐시하고 라우트가 헤더를 붙인다. 대가 - --hot 이 호스트 소스 변경을 모르므로 bun run restart 가 필요하다. docs/README.md 에 적었다"
2026-09-21T15:50:05Z NOTE T-029 "부모와 호스트 사이 출처 확인이 불가능하다(호스트 자신이 null 출처). targetOrigin 은 양쪽 * 이고, 대신 event.source 가 기대한 창(frame.contentWindow / window.parent)인지로 상대를 가린 뒤 데이터를 unknown 으로 좁힌다. 규약 파서 lib/pug-frame-message.ts 는 양쪽 번들이 같이 쓴다"
2026-09-21T15:58:00Z DONE T-029 "GET /pug-frame · /pug-frame/host.js + ```pug-frame 블록 컴포넌트. 실측(라즈베리파이 5, 프로덕션 모드): 호스트 번들 1.96MB, 첫 요청 979ms(빌드 포함), 이후 46ms, 304 는 2ms, 메인 번들 0.47MB 그대로. 테스트 7종 추가(222 -> 229 pass), tsc 통과, check-docs 는 T-028 이 적어 둔 기존 위반 1건만 남는다. 이 기계에 브라우저가 없어 sandbox iframe 이 실제로 그리는지는 사용자 육안 확인으로 남긴다 - 확인용 예시는 T-029 문서 4절에 있다"
2026-09-21T16:10:00Z ADD T-030 P2 web-files "코드 문법 색칠과 테마 설정 메뉴" docs/todos/T-030-code-syntax-highlight.md
2026-09-21T16:10:01Z START T-030
2026-09-21T16:10:02Z NOTE T-030 "하이라이터를 직접 만들었다. 런타임 의존성이 react 둘뿐이라는 것이 README 첫 화면과 CONVENTIONS 2 에 적혀 있고, highlight.js 공통 묶음은 이 앱의 클라이언트 번들과 맞먹는다. 마크다운 파서를 자체 구현한 것과 같은 판단이다. 대가로 정규식 리터럴과 나눗셈 같은 자리는 잘못 칠할 수 있다 - 알고 받는 비용이고, 대신 토큰을 이어 붙이면 원문과 글자 하나까지 같다는 불변식만은 테스트로 고정했다"
2026-09-21T16:10:03Z NOTE T-030 "구현 중 실제로 겪은 결함 둘. (1) YAML/TOML 에서 공백 규칙이 개행과 들여쓰기를 한 번에 삼켜, 그 줄이 더 이상 줄머리가 아니라서 들여쓴 키가 전부 색을 잃었다 - 개행과 들여쓰기를 따로 먹게 갈랐다. (2) 셸의 큰따옴표 문자열을 통째로 칠하니 `$NAME` 이 스크립트의 절반인 셸이 안 읽혔다 - 문자열 안쪽을 변수와 나머지로 다시 쪼갠다. 둘 다 표본 테스트가 잡았다"
2026-09-21T16:10:04Z NOTE T-030 "테마 블록을 :root 가 아니라 [data-code-theme] 속성 선택자로 썼다. 설정 화면의 미리보기 카드마다 같은 속성을 걸면 지금 적용된 테마와 무관하게 각 카드가 자기 색으로 보인다. 대신 CONVENTIONS 10 의 'hex 는 :root 와 다크 미디어 블록 안에만' 에 예외가 하나 생겨 규칙 본문에 적었다 - 팔레트는 화면 색이 아니라 사용자가 고르는 값이라 토큰으로 바꿔 쓸 수 없다"
2026-09-21T16:10:05Z NOTE T-030 "편집 탭은 색칠하지 않는다. textarea 안에는 엘리먼트를 못 넣어서, 색칠한 div 를 뒤에 겹치고 스크롤·줄바꿈·글꼴을 계속 맞춰야 한다. 한글 조합과 실행 취소 스택을 지키는 T-013 의 편집기를 그 위에 얹을 이유가 없고, 쓰기 허용 확장자가 기본 .md 뿐이라 편집 대상이 코드도 아니다"
2026-09-21T16:10:06Z NOTE T-030 "상한 120,000자. 실측(라즈베리파이 5): fs.service.ts 13,125자 12.5ms, styles.css 40,551자 77.9ms, 상한 근처 118,125자 196.1ms. 토큰 하나가 DOM 노드 하나라 토큰 수가 그대로 비용이고, 뷰어가 멈추는 것보다 색이 없는 편이 낫다. 결과는 useMemo 에 담겨 파일을 여는 순간 한 번만 든다"
2026-09-21T16:10:07Z DONE T-030 "원문 탭·마크다운 코드 블록 색칠 + /settings 테마 7종. 테스트 19종 추가(229 -> 248 pass), tsc 통과. 번들에 새 코드와 테마 CSS 6벌이 실렸는지 실서버(4331)에서 확인하고 PID 로만 껐다. bun test 는 telemetry.service.test 의 hardLimit 1건이 여전히 실패하는데 T-028 NOTE 에 적힌 기존 위반이고 이 작업과 무관하다. 브라우저 육안 확인은 사용자 몫으로 남긴다"
2026-09-21T16:40:00Z NOTE T-030 "pug-frame(T-029) 이 먼저 머지돼 리베이스했다. 번호가 겹쳐 T-030 으로 다시 발급했고(ID 는 재사용하지 않는다), 로그 타임스탬프도 단조 증가를 지키려 15:10 에서 16:10 으로 밀었다. 실제 충돌은 세 군데였다 - markdown-preview 의 case code(pug-frame 분기를 먼저 두고 나머지를 CodeBlock 으로), styles.css 끝의 두 append, README·STRUCTURE 의 같은 줄. pug-frame 의 원문 토글 pre 에도 code-surface 를 붙여 고른 테마를 따르게 했다 - .md__code 의 배경을 코드 테마로 옮겼기 때문에 그러지 않으면 그 블록만 배경을 부모에 기대게 된다"
2026-09-21T16:41:00Z NOTE T-029 "배포 뒤 캔버스가 안 보인 원인은 호스트 뷰포트 높이 0 이었다. pugFrameCanvas() 가 대상 요소의 position 을 relative 로 덮어써 #stage 의 position:absolute; inset:0 이 무효가 되고, 같이 붙는 overflow:hidden 이 프레임과 버튼을 전부 잘랐다. 네트워크·CORS·postMessage·render() 는 모두 정상(헤드리스 Chromium 실측 - 빠진 시스템 라이브러리를 사용자 권한으로 내려받아 붙였다). #stage 를 width/height 100% 로 바꿔 654x480 에 프레임 2개가 보인다. T-029 문서 6절"
2026-09-23T05:30:15Z NOTE T-024 "vibe-shorts 화면(4200, systemd user 유닛 vibe-shorts-web.service) 바로가기 추가. 항목이 label·port 두 칸뿐이라 T-024 4.1 대로 배열에 한 줄 더했다"
2026-09-24T04:55:30Z NOTE T-011 "900px 미만에서 가로로 누운 nav 가 화면 폭에 갇혀 메뉴 글자가 두 줄로 꺾였다. 항목을 flex-shrink:0 + nowrap 으로 두고 nav 에 overflow-x:auto 를 줘 가로로 밀게 했고(스크롤바는 숨김), 경로가 바뀌면 현재 메뉴를 nav 가운데로 끌어온다. scrollIntoView 는 페이지 세로 스크롤까지 움직여 nav.scrollLeft 만 고친다. 실측(헤드리스 Chromium 375px, 나눔고딕을 fontconfig 로 붙임) - 메뉴 폭 479px, /telemetry 에서 scrollLeft 104, 항목 높이 전부 36px 한 줄, 문서 가로 넘침 없음"
2026-09-24T05:10:00Z ADD T-031 P2 web-files "HTML 파일을 격리된 iframe 에서 그린다 - /raw 경로와 미리보기 탭" docs/todos/T-031-html-iframe-preview.md
2026-09-24T05:10:01Z START T-031
2026-09-24T05:10:02Z NOTE T-031 "srcdoc 을 버리고 파일을 그대로 내주는 GET /raw/<root>/<path> 를 만들어 iframe src 로 연다. srcdoc 문서는 URL 이 about:srcdoc 이라 ./style.css 를 풀 기준이 없어 옆에 둔 CSS·이미지가 전부 깨진다. 쿼리(?root=&path=)가 아니라 경로에 싣는 이유도 같다 - 브라우저가 상대 주소를 문서 URL 기준으로 풀어 같은 규칙으로 다시 들어와야 한다. 조립·해석은 web/lib/raw-url.ts 하나가 맡고 서버 라우트도 그것을 import 한다(pug-frame-message 와 같은 배치)"
2026-09-24T05:10:03Z NOTE T-031 "경로 검사를 새로 만들지 않았다. readFile 이 resolvePath 뒤에 하던 파일·존재·상한 검사를 resolveFile 로 떼어 /raw 와 같이 쓴다 - 두 경로의 검사가 다르면 그 차이가 곧 구멍이다. 대가로 /raw 도 FS_MAX_READ_BYTES(2MB) 를 따라 그보다 큰 이미지는 미리보기에서 깨진다. 지금 워크스페이스에 그런 파일이 있다는 근거가 없어 상한을 나누지 않았다"
2026-09-24T05:10:04Z NOTE T-031 "격리는 둘이다. iframe sandbox 에 allow-same-origin 을 넣지 않고(출처 null, /api 와 localStorage 불가), /raw 의 html·htm·xhtml·svg 응답에 같은 플래그의 CSP sandbox 헤더를 붙인다 - 속성만으로는 같은 주소를 새 탭으로 열면 문서가 이 서버 출처로 돌아가 PUT /api/fs/file 을 부를 수 있다. 헤드리스 Chromium 실측 - 직접 열기·iframe 모두 self.origin 이 null, 문서 안 fetch(/api/health) 는 TypeError. location.origin 은 URL 값이라 sandbox 와 무관하게 서버 주소를 돌려주므로 출처 확인에 쓰면 안 된다(처음 그렇게 재서 잘못 읽었다)"
2026-09-24T05:10:05Z NOTE T-031 "Access-Control-Allow-Origin: * 는 붙이지 않는다. pug-frame 호스트 스크립트는 공개 패키지 코드라 붙였지만 /raw 는 사용자의 파일이고, * 를 붙이면 브라우저의 다른 사이트가 이 서버의 파일을 읽어 간다. Origin: null 만 허용하는 것도 답이 아니다 - 어느 사이트든 sandbox iframe 으로 null 을 보낼 수 있다. 대가로 출처 null 문서의 <script type=module> 과 문서 안 fetch 는 CORS 로 거절된다. 인라인·일반 script src·CDN·CSS·이미지는 정상. 알려진 한계로 html-preview.tsx 와 ENDPOINTS 에 적었다"
2026-09-24T05:10:06Z NOTE T-031 "관찰(이 작업이 만든 것이 아니다): 프로덕션 모드에서 PUT /api/health, PUT /pug-frame, PUT /raw/… 가 모두 200 + 앱 HTML 이다. CONVENTIONS 5 의 실측(PUT /api/health -> 405)이 Bun 1.4.0 에서 재현되지 않는다. SPA 폴백 /* 가 메서드를 가리지 않는 것으로 보인다. 별개 작업"
2026-09-24T05:20:00Z DONE T-031 "GET /raw/<root>/<path> + HTML 미리보기 탭(/files·/workspace 공용 file-view). 테스트 14종 추가(250 -> 264 pass), tsc 통과, check-docs 는 T-028 이 적어 둔 기존 위반 1건만 남는다. 헤드리스 Chromium 실측 - iframe 이 뷰어 본문(580x711)을 채우고 상대 CSS 가 적용되며 안쪽 self.origin 은 null, /api 는 닿지 않는다. 스모크 서버(4339)는 PID 로만 껐다"
2026-09-24T05:50:00Z NOTE T-012 "900px 미만에서 트리(34vh)와 뷰어가 위아래로 갈려 뷰어가 화면 절반쯤만 가져 미리보기가 좁았다. hooks/use-tree-collapse.ts 를 두고 /files·/workspace 두 화면이 같이 쓴다 - 좁은 화면(matchMedia, CSS 와 같은 900px)에서 파일을 고르면 트리를 자동으로 접고, 툴바 끝의 '트리 펼치기/접기' 버튼(aria-expanded)으로 되돌린다. 경로가 비면 다시 펼친다. 접힌 상태는 .files--collapsed 로 첫 줄 툴바만 남기고 grid 행을 auto 1fr 로 바꾼다. 버튼은 넓은 화면에서 display:none 이라 좌우 배치는 그대로다. 실측(헤드리스 Chromium 375x700, 나눔고딕) - 뷰어 본문 높이 327 -> 513px, 툴바 한 줄(52px), 가로 넘침 없음, 경로가 있는 URL 로 바로 들어와도 접힌 채 시작. 1200px 에서는 버튼 숨김·320px 좌측 패널 유지"
2026-09-26T03:00:00Z ADD T-032 P2 web-files "워크스페이스에서 pull · commit · push 를 누른다 - 브랜치 줄과 트리 사이의 소스 컨트롤 섹션" docs/todos/T-032-workspace-source-control.md
2026-09-26T03:00:01Z START T-032
2026-09-26T03:00:02Z NOTE T-032 "git 을 띄우는 곳을 git-command.repository.ts 하나에 가둔다. 목록 API(git.repository.ts)의 .git 직접 읽기는 그대로. Bun.spawn 에 GIT_TERMINAL_PROMPT=0 · ssh BatchMode · 60초 SIGKILL 시한 - 서버에는 터미널이 없어 프롬프트 하나가 요청을 영원히 세운다"
2026-09-26T03:00:03Z NOTE T-032 "대상은 절대경로가 아니라 { repo, wt } id 다. 서버가 listRepos 로 체크아웃을 다시 찾아 그 경로에서만 돈다(requireCheckout). 없으면 404, 루트 밖이면 403 - 파일 API 의 resolvePath 와 같은 자리"
2026-09-26T03:00:04Z NOTE T-032 "pull 은 --ff-only 로 갈라지면 409. commit 은 add -A 뒤 Asia/Seoul 시각(YYYY-MM-DD HH:MM:SS) 메시지 - 마스터가 메시지 입력 대신 시각을 골랐다. push 는 추적 브랜치 있으면 push, 없으면 push -u origin HEAD. main/master 로 push 는 confirm 한 번 - 자동 배포가 1분 안에 받아 간다"
2026-09-26T03:00:05Z NOTE T-032 "서버 자신의 저장소(realpath(cwd) == checkout.path)는 status.self 로 표시하고 화면이 bun run restart 를 안내한다. 막지 않는다 - 거기서 문서만 고쳐 커밋하는 것은 정당하다"
2026-09-26T03:10:00Z DONE T-032 "GET/POST /api/workspace/git + 워크스페이스 소스 컨트롤 섹션(components/source-control.tsx). git 실행은 git-command.repository.ts 에만. 테스트 17종 추가(264 -> 281 pass), tsc 통과, check-docs 는 T-028 이 적어 둔 기존 위반 1건만 남는다. 실측 - API(4340) commit 메시지 2026-09-26 11:40:01(KST) · push 로 origin main 일치 · 빈 commit 409 · 화면(4341, 헤드리스 Chromium 1200/375px) 섹션이 meta 와 tree 사이 75px, Commit 뒤 트리 재로딩·버튼 비활성, main push 는 confirm 뒤 성공. 스모크 서버는 PID 로만 껐다. 남긴 한계 - push 인증은 서버 환경 몫, 열린 파일 본문은 pull 뒤 자동 재읽기 없음"
