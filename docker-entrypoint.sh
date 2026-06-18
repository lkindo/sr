#!/bin/sh
set -e

echo "=== Running Database Migrations ==="
npx prisma migrate deploy

# 메인 프로세스 실행
exec "$@"
