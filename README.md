# control-tower

로컬 개발 환경을 웹으로 들여다보는 관제탑. Bun(`Bun.serve`) 하나로 API와 프론트엔드를 함께 서빙한다.

- **파일 탐색기** — 설정한 워크스페이스 루트를 훑고 텍스트 파일을 연다.
- **마크다운 편집** — `.md` 를 미리보기·원문·편집 3탭으로 다루고, 충돌을 감지해 저장한다.
- **세션 뷰** — `~/.claude` 에 쌓인 Claude Code 세션을 목록과 대화 타임라인으로 읽는다. 기본은 대화만, 툴과 사고 과정은 눌러서 펼친다.
- **스킬 사용** — 어떤 스킬을 얼마나 썼는지, 각 세션이 어떤 스킬을 거쳤는지 본다.
- **대시보드** — 지금 무슨 일이 벌어지는지 한 화면에서 본다.
- **서비스 바로가기** — 같은 호스트의 다른 포트에서 도는 서비스로 대시보드 상단에서 건너간다.
- **실시간 반영** — 세션이 진행되면 화면이 스스로 따라간다 (SSE).
- **텔레메트리** — Claude Code 의 OpenTelemetry 를 직접 받아 토큰·비용 분포를 본다 (선택).

의존성은 React 뿐이다. 서버 프레임워크도, SQLite 드라이버도, 차트 라이브러리도 쓰지 않는다.

## 실행

```bash
bun install
bun run dev          # http://localhost:4317 (--hot)
bun run start:prod   # 핫 리로드 없이

bun run check        # 타입 체크 + 테스트
bun run check:docs   # 문서-코드 일치 검사
```

탐색할 디렉터리는 `WORKSPACE_ROOTS` 로 지정한다.

```bash
WORKSPACE_ROOTS=/home/me/workspace:/home/me/notes bun run dev
```

## 화면

| 경로 | 내용 |
| --- | --- |
| `/` | 대시보드 — 같은 호스트의 다른 서비스 바로가기, 통계 타일, 최근 세션·프로젝트·자주 쓴 툴·자주 쓴 스킬·최근 프롬프트 |
| `/files` | 파일 탐색기와 마크다운 에디터 |
| `/sessions` | 세션 목록. 검색·프로젝트 필터가 URL 에 남아 그대로 공유된다 |
| `/sessions/:id` | 대화 타임라인. 기본은 사람의 프롬프트와 모델의 답변만. 사고 과정·툴 입출력·시스템·첨부·서브에이전트를 각각 토글 |
| `/telemetry` | 토큰·비용 분포와 요청 지연 (텔레메트리를 켠 경우) |

## 설정

주요 환경변수만 적는다. 전체 목록은 [docs/STRUCTURE.md](./docs/STRUCTURE.md) 에 있다.

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | `4317` | 리슨 포트 |
| `CLAUDE_HOME` | `$HOME/.claude` | 관찰 대상 Claude 데이터 디렉터리 |
| `WORKSPACE_ROOTS` | `$HOME/workspace` | 탐색 허용 루트. `:` 구분 |
| `FS_WRITABLE_EXTENSIONS` | `.md,.markdown` | 쓰기 허용 확장자 |
| `TELEMETRY_ENABLED` | `1` | `0` 이면 OTLP 수신을 끈다 |

## 텔레메트리 (선택)

켜면 트랜스크립트로는 알 수 없는 것이 보인다 — 실제 달러 비용, 그리고 토큰 중 얼마가
실제 작업(`main`)이고 얼마가 오버헤드(세션 제목 생성 등)인지.

설정 방법과 두 가지 함정은 [docs/README.md](./docs/README.md#텔레메트리-수집-선택) 에 있다.
특히 `OTEL_EXPORTER_OTLP_PROTOCOL=http/json` 을 빠뜨리면 **완전히 조용히** 실패한다.

## 문서

| 문서 | 내용 |
| --- | --- |
| [docs/README.md](./docs/README.md) | 문서 지도 · 작업 절차 · 실행과 설정 |
| [docs/CONVENTIONS.md](./docs/CONVENTIONS.md) | 코드 컨벤션 |
| [docs/STRUCTURE.md](./docs/STRUCTURE.md) | 프로젝트 구조와 계층 규칙 |
| [docs/ENDPOINTS.md](./docs/ENDPOINTS.md) | HTTP 엔드포인트 명세 |
| [docs/TODO.md](./docs/TODO.md) | 작업 로그 (추가 전용) |
| [docs/todos/](./docs/todos/) | 작업 단위별 자기완결 명세 |
