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
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

db_file="${1:?db dump file required}"
up_file="${2:-}"

[ -f "$db_file" ] || { echo "not found: $db_file" >&2; exit 1; }

# 파괴적 작업 전에 입력 자체를 검증한다. 잘못된 파일로 앱부터 내리지 않는다.
if ! docker exec -i "$DB_CONTAINER" pg_restore -l >/dev/null 2>&1 <"$db_file"; then
  echo "[restore] ERROR: invalid PostgreSQL custom dump: $db_file" >&2
  exit 1
fi

app_image="$(docker inspect -f '{{.Config.Image}}' "$APP_CONTAINER" 2>/dev/null || true)"
if [ -n "$up_file" ]; then
  [ -f "$up_file" ] || { echo "not found: $up_file" >&2; exit 1; }
  [ -n "$app_image" ] || { echo "[restore] ERROR: app container/image not found" >&2; exit 1; }
  archive_entries="$(docker run --rm -i --entrypoint tar "$app_image" tzf - <"$up_file")" || {
    echo "[restore] ERROR: invalid uploads archive: $up_file" >&2
    exit 1
  }
  if printf '%s\n' "$archive_entries" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
    echo "[restore] ERROR: uploads archive contains an unsafe path" >&2
    exit 1
  fi
fi

echo "!! 경고: 데이터베이스 '$DB_NAME' 을(를) 다음 백업으로 덮어씁니다:"
echo "     DB      : $db_file"
[ -n "$up_file" ] && echo "     uploads : $up_file"
if [ "${FORCE:-}" != "1" ]; then
  read -r -p "계속하려면 정확히 'RESTORE' 를 입력하세요: " confirm
  [ "$confirm" = "RESTORE" ] || { echo "취소됨"; exit 1; }
fi

# 복구 직전 현재 상태도 백업한다. 이 백업이 실패하면 기존 데이터를 덮어쓰지 않는다.
if [ "${SKIP_PRE_RESTORE_BACKUP:-}" != "1" ]; then
  echo "[restore] pre-restore backup"
  "$SCRIPT_DIR/backup.sh"
else
  echo "[restore] WARNING: SKIP_PRE_RESTORE_BACKUP=1 — pre-restore safety backup skipped"
fi

app_was_running="$(docker inspect -f '{{.State.Running}}' "$APP_CONTAINER" 2>/dev/null || echo false)"
restart_app() {
  if [ "$app_was_running" = "true" ] && \
     [ "$(docker inspect -f '{{.State.Running}}' "$APP_CONTAINER" 2>/dev/null || echo false)" != "true" ]; then
    echo "[restore] restarting app container"
    docker start "$APP_CONTAINER" >/dev/null || true
  fi
}
trap restart_app EXIT

if [ "$app_was_running" = "true" ]; then
  echo "[restore] stopping app to prevent writes during restore"
  docker stop -t 30 "$APP_CONTAINER" >/dev/null
fi

# 앱 외의 남은 연결도 종료해 --clean 복구가 잠금에 걸리지 않게 한다.
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -v target_db="$DB_NAME" -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :'target_db' AND pid <> pg_backend_pid();" \
  >/dev/null

echo "[restore] pg_restore (--clean --if-exists --exit-on-error)"
if [ -n "${POSTGRES_PASSWORD:-}" ]; then
  docker exec -e "PGPASSWORD=${POSTGRES_PASSWORD}" -i "$DB_CONTAINER" \
    pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --exit-on-error \
      --no-owner --no-privileges <"$db_file"
else
  docker exec -i "$DB_CONTAINER" \
    pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --exit-on-error \
      --no-owner --no-privileges <"$db_file"
fi

if [ -n "$up_file" ]; then
  echo "[restore] uploads -> $UPLOADS_DIR"
  case "$UPLOADS_DIR" in
    ''|'/'|'/app'|'/app/var')
      echo "[restore] ERROR: unsafe UPLOADS_DIR: $UPLOADS_DIR" >&2
      exit 1
      ;;
  esac
  docker run --rm -i --volumes-from "$APP_CONTAINER" --entrypoint sh "$app_image" -c \
    "set -eu; mkdir -p '$UPLOADS_DIR'; find '$UPLOADS_DIR' -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; tar xzf - -C '$UPLOADS_DIR'" \
    <"$up_file"
fi

restart_app
trap - EXIT

if [ "$app_was_running" = "true" ]; then
  waited=0
  until [ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$APP_CONTAINER" 2>/dev/null || echo missing)" = "healthy" ]; do
    sleep 3
    waited=$((waited + 3))
    if [ "$waited" -ge 180 ]; then
      echo "[restore] ERROR: app did not become healthy after restore" >&2
      docker logs "$APP_CONTAINER" --tail 80 2>&1 || true
      exit 1
    fi
  done
fi

echo "[restore] done. DB and uploads were restored while application writes were stopped."
