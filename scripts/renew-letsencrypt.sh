#!/bin/bash
#
# Let's Encrypt 인증서 갱신 (프로덕션 서버에서 cron 으로 주기 실행)
#
# 왜 별도 스크립트인가 (감사 3.29):
#   기존 `setup-letsencrypt.sh` 는 배포 워크플로에서만 호출됐다. Let's Encrypt 인증서는
#   90일 유효하므로, 유지보수 모드로 90일간 배포가 없으면 lkindo.kr / www / sr / test
#   전 도메인에서 브라우저 하드 TLS 인터스티셜이 뜬다. 배포 주기와 무관한 갱신 경로가 필요하다.
#
# 안전성:
#   - `certbot renew` 는 만기 30일 전이 아니면 아무것도 하지 않는다(no-op). 매일 돌려도 안전하다.
#   - nginx 는 `restart` 가 아니라 `-s reload` 로 무중단 갱신한다. 실제로 인증서가 바뀐 경우에만.
#   - Let's Encrypt 레이트리밋(도메인당 주 5회)에 걸리지 않도록 강제 갱신은 하지 않는다.
#
# 설치 (호스트에서 1회, deploy.yml 이 자동 수행):
#   0 3 * * * /home/opc/sr/scripts/renew-letsencrypt.sh >> /home/opc/sr/var/certbot-renew.log 2>&1
#
# 종료코드 0=성공(갱신했거나 갱신 불필요), 1=실패.
set -euo pipefail

BASE_DIR="${BASE_DIR:-/home/opc/sr}"
CERTS_DIR="$BASE_DIR/nginx/certs"
WEBROOT_DIR="$BASE_DIR/nginx/html"
LIVE_GLOB="$CERTS_DIR/live/lkindo.kr*"
TARGET_CRT="$CERTS_DIR/server.crt"
NGINX_CONTAINER="${NGINX_CONTAINER:-sr-nginx}"

log() { echo "[$(date -Is)] $*"; }

# 현재 배포된 인증서의 지문. 갱신 여부 판단에만 쓴다.
fingerprint() {
  if [ -f "$1" ]; then
    openssl x509 -in "$1" -noout -fingerprint -sha256 2>/dev/null || echo "unreadable"
  else
    echo "absent"
  fi
}

log "certbot renew 시작"

before="$(fingerprint "$TARGET_CRT")"

# `--webroot` 갱신. 도메인 목록은 최초 발급 시 저장된 renewal 설정을 따르므로 여기서 다시 적지 않는다.
docker run --rm \
  -v "$CERTS_DIR:/etc/letsencrypt" \
  -v "$WEBROOT_DIR:/usr/share/nginx/html" \
  certbot/certbot renew \
  --webroot --webroot-path=/usr/share/nginx/html \
  --non-interactive --quiet

# live/ 아래 최신 디렉터리에서 배포 위치로 복사한다.
# (nginx 는 server.crt / server.key 만 바라보므로 live/ 심볼릭 링크를 직접 쓰지 않는다)
if ! LATEST_DIR="$(ls -td $LIVE_GLOB 2>/dev/null | head -n 1)" || [ -z "$LATEST_DIR" ]; then
  log "ERROR: live 인증서 디렉터리를 찾지 못했습니다. 최초 발급이 되어 있는지 확인하세요."
  exit 1
fi

new_fingerprint="$(fingerprint "$LATEST_DIR/fullchain.pem")"

if [ "$before" = "$new_fingerprint" ]; then
  log "인증서 변경 없음(만기 30일 전이 아님). nginx 를 건드리지 않습니다."
  exit 0
fi

log "새 인증서 감지 — 배포 위치로 복사합니다: $LATEST_DIR"
cp -f "$LATEST_DIR/fullchain.pem" "$TARGET_CRT"
cp -f "$LATEST_DIR/privkey.pem" "$CERTS_DIR/server.key"
chmod 644 "$TARGET_CRT"
chmod 600 "$CERTS_DIR/server.key"

# restart 가 아니라 reload — 기존 연결을 끊지 않는다.
log "nginx 설정 리로드"
if ! docker exec "$NGINX_CONTAINER" nginx -s reload; then
  log "ERROR: nginx reload 실패. 인증서는 복사됐으나 적용되지 않았습니다."
  exit 1
fi

log "인증서 갱신 완료"
