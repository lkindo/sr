#!/usr/bin/env bash
#
# 백업 복구 리허설 (감사 3.31)
#
# **프로덕션 DB 를 절대 건드리지 않는다.** 일회용 Postgres 컨테이너를 띄워 최신 백업을
# 복구하고, 스키마와 행 수를 단언한 뒤 컨테이너를 파기한다.
#
# 왜 필요한가:
#   `backup.sh` 의 `pg_restore -l` 은 덤프의 **목차만** 읽는다. 목차가 멀쩡해도 실제 복구가
#   깨질 수 있다. 이 스크립트는 "깨끗한 DB 로의 전체 복구가 동작 시스템을 재현하는가"를
#   실제로 실행해 확인한다 — 희망이 아니라 녹색 체크로.
#
# 사용법:
#   scripts/restore-rehearsal.sh [dump_file]
#   (생략 시 BACKUP_DIR 에서 가장 최근 덤프를 자동 선택)
#
# 암호화된 백업(.age/.gpg):
#   호스트에는 복호화 키가 없는 것이 정상이다(그것이 공개키 암호화를 쓰는 이유).
#   리허설을 하려면 `BACKUP_AGE_IDENTITY_FILE` 또는 `BACKUP_GPG_HOME` 을 지정해야 한다.
#   지정이 없으면 명확히 실패한다 — "검증 못 했음"을 성공으로 보고하지 않는다.
#
# 첨부파일:
#   덤프와 같은 시각의 uploads 아카이브에 DB 의 첨부 행이 가리키는 파일이 모두 있는지 대조한다.
#   행만 살아나고 파일이 없으면 복구돼도 다운로드가 전부 실패한다.
#
# 종료코드 0=복구 검증 성공.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/opc/sr/backups}"
PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"
REHEARSAL_DB="${REHEARSAL_DB:-sr_rehearsal}"
REHEARSAL_USER="${REHEARSAL_USER:-rehearsal}"
REHEARSAL_PASSWORD="${REHEARSAL_PASSWORD:-rehearsal-local-only}"
UPLOADS_DIR="${UPLOADS_DIR:-/app/var/uploads}"
CONTAINER_NAME="sr-restore-rehearsal-$$"

# 복구 후 반드시 존재하고 비어 있지 않아야 하는 테이블.
# 참조 데이터가 사라진 백업은 "복구되었지만 쓸 수 없는" 상태다.
REQUIRED_NONEMPTY_TABLES="${REQUIRED_NONEMPTY_TABLES:-users roles permissions role_permissions}"
# 존재만 확인하는 테이블(운영 초기에는 비어 있을 수 있다).
REQUIRED_TABLES="${REQUIRED_TABLES:-srs clients service_categories sr_activities audit_logs}"

log() { echo "[rehearsal] $*"; }

TMP_FILES=()

cleanup() {
  if docker ps -aq -f "name=^${CONTAINER_NAME}$" | grep -q .; then
    log "일회용 컨테이너 정리: $CONTAINER_NAME"
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
  if [ "${#TMP_FILES[@]}" -gt 0 ]; then
    rm -f -- "${TMP_FILES[@]}"
  fi
  return 0
}
trap cleanup EXIT

# ── 1. 대상 덤프 선택 ─────────────────────────────────────────────────────────
dump_file="${1:-}"
if [ -z "$dump_file" ]; then
  dump_file="$(ls -t "$BACKUP_DIR"/db_*.dump "$BACKUP_DIR"/db_*.dump.age "$BACKUP_DIR"/db_*.dump.gpg 2>/dev/null | head -n 1 || true)"
fi

if [ -z "$dump_file" ] || [ ! -f "$dump_file" ]; then
  log "ERROR: 복구할 덤프를 찾지 못했습니다 (BACKUP_DIR=$BACKUP_DIR)"
  exit 1
fi
log "대상 덤프: $dump_file"

# ── 2. 필요 시 복호화 ─────────────────────────────────────────────────────────
# 평문 경로를 decrypted_path 에 담는다. 키가 없으면 "검증 못 했음"이므로 실패한다.
decrypt_backup() {
  decrypted_path="$1"
  case "$1" in
    *.age)
      if [ -z "${BACKUP_AGE_IDENTITY_FILE:-}" ]; then
        log "ERROR: 암호화된 백업인데 BACKUP_AGE_IDENTITY_FILE 이 없습니다."
        log "       복호화 키 없이는 복구 검증을 할 수 없습니다(검증 실패로 처리)."
        exit 1
      fi
      decrypted_path="$(mktemp)"
      TMP_FILES+=("$decrypted_path")
      age -d -i "$BACKUP_AGE_IDENTITY_FILE" -o "$decrypted_path" "$1"
      log "복호화 완료(age): $1"
      ;;
    *.gpg)
      if [ -z "${BACKUP_GPG_HOME:-}" ]; then
        log "ERROR: 암호화된 백업인데 BACKUP_GPG_HOME 이 없습니다."
        exit 1
      fi
      decrypted_path="$(mktemp)"
      TMP_FILES+=("$decrypted_path")
      GNUPGHOME="$BACKUP_GPG_HOME" gpg --batch --yes --decrypt --output "$decrypted_path" "$1"
      log "복호화 완료(gpg): $1"
      ;;
  esac
}

source_dump="$dump_file"
decrypt_backup "$dump_file"
dump_file="$decrypted_path"

# ── 3. 일회용 Postgres 기동 ───────────────────────────────────────────────────
# 호스트 포트를 열지 않고 네트워크도 붙이지 않는다 — docker exec 로만 접근한다.
log "일회용 Postgres 기동: $CONTAINER_NAME ($PG_IMAGE)"
docker run -d --rm \
  --name "$CONTAINER_NAME" \
  --network none \
  -e POSTGRES_USER="$REHEARSAL_USER" \
  -e POSTGRES_PASSWORD="$REHEARSAL_PASSWORD" \
  -e POSTGRES_DB="$REHEARSAL_DB" \
  "$PG_IMAGE" >/dev/null

# `pg_isready` 만으로는 부족하다.
#
# postgres 이미지는 초기화 중 **임시 서버**를 띄워 DB/계정을 만든 뒤 그것을 종료하고
# 본 서버를 다시 올린다. 임시 서버에도 pg_isready 는 성공하므로, 그 틈에 pg_restore 를
# 시작하면 곧이어 오는 종료에 연결이 끊기고
#   FATAL: terminating connection due to administrator command
# 로 죽는다. 증상만 보면 백업이 깨진 것처럼 보이지만 백업은 멀쩡하다.
#
# 그래서 초기화 완료 로그를 먼저 기다린 뒤 pg_isready 로 확인한다. 이미지가 출력하는
# `PostgreSQL init process complete; ready for start up.` 이 그 경계다.
log "초기화 완료 대기..."
waited=0
until docker logs "$CONTAINER_NAME" 2>&1 | grep -q 'init process complete'; do
  sleep 2
  waited=$((waited + 2))
  if [ "$waited" -ge 120 ]; then
    log "ERROR: 일회용 Postgres 초기화가 120초 안에 끝나지 않았습니다."
    docker logs "$CONTAINER_NAME" 2>&1 | tail -20
    exit 1
  fi
done

log "준비 대기..."
until docker exec "$CONTAINER_NAME" pg_isready -U "$REHEARSAL_USER" -d "$REHEARSAL_DB" >/dev/null 2>&1; do
  sleep 2
  waited=$((waited + 2))
  if [ "$waited" -ge 120 ]; then
    log "ERROR: 일회용 Postgres 가 120초 안에 준비되지 않았습니다."
    exit 1
  fi
done
log "준비 완료 (${waited}s)"

# ── 4. 복구 ───────────────────────────────────────────────────────────────────
log "pg_restore 실행"
if ! docker exec -i "$CONTAINER_NAME" \
  pg_restore -U "$REHEARSAL_USER" -d "$REHEARSAL_DB" \
  --no-owner --no-privileges --exit-on-error <"$dump_file"; then
  log "ERROR: pg_restore 실패 — 이 백업으로는 복구할 수 없습니다."
  exit 1
fi
log "복구 성공"

# ── 5. 단언 ───────────────────────────────────────────────────────────────────
psql_q() {
  docker exec "$CONTAINER_NAME" psql -U "$REHEARSAL_USER" -d "$REHEARSAL_DB" -tAc "$1"
}

failures=0

for table in $REQUIRED_TABLES; do
  exists="$(psql_q "SELECT to_regclass('public.$table') IS NOT NULL;")"
  if [ "$exists" != "t" ]; then
    log "FAIL: 테이블 없음 — $table"
    failures=$((failures + 1))
  else
    log "OK  : 테이블 존재 — $table"
  fi
done

for table in $REQUIRED_NONEMPTY_TABLES; do
  exists="$(psql_q "SELECT to_regclass('public.$table') IS NOT NULL;")"
  if [ "$exists" != "t" ]; then
    log "FAIL: 테이블 없음 — $table"
    failures=$((failures + 1))
    continue
  fi
  count="$(psql_q "SELECT COUNT(*) FROM public.$table;")"
  if [ "$count" -le 0 ] 2>/dev/null; then
    log "FAIL: 비어 있음 — $table (행 0)"
    failures=$((failures + 1))
  else
    log "OK  : $table = ${count}행"
  fi
done

# ── 6. 첨부파일 대조 ──────────────────────────
backup_ts="$(basename "$source_dump")"
backup_ts="${backup_ts#db_}"
backup_ts="${backup_ts%%.dump*}"
uploads_file=""
for candidate in "$BACKUP_DIR/uploads_${backup_ts}.tar.gz" \
  "$BACKUP_DIR/uploads_${backup_ts}.tar.gz.age" \
  "$BACKUP_DIR/uploads_${backup_ts}.tar.gz.gpg"; do
  if [ -f "$candidate" ]; then
    uploads_file="$candidate"
    break
  fi
done

if [ -z "$uploads_file" ]; then
  log "FAIL: 덤프와 짝이 맞는 첨부 아카이브가 없습니다(uploads_${backup_ts}.tar.gz)"
  failures=$((failures + 1))
else
  decrypt_backup "$uploads_file"
  archive_list="$(tar tzf "$decrypted_path" | sed 's#^\./##')"

  # 다운로드 라우트와 같은 값(storage_path 가 없으면 file_url)을 본다.
  if ! attachment_rows="$(psql_q "SELECT COALESCE(storage_path, file_url) FROM public.sr_attachments;")"; then
    log "FAIL: 첨부 행을 조회하지 못했습니다"
    failures=$((failures + 1))
  else
    checked=0
    missing=0
    while IFS= read -r stored_path; do
      [ -n "$stored_path" ] || continue
      checked=$((checked + 1))
      # 앱의 resolveAttachmentFilePath 와 같은 규칙으로 저장소 기준 상대 경로를 만든다.
      # 저장 루트 밖의 절대 경로는 앱이 404 로 거부하므로 아카이브에 있어도 복구된 것이 아니다.
      case "$stored_path" in
        "$UPLOADS_DIR"/*) relative_path="${stored_path#"$UPLOADS_DIR"/}" ;;
        /*) relative_path="" ;;
        uploads/*) relative_path="${stored_path#uploads/}" ;;
        *) relative_path="$stored_path" ;;
      esac
      # 앱은 path.resolve 로 겹친 슬래시를 정규화한다.
      relative_path="${relative_path#"${relative_path%%[!/]*}"}"
      # grep -q 는 찾는 즉시 끝나 printf 가 SIGPIPE 를 받고, pipefail 이 이를 "없음"으로 뒤집는다.
      if [ -z "$relative_path" ] ||
        ! printf '%s\n' "$archive_list" | grep -Fx -- "$relative_path" >/dev/null; then
        log "FAIL: 첨부 파일 없음 — $stored_path"
        missing=$((missing + 1))
      fi
    done <<<"$attachment_rows"

    if [ "$missing" -gt 0 ]; then
      failures=$((failures + missing))
    else
      log "OK  : 첨부 $checked 건이 모두 아카이브에 있습니다"
    fi
  fi
fi

if [ "$failures" -gt 0 ]; then
  log "복구 리허설 실패: ${failures}건"
  exit 1
fi

log "복구 리허설 통과 — 이 백업은 실제로 복구 가능합니다."
