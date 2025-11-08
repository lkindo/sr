# SR Management System - 개발 서버 재시작 스크립트

Write-Host "🛑 개발 서버 중지 중..." -ForegroundColor Yellow
Write-Host "   (현재 실행 중인 서버가 있다면 Ctrl+C로 중지하세요)" -ForegroundColor Gray
Write-Host ""

Write-Host "🔄 Prisma 클라이언트 재생성 중..." -ForegroundColor Cyan
npx prisma generate

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Prisma 클라이언트 생성 완료!" -ForegroundColor Green
} else {
    Write-Host "❌ Prisma 클라이언트 생성 실패" -ForegroundColor Red
    Write-Host "   Node 프로세스를 종료하고 다시 시도하세요:" -ForegroundColor Yellow
    Write-Host "   taskkill /F /IM node.exe" -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "🚀 개발 서버 시작 중..." -ForegroundColor Cyan
Write-Host ""

pnpm dev

