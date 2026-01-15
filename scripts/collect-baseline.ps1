Param(
	[string]$Root = "$PSScriptRoot"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'
Set-Location $Root

$outDir = ".refactor-metrics"
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$ts = (Get-Date).ToString('yyyyMMdd_HHmmss')

$summaryFile = Join-Path $outDir "baseline_$ts.txt"
$treeFile    = Join-Path $outDir "tree_$ts.txt"
$gitFile     = Join-Path $outDir "git_$ts.txt"
$envFile     = Join-Path $outDir "env_$ts.txt"

Function Append([string]$Path, [string]$Text) {
	$Text | Out-File -FilePath $Path -Append -Encoding utf8
}

# 1) Stack detection
Append $summaryFile "=== STACK DETECTION ==="
$stackFiles = @(
	'package.json','pnpm-lock.yaml','yarn.lock',
	'requirements.txt','pyproject.toml','poetry.lock','Pipfile',
	'go.mod','pom.xml','build.gradle','build.gradle.kts',
	'Cargo.toml','.csproj','global.json'
)
foreach ($f in $stackFiles) { if (Test-Path $f) { Append $summaryFile ("FOUND: " + $f) } }
Append $summaryFile ""

# 2) Tool versions (best-effort)
Append $summaryFile "=== TOOL VERSIONS (if available) ==="
$cmds = @(
	'node -v','npm -v','pnpm -v','yarn -v',
	'python --version','pip --version','poetry --version','pipenv --version',
	'go version','java -version','mvn -v','gradle -v','cargo -V','dotnet --info'
)
foreach ($c in $cmds) {
	try {
		$o = Invoke-Expression $c 2>&1
		if ($LASTEXITCODE -eq $null -or $LASTEXITCODE -eq 0) {
			Append $summaryFile ($c + "`n" + ($o | Out-String) + "`n")
		}
	} catch { }
}

# 3) File stats
Append $summaryFile "=== FILE EXTENSION COUNTS (top 15) ==="
Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue |
	Where-Object { $_.FullName -notmatch '\\.git\\|node_modules|dist|build|target|bin|obj|\.venv|\.tox' } |
	Group-Object Extension |
	Sort-Object Count -Descending |
	Select-Object -First 15 |
	ForEach-Object { Append $summaryFile (("{0}: {1}" -f $_.Name, $_.Count)) }

Append $summaryFile ""
Append $summaryFile "=== TOTAL FILE COUNT ==="
$fc = (Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue |
	Where-Object { $_.FullName -notmatch '\\.git\\|node_modules|dist|build|target|bin|obj|\.venv|\.tox' }).Count
Append $summaryFile $fc.ToString()

# 4) Directory tree (depth 2)
"=== DIRECTORY TREE (depth 2) ===" | Out-File -FilePath $treeFile -Encoding utf8
Get-ChildItem -Depth 2 | Format-Wide -Column 1 | Out-File -FilePath $treeFile -Append -Encoding utf8

# 5) Git info
"=== GIT INFO ===" | Out-File -FilePath $gitFile -Encoding utf8
if (Test-Path ".git") {
	(git rev-parse --abbrev-ref HEAD) | Out-File -FilePath $gitFile -Append -Encoding utf8
	(git status --porcelain=v1 --branch) | Out-File -FilePath $gitFile -Append -Encoding utf8
	"--- LAST 10 COMMITS ---" | Out-File -FilePath $gitFile -Append -Encoding utf8
	(git log -n 10 --pretty=oneline) | Out-File -FilePath $gitFile -Append -Encoding utf8
	"--- CHURN (30 days) ---" | Out-File -FilePath $gitFile -Append -Encoding utf8
	(git log --since=30.days --stat) | Out-File -FilePath $gitFile -Append -Encoding utf8
} else {
	"No git repository detected." | Out-File -FilePath $gitFile -Append -Encoding utf8
}

# 6) Env summary (no secrets)
"--- ENV SUMMARY ---" | Out-File -FilePath $envFile -Encoding utf8
("OS: " + [System.Environment]::OSVersion.VersionString) | Out-File -FilePath $envFile -Append -Encoding utf8
("PowerShell: " + $PSVersionTable.PSVersion) | Out-File -FilePath $envFile -Append -Encoding utf8
("CPU: " + (Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name)) | Out-File -FilePath $envFile -Append -Encoding utf8
("RAM(GB): " + [math]::Round(((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB),2)) | Out-File -FilePath $envFile -Append -Encoding utf8

Write-Host ("Baseline files saved under " + $outDir + "`n - " + (Split-Path -Leaf $summaryFile) + "`n - " + (Split-Path -Leaf $treeFile) + "`n - " + (Split-Path -Leaf $gitFile) + "`n - " + (Split-Path -Leaf $envFile))


