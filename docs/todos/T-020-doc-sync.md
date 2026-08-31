# T-020 — 문서 동기화 루틴

| | |
| --- | --- |
| **ID** | T-020 |
| **우선순위** | P1 |
| **영역** | docs |
| **선행** | T-001 ~ T-022 (마지막에 수행) |
| **후행** | 없음 |

## 1. 목적

"모든 작업은 완료 후 컨벤션·프로젝트 구조·엔드포인트를 문서화한다"는 규칙이 실제로 지켜졌는지 확인하고, 열아홉 개 작업을 거치며 어긋난 부분을 맞춘다. 그리고 앞으로도 어긋나지 않도록 **검사를 자동화한다.**

이 작업은 새 기능을 만들지 않는다. 문서와 코드를 일치시키는 것이 전부다.

## 2. 산출물

| 파일 | 내용 |
| --- | --- |
| `docs/CONVENTIONS.md` | 최종 감사 후 갱신 |
| `docs/STRUCTURE.md` | 최종 감사 후 갱신 |
| `docs/ENDPOINTS.md` | 최종 감사 후 갱신 |
| `docs/README.md` | 실행 방법·설정 최신화 |
| `README.md` | 프로젝트 소개 재작성 |
| `scripts/check-docs.ts` | 문서-코드 일치 검사 |
| `package.json` | `check:docs` 스크립트 추가 |

## 3. 감사 절차

### 3.1 ENDPOINTS.md 대조

서버를 띄우고 문서에 적힌 **모든** 엔드포인트를 실제로 호출한다.

```bash
mkdir -p /tmp/ct-demo/proj && echo '# a' > /tmp/ct-demo/proj/a.md
WORKSPACE_ROOTS=/tmp/ct-demo bun run dev & sleep 1
B=localhost:4317

for path in \
  "/api/health" "/api/stats" "/api/projects" "/api/sessions" "/api/history" \
  "/api/fs/roots" "/api/fs/list?root=ct-demo" "/api/fs/tree?root=ct-demo" \
  "/api/fs/file?root=ct-demo&path=proj/a.md" ; do
  printf '%-50s %s\n' "$path" "$(curl -s -o /dev/null -w '%{http_code}' "$B$path")"
done
```

각 응답의 실제 필드를 문서의 표와 하나씩 대조한다. 확인할 것:

- 문서에 있는데 구현에 없는 엔드포인트 → 문서에서 제거하거나 TODO로 되돌린다.
- 구현에 있는데 문서에 없는 엔드포인트 → 문서에 추가한다.
- 파라미터 이름·기본값·범위가 다른 것 → 구현을 기준으로 문서를 고친다(구현이 잘못됐다면 별도 TODO를 append 한다).
- 상태 코드가 다른 것 → 실제로 각 오류를 유발해 확인한다.
- 모든 `⬜ 예정(T-xxx)` 표기가 `✅`로 바뀌었는지.

### 3.2 STRUCTURE.md 대조

```bash
find . -type f \
  -not -path './node_modules/*' -not -path './.git/*' -not -path './dist/*' \
  | sort
```

이 목록과 문서의 트리를 대조한다. 누락·잉여·이름 불일치를 모두 고친다. 환경변수 표는 `src/config.ts`와 대조한다.

```bash
grep -n 'Bun.env' src/config.ts
```

**⚠️ 포트 4317 경고를 반드시 문서에 남긴다.** `config.ts` 의 기본 포트 4317 은 **OTLP gRPC 의 기본 포트와 정확히 같다.** T-021 이 이 포트에서 `POST /v1/metrics`·`/v1/logs` 를 받기로 결정했으므로 충돌이 아니라 의도된 겸용이지만, 사용자가 `OTEL_EXPORTER_OTLP_PROTOCOL=http/json` 을 빼먹으면 claude 가 gRPC 로 시도해 **조용히 실패**한다. 에러가 화면에 뜨지 않아 원인을 찾기 어렵다.

- `docs/STRUCTURE.md` 환경변수 표의 `PORT` 항목에 이 경고를 붙인다.
- `docs/README.md` 텔레메트리 설정 안내에 굵게 박는다.
- `docs/ENDPOINTS.md` 에 `/v1/*` 이 `/api/*` 규약(목록 봉투·에러 형식)을 따르지 않는 이유를 적는다.

### 3.3 CONVENTIONS.md 대조

문서에 적힌 규칙이 실제로 지켜지고 있는지 표본 검사한다.

```bash
# 금지된 도구/라이브러리 사용 흔적
grep -rn "require(\|from 'express'\|from \"express\"\|node-fetch\|dotenv" src/ index.ts

# node:fs 사용처 (허용된 곳인지 확인: fs.repository, fs.service, 테스트)
grep -rn "node:fs" src/

# 계층 위반: routes 가 repositories 를 직접 import
grep -rn "repositories/" src/routes/

# 계층 위반: repositories 가 services 를 import
grep -rn "services/" src/repositories/

# 웹이 서버 모듈을 값으로 import (import type 이 아닌 것)
grep -rn "from \"\.\./\.\./\(services\|repositories\|routes\|config\)" src/web/ | grep -v "import type"

# dangerouslySetInnerHTML
grep -rn "dangerouslySetInnerHTML" src/web/

# any 사용
grep -rn ": any\|<any>" src/

# 기본 export (React 컴포넌트 외)
grep -rn "export default" src/ --include=*.ts
```

각 명령의 결과가 비어야 한다(허용된 예외는 문서에 근거가 있어야 한다). 위반이 나오면 코드를 고치거나, 정당한 예외면 CONVENTIONS.md에 예외 사유를 명시한다.

### 3.4 TODO.md 감사

```bash
grep -c '^20' docs/TODO.md                    # 전체 이벤트 수
grep -o 'ADD T-[0-9]*' docs/TODO.md | sort    # 등록된 작업
grep -o 'DONE T-[0-9]*' docs/TODO.md | sort   # 완료된 작업
```

- `ADD`된 모든 ID에 대응하는 `docs/todos/<ID>-*.md`가 존재하는가.
- 완료된 작업에 `DONE` 줄이 있는가.
- **기존 줄이 수정되지 않았는가** (append-only 위반은 로그의 신뢰를 무너뜨린다).
- 타임스탬프가 단조 증가하는가.

## 4. `scripts/check-docs.ts`

수동 감사를 다음에도 반복할 수 있게 자동화한다. Bun으로 실행되는 단일 스크립트다.

```ts
// bun scripts/check-docs.ts
// 종료 코드 0 = 통과, 1 = 불일치 발견
```

검사 항목:

| 검사 | 방법 |
| --- | --- |
| 라우트 ↔ ENDPOINTS | `src/routes/*.route.ts`에서 `"/api/..."` 문자열 리터럴을 정규식으로 뽑아, `docs/ENDPOINTS.md`에 각 경로가 등장하는지 확인 |
| 파일 ↔ STRUCTURE | `src/**/*.ts(x)`와 `index.ts` 목록을 만들어, 각 파일명이 `docs/STRUCTURE.md`에 등장하는지 확인 |
| 환경변수 ↔ STRUCTURE | `src/config.ts`의 `Bun.env.X` 이름을 뽑아, `docs/STRUCTURE.md` 환경변수 표에 있는지 확인 |
| TODO 문서 존재 | `docs/TODO.md`의 각 `ADD` 줄이 가리키는 경로가 실제 파일인지 확인 |
| TODO 형식 | 각 LOG 줄이 `<ISO> <OP> <ID> ...` 문법에 맞는지, 타임스탬프가 단조 증가하는지 |
| AREA 유효성 | `ADD` 줄의 `AREA` 가 TODO.md 규칙 절에 정의된 값인지 (`api-telemetry` 가 T-021 에서 추가됐다) |
| 미완료 표기 | 문서에 `⬜ 예정(T-xxx)`가 남아 있으면 해당 T-xxx가 `DONE`이 아닌지 확인 (DONE인데 ⬜면 불일치) |

> **파싱 범위**: `docs/TODO.md`는 `## LOG` 줄 **아래**만 읽는다. 그 위의 규칙·예시 블록에도 `T-001`이나 `docs/todos/...` 문자열이 나오므로, 파일 전체를 grep 하면 존재하지 않는 예시 경로(`docs/todos/T-001-slug.md`)를 실제 참조로 오인하고 예시 타임스탬프 때문에 단조 증가 검사가 거짓 실패한다.
>
> **그리고 `"## LOG"` 를 부분문자열로 찾으면 안 된다.** 규칙 6번 자체가 `` `## LOG` 아래만 로그다 `` 라는 문구를 담고 있어서, `split("## LOG")` 나 `indexOf("## LOG")` 는 규칙 절 중간을 시작점으로 잡는다. **줄 전체가 `## LOG` 인 줄**을 찾아야 한다(`line.trim() === "## LOG"`). 이 작업을 준비하며 실제로 밟은 함정이고, 밟으면 위반 18건이 거짓으로 보고된다.

출력은 사람이 읽는 목록이다. 실패 항목마다 `파일:줄  문제` 형태로 한 줄씩.

`package.json`:

```json
"scripts": {
  "check:docs": "bun scripts/check-docs.ts",
  "check": "tsc --noEmit && bun test && bun scripts/check-docs.ts"
}
```

이 스크립트는 휴리스틱이다. 문서가 정확한지가 아니라 **빠진 것이 없는지**를 본다. 통과했다고 문서가 옳다는 뜻은 아니므로, §3의 수동 감사를 대체하지 않는다.

## 5. README.md 재작성

루트 `README.md`는 아직 `bun init` 기본값이다. 다음으로 교체한다.

```markdown
# control tower

로컬 개발 환경을 웹으로 들여다보는 관제탑.

- 워크스페이스 파일 트리 탐색
- 마크다운 편집 (충돌 감지 저장)
- Claude Code 세션 목록과 대화 타임라인
- 실시간 갱신 (SSE)

## 실행

  bun install
  bun run dev          # http://localhost:4317

## 설정

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| ... (docs/STRUCTURE.md 의 표를 그대로) |

## 문서

- docs/README.md — 문서 지도, 작업 절차
- docs/CONVENTIONS.md — 코드 컨벤션
- docs/STRUCTURE.md — 프로젝트 구조
- docs/ENDPOINTS.md — API 명세
- docs/TODO.md — 작업 로그
```

`bun init` 안내 문구와 "Hello via Bun" 흔적을 남기지 않는다.

## 6. 수용 기준

- [ ] `docs/ENDPOINTS.md`의 모든 엔드포인트가 실제로 존재하고, 실제 모든 엔드포인트가 문서에 있다.
- [ ] 문서에 적힌 파라미터 기본값·범위·상태 코드가 실제 동작과 일치한다.
- [ ] `docs/STRUCTURE.md`의 트리가 `find` 결과와 일치한다.
- [ ] `docs/STRUCTURE.md`의 환경변수 표가 `src/config.ts`와 일치한다.
- [ ] 세 문서에 `⬜ 예정` 표기가 남아 있지 않다(또는 남아 있다면 그 작업이 실제로 미완료다).
- [ ] §3.3의 grep 검사가 모두 비어 있거나, 예외가 문서에 명시돼 있다.
- [ ] `docs/TODO.md`의 모든 `ADD`에 문서 파일이 존재하고, 완료된 것에 `DONE`이 있다.
- [ ] `docs/TODO.md`가 append-only로 유지됐다(줄 수정 흔적 없음).
- [ ] 루트 `README.md`에 `bun init` 기본 문구가 없다.
- [ ] 포트 4317 ↔ OTLP 기본 포트 경고가 `STRUCTURE.md`·`README.md` 두 곳에 있다.
- [ ] `.gitignore` 가 `*.db`/`*.db-wal`/`*.db-shm` 를 덮는다(텔레메트리 DB 에 `user.email`·계정 UUID 가 들어 있다).
- [ ] `bun run check:docs`가 종료 코드 0으로 통과한다.
- [ ] `bun run check`가 통과한다.

## 7. 검증

```bash
bun run check:docs; echo "exit=$?"
bun run check;      echo "exit=$?"

# 일부러 깨뜨려 검사가 작동하는지 확인
echo 'export const bogusRoutes = { "/api/bogus": { GET: () => new Response("x") } };' > src/routes/bogus.route.ts
bun run check:docs; echo "expect exit=1: $?"
rm src/routes/bogus.route.ts
bun run check:docs; echo "expect exit=0: $?"
```

검사가 일부러 만든 불일치를 잡아내지 못하면 `check-docs.ts`가 제 역할을 못 하는 것이다.

## 8. 완료 처리

1. 세 문서와 두 README를 최종 상태로 커밋한다.
2. `docs/CONVENTIONS.md` §12 — "`bun run check:docs`로 문서 일치를 자동 검사한다"를 추가하고, 작업 완료 체크리스트를 이 스크립트 실행까지 포함하도록 갱신한다.
3. `docs/README.md`의 작업 절차 6번을 "세 문서 갱신 + `bun run check:docs` 통과"로 고친다.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-020`
