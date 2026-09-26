# T-032 — 워크스페이스에서 pull · commit · push 를 누른다

- **ID** — T-032
- **우선순위** — P2
- **영역** — web-files
- **선행** — T-028
- **후행** — 없음

## 1. 목적

워크스페이스 화면(`/workspace`)은 저장소와 체크아웃을 골라 파일을 읽고 고칠 수 있지만, 고친
것을 커밋하거나 원격과 맞추려면 SSH 로 들어가 터미널을 열어야 한다. 브랜치 줄과 파일 트리
사이에 소스 컨트롤 섹션을 두고, 버튼 셋(Pull · Commit · Push)으로 그 왕복을 없앤다.

마스터 요청 원문 - "workspace에 git pull을 할 수 있는 버튼을 추가하고 싶어. 브랜치와 파일트리
사이에 소스컨트롤 섹션이 추가되면 좋겠어. 커밋, 푸시, 풀을 할 수 있고, 커밋시 메시지입력은
어려울것 같으니 그냥 커밋하는 시간을 KST로 YYYY-MM-DD HH:MM:SS 로 나오면 좋을듯."

완수 조건

- 체크아웃 줄(브랜치 · 커밋 · 경로) 아래, 파일 트리 위에 섹션이 있고 변경 수와 추적 브랜치 대비 앞뒤 커밋 수가 보인다
- Pull 을 누르면 fast-forward 로 받고 트리와 브랜치 줄이 새로 읽힌다
- Commit 을 누르면 워킹 트리 전체가 `YYYY-MM-DD HH:MM:SS`(KST) 메시지로 커밋된다. 커밋할 것이 없으면 버튼이 비활성이다
- Push 를 누르면 추적 브랜치로, 없으면 `origin` 에 같은 이름으로 올라간다
- 실패(갈라진 브랜치, 인증, 원격 없음)는 git 이 남긴 말 그대로 섹션 안에 보인다. 서버가 머지 커밋이나 충돌 마커를 만들지 않는다

## 2. 전제와 판단

### 2.1 `git` 을 띄운다 — 단, 파일 하나에 가둔다

CONVENTIONS §1 은 "주기적으로 도는 경로에서 외부 명령을 띄우지 않는다" 고 하고, 목록 API
(`git.repository.ts`)는 그 규칙대로 `.git` 텍스트 파일만 읽는다. pull·commit·push 는 다르다.
사람이 버튼을 눌러 **한 번** 도는 동작이고, 이 셋을 `.git` 을 손으로 고쳐 흉내 낼 것이 아니다.
그래서 규칙의 예외를 `git-command.repository.ts` 한 파일에 두고, 기존 `git.repository.ts` 의
"띄우지 않는다" 는 그대로 둔다.

실행은 `Bun.spawn` 이다. 두 가지를 항상 건다 — `GIT_TERMINAL_PROMPT=0` 과 ssh `BatchMode=yes`
(사용자가 `GIT_SSH_COMMAND` 를 정해 뒀으면 존중). 서버에는 터미널이 없어, 자격증명을 물으면
요청이 영원히 멈춘다. 원격이 응답하지 않을 때를 위해 60초 시한을 두고 넘기면 `SIGKILL` 한다.

### 2.2 대상은 절대경로가 아니라 목록의 id 다

클라이언트는 `{ repo, wt }` 만 보낸다. 서버는 `listRepos()` 를 다시 돌려 그 id 의 체크아웃을 찾고,
그 `path` 에서만 git 을 돈다. 없으면 404, 워크스페이스 루트 밖(`root: null`)이면 403 — 파일 API 가
`resolvePath` 하나로 루트를 지키는 것과 같은 형태다. 절대경로를 받으면 어떤 검사를 붙여도
"이 서버가 아무 디렉터리에서나 git 을 돌린다" 는 문장이 성립한다.

### 2.3 pull 은 `--ff-only`, commit 은 `add -A`, push 는 추적 브랜치 우선

- **pull** - 갈라졌으면 409 로 거절한다. 서버가 머지 커밋을 만들거나 충돌 마커를 파일에 남기면
  그것을 정리하는 곳은 결국 터미널이고, 화면에는 되돌릴 수단이 없다. 실패는 git 의 말을
  그대로 보여 주고 사람이 판단한다.
- **commit** - 메시지 입력 UI 를 두지 않는다(마스터 결정). 메시지는 `formatTimestamp(now, "Asia/Seoul")`
  로 만든 `YYYY-MM-DD HH:MM:SS` 다. 프로세스의 `TZ` 에 기대지 않고 시간대를 명시한다 —
  systemd 유닛에는 `TZ` 가 없어서 셸과 서비스가 다른 시각을 찍을 수 있다. 워킹 트리 전체를
  담는다. 화면에 선택 커밋이 없으니 일부만 담을 근거도 없다.
- **push** - `git status --branch` 가 알려 주는 추적 브랜치가 있으면 `git push`, 없으면
  `git push -u origin HEAD` 로 같은 이름으로 올리고 추적을 건다. 다음 pull 이 그 추적을 쓴다.
  detached HEAD 는 409 다.

### 2.4 상태 한 줄은 `git status --porcelain=v1 --branch` 한 번이다

"변경 3 · origin/main ↑1 ↓0" 한 줄을 위해 `status --branch` 의 첫 줄(브랜치·추적·ahead/behind)과
나머지 줄 수(변경 항목, 추적 안 된 파일 포함)를 읽는다. 파싱은 `parseStatus` 로 떼어 git 없이
테스트한다. 첫 줄 형태는 넷 — 추적 있음, 추적 없음, `HEAD (no branch)`, `No commits yet on` —
이고 `[gone]` 은 추적 없음으로 본다.

이 호출은 섹션이 열릴 때와 동작 뒤에만 돈다. 폴링하지 않는다.

### 2.5 서버 자신의 저장소는 표시한다 — 막지 않는다

이 서버는 `~/workspace/control-tower` 에서 돌고, 그 저장소도 목록에 나온다. 거기서 Pull 을
누르면 docs/README 가 경고한 상황이 된다 — 디스크는 최신인데 자동 배포는 `HEAD == origin/main`
이라 재시작을 건너뛴다(2026-09-21 실측 사고). 그래서 상태에 `self` 를 넣고 화면이 "pull 로 받은
코드는 `bun run restart` 를 해야 떠오른다" 고 알린다. 막지는 않는다. 그 저장소에서 문서만
고쳐 커밋하는 것은 정당한 사용이다.

`main`/`master` 로 push 는 한 번 묻는다(`window.confirm`). 자동 배포가 그 커밋을 1분 안에 받아
가므로, 잘못 누른 한 번이 곧 배포다.

### 2.6 동작 뒤 새로고침은 화면이 한다

`/api/events` 는 `~/.claude` 만 감시하고 워크스페이스 파일 변경은 오지 않는다. 동작이 끝나면
컴포넌트가 `onChanged` 로 페이지의 `refresh()` 를 불러 트리·저장소 목록(브랜치·HEAD)·상태를 다시
읽는다. 열려 있는 파일 본문도 같은 신호(`FileView` 의 `reloadSignal`)로 다시 읽되, 실시간 갱신과
같은 절대 규칙을 따른다 — **편집 중이면 읽지 않고 "다시 읽기" 배너만 띄운다**(이슈 #28, 처음에는
아예 읽지 않았다가 후속으로 붙였다). 첫 렌더의 값은 신호로 치지 않아 파일을 막 열었을 때 두 번
읽지 않는다. 툴바의 "새로고침" 도 같은 토큰이라 파일까지 다시 읽는다.
pull 앞에서는 `confirmLeave()` 로 저장하지 않은 편집이 있는지 한 번 묻는다.

## 3. 변경 목록

- `src/domain/workspace.ts` - `WorkspaceGitAction` · `WorkspaceGitStatus` · `WorkspaceGitResult`
- `src/lib/time.ts` (+test) - `formatTimestamp(date, timeZone)` · `KST`
- `src/repositories/git-command.repository.ts` - `runGit(cwd, args)`. 프로젝트에서 외부 프로세스를 띄우는 유일한 곳
- `src/services/workspace.service.ts` - `requireCheckout`(관문) · `parseStatus` · `readGitStatus` · `runGitAction`
- `src/services/workspace-git.service.test.ts` - bare origin + 클론 둘로 pull·commit·push·갈라짐·추적 없음·detached·403/404
- `src/routes/workspace.route.ts` - `GET`/`POST /api/workspace/git`
- `src/web/lib/api.ts` - `workspaceGitStatus` · `workspaceGit`
- `src/web/components/source-control.tsx` - 섹션. 상태 한 줄 + 버튼 셋 + 결과/출력 + self 안내
- `src/web/pages/workspace.page.tsx` - `files__meta` 아래에 붙인다. 루트 밖 체크아웃에는 붙이지 않는다
- `src/web/styles.css` - `.files__scm*`
- 문서 - README 기능 줄, ENDPOINTS 워크스페이스 절, STRUCTURE, CONVENTIONS §1·§9·§11.1, 이 문서, TODO

## 4. 확인 방법

- `bun run check` - tsc, 테스트, check-docs
- 임시 루트로 서버를 띄우고 curl
  - `curl -s 'http://localhost:4340/api/workspace/git?repo=<id>&wt=main'` → `{ branch, head, upstream, ahead, behind, changed, self }`
  - `curl -s -X POST -H 'content-type: application/json' -d '{"repo":"<id>","wt":"main","action":"commit"}' http://localhost:4340/api/workspace/git` → `message` 가 `YYYY-MM-DD HH:MM:SS`
  - 변경이 없을 때 같은 요청 → 409 `nothing to commit`
- 브라우저에서 `/workspace` - 체크아웃 줄 아래에 "변경 N · origin/main ↑a ↓b" 와 Pull · Commit · Push. 변경 0 이면 Commit 비활성

실측은 §6 에 적는다.

## 5. 알려진 한계

- **push 인증은 서버 환경의 몫이다.** 서버 유닛은 비대화형이라 자격증명 helper 나 ssh 키가
  묻지 않고 통과해야 한다. 안 되면 409 와 git 의 말("could not read Username" 등)이 그대로
  보인다. 인증을 서버에 심는 것은 이 작업의 범위 밖이다.
- ~~열려 있는 파일 본문은 pull 뒤 자동으로 다시 읽지 않는다~~ — 이슈 #28 로 해결(§2.6). 편집 중일 때만 배너로 남는다.
- 커밋 신원(`user.name`/`user.email`)은 서버 프로세스의 gitconfig 를 따른다. 없으면 commit 이 409 다.

## 6. 실측

라즈베리파이 5, 프로덕션 모드, 임시 루트에 bare origin 과 클론 하나(2026-09-26).

API(포트 4340, fetch)

- 상태 - `{"branch":"main","upstream":"origin/main","ahead":0,"behind":0,"changed":1,"head":"c3ef932…","self":false}`
- commit → 200, `message "2026-09-26 11:40:01"`(KST, 실행 시각 UTC 02:40), 이어 `changed 0 · ahead 1`. `git log -1 --format=%s` 가 같은 문자열
- 변경 없이 commit → `409 {"error":"nothing to commit","output":""}`
- push → 200, `output "To …/origin.git\n   c3ef932..2157117  main -> main"`, `ahead 0`, origin 의 `main` 이 같은 SHA
- pull(최신) → 200, `message "이미 최신입니다"`, `output "Already up to date."`
- `action: "rebase"` → 400, 없는 저장소 → 404, `wt` 누락 → 400

화면(포트 4341, 헤드리스 Chromium, 나눔 글꼴)

- 1200×800 - 사이드 패널 순서가 `toolbar > toolbar > meta > scm > tree`. 섹션은 319×75px, 가로 넘침 없음. 상태 "변경 2 · origin/main ↑0 ↓0", 버튼 셋 활성
- Commit 클릭 → 결과 "2026-09-26 11:40:56", 상태 "변경 0 · origin/main ↑1 ↓0", 트리가 다시 읽힘(항목 6). Commit 버튼 비활성
- Push 클릭 → `main` 이라 confirm 이 뜨고 수락 → "main 을 push 했습니다" + git 출력 두 줄, 상태 "↑0 ↓0", origin 과 로컬 SHA 일치
- 375×700 - 섹션이 375×75px 로 한 열에 들어가고 가로 넘침 없음. 변경 0 이라 Commit 만 비활성
