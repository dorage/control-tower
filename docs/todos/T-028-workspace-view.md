# T-028 — 워크스페이스 메뉴

- **ID** — T-028
- **우선순위** — P2
- **영역** — web-files
- **선행** — T-012, T-013
- **후행** — 없음

## 1. 목적

워크스페이스 루트 아래의 git 저장소를 한 화면에서 고른다. 같은 저장소의 main 작업 트리와
`git worktree add` 로 붙인 작업 트리는 **한 항목으로 묶어** 보여주고, 어느 체크아웃을 볼지는
드롭다운으로 고른다. 고른 체크아웃 안에서 파일을 읽고 마크다운을 고치는 일은 `/files` 와 똑같다.

지금은 `~/workspace` 아래에 저장소 여섯 개와 worktree 여러 개가 뒤섞여 있어, `/files` 트리에서
`control-tower/.claude/worktrees/feat+workspace-view/docs/...` 를 매번 펼쳐 내려가야 한다.
"어느 저장소의 어느 체크아웃" 이 한 번의 선택이 되면 그 깊이가 사라진다.

**`/files` 의 동작은 바뀌지 않는다.** 뷰어를 컴포넌트로 빼내 두 화면이 나눠 쓰는 것이 전부다.

## 2. 전제와 판단

### 2.1 `git` 명령 대신 `.git` 파일을 읽는다

필요한 것은 HEAD, 브랜치, worktree 목록, 잠금 사유 넷뿐이고 전부 `.git` 아래의 작은 텍스트 파일이다.
형식은 gitrepository-layout(5) 로 공개된 규격이라 파싱이 안정적이다.

- 화면을 열 때마다 도는 경로에서 프로세스를 띄우지 않는다. 저장소가 여섯 개면 `git worktree list` 가
  여섯 번이다. 이 기계는 SD 카드에서 돈다(CONVENTIONS §1 — `ps` 대신 `/proc` 를 읽는 것과 같은 판단).
- 읽기는 방어적으로. 반쯤 쓰인 파일, 사라진 worktree, 깨진 HEAD 는 예외가 아니라 정상 경로다.
  던지지 않고 `null` 로 떨어뜨린다.

되돌리기 쉬운 선택이다. 형식이 바뀌어 읽지 못하게 되면 `branch`/`head` 가 `null` 이 될 뿐 화면은 산다.

### 2.2 파일 접근은 기존 API 를 그대로 쓴다

새로 만드는 API 는 저장소 목록 하나(`GET /api/workspace/repos`)뿐이다. 파일 읽기·쓰기는 `/api/fs/*` 를
그대로 쓴다. 목록은 각 체크아웃이 **어느 루트의 어느 상대경로인지**(`root`/`relPath`)만 알려 주고,
화면이 그 둘로 기존 API 를 부른다.

경로 관문(`resolvePath`)을 우회하는 조립을 하나도 늘리지 않기 위해서다(CONVENTIONS §9).
그 대가로, 어느 루트에도 담기지 않은 체크아웃은 열 수 없다 — 목록에는 남기되 `root: null` 로 표시하고
화면이 "루트 밖" 이라고 안내한다. 감추는 것보다 낫다. 사용자는 그 worktree 가 존재한다는 사실을 알아야 한다.

### 2.3 "main" 은 브랜치가 아니다

git 용어의 **main working tree**(`git init`/`clone` 이 만든 원래 디렉터리)와 **linked working tree**
(`git worktree add`)를 따른다. main 작업 트리가 `develop` 을 체크아웃하고 있을 수도 있다.
화면의 드롭다운에는 "기본 · \<브랜치\>" 로 적어 둘을 헷갈리지 않게 한다.

### 2.4 탐색은 깊이 2

`~/workspace/<프로젝트>` 와 묶음 디렉터리를 하나 둔 `~/workspace/<묶음>/<프로젝트>` 까지가 실제로
쓰이는 형태다. 더 내려가면 저장소 안의 `vendor/*` 까지 훑는다. 숨김 디렉터리와 `node_modules` 는 건너뛰고,
`.git` 이 **파일**인 디렉터리(linked 작업 트리·서브모듈)는 저장소로 잡지 않고 그 아래로 내려가지도 않는다.

### 2.5 캐시하지 않는다

한 저장소당 읽는 것이 작은 텍스트 파일 몇 개다. 캐시를 두면 worktree 를 방금 만든 사람이 목록에서
그것을 못 본다. 목록을 새로 읽는 버튼이 이미 화면에 있다.

## 3. 산출물

- `src/domain/workspace.ts` — `WorkspaceRepo` · `WorkspaceCheckout`
- `src/repositories/git.repository.ts` — `probeGit` · `readRepository` (`.git` 직접 읽기)
- `src/repositories/git.repository.test.ts` — 실제 git 으로 만든 저장소·worktree 픽스처
- `src/services/fs.service.ts` — `locate(roots, absolute)` 추가, `slugify` export
- `src/services/workspace.service.ts` — 루트 탐색 → 저장소 묶기 → 파일 API 루트에 매핑
- `src/services/workspace.service.test.ts` — 탐색 규칙과 루트 밖 체크아웃
- `src/routes/workspace.route.ts` — `GET /api/workspace/repos`
- `src/web/components/file-view.tsx` — `files.page.tsx` 에서 빼낸 뷰어 패널
- `src/web/components/file-tree.tsx` — `basePath` prop 추가
- `src/web/pages/workspace.page.tsx` — `/workspace` 화면
- `src/web/app.tsx` · `src/web/components/app-shell.tsx` · `src/web/lib/api.ts` · `src/web/styles.css`

## 4. 상세 명세

### 4.1 저장소 하나 읽기

- `.git` 이 디렉터리가 아니면 저장소가 아니다(`null`).
- main 체크아웃은 `.git/HEAD`, linked 는 `.git/worktrees/<name>/HEAD` 를 본다. **참조 해석은 공용
  `.git` 기준**이다 — 작업 트리마다 HEAD 는 따로지만 `refs/heads/*` 는 저장소가 함께 쓴다.
- `ref: refs/heads/x` → 브랜치 `x`. SHA 는 느슨한 참조 파일에서, 없으면 `packed-refs` 에서
  (`#` 헤더와 `^` peeled 줄은 건너뛴다). 40자 hex 면 detached 로 보고 브랜치를 `null` 로 둔다.
- `.git/worktrees/<name>/gitdir` 의 내용은 작업 트리의 `.git` **파일** 경로다. 디렉터리를 얻으려면
  한 단계 올라간 뒤 `realpath` 한다. 실패하면 prunable 이므로 목록에서 뺀다.
- `locked` 파일이 있으면 그 내용이 잠금 사유다(빈 파일이면 `""`).

### 4.2 API

`GET /api/workspace/repos` — 파라미터 없음. 목록 봉투(`{ total, offset, limit, items }`)를 쓴다.
필드와 탐색 규칙은 `docs/ENDPOINTS.md` 워크스페이스 절.

### 4.3 화면

`/workspace?repo=<repoId>&wt=<checkoutId>&path=<체크아웃 기준 상대경로>`

- `repo` 가 없으면 첫 저장소로 `replace` 이동한다(뒤로가기 기록을 남기지 않는다).
- `wt` 가 없거나 없는 id 면 조용히 `checkouts[0]`(main)으로 떨어진다. 낡은 링크로 화면을 비우지 않는다.
- 왼쪽 패널은 툴바 두 줄(저장소 선택 + 숨김·새로고침 / 체크아웃 선택)과 메타 한 줄
  (`브랜치 · HEAD 앞 7자 · 경로`), 그 아래 트리다.
- 트리는 체크아웃 디렉터리를 뿌리로 삼는다(`FileTree`의 `basePath`). `basePath` 위쪽 디렉터리는
  읽지 않고, 뿌리나 체크아웃이 바뀌면 펼침 집합을 버린다 — 다른 체크아웃의 펼침을 끌고 가면
  있지도 않은 경로를 읽으러 간다. `basePath=""` 면 기존 동작과 완전히 같다.
- `path` 는 **체크아웃 기준** 상대경로로 URL 에 남기고, 파일 API 에는 `relPath` 를 앞에 붙여 부른다.
  저장소를 바꾸면 `wt` 와 `path` 를, 체크아웃만 바꾸면 `path` 를 함께 지운다(`setParams` 한 번으로).
- 저장하지 않은 편집이 있으면 이동 전에 확인한다(`/files` 와 같은 `confirmLeave`).
- `root` 가 `null` 인 체크아웃은 트리와 뷰어 자리에 안내를 띄운다.

## 5. 수용 기준

- [x] `/workspace` 메뉴가 "파일" 다음에 있고, 저장소 목록이 이름순으로 나온다
- [x] 같은 저장소의 main 과 worktree 가 한 항목으로 묶이고 드롭다운으로 바뀐다
- [x] 고른 체크아웃의 파일 트리를 보고 파일을 열어 읽는다. 마크다운은 미리보기·편집까지 `/files` 와 같다
- [x] 루트 밖 체크아웃은 목록에 나오되 열 수 없다고 안내한다
- [x] prunable worktree·서브모듈·`node_modules`·숨김 디렉터리는 목록에 없다
- [x] `/files` 의 동작이 바뀌지 않는다(컴포넌트 추출만)
- [x] 서버가 `git` 프로세스를 띄우지 않는다
- [x] 문서 4종(ENDPOINTS·STRUCTURE·CONVENTIONS·README)을 갱신했다

## 6. 검증

```bash
bunx tsc --noEmit
bun test
bun run check
PORT=4323 bun index.ts &
curl -s localhost:4323/api/workspace/repos
```

## 7. 완료 처리

`docs/TODO.md` 에 `DONE T-028` 을 append 한다. 브라우저 육안 확인은 사용자 몫으로 남긴다.
