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
# 종료코드 0=복구 검증 성공.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/opc/sr/backups}"
PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"
REHEARSAL_DB="${REHEARSAL_DB:-sr_rehearsal}"
REHEARSAL_USER="${REHEARSAL_USER:-rehearsal}"
REHEARSAL_PASSWORD="${REHEARSAL_PASSWORD:-rehearsal-local-only}"
CONTAINER_NAME="sr-restore-rehearsal-$$"

# 복구 후 반드시 존재하고 비어 있지 않아야 하는 테이블.
# 참조 데이터가 사라진 백업은 "복구되었지만 쓸 수 없는" 상태다.
REQUIRED_NONEMPTY_TABLES="${REQUIRED_NONEMPTY_TABLES:-users roles permissions role_permissions}"
# 존재만 확인하는 테이블(운영 초기에는 비어 있을 수 있다).
REQUIRED_TABLES="${REQUIRED_TABLES:-srs clients service_categories sr_activities audit_logs}"

log() { echo "[rehearsal] $*"; }

cleanup() {
  if docker ps -aq -f "name=^${CONTAINER_NAME}$" | grep -q .; then
    log "일회용 컨테이너 정리: $CONTAINER_NAME"
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
  [ -n "${TMP_PLAIN:-}" ] && rm -f "$TMP_PLAIN"
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
TMP_PLAIN=""
case "$dump_file" in
  *.age)
    if [ -z "${BACKUP_AGE_IDENTITY_FILE:-}" ]; then
      log "ERROR: 암호화된 백업인데 BACKUP_AGE_IDENTITY_FILE 이 없습니다."
      log "       복호화 키 없이는 복구 검증을 할 수 없습니다(검증 실패로 처리)."
      exit 1
    fi
    TMP_PLAIN="$(mktemp)"
    age -d -i "$BACKUP_AGE_IDENTITY_FILE" -o "$TMP_PLAIN" "$dump_file"
    dump_file="$TMP_PLAIN"
    log "복호화 완료(age)"
    ;;
  *.gpg)
    if [ -z "${BACKUP_GPG_HOME:-}" ]; then
      log "ERROR: 암호화된 백업인데 BACKUP_GPG_HOME 이 없습니다."
      exit 1
    fi
    TMP_PLAIN="$(mktemp)"
    GNUPGHOME="$BACKUP_GPG_HOME" gpg --batch --yes --decrypt --output "$TMP_PLAIN" "$dump_file"
    dump_file="$TMP_PLAIN"
    log "복호화 완료(gpg)"
    ;;
esac

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

log "준비 대기..."
waited=0
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

if [ "$failures" -gt 0 ]; then
  log "복구 리허설 실패: ${failures}건"
  exit 1
fi

log "복구 리허설 통과 — 이 백업은 실제로 복구 가능합니다."
