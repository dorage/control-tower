# control-tower

웹으로 보는 로컬 관제탑. Bun(`Bun.serve`) 하나로 API와 프론트엔드를 함께 서빙한다.

## 실행

```bash
bun install
bun run dev      # 개발 (HMR). 기본 http://localhost:4317
bun run start    # 실행
bun test         # 테스트
bunx tsc --noEmit  # 타입 체크
```

탐색할 디렉터리는 `WORKSPACE_ROOTS`로 지정한다(`:` 구분, 기본 `$HOME/workspace`).

```bash
WORKSPACE_ROOTS=/home/me/workspace:/home/me/notes bun run dev
```

## 현재 상태

파일 탐색기와 마크다운 뷰까지 동작한다. `/files`에서 트리를 탐색하고 텍스트 파일을 열어
볼 수 있으며, `.md`는 원문과 렌더된 미리보기를 오갈 수 있다.

편집·저장(T-008/T-013), 세션 뷰(T-003/T-015~T-017), 실시간 반영(T-004/T-018)은 아직이다.

## 문서

[docs/README.md](./docs/README.md)에서 시작한다. 작업 로그는 [docs/TODO.md](./docs/TODO.md),
명세는 [docs/todos/](./docs/todos/)에 있다.
