#!/usr/bin/env bash
#
# SR 시스템 복구 스크립트 (프로덕션 서버에서 실행)
#
# 사용법:
#   scripts/restore.sh <db_dump_file> [uploads_tar_gz]
# 예:
#   scripts/restore.sh /home/opc/sr/backups/db_20260703_030000.dump \
#                       /home/opc/sr/backups/uploads_20260703_030000.tar.gz
#
# 주의: 대상 DB의 기존 객체를 덮어쓴다(파괴적). 기본적으로 확인 입력을 요구한다.
#       자동화에서는 FORCE=1 로 확인을 생략할 수 있다.
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-sr-db}"
APP_CONTAINER="${APP_CONTAINER:-sr-app}"
DB_USER="${POSTGRES_USER:-lkind}"
DB_NAME="${POSTGRES_DB:-sr_db}"
UPLOADS_DIR="${UPLOADS_DIR:-/app/var/uploads}"

db_file="${1:?db dump file required}"
up_file="${2:-}"

[ -f "$db_file" ] || { echo "not found: $db_file" >&2; exit 1; }

echo "!! 경고: 데이터베이스 '$DB_NAME' 을(를) 다음 백업으로 덮어씁니다:"
echo "     DB      : $db_file"
[ -n "$up_file" ] && echo "     uploads : $up_file"
if [ "${FORCE:-}" != "1" ]; then
  read -r -p "계속하려면 정확히 'RESTORE' 를 입력하세요: " confirm
  [ "$confirm" = "RESTORE" ] || { echo "취소됨"; exit 1; }
fi

echo "[restore] pg_restore (--clean --if-exists)"
if [ -n "${POSTGRES_PASSWORD:-}" ]; then
  docker exec -e "PGPASSWORD=${POSTGRES_PASSWORD}" -i "$DB_CONTAINER" \
    pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --no-privileges <"$db_file"
else
  docker exec -i "$DB_CONTAINER" \
    pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --no-privileges <"$db_file"
fi

if [ -n "$up_file" ]; then
  [ -f "$up_file" ] || { echo "not found: $up_file" >&2; exit 1; }
  echo "[restore] uploads -> $UPLOADS_DIR"
  docker exec -i "$APP_CONTAINER" sh -c "mkdir -p '$UPLOADS_DIR' && tar xzf - -C '$UPLOADS_DIR'" <"$up_file"
fi

echo "[restore] done. 앱 컨테이너를 재시작하는 것을 권장합니다: docker restart $APP_CONTAINER"
