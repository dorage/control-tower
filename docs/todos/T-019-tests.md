# T-019 — 테스트 스위트와 타입 체크

| | |
| --- | --- |
| **ID** | T-019 |
| **우선순위** | P1 |
| **영역** | quality |
| **선행** | T-003, T-008 |
| **후행** | 없음 |

## 1. 목적

이미 작성된 서비스 계층(`session.service.ts` 371줄 포함)에는 테스트가 하나도 없다. 트랜스크립트 파싱은 외부 파일 포맷에 의존하는 코드라 조용히 깨지기 쉽다. 회귀를 잡는 최소한의 그물을 친다.

`bun test`로 실행한다. 별도 테스트 러너를 도입하지 않는다.

## 2. 방침

**테스트하는 것** — 순수 로직, 파싱, 경계값, 보안 판정.
**테스트하지 않는 것** — React 컴포넌트 렌더(브라우저 검증으로 대체), 실제 `~/.claude` 데이터에 의존하는 검사.

**사용자의 실제 홈 디렉터리를 절대 읽거나 쓰지 않는다.** 모든 디스크 테스트는 `mkdtemp`로 만든 임시 디렉터리를 쓰고 `afterAll`에서 지운다.

## 3. 산출물

| 파일 | 대상 |
| --- | --- |
| `src/lib/text.test.ts` | `stripAnsi`, `truncate`, `parseJsonl`, `decodeProjectId` |
| `src/lib/http.test.ts` | T-002에서 생성됨 (여기서 보강) |
| `src/services/fs.service.test.ts` | T-005/T-008에서 생성됨 (여기서 보강) |
| `src/services/session.service.test.ts` | 요약·타임라인 생성 |
| `src/services/watch.service.test.ts` | 구독/해지 |
| `src/web/lib/format.test.ts` | T-010에서 생성됨 |
| `src/web/lib/markdown.test.ts` | T-014에서 생성됨 |
| `test/fixtures/` | 합성 트랜스크립트 JSONL |
| `test/helpers.ts` | 임시 `CLAUDE_HOME` 구성 헬퍼 |

## 4. 상세 명세

### 4.1 `src/lib/text.test.ts`

| 케이스 | 기대 |
| --- | --- |
| `stripAnsi("\\x1b[31mred\\x1b[0m")` | `"red"` |
| `stripAnsi("plain")` | 변화 없음 |
| `stripAnsi("\\x1b[?25l\\x1b[2K")` | `""` (커서/지우기 시퀀스도 제거) |
| `truncate("abcdef", 3)` | `{ text: "abc", truncated: true }` |
| `truncate("abc", 3)` | `{ text: "abc", truncated: false }` |
| `parseJsonl('{"a":1}\\n{"b":2}')` | 2개 |
| `parseJsonl('{"a":1}\\n{broken\\n{"b":2}')` | 2개 (깨진 줄 건너뜀) |
| `parseJsonl("")` | `[]` |
| `parseJsonl('{"a":1}\\n\\n  \\n')` | 1개 (빈 줄 무시) |
| `parseJsonl('{"a":1}\\n{"b":')` | 1개 (반쯤 쓰인 마지막 줄) |
| `decodeProjectId("-home-dorage-workspace-app")` | `"/home/dorage/workspace/app"` |

`parseJsonl`의 "반쯤 쓰인 마지막 줄" 케이스가 특히 중요하다. 트랜스크립트는 실행 중인 세션이 계속 append 하는 파일이므로 실제로 자주 발생한다.

`decodeProjectId`는 원래 경로에 `-`가 들어 있으면 복원할 수 없다(`my-app` → `my/app`). 이 손실을 **명시하는 테스트**를 남긴다. 고치는 것이 아니라 알려진 한계로 기록하는 것이다.

```ts
test("decodeProjectId 는 이름 속 하이픈을 복원할 수 없다 (알려진 한계)", () => {
  expect(decodeProjectId("-home-u-my-app")).toBe("/home/u/my/app");
});
```

### 4.2 `test/helpers.ts`

```ts
export interface FakeClaudeHome {
  dir: string;
  addTranscript(projectId: string, sessionId: string, records: unknown[]): Promise<void>;
  addLiveSession(pid: number, data: Record<string, unknown>): Promise<void>;
  addHistory(entries: unknown[]): Promise<void>;
  cleanup(): Promise<void>;
}

export async function makeClaudeHome(): Promise<FakeClaudeHome>;
```

`projects/`, `sessions/`, `history.jsonl` 구조를 임시 디렉터리에 만든다.

**주의**: `src/config.ts`는 모듈 로드 시점에 `Bun.env`를 읽는다. 따라서 테스트는 `process.env.CLAUDE_HOME`을 설정한 **뒤에** 대상 모듈을 `await import()`로 동적 로드해야 한다. 정적 import를 쓰면 설정이 이미 굳어 있다.

```ts
process.env.CLAUDE_HOME = home.dir;
const { listSessions } = await import("../src/services/session.service");
```

한 테스트 파일 안에서는 모듈 캐시 때문에 `CLAUDE_HOME`을 두 번 바꿀 수 없다. **파일당 하나의 `CLAUDE_HOME`** 규칙을 지키고, 다른 설정이 필요하면 테스트 파일을 나눈다.

### 4.3 `test/fixtures/`

합성 트랜스크립트를 만든다. 실제 세션 파일을 복사하지 않는다(개인 정보가 들어 있다).

`sample-session.jsonl`에 다음을 모두 포함시킨다.

- `type: "user"` 문자열 content
- `type: "user"` 배열 content (text 블록)
- `type: "user"` tool_result 블록 (`is_error: true` 하나 포함)
- `type: "assistant"` text + thinking + tool_use 블록, `usage` 포함
- `type: "assistant"` `isApiErrorMessage: true`
- `isSidechain: true` 레코드
- `isMeta: true` 레코드
- `type: "summary"`, `type: "ai-title"`, `type: "mode"` 이벤트 레코드
- `type: "attachment"` 레코드
- `timestamp`가 없는 레코드
- 깨진 JSON 줄 하나

### 4.4 `src/services/session.service.test.ts`

`buildSummary`와 `toTimelineEntry`는 export 되어 있지 않다. **테스트를 위해 export를 추가하지 않는다.** 대신 공개 API(`listSessions`, `getSession`, `getTimeline`)를 통해 검증한다.

| 케이스 | 기대 |
| --- | --- |
| 픽스처 세션의 `counts.userMessages` | tool_result만 든 user 레코드는 세지 않는다 |
| `counts.toolUses` / `toolUsage` | tool_use 블록 수와 툴별 집계가 맞다 |
| `counts.thinkingBlocks` | thinking 블록 수 |
| `counts.errors` | `isApiErrorMessage` + `is_error` tool_result 합 |
| `counts.sidechainRecords` | sidechain 레코드 수 |
| `usage.total` | input+output+cacheRead+cacheCreation |
| `title` | `aiTitle`이 있으면 그것, 없으면 `firstPrompt` 앞 80자 |
| `projectPath` | 레코드의 `cwd`가 있으면 그것을 쓴다(`decodeProjectId`가 아니라) |
| `startedAt`/`lastActivityAt` | 타임스탬프 없는 레코드를 건너뛰고 계산된다 |
| `getTimeline` 기본 | `kind: "event"` 엔트리가 없다 |
| `getTimeline({ events: true })` | 이벤트 엔트리가 포함되고 `blocks[0].text`가 `eventLabel` 형태다 |
| `getTimeline({ includeSidechain: false })` | sidechain 엔트리가 없다 |
| `getTimeline` offset/limit | 슬라이싱이 맞고 `total`은 전체 수다 |
| `MAX_BLOCK_CHARS` 초과 텍스트 | `truncated: true`, `text.length === MAX_BLOCK_CHARS` |
| `getSession("없는id")` | `null` |
| 빈 `CLAUDE_HOME` | `listSessions`가 `{ total: 0, sessions: [] }`, 예외 없음 |

캐시 검증도 넣는다: 같은 세션을 두 번 요약해도 결과가 같고, 파일을 수정(크기 변경)하면 갱신된 결과가 나온다.

### 4.5 `src/services/watch.service.test.ts`

| 케이스 | 기대 |
| --- | --- |
| `subscribe` 후 `subscriberCount()` | 1 |
| 해지 함수 호출 후 | 0 |
| 두 번 구독 후 하나만 해지 | 1 |
| 파일 추가 후 리스너 호출 | `type: "change"` 이벤트 수신 |
| 변경이 없을 때 | 리스너가 다시 호출되지 않는다 |

폴링 주기 때문에 느려지지 않도록 `WATCH_INTERVAL_MS=50`으로 설정한 뒤 모듈을 동적 import 한다. 각 테스트는 끝나면 반드시 해지해 타이머를 남기지 않는다 — 남으면 `bun test`가 종료되지 않는다.

### 4.6 스크립트

`package.json`에 추가한다.

```json
"scripts": {
  "test": "bun test",
  "check": "tsc --noEmit && bun test"
}
```

`bun run check` 한 번으로 타입과 테스트를 모두 본다.

### 4.7 커버리지 목표

수치 목표를 강제하지 않는다. 대신 **다음 파일에 테스트가 하나도 없으면 안 된다**는 규칙을 둔다.

- `src/lib/*.ts`
- `src/services/fs.service.ts`
- `src/services/session.service.ts`
- `src/services/watch.service.ts`
- `src/web/lib/markdown.ts`
- `src/web/lib/format.ts`

`bun test --coverage`로 현황을 보고, 위 목록의 커버리지를 `docs/CONVENTIONS.md` §11에 기록한다.

## 5. 수용 기준

- [ ] `bun test`가 전부 통과하고 **10초 안에** 끝난다.
- [ ] `bun test`가 스스로 종료된다(남은 타이머/핸들 없음).
- [ ] 테스트 실행 후 `~/.claude`와 `~/workspace`가 변경되지 않았다.
- [ ] `/tmp`에 임시 디렉터리가 남지 않는다.
- [ ] §4.7의 6개 파일이 모두 테스트를 가진다.
- [ ] `bun run check`가 통과한다.
- [ ] 테스트가 실제 사용자 데이터를 읽지 않는다(픽스처만 사용).
- [ ] 같은 테스트를 두 번 연속 실행해도 결과가 같다(상태 누수 없음).

## 6. 검증

```bash
# 실행 전 상태 기록
ls -la ~/.claude > /tmp/before.txt 2>/dev/null
ls /tmp | sort > /tmp/tmp-before.txt

bun test
echo "exit=$?"

time bun test              # 10초 이내
bun test && bun test       # 두 번 연속 동일 결과
bun run check

# 부작용 확인
ls -la ~/.claude > /tmp/after.txt 2>/dev/null
diff /tmp/before.txt /tmp/after.txt && echo "claude home 무변경 ok"
ls /tmp | sort > /tmp/tmp-after.txt
diff /tmp/tmp-before.txt /tmp/tmp-after.txt && echo "임시 디렉터리 누수 없음 ok"

bun test --coverage
```

## 7. 완료 처리

1. `docs/CONVENTIONS.md` §11 — 확정된 테스트 규칙(임시 디렉터리 사용, `CLAUDE_HOME` 설정 후 동적 import, 파일당 하나의 환경 설정, 필수 테스트 파일 목록)과 현재 커버리지를 기록한다.
2. `docs/STRUCTURE.md` — `test/` 디렉터리와 각 `*.test.ts`를 트리에 추가하고, `package.json`의 `test`/`check` 스크립트를 반영한다.
3. `docs/ENDPOINTS.md` — 변경 없음.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-019`
