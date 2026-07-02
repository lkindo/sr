#!/usr/bin/env bash
#
# SR 시스템 백업 스크립트 (프로덕션 서버에서 실행)
#
# - Postgres 논리 백업: docker exec sr-db pg_dump -Fc  (custom format, pg_restore 용)
# - 첨부파일 백업: docker exec sr-app 의 STORAGE_DIR(/app/var/uploads) 를 tar.gz
# - 보존기간 초과 백업 자동 삭제
#
# 주의(오프호스트): 아래 백업은 기본적으로 "서버 로컬"($BACKUP_DIR)에 저장된다.
#   실수 삭제/잘못된 마이그레이션/논리적 손상에는 충분하지만, "디스크 물리 장애"에는
#   같은 디스크라 무력하다. 반드시 오프호스트 복제를 추가하라(docs/backup-and-restore.md 참고).
#
# 환경변수로 재정의 가능. 종료코드 0=성공.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/opc/sr/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DB_CONTAINER="${DB_CONTAINER:-sr-db}"
APP_CONTAINER="${APP_CONTAINER:-sr-app}"
DB_USER="${POSTGRES_USER:-lkind}"
DB_NAME="${POSTGRES_DB:-sr_db}"
UPLOADS_DIR="${UPLOADS_DIR:-/app/var/uploads}"

ts="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
db_file="$BACKUP_DIR/db_${ts}.dump"
up_file="$BACKUP_DIR/uploads_${ts}.tar.gz"

# docker exec 는 반드시 -t 없이 사용한다(-t 는 pseudo-tty 로 바이너리 스트림을 손상시킴).
echo "[backup] pg_dump (custom format) -> $db_file"
# 로컬 소켓 trust 로 접속(healthcheck 의 pg_isready 와 동일). 필요 시 PGPASSWORD 를 전달.
if [ -n "${POSTGRES_PASSWORD:-}" ]; then
  docker exec -e "PGPASSWORD=${POSTGRES_PASSWORD}" "$DB_CONTAINER" \
    pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc >"$db_file"
else
  docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc >"$db_file"
fi

echo "[backup] uploads tar.gz -> $up_file"
docker exec "$APP_CONTAINER" sh -c "cd '$UPLOADS_DIR' 2>/dev/null && tar czf - . || true" >"$up_file"

# 최소 무결성 확인: DB 덤프가 비어 있으면 실패로 간주(백업이 조용히 깨지는 것 방지)
if [ ! -s "$db_file" ]; then
  echo "[backup] ERROR: DB dump is empty — aborting" >&2
  rm -f "$db_file"
  exit 1
fi
# pg_restore -l 로 덤프 목차를 읽어 유효성 재확인
if ! docker exec -i "$DB_CONTAINER" pg_restore -l >/dev/null 2>&1 <"$db_file"; then
  echo "[backup] ERROR: DB dump failed pg_restore -l validation — aborting" >&2
  exit 1
fi
if [ ! -s "$up_file" ]; then
  echo "[backup] WARN: uploads archive empty (no attachments yet?)"
fi

echo "[backup] pruning backups older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -maxdepth 1 -name 'db_*.dump' -type f -mtime "+${RETENTION_DAYS}" -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'uploads_*.tar.gz' -type f -mtime "+${RETENTION_DAYS}" -delete

db_size="$(du -h "$db_file" | cut -f1)"
up_size="$(du -h "$up_file" 2>/dev/null | cut -f1 || echo '0')"
echo "[backup] OK  db=${db_size}  uploads=${up_size}  dir=${BACKUP_DIR}"

# 오프호스트 복제 훅(선택): OFFSITE_CMD 가 설정되어 있으면 실행한다.
# 예: OFFSITE_CMD='rclone copy /home/opc/sr/backups remote:sr-backups'
if [ -n "${OFFSITE_CMD:-}" ]; then
  echo "[backup] offsite: $OFFSITE_CMD"
  eval "$OFFSITE_CMD"
fi
