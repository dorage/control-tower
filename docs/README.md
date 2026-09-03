# control-tower 문서

웹으로 보는 로컬 관제탑(control tower). 세 가지를 한 화면에서 제공한다.

1. **파일 탐색기** — 설정된 워크스페이스 루트의 디렉터리 트리를 본다.
2. **마크다운 에디터** — `.md` 파일을 열어 편집·저장한다.
3. **세션 뷰** — `~/.claude` 아래의 Claude Code 세션을 목록/타임라인으로 본다.

Bun(`Bun.serve`) 하나로 API와 프론트엔드를 함께 서빙한다.

## 문서 지도

| 문서 | 내용 | 갱신 시점 |
| --- | --- | --- |
| [TODO.md](./TODO.md) | 작업 로그(AppendOnlyLog). 한 줄 = 한 이벤트 | 작업 상태가 바뀔 때마다 append |
| [todos/](./todos/) | 작업 단위별 자기완결 명세 | 작업 정의/변경 시 |
| [CONVENTIONS.md](./CONVENTIONS.md) | 코드·네이밍·구조 컨벤션 | 모든 작업 완료 시 |
| [STRUCTURE.md](./STRUCTURE.md) | 프로젝트 디렉터리 구조와 계층 규칙 | 모든 작업 완료 시 |
| [ENDPOINTS.md](./ENDPOINTS.md) | HTTP 엔드포인트 명세 | 모든 작업 완료 시 |

## 작업 절차

1. `docs/TODO.md`에서 다음 작업 ID를 고른다. 선행 작업이 `DONE`인지 확인한다.
2. `docs/todos/<ID>-*.md`를 읽는다. 그 문서 하나로 작업이 완결되어야 한다. 부족하면 문서를 먼저 고친다.
3. `TODO.md`에 `START` 줄을 append 한다.
4. 구현한다.
5. 수용 기준과 검증 명령을 모두 통과시킨다.
6. **CONVENTIONS / STRUCTURE / ENDPOINTS 세 문서를 갱신하고 `bun run check` 를 통과시킨다.** (변경 없음이면 "변경 없음"을 확인만 하고 넘어간다)
7. `TODO.md`에 `DONE` 줄을 append 한다.

## 실행

```bash
bun install
bun run dev        # 실행 (--hot)
bun run start      # 실행 (--hot). dev 와 같다
bun run start:prod # 핫 리로드 없이 실행 (NODE_ENV=production)
bun test           # 테스트
bun run check      # 타입 체크 + 테스트 (작업 완료 전 이걸 통과시킨다)
bunx tsc --noEmit  # 타입 체크만
```

`--hot`은 CLI 플래그로만 켤 수 있다(`bunfig.toml`에 스위치가 없다). 그래서 기본 실행 스크립트에 박아 둔다.
서버 파일을 고치면 프로세스 재시작 없이 `fetch` 핸들러가 다시 로드되고, `src/web/*`는 `Bun.serve`의
`development.hmr`이 따로 처리한다. 모듈 최상단 상태(캐시, `startedAt`)는 리로드 때 초기화된다.

기본 주소: `http://localhost:4317`

## 자동 배포

`origin/main` 이 움직이면 1분 안에 받아서 검사하고 서비스를 다시 띄운다. systemd 유저 타이머가
1분마다 `git fetch` 한 번을 하는 것이 전부다. 밖으로 여는 포트가 없고, 저장소가 공개라
자격증명도 필요 없다.

구성은 넷이다.

- `control-tower.service` — 서버 본체. **`--hot` 을 쓰지 않는다.** `--hot` 은 이미 로드된
  파일의 변경만 따라가서, 브랜치 머지처럼 파일이 새로 생기는 변경 뒤에는 라우트는 등록됐는데
  핸들러가 돌지 않는 상태가 된다(2026-09-03 실측). 갱신은 재시작으로 한다
- `control-tower-deploy.timer` — 1분마다 아래 서비스를 깨운다
- `control-tower-deploy.service` — `Type=oneshot`. 배포 스크립트를 한 번 실행한다
- `~/.local/bin/control-tower-deploy` — `scripts/deploy.sh` 의 **사본**

스크립트를 저장소 밖에서 실행하는 이유는, 저장소 안의 파일을 그대로 돌리면 배포가 자기 자신을
갱신하는 셈이 되기 때문이다. `scripts/deploy.sh` 를 고쳤으면 사본을 다시 만든다.

### 설치

```bash
cp scripts/deploy.sh ~/.local/bin/control-tower-deploy
chmod +x ~/.local/bin/control-tower-deploy
systemctl --user daemon-reload
systemctl --user enable --now control-tower-deploy.timer
```

유닛 파일은 `~/.config/systemd/user/` 에 있다. 기계를 새로 세운다면 `loginctl enable-linger`
까지 해 둬야 로그아웃 뒤에도 돈다.

### 안전망

배포는 네 군데서 멈춘다.

- 작업 트리가 깨끗하지 않으면 아무것도 하지 않는다. 자동 배포가 사람 작업을 덮지 않는다
- fast-forward 가 아니면 합치지 않고 멈춰 사람을 부른다
- `bun run check` 를 통과해야 재시작한다. 실패하면 직전 커밋으로 되돌리고, **그 커밋 SHA 를
  적어 둬 1분마다 같은 실패를 반복하지 않는다**(`~/.cache/control-tower-deploy.failed`)
- 재시작 후 20초 안에 `/api/health` 가 살아나지 않으면 직전 커밋으로 되돌려 다시 띄운다

헬스체크가 `/api/health` 하나만 보는 것은 알고 있는 한계다. 특정 API 만 죽은 상태는 잡지
못한다. 다만 배포마다 프로세스를 새로 띄우므로 `--hot` 이 만들던 그 상태는 생기지 않는다.

### 확인과 끄기

```bash
systemctl --user list-timers control-tower-deploy.timer
journalctl --user -u control-tower-deploy -n 50   # 배포 기록
systemctl --user start control-tower-deploy       # 기다리지 않고 지금 배포
systemctl --user disable --now control-tower-deploy.timer   # 자동 배포 끄기
```

## 텔레메트리 수집 (선택)

Claude Code 의 OpenTelemetry 내보내기를 control-tower 가 직접 받는다. 켜면 트랜스크립트로는 알 수 없는 것들이 보인다 — 실제 달러 비용, 그리고 `query_source` 별 토큰 귀속(실제 작업 대 세션 제목 생성 같은 오버헤드).

**소급되지 않는다.** 켠 순간부터의 데이터만 쌓인다. 과거 분석은 트랜스크립트 기반 화면이 담당한다.

`~/.claude/settings.json` 의 `env` 에 넣고 claude 를 새로 시작한다.

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4317",
    "OTEL_METRIC_EXPORT_INTERVAL": "10000"
  }
}
```

랩퍼 스크립트나 `otelHeadersHelper` 는 필요 없다. 로컬 수신이라 인증이 없다.

### 반드시 지킬 것 두 가지

**1. `OTEL_EXPORTER_OTLP_PROTOCOL` 을 빼면 안 된다.**
4317 은 OTLP **gRPC** 의 기본 포트이기도 하다. 이 값을 생략하면 기본 프로토콜이 `grpc` 가 되어 claude 가 HTTP 서버에 gRPC 로 말하고 **완전히 조용히** 실패한다. 화면에 에러가 없고 `claude --debug` 출력에도 흔적이 남지 않는다.

확인 방법은 이것뿐이다.

```bash
curl -s localhost:4317/api/telemetry/status
# collecting 이 계속 false 면 도달하지 못하고 있는 것이다
```

**2. `OTEL_METRIC_EXPORT_INTERVAL` 을 10000 미만으로 내리지 않는다.**
기본값은 60000 이고, 10000 으로 올리는 것까지가 안전선이다. 1000 으로 내리면 저장량이 약 47배가 된다. 상한(`TEL_HARD_LIMIT_BYTES`, 기본 4 GiB)에 걸리면 오래된 데이터가 강제로 삭제되고, SD 카드 쓰기도 낭비된다.

### 보존 정책

| 계층 | 해상도 | 기본 보존 |
| --- | --- | --- |
| 원본 데이터포인트 | export 간격 | 30일 |
| 시간 롤업 | 1시간 | 400일 |
| 일 롤업 | 1일 | 3650일 |
| 요청 단위 | 요청 1건 | 400일 |

실측 기준(하루 수백 요청) 전체가 20 MiB 미만이고, 병렬 8세션을 24시간 돌리는 최악의 경우에도 1.06 GiB 다. 보존 기간과 상한은 `TEL_*` 환경변수로 조정한다([STRUCTURE.md](./STRUCTURE.md) 설정 표).

저장 위치는 기본 `$HOME/.control-tower/telemetry.db` 다. **`CLAUDE_HOME` 아래로 옮기면 안 된다** — 감시 대상 디렉터리에 우리 파일을 쓰면 매 insert 마다 변경 이벤트가 발생한다.

수집을 끄려면 `TELEMETRY_ENABLED=0` 으로 서버를 띄운다. 이 경우 DB 파일도 만들지 않는다.
