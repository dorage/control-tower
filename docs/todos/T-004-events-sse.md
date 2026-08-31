# T-004 — SSE 실시간 변경 이벤트 API

| | |
| --- | --- |
| **ID** | T-004 |
| **우선순위** | P1 |
| **영역** | api-session |
| **선행** | T-001, T-002 |
| **후행** | T-018 |

## 1. 목적

`~/.claude` 데이터가 바뀌면 브라우저에 밀어준다. 프론트엔드가 폴링하지 않고 갱신할 수 있게 한다.

## 2. 현재 상태

`src/services/watch.service.ts`가 이미 다음을 제공한다.

```ts
interface ChangeEvent {
  type: "change";
  fingerprint: string;
  transcripts: number;
  liveSessions: number;
  at: string;      // ISO
}

subscribe(listener: (event: ChangeEvent) => void): () => void   // 반환값은 해지 함수
subscriberCount(): number
```

동작: 첫 구독자가 생기면 `config.watchIntervalMs`(기본 1500ms) 간격 타이머가 시작되고, 트랜스크립트 파일 크기/시각 + 세션 파일 상태의 해시가 바뀔 때만 리스너를 호출한다. 구독자가 0이 되면 타이머를 멈춘다.

### 2.1 범위 추가 — 변경 델타

원래 이 작업은 "subscribe/해지만 정확히 하면 된다"였다. 그러나 현재 `fingerprint()` 는 **전체를 한 해시로 뭉개기 때문에** 이벤트가 "뭔가 바뀌었다"밖에 말하지 못한다.

```ts
// src/services/watch.service.ts:24 — 어느 세션이 바뀐지 알 수 없다
value: Bun.hash(`${transcriptPart}#${livePart}`).toString(16)
```

이러면 클라이언트는 매 이벤트마다 전부 다시 불러야 하고, T-018 이 "갱신하지 말아야 할 것을 갱신하지 않는 것에 성패가 걸린다"고 적은 문제를 풀 수 없다. **그래서 이 작업에 파일별 델타 계산을 포함한다** (§4.6).

`ChangeEvent` 에 필드 세 개가 붙는다. 기존 필드는 그대로 두므로 하위 호환이다.

```ts
interface ChangeEvent {
  type: "change";
  fingerprint: string;
  transcripts: number;
  liveSessions: number;
  at: string;
  /** 이번 변경에서 크기/시각이 달라진 세션 id. */
  changedSessions: string[];
  /** 새로 나타난 세션 id. */
  addedSessions: string[];
  /** 사라진 세션 id. */
  removedSessions: string[];
}
```

fb-watchman 을 쓰지 않는다. 이 기기(aarch64)에 watchman 데몬 prebuilt 가 없어 소스 빌드가 필요하고, 외부 데몬 + 클라이언트 라이브러리를 추가하는 대가가 얻는 것보다 크다. 재귀 감시가 정말 필요해지면 `node:fs` 의 `watch(dir, { recursive: true })` 가 이 기기에서 동작함을 확인했으므로 그것이 다음 순서다.

## 3. 산출물

| 파일 | 내용 |
| --- | --- |
| `src/services/watch.service.ts` | 파일별 델타 계산 (§4.6) |
| `src/routes/events.route.ts` | `GET /api/events` (SSE) |
| `src/routes/index.ts` | `...eventRoutes` 추가 |
| `src/services/watch.service.test.ts` | 델타 계산 테스트 |

## 4. 상세 명세

### 4.1 응답 헤더

```
content-type: text/event-stream
cache-control: no-store
connection: keep-alive
x-accel-buffering: no
```

`src/lib/http.ts`의 `json()`을 쓰지 않는다. `new Response(stream, { headers })`를 직접 만든다.

### 4.2 프레임

| 이벤트 | 시점 | data |
| --- | --- | --- |
| `ready` | 연결 직후 1회 | `{"at":"<ISO>"}` |
| `change` | 데이터 변경 시 | `ChangeEvent` 그대로 |
| (주석) | 25초마다 | `: ping` |

SSE 프레임 형식은 `event: <name>\ndata: <json>\n\n`. 주석은 `: ping\n\n`.

### 4.3 구현

```ts
import { subscribe } from "../services/watch.service";

const PING_MS = 25_000;

export const eventRoutes = {
  "/api/events": {
    GET: (req: Request) => {
      const encoder = new TextEncoder();
      let unsubscribe: (() => void) | null = null;
      let ping: ReturnType<typeof setInterval> | null = null;

      const stream = new ReadableStream({
        start(controller) {
          const send = (frame: string) => {
            try {
              controller.enqueue(encoder.encode(frame));
            } catch {
              // 소비자가 이미 끊긴 경우 — cleanup 이 곧 호출된다
            }
          };

          send(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);

          unsubscribe = subscribe((event) => {
            send(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
          });

          ping = setInterval(() => send(": ping\n\n"), PING_MS);
          ping.unref?.();

          req.signal.addEventListener("abort", () => {
            cleanup();
            try { controller.close(); } catch { /* 이미 닫힘 */ }
          });
        },
        cancel() {
          cleanup();
        },
      });

      function cleanup() {
        unsubscribe?.();
        unsubscribe = null;
        if (ping) clearInterval(ping);
        ping = null;
      }

      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        },
      });
    },
  },
};
```

### 4.4 누수 방지 — 이 작업의 핵심

`subscribe`가 반환한 해지 함수를 **반드시** 호출해야 한다. 호출하지 않으면 브라우저 탭을 닫아도 폴링 타이머가 영원히 돈다.

해지가 필요한 경로는 세 가지고, `cleanup()`은 여러 번 불려도 안전해야 한다(위 구현은 null 대입으로 멱등).

1. `req.signal`의 `abort` — 클라이언트가 연결을 끊음
2. `ReadableStream.cancel` — 소비자가 스트림을 취소함
3. `controller.enqueue` 실패 — 이미 닫힌 스트림

### 4.5 index.ts 등록

`"/*": index` **앞에** `...eventRoutes`를 spread 한다(순서 자체는 Bun의 명시적 경로 우선 규칙 덕에 무관하지만 가독성상 API 라우트끼리 모은다).

### 4.6 파일별 델타 계산

`fingerprint()` 는 이미 `sessionId:size:modifiedAt` 문자열을 만든다. 해시로 뭉개기 **직전** 단계를 맵으로 유지하고 이전 맵과 비교하면 델타가 공짜로 나온다. 의존성 0, 20줄 내외.

```ts
// 모듈 스코프. lastFingerprint 와 나란히 둔다.
let lastState = new Map<string, string>();   // sessionId -> "size:mtime"

function diff(prev: Map<string, string>, next: Map<string, string>) {
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  for (const [id, sig] of next) {
    const before = prev.get(id);
    if (before === undefined) added.push(id);
    else if (before !== sig) changed.push(id);
  }
  for (const id of prev.keys()) if (!next.has(id)) removed.push(id);
  return { changed, added, removed };
}
```

주의할 점 두 가지.

- **첫 tick 은 델타를 보내지 않는다.** `subscribe()` 는 첫 구독자에서 즉시 `tick()` 을 부르는데, 그때 `lastState` 가 비어 있으므로 모든 세션이 `added` 로 잡힌다. 첫 계산은 상태만 채우고 리스너를 호출하지 않도록, 기존 `lastFingerprint === ""` 조건과 함께 처리한다. (현재 코드는 첫 tick 에서 해시가 달라지므로 이벤트를 한 번 보낸다. 이 동작을 유지하려면 `added` 를 비워서 보낸다 — 어느 쪽이든 **클라이언트가 "빈 델타 = 전체 갱신"으로 오해하지 않게** 명시적 필드로 구분한다.)
- **라이브 세션 파일(`sessions/*.json`) 변경도 델타에 넣는다.** 트랜스크립트는 `sessionId` 로 식별되고 라이브 세션도 `sessionId` 를 갖고 있으므로 같은 키 공간에 합칠 수 있다. 두 소스가 같은 세션을 가리키면 한 번만 보고한다(`Set` 으로 합집합).

`subscriberCount()` 와 `subscribe()` 시그니처는 바꾸지 않는다. T-018 이 아직 없으므로 소비자는 T-004 뿐이다.

## 5. 수용 기준

- [ ] `curl -N localhost:4317/api/events`가 즉시 `event: ready`를 출력하고 연결을 유지한다.
- [ ] `$CLAUDE_HOME` 아래 파일을 건드리면 2초 안에 `event: change` 프레임이 온다.
- [ ] 아무 일이 없으면 25초마다 `: ping`이 온다.
- [ ] curl을 Ctrl-C로 끊고 나서 `subscriberCount()`가 0으로 돌아온다(= 서버 로그에 추가 폴링 흔적이 없다).
- [ ] 동시에 3개 연결을 열었다가 모두 닫아도 서버가 살아있고 CPU가 idle로 돌아온다.
- [ ] 트랜스크립트 한 개에 append 하면 `changedSessions` 에 그 세션 id 만 들어오고 나머지 배열은 비어 있다.
- [ ] 세션 파일을 새로 만들면 `addedSessions`, 지우면 `removedSessions` 에 잡힌다.
- [ ] 첫 연결 직후의 `change` 이벤트가 모든 세션을 `added` 로 보고하지 않는다.
- [ ] `bunx tsc --noEmit` 통과, `bun test` 통과.

## 6. 검증

```bash
bun run dev & sleep 1

# 1) ready + keep-alive
timeout 3 curl -sN localhost:4317/api/events | head -5

# 2) change 프레임 — 별도 터미널에서 파일을 건드린다
( sleep 1; touch "${CLAUDE_HOME:-$HOME/.claude}/sessions/.probe.json" ) &
timeout 5 curl -sN localhost:4317/api/events | grep -m1 'event: change' && echo "change ok"
rm -f "${CLAUDE_HOME:-$HOME/.claude}/sessions/.probe.json"

# 3) 다중 연결 후 정리
for i in 1 2 3; do timeout 2 curl -sN localhost:4317/api/events >/dev/null & done
wait
curl -s localhost:4317/api/health | grep -q '"ok":true' && echo "alive ok"
kill %1
```

`.probe.json`은 `live-session.repository.ts`가 `sessionId`/`pid` 없는 파일을 건너뛰므로 데이터에 영향을 주지 않는다. 그래도 검증 후 반드시 지운다.

## 7. 완료 처리

1. `docs/ENDPOINTS.md` — `/api/events`를 `✅`로 하고 실제 프레임 예시를 구현과 맞춘다. `change` 프레임 예시에 `changedSessions`/`addedSessions`/`removedSessions` 를 포함한다.
2. `docs/STRUCTURE.md` — `src/routes/events.route.ts`, `src/services/watch.service.test.ts`를 `✅`로.
3. `docs/CONVENTIONS.md` §7 — "스트리밍 응답은 abort/cancel/enqueue 실패 세 경로 모두에서 멱등하게 정리한다", "변경 알림은 무엇이 바뀌었는지를 함께 보낸다 — 수신 측이 전체를 다시 읽게 만들지 않는다"를 추가.
4. `docs/TODO.md`에 append: `<UTC-ISO> DONE T-004`
