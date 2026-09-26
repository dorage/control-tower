/**
 * `git` 명령 실행. 이 저장소가 프로젝트에서 외부 프로세스를 띄우는 유일한 곳이다.
 *
 * `git.repository.ts` 는 `.git` 아래 텍스트 파일만 읽는다 — 목록 API 처럼 화면을 열 때마다
 * 도는 경로에서는 프로세스를 띄우지 않는다는 규칙(CONVENTIONS §1) 때문이다. 여기는 그 반대다.
 * pull·commit·push 는 사람이 버튼을 눌러 한 번 도는 동작이고, 그 셋은 `.git` 을 손으로 고쳐서
 * 흉내 낼 것이 아니다. 그래서 규칙의 예외를 파일 하나에 가둔다.
 *
 * 두 가지를 항상 지킨다.
 * - **묻지 않는다.** 서버는 터미널이 없다. 자격증명이나 호스트 키를 물으면 요청이 영원히 멈추므로
 *   `GIT_TERMINAL_PROMPT=0` 과 ssh `BatchMode` 로 즉시 실패시킨다.
 * - **기다리지 않는다.** 원격이 응답하지 않아도 요청은 끝나야 한다. 시한을 넘기면 죽인다.
 */

export interface GitRun {
  /** 종료 코드. 시한을 넘겨 죽였으면 -1 */
  code: number;
  stdout: string;
  stderr: string;
}

/** 원격 동작(pull·push)이 걸릴 수 있는 최대 시간. 로컬 동작은 이보다 훨씬 빨리 끝난다. */
const TIMEOUT_MS = 60_000;

/** `git` 실행 파일. 없으면 서버 유닛의 PATH 문제다 — 매 호출마다 찾지 않고 한 번만 찾는다. */
const GIT = Bun.which("git");

function quietEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...Bun.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" };
  // 사용자가 자기 ssh 래퍼를 정해 뒀으면 존중한다. 없을 때만 묻지 않는 ssh 를 쓴다.
  if (!env.GIT_SSH_COMMAND) env.GIT_SSH_COMMAND = "ssh -o BatchMode=yes";
  return env;
}

/**
 * `cwd` 에서 `git <args>` 를 실행하고 결과를 그대로 돌려준다. 종료 코드로 판단하는 것은 호출자다.
 *
 * `cwd` 는 호출자가 이미 워크스페이스 루트 안의 체크아웃으로 검증한 절대경로다. 여기서는 다시
 * 검사하지 않는다 — 관문은 서비스 한 곳에만 둔다.
 */
export async function runGit(cwd: string, args: string[]): Promise<GitRun> {
  if (GIT === null) throw new Error("git executable not found in PATH");

  const proc = Bun.spawn([GIT, ...args], {
    cwd,
    env: quietEnv(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: TIMEOUT_MS,
    killSignal: "SIGKILL",
  });

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  // 시한으로 죽인 프로세스는 코드가 아니라 시그널로 끝난다. 호출자가 "왜 실패했는지" 를 알게 한다.
  if (proc.signalCode !== null) {
    return { code: -1, stdout, stderr: `${stderr}\ngit killed after ${TIMEOUT_MS / 1000}s (${proc.signalCode})`.trim() };
  }
  return { code, stdout, stderr };
}
