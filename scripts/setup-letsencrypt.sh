#!/bin/bash
set -e

echo "Checking DNS resolution for lkindo.kr and test.lkindo.kr..."
if ! nslookup lkindo.kr 8.8.8.8 > /dev/null 2>&1; then
  echo "Error: lkindo.kr does not resolve yet."
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
  -d lkindo.kr -d www.lkindo.kr -d test.lkindo.kr \
  --email lkind@naver.com --agree-tos --no-eff-email --keep-until-expiring

echo "Copying issued certificates to Nginx production certs directory..."
# live/ 디렉토리 아래의 lkindo.kr* 패턴 디렉토리 중 가장 최근에 변경된 최신 경로 탐색 (절대 경로 지정)
LATEST_DIR=$(ls -td /home/opc/sr/nginx/certs/live/lkindo.kr* | head -n 1)
echo "Resolved latest cert directory: ${LATEST_DIR}"

sudo cp -f "${LATEST_DIR}/fullchain.pem" /home/opc/sr/nginx/certs/server.crt
sudo cp -f "${LATEST_DIR}/privkey.pem" /home/opc/sr/nginx/certs/server.key

sudo chmod 644 /home/opc/sr/nginx/certs/server.crt
sudo chmod 600 /home/opc/sr/nginx/certs/server.key

echo "Restarting Nginx to apply new official SSL certificate..."
docker compose -f /home/opc/sr/docker-compose.prod.yml restart nginx

echo "SSL Certificate issued and applied successfully!"
