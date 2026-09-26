/**
 * 워크스페이스에 있는 git 저장소와 그 체크아웃.
 *
 * 용어는 git 을 따른다 — 저장소 하나에 **main working tree**(`git init`/`git clone` 이
 * 만든 원래 디렉터리) 하나와 **linked working tree**(`git worktree add` 로 붙인 것)
 * 여럿이 있다. 여기서 "main" 은 브랜치 이름이 아니라 이 작업 트리 구분이다 —
 * main working tree 가 `develop` 을 체크아웃하고 있을 수도 있다.
 */

export interface WorkspaceCheckout {
  /** 저장소 안에서 유일. main 작업 트리는 "main", linked 는 `.git/worktrees/<name>` 의 name. 충돌하면 `-2` 붙임 */
  id: string;
  kind: "main" | "linked";
  /** main 작업 트리는 "main", linked 는 git 이 붙인 이름(보통 체크아웃 디렉터리의 basename) */
  name: string;
  /** 절대경로, 심볼릭 링크 풀림 */
  path: string;
  /** 브랜치. detached HEAD 면 null */
  branch: string | null;
  /** HEAD 커밋 전체 SHA(40자). 못 풀면 null */
  head: string | null;
  /** `git worktree lock` 사유. 안 잠겼으면 null, 사유 없이 잠겼으면 "" */
  locked: string | null;
  /** 이 체크아웃을 담는 파일 API 루트 id. 루트 밖이면 null */
  root: string | null;
  /** 루트 기준 상대경로(POSIX). 루트 자신이면 "". root 가 null 이면 null */
  relPath: string | null;
}

export interface WorkspaceRepo {
  /** URL 용 slug. 같은 이름이 둘이면 -2 */
  id: string;
  name: string;
  /** main 작업 트리 절대경로 */
  path: string;
  /** main 첫 번째, 이어서 linked 이름순 */
  checkouts: WorkspaceCheckout[];
}

/** 화면의 소스 컨트롤 버튼 하나가 곧 동작 하나다. 메시지 입력 같은 추가 입력은 받지 않는다. */
export type WorkspaceGitAction = "pull" | "commit" | "push";

/** `git status --porcelain --branch` 한 번으로 얻는 것. 목록 API 와 달리 명령을 띄운다. */
export interface WorkspaceGitStatus {
  /** 브랜치. detached HEAD 면 null */
  branch: string | null;
  /** HEAD 커밋 전체 SHA. 커밋이 하나도 없으면 null */
  head: string | null;
  /** 추적 브랜치(`origin/main`). 없으면 null */
  upstream: string | null;
  /** upstream 보다 앞선 커밋 수. upstream 이 없으면 0 */
  ahead: number;
  behind: number;
  /** 워킹 트리에서 달라진 항목 수(추적 안 된 파일 포함). commit 은 이것을 전부 담는다 */
  changed: number;
  /** 이 체크아웃이 서버 자신의 저장소인지. pull 만으로는 서버가 새 코드를 쓰지 않으므로 화면이 알린다 */
  self: boolean;
}

export interface WorkspaceGitResult {
  action: WorkspaceGitAction;
  /** 화면에 그대로 보여 줄 한 줄. commit 이면 커밋 메시지(KST 시각) */
  message: string;
  /** git 이 표준 출력·오류에 남긴 것. 비어 있을 수 있다 */
  output: string;
  /** 동작 뒤 다시 읽은 상태 */
  status: WorkspaceGitStatus;
}
