#!/bin/sh
set -e

echo "=== Running Database Migrations ==="
if ! prisma migrate deploy; then
    echo "Migration failed (likely P3005), attempting to baseline with '0_init'..."
    prisma migrate resolve --applied 0_init
    echo "Retrying migration deploy..."
    prisma migrate deploy
fi

# 메인 프로세스 실행
exec "$@"
