#!/bin/sh

# 데이터베이스 연결 대기 (선택 사항, 필요 시 nc 등 사용)
# echo "Waiting for database to be ready..."

# Prisma 마이그레이션 실행
echo "Running prisma migrate deploy..."
# 운영 환경에서는 migrate deploy가 권장됩니다.
# 마이그레이션 파일이 없는 초기 구축 단계라면 db push를 사용하세요.
npx prisma migrate deploy || npx prisma db push --accept-data-loss

# 메인 프로세스 실행
exec "$@"
