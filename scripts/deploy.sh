#!/usr/bin/env bash
#
# origin/main 이 움직였으면 받아서 검사하고 서비스를 다시 띄운다.
#
# 실행되는 것은 이 파일이 아니라 ~/.local/bin/control-tower-deploy 로 복사된 사본이다.
# 저장소 안의 파일을 그대로 실행하면 자기 자신을 갱신하는 스크립트가 된다.
# 이 파일을 고쳤으면 docs/README.md 의 "자동 배포" 절을 따라 다시 복사한다.
#
# systemd 타이머(control-tower-deploy.timer)가 1분마다 부른다. 출력은 journald 로 간다:
#   journalctl --user -u control-tower-deploy -n 50
set -euo pipefail

REPO=${CT_REPO:-/home/dorage/workspace/control-tower}
UNIT=${CT_UNIT:-control-tower.service}
HEALTH=${CT_HEALTH:-http://localhost:4317/api/health}
# 검사에 실패한 커밋을 적어 둔다. 같은 커밋을 1분마다 다시 받아 검사하지 않기 위해서다.
FAILED_MARK=${CT_FAILED_MARK:-$HOME/.cache/control-tower-deploy.failed}

export PATH="$HOME/.bun/bin:$PATH"
cd "$REPO"

log() { echo "[deploy] $*"; }

# 사람이 손대고 있는 중이면 아무것도 하지 않는다. 자동 배포가 작업을 덮지 않게.
if [ -n "$(git status --porcelain)" ]; then
  log "작업 트리가 깨끗하지 않다. 넘어간다."
  exit 0
fi

git fetch --quiet origin main
before=$(git rev-parse HEAD)
after=$(git rev-parse origin/main)

if [ "$before" = "$after" ]; then
  exit 0
fi

# 이미 검사에서 떨어진 커밋이면 조용히 넘어간다. main 이 고쳐지면 SHA 가 달라져 다시 시도한다.
if [ -f "$FAILED_MARK" ] && [ "$(cat "$FAILED_MARK")" = "$after" ]; then
  exit 0
fi

log "$before -> $after"

# --ff-only: 로컬 커밋이 있어 히스토리가 갈라졌으면 합치지 않고 멈춘다.
if ! git merge --ff-only origin/main; then
  log "fast-forward 가 아니다. 사람이 봐야 한다."
  exit 1
fi

bun install --frozen-lockfile

if ! bun run check; then
  log "check 실패. 되돌리고 배포하지 않는다."
  git reset --hard "$before"
  mkdir -p "$(dirname "$FAILED_MARK")"
  echo "$after" > "$FAILED_MARK"
  exit 1
fi
rm -f "$FAILED_MARK"

# 여기서부터가 진짜 배포다. --hot 에 맡기지 않고 프로세스를 새로 띄운다.
systemctl --user restart "$UNIT"

for _ in $(seq 1 20); do
  if curl -fsS -m 2 "$HEALTH" > /dev/null 2>&1; then
    log "배포 완료 $after"
    exit 0
  fi
  sleep 1
done

log "20초 안에 살아나지 않았다. $before 로 되돌린다."
git reset --hard "$before"
bun install --frozen-lockfile
systemctl --user restart "$UNIT"
exit 1
