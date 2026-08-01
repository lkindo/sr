#!/bin/sh
set -e

echo "=== Running Database Migrations ==="
if ! prisma migrate deploy; then
    echo "Migration failed (likely P3005), attempting to baseline with '0_init'..."
    prisma migrate resolve --applied 0_init
    echo "Retrying migration deploy..."
    prisma migrate deploy
fi

# === 기준 데이터 시딩 (감사 3.4) ===
#
# 마이그레이션에는 데이터가 없다. 역할·권한 행이 없으면 깨끗한 DB 로 배포했을 때
# 앱은 정상 부팅하지만 **아무도 로그인할 수 없고** 회원가입도 "시스템 설정 오류" 로 실패한다.
#
# 이 번들은 빌드 시 esbuild 로 만들어지며(Dockerfile 참고) 다음만 수행한다:
#   - permissions / roles / role_permissions upsert (멱등)
#   - BOOTSTRAP_ADMIN_* 가 설정되어 있고 ADMIN 이 하나도 없을 때만 관리자 1명 생성
#
# 개발용 픽스처(테스트 계정·샘플 SR)는 NODE_ENV=production 에서 실행되지 않는다.
# 시딩 실패로 부팅을 막지는 않는다 — DB 일시 오류로 앱 전체가 뜨지 못하는 쪽이 더 나쁘다.
if [ -f prisma/seed.bundle.cjs ]; then
    echo "=== Seeding reference data ==="
    node prisma/seed.bundle.cjs || echo "WARNING: 기준 데이터 시딩 실패 — 로그인 불가 상태일 수 있습니다."
else
    echo "WARNING: prisma/seed.bundle.cjs 가 없습니다. 기준 데이터 시딩을 건너뜁니다."
fi

# 메인 프로세스 실행
exec "$@"
