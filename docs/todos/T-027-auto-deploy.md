# T-027 — origin/main 추적 자동 배포

- **ID** — T-027
- **우선순위** — P2
- **영역** — core
- **선행** — 없음
- **후행** — 없음

## 1. 목적

`main` 에 머지하면 이 기계의 관제탑이 알아서 최신이 되게 한다. 지금은 사람이 SSH 로 들어가 pull 하고 재시작해야 하고, 그 재시작을 잊으면 화면이 조용히 깨진다(T-026 에서 실제로 겪었다).

## 2. 전제와 판단

### 2.1 이 프로젝트에 빌드 단계는 없다

Bun 이 요청 때 번들한다. 미리 만들어 둘 산출물이 없어서 "배포" 는 받기·검사·재시작 셋이다.

### 2.2 `--hot` 을 자동 배포와 함께 쓰지 않는다

`--hot` 은 **이미 로드된 파일**의 변경만 따라간다. 브랜치 머지처럼 파일이 새로 생기는 변경 뒤에는 라우트는 등록됐는데 핸들러가 돌지 않는 상태가 된다(2026-09-03 실측: `/api/system` 만 12초 뒤 빈 응답, strace 로 그 12초 동안 `/proc/<pid>/stat` 읽기 0건). 자동 배포를 넣으면서 `control-tower.service` 에서 `--hot` 을 뺐다. 코드를 고쳐가며 보는 일은 워크트리에서 다른 포트로 한다.

`NODE_ENV` 는 여전히 설정하지 않는다 — `Bun.serve` 의 `development.hmr` 은 켜진 채로 둔다. 브라우저 쪽 갱신이고 이번 문제와 무관하다.

### 2.3 폴링을 고른 이유

webhook 은 즉시 반응하지만 밖으로 포트를 열어야 한다. 이 프로젝트는 인증이 범위 밖이라고 못 박혀 있다(CONVENTIONS §9). GitHub Actions self-hosted runner 는 아웃바운드만 쓰지만 러너가 상시 떠 있어야 하고 설정이 무겁다.

폴링은 이미 systemd 위에 있는 이 기계에 개념을 하나도 더하지 않는다. 저장소가 공개라 자격증명도 없다. 값은 1분의 지연인데, 단일 사용자 로컬 도구에서 문제가 되지 않는다.

### 2.4 스크립트를 저장소 밖에서 실행한다

`~/.local/bin/control-tower-deploy` 는 `scripts/deploy.sh` 의 사본이다. 저장소 안의 파일을 직접 실행하면 배포가 자기 자신을 갱신하는 셈이 된다. 대신 스크립트를 고쳤을 때 사본을 다시 만드는 것은 사람 몫이고, 그 절차를 `docs/README.md` 에 적었다.

## 3. 산출물

- `scripts/deploy.sh` — 받기·검사·재시작·롤백
- `~/.config/systemd/user/control-tower-deploy.service` — `Type=oneshot`
- `~/.config/systemd/user/control-tower-deploy.timer` — 1분 주기
- `~/.config/systemd/user/control-tower.service` — `--hot` 제거 (백업: `.bak-20260903`)
- `docs/README.md` — 자동 배포 절

## 4. 상세 명세

배포 스크립트는 이 순서로 멈춘다.

- 작업 트리가 깨끗하지 않으면 종료. 사람이 손대는 중인 저장소를 자동 배포가 덮지 않는다
- `git fetch` 후 `HEAD == origin/main` 이면 종료. 평소에는 여기까지가 전부다
- 직전에 검사에서 떨어진 커밋과 같으면 종료. 이 표시(`~/.cache/control-tower-deploy.failed`)가 없으면 깨진 main 을 1분마다 받아 검사하고 되돌리기를 반복한다
- fast-forward 가 아니면 종료. 히스토리가 갈라진 것은 사람이 볼 일이다
- `bun run check` 실패면 직전 커밋으로 되돌리고 SHA 를 적어 둔다. 서비스는 건드리지 않았으므로 그대로 돈다
- 재시작 후 20초 안에 `/api/health` 가 안 살아나면 직전 커밋으로 되돌려 다시 띄운다

## 5. 수용 기준

- [x] `main` 에 푸시하면 1분 안에 서버가 새 코드로 재시작된다.
- [x] 사람이 원본 체크아웃에서 작업 중이면 자동 배포가 아무것도 하지 않는다.
- [x] `bun run check` 가 실패하는 커밋은 배포되지 않고, 같은 커밋을 반복해서 시도하지 않는다.
- [x] 재시작 후 서버가 살아나지 않으면 직전 커밋으로 되돌아간다.
- [x] 서비스가 `--hot` 없이 뜬다.
- [x] 타이머를 끄는 방법이 문서에 있다.

## 6. 검증

```bash
bash -n scripts/deploy.sh
systemd-analyze --user verify ~/.config/systemd/user/control-tower-deploy.timer
systemctl --user list-timers control-tower-deploy.timer
journalctl --user -u control-tower-deploy -n 50
```

## 7. 완료 처리

- `docs/README.md` 에 자동 배포 절 추가.
- `docs/STRUCTURE.md` 트리에 `scripts/deploy.sh` 추가.
- `docs/TODO.md` 에 append: `<UTC-ISO> DONE T-027`.
