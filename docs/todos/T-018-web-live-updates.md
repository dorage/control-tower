# T-018 — SSE 기반 실시간 반영

| | |
| --- | --- |
| **ID** | T-018 |
| **우선순위** | P1 |
| **영역** | web-core |
| **선행** | T-004, T-010, T-011 |
| **후행** | 없음 |

## 1. 목적

세션이 진행되는 동안 화면이 스스로 따라간다. `/api/events`(T-004)를 구독해 해당 화면만 조용히 갱신한다.

**이 작업의 성패는 "갱신하지 말아야 할 것을 갱신하지 않는 것"에 달려 있다.** 편집 중인 문서를 덮어쓰거나, 읽던 위치를 흔들거나, 매 이벤트마다 전체를 다시 그리면 기능이 아니라 방해가 된다.

## 2. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/web/hooks/use-live.ts` | SSE 연결 + 구독 훅 |
| `src/web/components/app-shell.tsx` | 헤더 연결 표시등 |
| 각 페이지 | 갱신 반응 연결 |

## 3. 상세 명세

### 3.1 단일 연결

`EventSource`를 **모듈 스코프에 하나만** 만든다. 페이지마다 만들면 서버에 구독자가 쌓이고 폴링이 중복된다.

```ts
// src/web/hooks/use-live.ts
type ConnectionState = "connecting" | "open" | "closed";

let source: EventSource | null = null;
let state: ConnectionState = "closed";
const changeListeners = new Set<(event: ChangeEvent) => void>();
const stateListeners = new Set<() => void>();

function ensureConnected(): void {
  if (source) return;
  state = "connecting";
  source = new EventSource("/api/events");
  source.addEventListener("ready", () => setState("open"));
  source.addEventListener("change", (event) => {
    try {
      const parsed = JSON.parse((event as MessageEvent).data) as ChangeEvent;
      for (const listener of changeListeners) listener(parsed);
    } catch { /* 잘린 프레임 무시 */ }
  });
  source.onerror = () => setState("connecting");   // EventSource 가 스스로 재연결한다
}

function disconnect(): void {
  source?.close();
  source = null;
  setState("closed");
}
```

- 첫 구독자가 생기면 연결하고, 마지막 구독자가 사라지면 끊는다.
- `EventSource`는 끊기면 자동으로 재연결한다. 직접 재연결 루프를 만들지 않는다.
- `ChangeEvent` 타입은 서버의 `src/services/watch.service.ts`에서 `import type`으로 가져온다. 웹에서 재정의하지 않는다.

### 3.2 훅

```ts
/** 데이터 변경 시 호출된다. handler 는 ref 에 담아 최신 값을 쓴다. */
export function useLiveChange(handler: (event: ChangeEvent) => void, enabled?: boolean): void;

/** 헤더 표시등용. */
export function useLiveState(): "connecting" | "open" | "closed";
```

`useLiveChange`는 `handler`를 deps에 넣지 않는다. 넣으면 렌더마다 재구독한다.

### 3.3 디바운스와 합류

`change` 이벤트는 세션이 활발할 때 1.5초마다 올 수 있다. 각 화면은 **자체 디바운스**를 건다.

| 화면 | 반응 | 디바운스 |
| --- | --- | --- |
| 대시보드 | 통계·최근 세션 재로드 | 3초 |
| 세션 목록 | 첫 페이지만 재로드. `offset > 0`이면 배너만 표시 | 3초 |
| 세션 타임라인 | 아래 §3.4 | 2초 |
| 파일 탐색기 | 트리 캐시 무효화 | 2초 |
| 마크다운 에디터 | 아래 §3.5 | – |

디바운스 유틸을 `src/web/lib/debounce.ts`에 하나 만들어 공유한다.

### 3.4 세션 타임라인의 규칙

읽고 있는 위치를 흔들지 않는 것이 핵심이다.

- **현재 보고 있는 세션이 아니면 무시한다.** `change` 이벤트에는 어느 세션이 바뀌었는지가 없으므로(`fingerprint`뿐), 갱신은 항상 "현재 세션 재조회"다.
- 마지막 페이지를 보고 있을 때(`offset + limit >= total`)만 자동으로 다시 불러온다.
- 그 외에는 상단에 배너를 띄운다: `새 메시지가 있습니다 [최신으로]`.
- 자동 갱신 시 스크롤 위치를 유지한다. 사용자가 맨 아래에 있었다면(`scrollTop + clientHeight >= scrollHeight - 50`) 새 내용 아래로 따라 내린다. 아니면 그대로 둔다.
- 펼쳐 놓은 블록의 상태를 유지한다. 엔트리 key를 배열 인덱스가 아니라 `entry.uuid ?? entry.index`로 준다.

### 3.5 파일 화면의 규칙 — 절대 규칙

- 열려 있는 파일이 `dirty`면 **어떤 경우에도 다시 읽지 않는다.** 대신 상단에 `디스크에서 변경되었을 수 있습니다 [다시 읽기]` 배너만 띄운다.
- `dirty`가 false여도, 서버가 준 `version`이 실제로 달라졌을 때만 `draft`를 교체한다. 같으면 아무것도 하지 않는다(포커스와 커서를 지키기 위해).
- 트리 캐시 무효화는 **현재 펼쳐진 디렉터리만** 다시 읽는다. 전체를 비우고 다시 그리면 펼침 상태가 깜빡인다.

`/api/events`는 `~/.claude`만 감시한다(`watch.service.ts`). 워크스페이스 파일 변경은 이 이벤트로 오지 않는다. 파일 화면의 실시간 갱신은 따라서 **부수적**이며, 워크스페이스 감시를 추가하는 것은 이 작업의 범위 밖이다. 이 한계를 `docs/ENDPOINTS.md`에 명시한다.

### 3.6 연결 표시등

헤더 우측(T-011 §4.3에서 비워 둔 자리)에 점 하나 + 툴팁.

| 상태 | 색 | 툴팁 |
| --- | --- | --- |
| `open` | `--success` | "실시간 연결됨" |
| `connecting` | `--warning` | "연결 중..." |
| `closed` | `--text-faint` | "연결 끊김" |

클릭하면 수동 재연결.

### 3.7 탭이 숨겨졌을 때

`document.visibilityState === "hidden"`이면 연결을 끊는다. 다시 보이면 연결하고 현재 화면을 1회 갱신한다. 백그라운드 탭이 서버 폴링을 붙잡고 있을 이유가 없다.

## 4. 수용 기준

- [ ] 앱 전체에서 `EventSource` 연결이 **정확히 1개**다(개발자도구 네트워크 탭에서 확인).
- [ ] 헤더 표시등이 연결 상태를 반영한다.
- [ ] 서버를 껐다 켜면 표시등이 `connecting`을 거쳐 `open`으로 돌아온다(자동 재연결).
- [ ] 세션이 진행 중일 때 대시보드 수치가 스스로 갱신된다.
- [ ] 타임라인 마지막 페이지에서 새 메시지가 자동으로 붙는다.
- [ ] 첫 페이지를 보고 있을 때는 자동으로 뛰지 않고 배너만 뜬다.
- [ ] 타임라인 자동 갱신 시 펼쳐 둔 tool_result가 접히지 않는다.
- [ ] 맨 아래가 아닌 위치에서 읽는 중이면 스크롤이 움직이지 않는다.
- [ ] **편집 중(dirty)인 마크다운이 SSE 때문에 덮어써지지 않는다.**
- [ ] `dirty`가 아니고 파일도 안 바뀌었으면 textarea 커서가 튀지 않는다.
- [ ] 탭을 다른 탭으로 바꾸면 연결이 끊기고, 돌아오면 다시 연결된다.
- [ ] 페이지를 떠나면(`/sessions` → `/files`) 이전 화면의 구독이 해제된다.
- [ ] 1.5초마다 이벤트가 와도 재렌더가 디바운스 간격 이하로만 발생한다.
- [ ] `bunx tsc --noEmit` 통과.

## 5. 검증

```bash
bun run dev
```

터미널에서 데이터를 계속 건드려 이벤트를 만든다.

```bash
# 1.5초마다 변경 이벤트를 유발
while true; do touch "${CLAUDE_HOME:-$HOME/.claude}/sessions/.probe.json"; sleep 1; done
```

브라우저 시나리오:

1. 네트워크 탭에서 `/api/events` 연결이 1개인지 확인. `/sessions` → `/files` → `/`를 오가며 여전히 1개인지.
2. 대시보드에서 수치가 갱신되는지, 재렌더가 3초에 한 번 이하인지(`console.count`).
3. 실행 중인 실제 Claude 세션의 타임라인을 마지막 페이지에서 열어 두고 새 메시지가 붙는지.
4. 그 상태에서 tool_result를 펼쳐 두고 갱신 후에도 펼쳐져 있는지.
5. 중간까지 스크롤한 상태에서 갱신이 스크롤을 건드리지 않는지.
6. `/files`에서 `.md`를 열어 고친 뒤(`dirty`), 이벤트가 계속 오는 동안 편집 내용이 사라지지 않는지 — **가장 중요한 확인.**
7. 다른 탭으로 이동 후 돌아왔을 때 재연결되는지.
8. 서버를 `kill` 후 재시작해 표시등이 복구되는지.

정리:

```bash
rm -f "${CLAUDE_HOME:-$HOME/.claude}/sessions/.probe.json"
```

## 6. 완료 처리

1. `docs/STRUCTURE.md` — `src/web/hooks/use-live.ts`, `src/web/lib/debounce.ts`를 `✅`로.
2. `docs/ENDPOINTS.md` — `/api/events`에 "`~/.claude`만 감시하며 워크스페이스 파일 변경은 통지하지 않는다"는 한계를 명시.
3. `docs/CONVENTIONS.md` §10 — "SSE 연결은 모듈 스코프에 하나", "실시간 갱신은 사용자 편집 상태(dirty)와 스크롤 위치를 절대 침범하지 않는다", "숨겨진 탭에서는 연결을 끊는다"를 추가.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-018`
