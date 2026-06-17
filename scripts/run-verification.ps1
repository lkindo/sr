param (
    [switch]$fast,
    [switch]$clean,
    [switch]$full
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

# 0. Cache Cleaning (Optional)
if ($clean) {
    Log-Info "Cleaning cache files..."
    $filesToClean = @(
        ".eslintcache",
        "tsconfig.tsbuildinfo",
        "tsconfig.full.tsbuildinfo",
        "test-results"
    )
    foreach ($file in $filesToClean) {
        if (Test-Path $file) {
            Log-Info "Removing: $file"
            Remove-Item -Path $file -Recurse -Force | Out-Null
        }
    }
    Log-Success "Cache files cleaned successfully!"
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

    # 3. Parallel Static Checks (Type, Lint, Format)
    Run-Step "Parallel Static Checks" {
        pnpm verify:static
    }

    # 4. Vitest Tests
    Run-Step "Vitest Unit & Integration Tests" {
        if ($full) {
            Log-Info "Running FULL Vitest test suite..."
            pnpm test run
        } else {
            # Check for uncommitted changes in Git
            $gitChanges = git status --porcelain
            $meaningfulChanges = @()
            if ($gitChanges) {
                $lines = if ($gitChanges -is [string]) { $gitChanges -split "`r?`n" } else { $gitChanges }
                foreach ($line in $lines) {
                    if ($line.Trim().Length -gt 0 -and $line.Length -gt 3) {
                        $file = $line.Substring(3).Trim()
                        if ($file -notmatch 'package\.json|pnpm-lock\.yaml|scripts/run-verification\.ps1|\.gemini/|walkthrough\.md|task\.md|implementation_plan\.md|harness_critique_report\.md|\.eslintcache|\.gitignore') {
                            $meaningfulChanges += $file
                        }
                    }
                }
            }

            if ($meaningfulChanges.Count -eq 0) {
                Log-Info "No meaningful code changes detected (only configs, docs or harness modified). Skipping Vitest tests."
                Log-Info "Tip: Use -full flag to run the complete test suite."
            } else {
                Log-Info "Running INCREMENTAL Vitest tests (changed files only)..."
                pnpm test run --changed
            }
        }
    }

    # 5. Playwright E2E Tests (Conditional)
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
