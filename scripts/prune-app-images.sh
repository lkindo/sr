#!/usr/bin/env bash
#
# 서버의 앱 이미지를 최근 N개(기본 2개)만 남기고 지운다.
#
# 예전 기준은 "7일이 지나면 지운다"였다. 시간 기준은 배포가 몰리면 막지 못한다. 2026-11-01~02 에
# 배포가 이어지면서 이미지가 쌓여 디스크가 이틀 만에 64% 에서 90% 로 올랐는데, 7일이 지난
# 이미지가 없어 prune 이 회수한 용량은 0B 였다. 그래서 개수로 자른다.
#
# 남기는 것:
#  - 불변 태그(커밋 SHA 등)가 붙은 앱 이미지 중 가장 최근 N개. 현재본과 직전본이다.
#  - 컨테이너가 쓰는 이미지 전부. 앱 이외의 이미지(certbot 등)도 건드리지 않는다.
# 지우는 것:
#  - 그 밖의 앱 이미지
#  - 어떤 태그도 없는 이미지. 이동 태그 `dev` 를 다시 pull 하면 이전 이미지가 이렇게 남는다.
#
# 사용법: scripts/prune-app-images.sh [keep] [repo]
set -euo pipefail

KEEP="${1:-2}"
REPO="${2:-ghcr.io/lkindo/sr}"
MOVING_TAG='dev'

case "$KEEP" in
  '' | *[!0-9]*)
    echo "ERROR: 보존 개수는 숫자여야 합니다: $KEEP" >&2
    exit 2
    ;;
esac
if [ "$KEEP" -lt 1 ]; then
  # 0 을 허용하면 컨테이너가 쓰지 않는 직전본까지 사라져 롤백 경로가 없어진다.
  echo "ERROR: 보존 개수는 1 이상이어야 합니다: $KEEP" >&2
  exit 2
fi

in_use="$(docker ps -aq | while read -r container; do
  docker inspect -f '{{.Image}}' "$container"
done)"

# 형식: 생성시각<TAB>이미지ID<TAB>태그. 생성시각은 같은 서버의 같은 시간대 문자열이라 사전순이 곧 시간순이다.
images="$(docker images --no-trunc --format '{{.CreatedAt}}	{{.ID}}	{{.Tag}}' "$REPO" |
  awk -F '\t' -v moving="$MOVING_TAG" '$3 != moving && $3 != "<none>"' |
  sort -r)"

kept=0
seen=''
while IFS="$(printf '\t')" read -r _created id _tag; do
  [ -n "$id" ] || continue
  case "$seen" in *" $id "*) continue ;; esac
  seen="$seen $id "

  if [ "$kept" -lt "$KEEP" ]; then
    kept=$((kept + 1))
    continue
  fi
  if printf '%s\n' "$in_use" | grep -Fxq "$id"; then
    continue
  fi

  # 한 이미지에 태그가 여럿일 수 있으므로(예: SHA 와 rollback) 태그별로 뗀다.
  printf '%s\n' "$images" | awk -F '\t' -v id="$id" '$2 == id { print $3 }' | while read -r tag; do
    docker rmi "$REPO:$tag"
  done
done <<EOF
$images
EOF

# -a 없이 돌려 태그 없는 이미지만 지운다. 컨테이너가 쓰는 이미지는 docker 가 건너뛴다.
docker image prune -f
