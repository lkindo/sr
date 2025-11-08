# Add runtime = 'nodejs' to all API route files that use Prisma

$files = @(
    "src/app/api/health/route.ts",
    "src/app/api/srs/route.ts",
    "src/app/api/users/route.ts",
    "src/app/api/clients/[id]/categories/route.ts",
    "src/app/api/users/[id]/roles/route.ts",
    "src/app/api/users/[id]/route.ts",
    "src/app/api/attachments/[id]/route.ts",
    "src/app/api/attachments/route.ts",
    "src/app/api/roles/route.ts",
    "src/app/api/roles/[id]/permissions/route.ts",
    "src/app/api/roles/[id]/route.ts",
    "src/app/api/clients/[id]/route.ts",
    "src/app/api/dashboard/stats/route.ts",
    "src/app/api/clients/route.ts",
    "src/app/api/srs/[id]/route.ts",
    "src/app/api/srs/[id]/comments/route.ts",
    "src/app/api/srs/[id]/activities/route.ts",
    "src/app/api/permissions/route.ts"
)

$runtimeConfig = @"

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';
"@

$count = 0
$skipped = 0

foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        Write-Host "   ⚠️  파일 없음: $file" -ForegroundColor Yellow
        continue
    }
    
    $content = Get-Content $file -Encoding UTF8 | Out-String
    
    # 이미 runtime 설정이 있는지 확인
    if ($content -match "export const runtime") {
        Write-Host "   ⏭️  이미 있음: $file" -ForegroundColor Cyan
        $skipped++
        continue
    }
    
    # import prisma 다음 줄에 추가
    if ($content -match "import prisma from") {
        $lines = Get-Content $file -Encoding UTF8
        $newLines = @()
        $added = $false
        
        for ($i = 0; $i -lt $lines.Length; $i++) {
            $newLines += $lines[$i]
            
            # import prisma 줄 다음에 빈 줄이 있으면 그 다음에 추가
            if ($lines[$i] -match "import prisma from" -and -not $added) {
                # 다음 줄이 빈 줄이면 그 후에 추가
                if ($i + 1 -lt $lines.Length -and $lines[$i + 1] -match "^\s*$") {
                    $newLines += $lines[$i + 1]  # 빈 줄 추가
                    $newLines += ""
                    $newLines += "// Force Node.js runtime (Prisma doesn't work in Edge Runtime)"
                    $newLines += "export const runtime = 'nodejs';"
                    $added = $true
                    $i++  # 빈 줄을 건너뜀
                }
            }
        }
        
        if ($added) {
            $newLines | Set-Content $file -Encoding UTF8
            Write-Host "   ✅ 추가됨: $file" -ForegroundColor Green
            $count++
        } else {
            Write-Host "   ⚠️  추가 실패: $file" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "완료: $count개 파일 수정, $skipped개 파일 스킵" -ForegroundColor Cyan

