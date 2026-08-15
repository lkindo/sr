# deploy-local.ps1
$ErrorActionPreference = 'Stop'
$DeployKeyPath = $env:SR_DEPLOY_SSH_KEY
if (-not $DeployKeyPath) {
    Write-Error "SR_DEPLOY_SSH_KEY 환경변수로 프로젝트 디렉터리 밖의 SSH 개인키 경로를 지정하세요."
    exit 1
}

$DeployTag = "local-$(Get-Date -AsUTC -Format 'yyyyMMddHHmmss')"
$ImageRef = "ghcr.io/lkindo/sr:$DeployTag"
$ArchiveName = "sr-app-$DeployTag.tar"

try {
    $DeployKeyPath = (Resolve-Path -LiteralPath $DeployKeyPath -ErrorAction Stop).Path
} catch {
    Write-Error "SR_DEPLOY_SSH_KEY 파일을 찾을 수 없습니다: $DeployKeyPath"
    exit 1
}

Write-Host "========== 1. 로컬 Docker 이미지 빌드 시작 (Platform: linux/amd64) ==========" -ForegroundColor Cyan
docker build --platform linux/amd64 -t $ImageRef .

if ($LASTEXITCODE -ne 0) {
    Write-Error "로컬 Docker 빌드에 실패했습니다."
    exit $LASTEXITCODE
}

Write-Host "========== 2. Docker 이미지 tar로 아카이브 저장 ==========" -ForegroundColor Cyan
docker save -o $ArchiveName $ImageRef

if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker 이미지 tar 저장에 실패했습니다."
    exit $LASTEXITCODE
}

Write-Host "========== 3. 서버로 tar 파일 전송 (SCP) ==========" -ForegroundColor Cyan
scp -i "$DeployKeyPath" -o StrictHostKeyChecking=accept-new $ArchiveName "opc@134.185.106.129:/home/opc/sr/$ArchiveName"

if ($LASTEXITCODE -ne 0) {
    Write-Error "SCP 전송에 실패했습니다."
    Remove-Item -Force -LiteralPath $ArchiveName
    exit $LASTEXITCODE
}

# 로컬 tar 파일 삭제
Remove-Item -Force -LiteralPath $ArchiveName

Write-Host "========== 4. 서버 원격 갱신 (SSH) ==========" -ForegroundColor Cyan
$RemoteScript = @'
set -euo pipefail
cd /home/opc/sr

# 마이그레이션 전에 검증된 복구 지점을 만들며 실패하면 현재 서비스를 유지한다.
set -a
. ./.env.prod
set +a
bash scripts/backup.sh

docker load -i '__ARCHIVE__'
rm -f '__ARCHIVE__'

sed -i '/^APP_IMAGE_TAG=/d' .env.prod
printf '\nAPP_IMAGE_TAG=%s\n' '__TAG__' >> .env.prod
docker compose --env-file .env.prod -f docker-compose.prod.yml config -q

# DB와 nginx는 내리지 않고 앱만 교체한다.
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --force-recreate --no-deps app

waited=0
while [ "$waited" -lt 240 ]; do
  state="$(docker inspect -f '{{.State.Status}}' sr-app 2>/dev/null || echo missing)"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' sr-app 2>/dev/null || echo none)"
  if [ "$state" = running ] && [ "$health" = healthy ]; then
    exit 0
  fi
  if [ "$state" = exited ] || [ "$state" = dead ]; then
    docker logs sr-app --tail 80 2>&1 || true
    exit 1
  fi
  sleep 3
  waited=$((waited + 3))
done
docker logs sr-app --tail 80 2>&1 || true
exit 1
'@
$RemoteScript = $RemoteScript.Replace('__ARCHIVE__', $ArchiveName).Replace('__TAG__', $DeployTag)
ssh -i "$DeployKeyPath" -o StrictHostKeyChecking=accept-new opc@134.185.106.129 $RemoteScript

if ($LASTEXITCODE -ne 0) {
    Write-Error "서버 원격 실행에 실패했습니다."
    exit $LASTEXITCODE
}

Write-Host "========== 배포 완료! ==========" -ForegroundColor Green
Write-Host "접속 주소: https://lkindo.kr" -ForegroundColor Yellow

