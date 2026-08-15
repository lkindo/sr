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

# 공개키 암호화 수신자(age 공개키 `age1...` 또는 gpg 키 ID/이메일).
# 설정되면 백업 산출물을 암호화하고 평문을 지운다(감사 3.31).
#
# **공개키 방식을 쓰는 이유**: 이 호스트에는 암호화 키만 두고 복호화 키는 두지 않는다.
# 서버가 침해되어도 과거 백업을 읽을 수 없다. 대칭키(passphrase)였다면 호스트에 있는
# 그 값으로 모든 백업이 복호화된다.
BACKUP_ENCRYPT_RECIPIENT="${BACKUP_ENCRYPT_RECIPIENT:-}"

ts="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
db_file="$BACKUP_DIR/db_${ts}.dump"
up_file="$BACKUP_DIR/uploads_${ts}.tar.gz"

# 실패한 실행의 부분 산출물이 다음 복구 때 정상 백업으로 오인되지 않게 치운다.
cleanup_incomplete() {
  rc=$?
  if [ "$rc" -ne 0 ]; then
    rm -f "$db_file" "$db_file.age" "$db_file.gpg" \
      "$up_file" "$up_file.age" "$up_file.gpg"
  fi
}
trap cleanup_incomplete EXIT

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
docker exec "$APP_CONTAINER" sh -c \
  "test -d '$UPLOADS_DIR' && cd '$UPLOADS_DIR' && tar czf - ." >"$up_file"

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
  echo "[backup] ERROR: uploads archive is empty — aborting" >&2
  exit 1
fi
if ! docker exec -i "$APP_CONTAINER" tar tzf - >/dev/null 2>&1 <"$up_file"; then
  echo "[backup] ERROR: uploads archive failed tar validation — aborting" >&2
  exit 1
fi

# ── 암호화 ────────────────────────────────────────────────────────────────────
# 덤프는 사용자·고객사·SR 본문이 담긴 평문 PII 다. 오프사이트로 내보내기 전에 암호화한다.
#
# 수신자가 설정됐는데 도구가 없으면 **조용히 평문을 남기지 않고 실패한다** —
# "암호화하려 했는데 안 됐다"를 성공으로 보고하는 것이 가장 위험하다.
encrypt_file() {
  src="$1"
  dst="${src}.age"

  if command -v age >/dev/null 2>&1; then
    age -r "$BACKUP_ENCRYPT_RECIPIENT" -o "$dst" "$src"
  elif command -v gpg >/dev/null 2>&1; then
    dst="${src}.gpg"
    gpg --batch --yes --trust-model always \
      --recipient "$BACKUP_ENCRYPT_RECIPIENT" --encrypt --output "$dst" "$src"
  else
    echo "[backup] ERROR: BACKUP_ENCRYPT_RECIPIENT 가 설정됐지만 age/gpg 가 없습니다." >&2
    echo "[backup]        평문 백업을 남기지 않기 위해 중단합니다. 서버에 age 또는 gnupg 를 설치하세요." >&2
    return 1
  fi

  if [ ! -s "$dst" ]; then
    echo "[backup] ERROR: 암호화 결과가 비어 있습니다: $dst" >&2
    return 1
  fi

  # 평문 원본 제거 — 암호화의 목적이 사라지지 않도록.
  rm -f "$src"
  echo "[backup] encrypted -> $dst"
}

if [ -n "$BACKUP_ENCRYPT_RECIPIENT" ]; then
  echo "[backup] encrypting with recipient: $BACKUP_ENCRYPT_RECIPIENT"
  encrypt_file "$db_file"
  [ -s "$up_file" ] && encrypt_file "$up_file"
else
  echo "[backup] WARN: BACKUP_ENCRYPT_RECIPIENT 미설정 — 백업이 평문으로 저장됩니다."
  echo "[backup]       오프사이트 복제 전에 반드시 설정하세요(docs/backup-and-restore.md)."
fi

echo "[backup] pruning backups older than ${RETENTION_DAYS} days"
# 암호화 산출물(.age/.gpg)까지 포함해야 한다. 평문 패턴만 지우면 암호화 파일이
# 영원히 쌓여 디스크를 채운다.
find "$BACKUP_DIR" -maxdepth 1 -type f -mtime "+${RETENTION_DAYS}" \
  \( -name 'db_*.dump' -o -name 'db_*.dump.age' -o -name 'db_*.dump.gpg' \
  -o -name 'uploads_*.tar.gz' -o -name 'uploads_*.tar.gz.age' -o -name 'uploads_*.tar.gz.gpg' \) \
  -delete

# 암호화한 경우 평문은 이미 지워졌으므로 실제로 남아 있는 파일을 찾아 크기를 잰다.
report_size() {
  for candidate in "$1" "$1.age" "$1.gpg"; do
    if [ -s "$candidate" ]; then
      du -h "$candidate" | cut -f1
      return 0
    fi
  done
  echo '0'
}

db_size="$(report_size "$db_file")"
up_size="$(report_size "$up_file")"
echo "[backup] OK  db=${db_size}  uploads=${up_size}  dir=${BACKUP_DIR}"

# 오프호스트 복제 훅(선택): OFFSITE_CMD 가 설정되어 있으면 실행한다.
# 예: OFFSITE_CMD='rclone copy /home/opc/sr/backups remote:sr-backups'
if [ -n "${OFFSITE_CMD:-}" ]; then
  echo "[backup] offsite: $OFFSITE_CMD"
  eval "$OFFSITE_CMD"
fi
