#!/bin/sh
set -e

echo "=== Running Database Migrations ==="
migration_status=0
migration_output="$(prisma migrate deploy 2>&1)" || migration_status=$?
printf '%s\n' "$migration_output"

if [ "$migration_status" -ne 0 ]; then
    case "$migration_output" in
        *P3005*)
            if [ "${ALLOW_PRISMA_BASELINE:-}" != "1" ]; then
                echo "ERROR: P3005 detected, but automatic baselining is disabled." >&2
                echo "       Verify this is an existing schema matching 0_init, take a backup," >&2
                echo "       then run once with ALLOW_PRISMA_BASELINE=1." >&2
                exit "$migration_status"
            fi
            echo "P3005 confirmed and ALLOW_PRISMA_BASELINE=1; applying one-time 0_init baseline..."
            prisma migrate resolve --applied 0_init
            prisma migrate deploy
            ;;
        *)
            echo "ERROR: migration failed for a reason other than P3005; refusing to alter migration history." >&2
            exit "$migration_status"
            ;;
    esac
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
# 기준 데이터가 없으면 로그인/가입이 불가능하므로 실패를 정상 부팅으로 보고하지 않는다.
if [ -f prisma/seed.bundle.cjs ]; then
    echo "=== Seeding reference data ==="
    node prisma/seed.bundle.cjs
else
    echo "ERROR: prisma/seed.bundle.cjs 가 없습니다. 기준 데이터 없이 앱을 시작하지 않습니다." >&2
    exit 1
fi

# 메인 프로세스 실행
exec "$@"
