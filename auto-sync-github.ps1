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
  Write-Host "Remote 'origin' não está configurado." -ForegroundColor Yellow
  Write-Host "Configure e rode de novo:" -ForegroundColor Yellow
  Write-Host "  git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git"
  Write-Host "  git push -u origin main"
  exit 2
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

