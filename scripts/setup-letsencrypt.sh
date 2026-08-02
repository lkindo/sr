#!/bin/bash
set -e

echo "Checking DNS resolution for lkindo.kr, sr.lkindo.kr and test.lkindo.kr..."
if ! nslookup lkindo.kr 8.8.8.8 > /dev/null 2>&1; then
  echo "Error: lkindo.kr does not resolve yet."
  exit 1
fi
if ! nslookup sr.lkindo.kr 8.8.8.8 > /dev/null 2>&1; then
  echo "Error: sr.lkindo.kr does not resolve yet. Please wait for DNS propagation."
  exit 1
fi
if ! nslookup test.lkindo.kr 8.8.8.8 > /dev/null 2>&1; then
  echo "Error: test.lkindo.kr does not resolve yet. Please wait for DNS propagation."
  exit 1
fi

echo "Creating acme-challenge directory..."
mkdir -p /home/opc/sr/nginx/html/.well-known/acme-challenge

echo "Issuing SSL certificate via Certbot for multiple domains..."
docker run --rm \
  -v /home/opc/sr/nginx/certs:/etc/letsencrypt \
  -v /home/opc/sr/nginx/html:/usr/share/nginx/html \
  certbot/certbot certonly --webroot \
  --webroot-path=/usr/share/nginx/html \
  --cert-name lkindo.kr \
  -d lkindo.kr -d www.lkindo.kr -d sr.lkindo.kr -d test.lkindo.kr \
  --email lkind@naver.com --agree-tos --no-eff-email --keep-until-expiring \
  --expand --non-interactive

echo "Copying issued certificates to Nginx production certs directory..."

# 예전 코드:
#   LATEST_DIR=$(sudo ls -td .../live/lkindo.kr* | head -n 1)
# 파이프라인의 종료 코드는 마지막 명령(head)의 것이라 `ls` 가 실패해도 0 이다.
# 그래서 `set -e` 가 걸리지 않고 LATEST_DIR 이 빈 채로 진행해
# `cp "/fullchain.pem"` 이라는 뜻 모를 오류로 배포가 죽었다(2026-08-02 운영 배포 실패).
#
# 이제 (1) --cert-name 으로 lineage 이름을 고정하고, (2) 못 찾으면 그 사실을 명시적으로
# 다룬다. 이름이 다른 lineage 가 이미 있을 수 있으므로 폴백으로 최신 디렉터리도 본다.
CERTS_LIVE="/home/opc/sr/nginx/certs/live"
LATEST_DIR=""

if sudo test -f "${CERTS_LIVE}/lkindo.kr/fullchain.pem"; then
  LATEST_DIR="${CERTS_LIVE}/lkindo.kr"
else
  # --cert-name 적용 전에 발급된 lineage(예: sr.lkindo.kr, lkindo.kr-0001) 폴백.
  LATEST_DIR="$(sudo sh -c "ls -td ${CERTS_LIVE}/*/ 2>/dev/null" | head -n 1 || true)"
  LATEST_DIR="${LATEST_DIR%/}"
fi

echo "Resolved latest cert directory: ${LATEST_DIR:-(none)}"

if [ -n "$LATEST_DIR" ] && sudo test -f "${LATEST_DIR}/fullchain.pem"; then
  sudo cp -f "${LATEST_DIR}/fullchain.pem" /home/opc/sr/nginx/certs/server.crt
  sudo cp -f "${LATEST_DIR}/privkey.pem" /home/opc/sr/nginx/certs/server.key
elif sudo test -s /home/opc/sr/nginx/certs/server.crt; then
  # lineage 를 못 찾았지만 nginx 는 이미 인증서를 들고 서비스 중이다.
  # 여기서 배포를 죽이면 **앱 배포가 이미 끝난 뒤** 실패로 보고되어 혼란만 준다.
  # 크게 경고하고 넘어간다 — 만료 감시는 renew-letsencrypt.sh 와 모니터링의 몫이다.
  echo "::warning::인증서 lineage 를 찾지 못했습니다(${CERTS_LIVE}). 기존 server.crt 를 유지합니다."
  sudo sh -c "ls -la ${CERTS_LIVE} 2>&1" || true
else
  echo "Error: 인증서 lineage 도 기존 server.crt 도 없습니다. nginx 가 TLS 를 제공할 수 없습니다." >&2
  sudo sh -c "ls -la ${CERTS_LIVE} 2>&1" || true
  exit 1
fi

sudo chmod 644 /home/opc/sr/nginx/certs/server.crt
sudo chmod 600 /home/opc/sr/nginx/certs/server.key

echo "Restarting Nginx to apply new official SSL certificate..."
docker compose -f /home/opc/sr/docker-compose.prod.yml restart nginx

echo "SSL Certificate issued and applied successfully!"
