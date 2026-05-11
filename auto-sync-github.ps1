$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Git([string[]]$args) {
  & git @args
  return $LASTEXITCODE
}

$inside = (Git @("rev-parse", "--is-inside-work-tree") 2>$null)
if ($LASTEXITCODE -ne 0) {
  Write-Host "Não é um repositório Git nesta pasta: $root" -ForegroundColor Yellow
  exit 1
}

$originUrl = ""
try { $originUrl = (git remote get-url origin 2>$null) } catch { $originUrl = "" }
if (-not $originUrl) {
  try {
    & gh --version | Out-Null
  } catch {
    Write-Host "GitHub CLI (gh) não encontrado. Instale e rode novamente." -ForegroundColor Yellow
    exit 2
  }

  try {
    & gh auth status -h github.com | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "auth" }
  } catch {
    Write-Host "Você precisa logar no GitHub 1x para habilitar o auto-sync:" -ForegroundColor Yellow
    Write-Host "  gh auth login" -ForegroundColor Yellow
    exit 3
  }

  $repoName = (Split-Path -Leaf $root)
  $repoName = ($repoName -replace "\s+", "-")
  $repoName = ($repoName -replace "[^a-zA-Z0-9._-]", "")
  $repoName = $repoName.ToLowerInvariant()
  if (-not $repoName) { $repoName = "repo" }

  try {
    & git branch --show-current | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "branch" }
  } catch {}

  try {
    & gh repo create $repoName --private --source . --remote origin --push --confirm | Out-Host
  } catch {
    Write-Host ("Falha ao criar repo no GitHub: " + $_.Exception.Message) -ForegroundColor Yellow
    exit 4
  }

  try { $originUrl = (git remote get-url origin 2>$null) } catch { $originUrl = "" }
}

Write-Host ("Auto-sync GitHub ativo. origin=" + $originUrl) -ForegroundColor White

$debounceMs = 2000
$pending = $false
$timer = New-Object System.Timers.Timer
$timer.Interval = $debounceMs
$timer.AutoReset = $false

Register-ObjectEvent -InputObject $timer -EventName Elapsed -Action {
  $global:pending = $false
  try {
    & git add -A | Out-Null
    & git diff --cached --quiet 2>$null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    $msg = ("auto: sync " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))
    & git commit -m $msg | Out-Null
    & git push | Out-Host
  } catch {
    Write-Host ("Auto-sync falhou: " + $_.Exception.Message) -ForegroundColor Yellow
  }
} | Out-Null

$ignore = @(
  "\.git\",
  "\node_modules\",
  "\automation-backend\.venv\",
  "\automation-backend\wa-profile\",
  "\automation-backend\boletos\",
  "\automation-backend\enviados\",
  "\automation-backend\erro\",
  "\backend\uploads\"
)

$fsw = New-Object System.IO.FileSystemWatcher
$fsw.Path = $root
$fsw.IncludeSubdirectories = $true
$fsw.NotifyFilter = [System.IO.NotifyFilters]"FileName, DirectoryName, LastWrite, Size"
$fsw.EnableRaisingEvents = $true

$onChange = {
  param($sender, $eventArgs)
  $p = $eventArgs.FullPath
  foreach ($x in $ignore) {
    if ($p -like ("*" + $x + "*")) { return }
  }
  if (-not $global:pending) {
    $global:pending = $true
    $timer.Stop()
    $timer.Start()
  } else {
    $timer.Stop()
    $timer.Start()
  }
}

Register-ObjectEvent -InputObject $fsw -EventName Created -Action $onChange | Out-Null
Register-ObjectEvent -InputObject $fsw -EventName Changed -Action $onChange | Out-Null
Register-ObjectEvent -InputObject $fsw -EventName Renamed -Action $onChange | Out-Null
Register-ObjectEvent -InputObject $fsw -EventName Deleted -Action $onChange | Out-Null

while ($true) { Start-Sleep -Seconds 1 }
