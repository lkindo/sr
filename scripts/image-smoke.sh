#!/usr/bin/env bash
#
# 빌드한 운영 이미지를 실제로 띄워 본다.
#
# E2E 는 `next start` 로 돌지만 운영은 standalone 이미지다. 이미지에서만 나는 결함
# (빠진 파일, 마이그레이션·시드 번들, 인증 설정)은 지금까지 운영 배포에서야 드러났다.
# 빈 DB 에 띄워 마이그레이션과 시드를 거친 뒤, 관리자 로그인과 인증이 필요한 API 까지 확인한다.
#
# 사용법: scripts/image-smoke.sh <image>
# 종료코드 0=통과.
set -euo pipefail

IMAGE="${1:?image required}"
PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"
PORT="${SMOKE_PORT:-3900}"
BASE="http://127.0.0.1:${PORT}"

SUFFIX="$$"
NETWORK="sr-smoke-${SUFFIX}"
DB="sr-smoke-db-${SUFFIX}"
APP="sr-smoke-app-${SUFFIX}"
COOKIES="$(mktemp)"

# 일회용 값이다. 이 컨테이너들은 스크립트가 끝나면 사라진다.
# sr_ci 는 .gitleaks.toml 이 허용하는 CI 전용 계정 이름이다.
DB_URL="postgresql://sr_ci:sr_ci@${DB}:5432/sr_ci"
SMOKE_SECRET="smoke-only-secret-0123456789abcdef0123456789"
ADMIN_EMAIL="smoke-admin@example.com"
ADMIN_PASSWORD="smoke-only-password-123"

log() { echo "[image-smoke] $*"; }

cleanup() {
  docker rm -f "$APP" "$DB" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  rm -f "$COOKIES"
}
trap cleanup EXIT

fail() {
  log "FAIL: $*"
  docker logs "$APP" --tail 60 2>&1 || true
  exit 1
}

docker network create "$NETWORK" >/dev/null

log "Postgres 기동"
docker run -d --name "$DB" --network "$NETWORK" \
  -e POSTGRES_USER=sr_ci -e POSTGRES_PASSWORD=sr_ci -e POSTGRES_DB=sr_ci \
  "$PG_IMAGE" >/dev/null

# pg_isready 만 보면 초기화용 임시 서버에 속는다. 초기화 완료 로그 뒤의 준비 상태를 본다.
waited=0
until docker logs "$DB" 2>&1 | grep -q 'init process complete' &&
  docker exec "$DB" pg_isready -U sr_ci -d sr_ci >/dev/null 2>&1; do
  sleep 2
  waited=$((waited + 2))
  [ "$waited" -lt 120 ] || fail "Postgres 가 120초 안에 준비되지 않았습니다"
done

log "앱 기동: $IMAGE"
docker run -d --name "$APP" --network "$NETWORK" -p "127.0.0.1:${PORT}:3000" \
  -e DATABASE_URL="$DB_URL" \
  -e DIRECT_URL="$DB_URL" \
  -e NEXTAUTH_SECRET="$SMOKE_SECRET" \
  -e AUTH_SECRET="$SMOKE_SECRET" \
  -e NEXTAUTH_URL="$BASE" \
  -e AUTH_TRUST_HOST=true \
  -e BOOTSTRAP_ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e BOOTSTRAP_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  "$IMAGE" >/dev/null

waited=0
while :; do
  state="$(docker inspect -f '{{.State.Status}}' "$APP")"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$APP")"
  [ "$state" != "exited" ] || fail "앱이 종료됐습니다"
  [ "$health" != "healthy" ] || break
  sleep 3
  waited=$((waited + 3))
  [ "$waited" -lt 180 ] || fail "앱이 180초 안에 healthy 가 되지 못했습니다 (health=$health)"
done
log "OK  : healthy (${waited}s) — 마이그레이션과 시드 통과"

status_of() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 20 -b "$COOKIES" "$BASE$1"
}

[ "$(status_of /login)" = "200" ] || fail "/login 이 200 이 아닙니다"

# standalone 은 정적 자산을 자동으로 복사하지 않는다. 빠지면 HTML 과 API 는 멀쩡한데 화면만 깨진다.
login_html="$(curl -s --max-time 20 "$BASE/login")"
for pattern in '/_next/static/[^"]+[.]js' '/_next/static/[^"]+[.]css'; do
  asset="$(printf '%s' "$login_html" | grep -oE "$pattern" | head -1 || true)"
  [ -n "$asset" ] || fail "로그인 화면에서 정적 자산을 찾지 못했습니다: $pattern"
  [ "$(status_of "$asset")" = "200" ] || fail "정적 자산이 200 이 아닙니다: $asset"
done
log "OK  : 로그인 화면과 정적 자산"

[ "$(status_of /api/srs)" = "401" ] || fail "미인증 /api/srs 가 401 이 아닙니다"
log "OK  : 미인증 API 는 401"

csrf="$(curl -s --max-time 20 -c "$COOKIES" -b "$COOKIES" "$BASE/api/auth/csrf" |
  sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')"
[ -n "$csrf" ] || fail "CSRF 토큰을 받지 못했습니다"

curl -s -o /dev/null --max-time 20 -c "$COOKIES" -b "$COOKIES" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$csrf" \
  --data-urlencode "email=$ADMIN_EMAIL" \
  --data-urlencode "password=$ADMIN_PASSWORD" \
  --data-urlencode "callbackUrl=$BASE/dashboard" \
  --data-urlencode "json=true" \
  "$BASE/api/auth/callback/credentials"

session="$(curl -s --max-time 20 -b "$COOKIES" "$BASE/api/auth/session")"
case "$session" in
  *'"ADMIN"'*) log "OK  : 관리자 로그인" ;;
  *) fail "로그인 세션에 ADMIN 역할이 없습니다" ;;
esac

[ "$(status_of /api/srs)" = "200" ] || fail "로그인 후 /api/srs 가 200 이 아닙니다"
[ "$(status_of /dashboard)" = "200" ] || fail "로그인 후 /dashboard 가 200 이 아닙니다"
log "OK  : 인증이 필요한 API 와 화면"

log "통과"
