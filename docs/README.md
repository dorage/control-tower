# control-tower 문서

웹으로 보는 로컬 관제탑(control tower). 세 가지를 한 화면에서 제공한다.

1. **파일 탐색기** — 설정된 워크스페이스 루트의 디렉터리 트리를 본다.
2. **마크다운 에디터** — `.md` 파일을 열어 편집·저장한다.
3. **세션 뷰** — `~/.claude` 아래의 Claude Code 세션을 목록/타임라인으로 본다.

Bun(`Bun.serve`) 하나로 API와 프론트엔드를 함께 서빙한다.

## 문서 지도

| 문서 | 내용 | 갱신 시점 |
| --- | --- | --- |
| [TODO.md](./TODO.md) | 작업 로그(AppendOnlyLog). 한 줄 = 한 이벤트 | 작업 상태가 바뀔 때마다 append |
| [todos/](./todos/) | 작업 단위별 자기완결 명세 | 작업 정의/변경 시 |
| [CONVENTIONS.md](./CONVENTIONS.md) | 코드·네이밍·구조 컨벤션 | 모든 작업 완료 시 |
| [STRUCTURE.md](./STRUCTURE.md) | 프로젝트 디렉터리 구조와 계층 규칙 | 모든 작업 완료 시 |
| [ENDPOINTS.md](./ENDPOINTS.md) | HTTP 엔드포인트 명세 | 모든 작업 완료 시 |

## 작업 절차

1. `docs/TODO.md`에서 다음 작업 ID를 고른다. 선행 작업이 `DONE`인지 확인한다.
2. `docs/todos/<ID>-*.md`를 읽는다. 그 문서 하나로 작업이 완결되어야 한다. 부족하면 문서를 먼저 고친다.
3. `TODO.md`에 `START` 줄을 append 한다.
4. 구현한다.
5. 수용 기준과 검증 명령을 모두 통과시킨다.
6. **CONVENTIONS / STRUCTURE / ENDPOINTS 세 문서를 갱신한다.** (변경 없음이면 "변경 없음"을 확인만 하고 넘어간다)
7. `TODO.md`에 `DONE` 줄을 append 한다.

## 실행

```bash
bun install
bun run dev      # 개발 (HMR)
bun run start    # 실행
bun test         # 테스트
bunx tsc --noEmit  # 타입 체크
```

기본 주소: `http://localhost:4317`
