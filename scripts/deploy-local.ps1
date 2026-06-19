# deploy-local.ps1
Write-Host "========== 1. 로컬 Docker 이미지 빌드 시작 (Platform: linux/amd64) ==========" -ForegroundColor Cyan
docker build --platform linux/amd64 -t ghcr.io/lkindo/sr:latest .

if ($LASTEXITCODE -ne 0) {
    Write-Error "로컬 Docker 빌드에 실패했습니다."
    exit $LASTEXITCODE
}

Write-Host "========== 2. Docker 이미지 tar로 아카이브 저장 ==========" -ForegroundColor Cyan
docker save -o sr-app.tar ghcr.io/lkindo/sr:latest

if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker 이미지 tar 저장에 실패했습니다."
    exit $LASTEXITCODE
}

Write-Host "========== 3. 서버로 tar 파일 전송 (SCP) ==========" -ForegroundColor Cyan
scp -i ssh-key-2026-01-18.key -o StrictHostKeyChecking=no sr-app.tar opc@134.185.106.129:/home/opc/sr/sr-app.tar

if ($LASTEXITCODE -ne 0) {
    Write-Error "SCP 전송에 실패했습니다."
    Remove-Item -Force sr-app.tar
    exit $LASTEXITCODE
}

# 로컬 tar 파일 삭제
Remove-Item -Force sr-app.tar

Write-Host "========== 4. 서버 원격 갱신 (SSH) ==========" -ForegroundColor Cyan
ssh -i ssh-key-2026-01-18.key -o StrictHostKeyChecking=no opc@134.185.106.129 "cd /home/opc/sr && docker compose -f docker-compose.prod.yml down && docker load -i sr-app.tar && rm -f sr-app.tar && docker compose -f docker-compose.prod.yml up -d"

if ($LASTEXITCODE -ne 0) {
    Write-Error "서버 원격 실행에 실패했습니다."
    exit $LASTEXITCODE
}

Write-Host "========== 배포 완료! ==========" -ForegroundColor Green
Write-Host "접속 주소: https://lkindo.kr" -ForegroundColor Yellow

