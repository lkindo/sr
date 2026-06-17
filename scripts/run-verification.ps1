param (
    [switch]$fast
)

$ErrorActionPreference = "Stop"

function Log-Info ($msg) {
    Write-Host "`n[INFO] $msg" -ForegroundColor Cyan
}

function Log-Success ($msg) {
    Write-Host "[SUCCESS] $msg" -ForegroundColor Green
}

function Log-Error ($msg) {
    Write-Host "[ERROR] $msg" -ForegroundColor Red
}

# 1. Preflight Check
if (-not (Get-Command "pnpm" -ErrorAction SilentlyContinue)) {
    Log-Error "Preflight Check Failed: 'pnpm' command was not found. Please install Node.js and pnpm first."
    exit 1
}

$steps = [System.Collections.Generic.List[PSCustomObject]]::new()

function Run-Step ($stepName, $scriptBlock) {
    Log-Info "Executing: $stepName"
    
    $startTime = Get-Date
    $success = $true
    $global:LASTEXITCODE = 0
    
    try {
        & $scriptBlock
        if ($LASTEXITCODE -ne 0) {
            $success = $false
        }
    } catch {
        $success = $false
        Log-Error "Exception occurred during execution: $_"
    }
    
    $endTime = Get-Date
    $duration = [Math]::Round(($endTime - $startTime).TotalSeconds, 2)
    
    $status = if ($success) { "SUCCESS" } else { "FAILED" }
    
    $steps.Add(([PSCustomObject]@{
        "Step"     = $stepName
        "Status"   = $status
        "Duration" = "${duration}s"
    }))
    
    if (-not $success) {
        throw "$stepName Failed"
    }
}

function Print-SummaryTable {
    Write-Host "`n==================================================" -ForegroundColor Yellow
    Write-Host "               Verification Summary               " -ForegroundColor Yellow
    Write-Host "==================================================" -ForegroundColor Yellow
    Write-Host ("{0,-28} {1,-12} {2,-10}" -f "Step", "Status", "Duration") -ForegroundColor Cyan
    Write-Host ("{0,-28} {1,-12} {2,-10}" -f "----", "------", "--------") -ForegroundColor Cyan
    
    foreach ($step in $steps) {
        $color = "Green"
        if ($step.Status -eq "FAILED") {
            $color = "Red"
        } elseif ($step.Status -eq "SKIPPED") {
            $color = "Yellow"
        }
        
        Write-Host ("{0,-28} {1,-12} {2,-10}" -f $step.Step, $step.Status, $step.Duration) -ForegroundColor $color
    }
    Write-Host "==================================================" -ForegroundColor Yellow
}

try {
    # 2. Prisma Client Generation
    Run-Step "Prisma Client Generation" {
        pnpm prisma generate
    }

    # 3. TypeScript Type Checking
    Run-Step "TypeScript Type Checking" {
        pnpm type-check
    }

    # 4. ESLint Check
    Run-Step "ESLint Linting" {
        pnpm lint
    }

    # 5. Prettier Check
    Run-Step "Prettier Formatting Check" {
        pnpm format:check
    }

    # 6. Vitest Tests
    Run-Step "Vitest Unit & Integration Tests" {
        pnpm test run
    }

    # 7. Playwright E2E Tests (Conditional)
    if ($fast) {
        Log-Info "[--fast] option specified. Skipping Playwright E2E tests."
        $steps.Add(([PSCustomObject]@{
            "Step"     = "Playwright E2E Tests"
            "Status"   = "SKIPPED"
            "Duration" = "0s"
        }))
    } else {
        Run-Step "Playwright E2E Tests" {
            pnpm test:e2e --project=chromium --project=multi-user
        }
    }

    Print-SummaryTable
    Log-Success "`nAll verification steps completed successfully!"
    exit 0

} catch {
    Print-SummaryTable
    Log-Error "`nVerification failed: $_"
    exit 1
}
