# build-standalone-win.ps1
$ErrorActionPreference = "Stop"

# 매번 고유한 임시 디렉토리 이름 생성하여 nul 파일 충돌 방지
$TimeSuffix = Get-Date -Format "HHmmss"
$TempDir = "C:\Users\sanle\.gemini\antigravity\brain\260fc53b-5ac8-4f1a-9632-fec6b16055a4\scratch\build-temp-$TimeSuffix"
$ProjectDir = "d:\project\sr"

Write-Host "========== [1] 임시 빌드 디렉토리 생성 ($TempDir) ==========" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $TempDir | Out-Null

# robocopy를 사용하여 안전하게 소스 복사 (node_modules, .next, .git 제외)
robocopy $ProjectDir $TempDir /E /XD node_modules .next .git /XF next-build.tar *.tmp /NDL /NFL /NJH /NJS
if ($LASTEXITCODE -ge 8) {
    Write-Error "robocopy 복사 실패: $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "========== [2] 임시 디렉토리에서 npm 의존성 설치 (심링크 방지) ==========" -ForegroundColor Cyan
Set-Location -Path $TempDir

npm install --legacy-peer-deps --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
    Write-Error "npm install 실패"
    exit $LASTEXITCODE
}

Write-Host "========== [3] Prisma Client 생성 ==========" -ForegroundColor Cyan
npx prisma generate

Write-Host "========== [4] Next.js Standalone 빌드 실행 ==========" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Next.js 빌드 실패"
    exit $LASTEXITCODE
}

Write-Host "========== [5] 빌드 결과물 복사 및 정리 ==========" -ForegroundColor Green
Set-Location -Path $ProjectDir

if (Test-Path "$ProjectDir\.next") {
    Remove-Item -Recurse -Force "$ProjectDir\.next"
}
if (Test-Path "$ProjectDir\server.js") {
    Remove-Item -Force "$ProjectDir\server.js"
}

Copy-Item -Path "$TempDir\.next\standalone\.next" -Destination "$ProjectDir\.next" -Recurse -Force
Copy-Item -Path "$TempDir\.next\standalone\server.js" -Destination "$ProjectDir\server.js" -Force
Copy-Item -Path "$TempDir\.next\static" -Destination "$ProjectDir\.next\static" -Recurse -Force

# 정리 시 nul 에러 발생 가능하므로 try/catch로 예외 묵살 (시간 기반 고유 폴더를 쓰므로 방치되어도 영향 없음)
try {
    Remove-Item -Recurse -Force $TempDir
} catch {
    Write-Host "경고: 임시 빌드 디렉토리 삭제 중 일부 파일은 제거되지 않았습니다 (다음 빌드에는 영향 없음)." -ForegroundColor Yellow
}

Write-Host "========== Standalone 빌드 완료! ==========" -ForegroundColor Green
