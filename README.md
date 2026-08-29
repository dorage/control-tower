# control-tower

웹으로 보는 로컬 관제탑. Bun(`Bun.serve`) 하나로 API와 프론트엔드를 함께 서빙한다.

## 실행

```bash
bun install
bun run dev        # 실행 (--hot). 기본 http://localhost:4317
bun run start      # 실행 (--hot). dev 와 같다
bun run start:prod # 핫 리로드 없이 실행
bun test         # 테스트
bunx tsc --noEmit  # 타입 체크
```

탐색할 디렉터리는 `WORKSPACE_ROOTS`로 지정한다(`:` 구분, 기본 `$HOME/workspace`).

```bash
WORKSPACE_ROOTS=/home/me/workspace:/home/me/notes bun run dev
```

## 현재 상태

파일 탐색기와 세션 뷰가 동작한다.

- `/files` — 트리를 탐색하고 텍스트 파일을 연다. `.md`는 원문과 렌더된 미리보기를 오간다.
- `/sessions` — `~/.claude`에 쌓인 세션을 최신순으로 훑고, 검색·프로젝트 필터로 좁힌다.
  필터는 URL에 남으므로 그대로 공유할 수 있다.
- `/sessions/:id` — 한 세션의 대화를 처음부터 읽는다. 사고 과정·툴 입출력·시스템 이벤트·
  서브에이전트를 각각 켜고 끌 수 있고, 긴 세션은 200개씩 넘긴다.

관찰 대상 디렉터리는 `CLAUDE_HOME`으로 바꾼다(기본 `$HOME/.claude`).

편집·저장(T-008/T-013), 대시보드(T-017), 실시간 반영(T-004/T-018)은 아직이다.

## 문서

[docs/README.md](./docs/README.md)에서 시작한다. 작업 로그는 [docs/TODO.md](./docs/TODO.md),
명세는 [docs/todos/](./docs/todos/)에 있다.
