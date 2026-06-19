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
mkdir -p nginx/html/.well-known/acme-challenge

echo "Issuing SSL certificate via Certbot for multiple domains..."
docker run --rm \
  -v /home/opc/sr/nginx/certs:/etc/letsencrypt \
  -v /home/opc/sr/nginx/html:/usr/share/nginx/html \
  certbot/certbot certonly --webroot \
  --webroot-path=/usr/share/nginx/html \
  -d lkindo.kr -d www.lkindo.kr -d test.lkindo.kr \
  --email lkind@naver.com --agree-tos --no-eff-email --keep-until-expiring

echo "Copying issued certificates to Nginx production certs directory..."
sudo cp -f nginx/certs/live/lkindo.kr/fullchain.pem nginx/certs/server.crt
sudo cp -f nginx/certs/live/lkindo.kr/privkey.pem nginx/certs/server.key

sudo chmod 644 nginx/certs/server.crt
sudo chmod 600 nginx/certs/server.key

echo "Restarting Nginx to apply new official SSL certificate..."
docker compose -f docker-compose.prod.yml restart nginx

echo "SSL Certificate issued and applied successfully!"
