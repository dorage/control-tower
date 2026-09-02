# T-026 — 호스트 성능 모니터링

- **ID** — T-026
- **우선순위** — P2
- **영역** — core
- **선행** — T-017
- **후행** — 없음

## 1. 목적

control-tower 가 도는 기계(라즈베리파이) 자신의 상태를 대시보드에서 본다. 관찰 대상이 `~/.claude` 에서 이 기계로 넓어지는 첫 작업이다.

보고 싶은 것은 네 가지다 — 메모리 사용량, CPU 사용량, 메모리 상위 20 프로세스, CPU 상위 20 프로세스. 세션이 여덟 개 병렬로 돌 때 무엇이 기계를 잡아먹는지 SSH 로 `top` 을 띄우지 않고 알기 위해서다.

## 2. 전제와 판단

### 2.1 `ps`/`top` 을 부르지 않고 /proc 를 읽는다

- `ps` 의 `%cpu` 는 **프로세스 수명 전체의 평균**이다. 8시간 전에 CPU 를 태운 프로세스가 지금 조용해도 상위에 남는다. "지금 무엇이 먹고 있나" 라는 질문에 답하지 못한다.
- 지금의 사용률은 누적 시간의 **차이**다. 두 시점이 필요하고, 그 차이는 우리가 계산한다.
- 폴링마다 프로세스를 새로 띄우지 않는 것도 이유다. 이 기계는 SD 카드에서 돈다.

### 2.2 프로세스당 파일 하나만 읽는다

`/proc/<pid>/stat` 한 줄에 이름·상태·부모·CPU 시간·RSS 가 모두 있다. `status` 나 `statm` 을 함께 읽으면 폴링마다 파일 수가 두 배가 된다(실측 229 프로세스). 전체 명령줄(`cmdline`)만 **상위 목록에 오른 것**에 한해 추가로 읽는다 — `comm` 은 커널이 15자에서 자르고, 실제로 claude 프로세스의 `comm` 은 버전 문자열(`2.1.258`)이라 그것만으로는 무엇인지 알 수 없다.

### 2.3 상수 두 개

- `CLK_TCK` (100) — 상수로 둔다. 리눅스 사용자 공간에서 사실상 고정이고, 이 값 하나 때문에 `getconf` 를 띄우지 않는다.
- 페이지 크기 — **계산한다.** `/proc/self/status` 의 `VmRSS`(kB) ÷ `/proc/self/stat` 의 rss(페이지). aarch64 에 16 KiB 페이지 커널이 있어 4096 을 박지 않는다. 실패하면 4096 으로 떨어진다.

### 2.4 CPU 퍼센트의 기준

- **전체 사용률**(`cpu.usagePercent`)은 0..100 이다. 모든 코어를 합쳐 idle 이 아니었던 비율.
- **프로세스별**(`cpuPercent`)은 `top` 과 같다. 코어 1개가 100%, 4코어 기기에서 400 까지 간다.

두 숫자의 자릿수가 다른 것은 의도다. 프로세스를 기계 전체 대비로 환산하면 4코어에서 한 프로세스가 아무리 태워도 25% 로 보여 "한 코어를 꽉 잡고 있다" 는 사실이 사라진다.

### 2.5 사용 중 메모리 = total - available

`free` 도 이렇게 센다. 커널이 언제든 회수할 수 있는 페이지 캐시를 "사용 중" 으로 세면 리눅스는 언제나 90% 를 넘게 쓴 것처럼 보인다. `Cached`/`Buffers` 는 따로 표시한다.

## 3. 산출물

- `src/domain/system.ts` — `SystemMetrics` · `CpuMetrics` · `MemoryMetrics` · `ProcessSample`
- `src/repositories/system.repository.ts` — /proc 읽기 + 순수 파서
- `src/repositories/system.repository.test.ts` — 파서 테스트(실측 문자열) + 실제 /proc 스모크
- `src/services/system.service.ts` — 스냅샷 두 장의 차이 → 지표, 표본 캐시
- `src/services/system.service.test.ts` — `buildMetrics` 순수 계산 테스트
- `src/routes/system.route.ts` — `GET /api/system`
- `src/web/hooks/use-poll.ts` — 탭이 보일 때만 도는 폴링 훅
- `src/web/components/meter.tsx` — 용량 대비 게이지 · 코어별 막대
- `src/web/components/process-table.tsx` — 상위 프로세스 목록
- `src/web/pages/system.page.tsx` — `/system` 화면
- `src/web/pages/dashboard.page.tsx` — 대시보드 "시스템" 카드
- `src/config.ts` — `SYSTEM_SAMPLE_MS` · `SYSTEM_CACHE_MS`

## 4. 상세 명세

### 4.1 표본 하나 만들기

- 스냅샷을 뜬다(`/proc/stat` + 모든 `/proc/<pid>/stat`).
- 직전 스냅샷이 **200ms ~ 60초** 사이면 그것을 기준점으로 쓴다. 추가 대기가 없다.
- 아니면 방금 뜬 것을 기준점으로 삼고 `SYSTEM_SAMPLE_MS`(기본 400ms) 뒤에 한 번 더 뜬다.
- 차이를 지표로 접고, 상위 목록의 명령줄을 채운다.

60초 상한을 두는 이유는 그보다 오래된 기준점과 비교하면 "지금" 이 아니라 "그동안의 평균" 이 나오기 때문이다. 200ms 하한은 두 요청이 겹쳤을 때 표본이 잡음이 되는 것을 막는다.

`SYSTEM_CACHE_MS`(기본 1초) 안에 들어온 요청은 같은 표본을 받는다. 탭 두 개가 각자 폴링해도 /proc 훑기는 초당 한 번이다.

### 4.2 API

`GET /api/system?limit=20` — 목록 봉투를 씌우지 않는다. 목록 두 개가 딸린 단건 스냅샷이다. 자세한 필드는 `docs/ENDPOINTS.md`.

`limit` 은 1..100 이고 두 목록에 함께 적용된다. 리눅스가 아니면 `supported: false` 와 0/빈 배열을 돌려준다 — 에러가 아니다.

### 4.3 화면

- `/system` — 타일(CPU·메모리·부하·온도·프로세스 수·가동 시간), CPU 카드(전체 게이지 + 코어별 막대), 메모리 카드(게이지 + 스왑 + 세부), 상위 20 두 카드.
- 대시보드 — "시스템" 카드에 게이지 둘. `limit=1` 로 받아 목록은 가져오지 않는다.
- **폴링한다.** `/system` 은 3초, 대시보드 카드는 5초. 탭이 숨겨지면 멈추고 돌아오면 즉시 한 번 부른다. 성능 화면은 CONVENTIONS §10.1 의 "분석 화면은 자동 갱신하지 않는다" 의 예외다 — 1분 전 CPU 사용률은 볼 이유가 없다.
- 상위 목록의 막대는 **목록 안 최댓값** 기준이다. CPU 를 전체 용량(코어 수 × 100) 대비로 그리면 막대가 전부 보이지 않는다.

## 5. 수용 기준

- [x] `GET /api/system` 이 CPU·메모리·상위 20 두 목록을 준다.
- [x] 프로세스별 CPU 가 수명 평균이 아니라 **직전 구간**의 사용률이다.
- [x] 이름에 공백·괄호가 든 프로세스에서 필드가 밀리지 않는다.
- [x] 프로세스가 읽는 도중 사라져도 응답이 실패하지 않는다.
- [x] 리눅스가 아닌 곳에서 500 이 아니라 `supported: false` 다.
- [x] 대시보드와 `/system` 이 자동으로 갱신되고, 탭이 숨겨지면 멈춘다.
- [x] 색은 토큰만 쓴다. 라이트/다크 모두 대응.
- [x] `bun run check` 통과.

## 6. 검증

```bash
bun test src/repositories/system.repository.test.ts src/services/system.service.test.ts
bun run check
curl -s localhost:4317/api/system?limit=3
```

브라우저에서: `/system` 의 게이지가 3초마다 움직이는지, 다른 탭에 다녀오면 즉시 갱신되는지, 상위 목록의 이름 위에 전체 명령줄 툴팁이 뜨는지.

## 7. 완료 처리

- `docs/STRUCTURE.md` 트리·환경변수 표 갱신.
- `docs/ENDPOINTS.md` 에 `GET /api/system` 추가.
- `docs/CONVENTIONS.md` §1(node:fs 예외)·§10.1(폴링 예외) 갱신.
- `README.md` 기능 목록·화면 표·설정 표 갱신.
- `docs/TODO.md` 에 append: `<UTC-ISO> DONE T-026`.
