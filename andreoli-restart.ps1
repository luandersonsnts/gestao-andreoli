$ErrorActionPreference = "Stop"

function Stop-Ports([int[]]$ports) {
  $pids = Get-NetTCPConnection -ErrorAction SilentlyContinue |
    Where-Object { $ports -contains $_.LocalPort } |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($pid in $pids) {
    if (-not $pid) { continue }
    try { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue } catch {}
  }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

$npm = "npm"
if (Test-Path "C:\Program Files\nodejs\npm.cmd") { $npm = "C:\Program Files\nodejs\npm.cmd" }

Write-Host "Andreoli Consultoria - Reinício" -ForegroundColor White
Write-Host ("Pasta: " + $root)
Write-Host "Parando serviços (ports 3001 e 5174; limpando 5173 antiga)..." -ForegroundColor White

Stop-Ports @(3001, 5173, 5174)

if (Test-Path $backendDir) {
  Write-Host "Atualizando backend (npm/prisma)..." -ForegroundColor White
  try {
    Push-Location $backendDir
    & $npm install | Out-Host
    try { & $npm exec prisma migrate deploy | Out-Host } catch { Write-Host ("Prisma migrate deploy falhou: " + $_.Exception.Message) -ForegroundColor Yellow }
    try { & $npm exec prisma generate | Out-Host } catch { Write-Host ("Prisma generate falhou (arquivo travado no Windows): " + $_.Exception.Message) -ForegroundColor Yellow }
  } catch {
    Write-Host ("Falha atualizando backend: " + $_.Exception.Message) -ForegroundColor Yellow
  } finally {
    try { Pop-Location } catch {}
  }
} else {
  Write-Host "Backend não encontrado." -ForegroundColor Yellow
}

if (Test-Path $frontendDir) {
  Write-Host "Atualizando frontend (npm)..." -ForegroundColor White
  try {
    Push-Location $frontendDir
    & $npm install | Out-Host
  } catch {
    Write-Host ("Falha atualizando frontend: " + $_.Exception.Message) -ForegroundColor Yellow
  } finally {
    try { Pop-Location } catch {}
  }
} else {
  Write-Host "Frontend não encontrado." -ForegroundColor Yellow
}

$backendStarted = $false
try {
  Write-Host "Iniciando tarefa: AndreoliConsultoria-Backend"
  schtasks /Run /TN "AndreoliConsultoria-Backend" | Out-Host
  $backendStarted = $true
} catch {
  Write-Host ("Não conseguiu iniciar tarefa do backend (sem admin pode falhar): " + $_.Exception.Message) -ForegroundColor Yellow
}

$frontendStarted = $false
try {
  Write-Host "Iniciando tarefa: AndreoliConsultoria-Frontend"
  schtasks /Run /TN "AndreoliConsultoria-Frontend" | Out-Host
  $frontendStarted = $true
} catch {
  Write-Host ("Não conseguiu iniciar tarefa do frontend (sem admin pode falhar): " + $_.Exception.Message) -ForegroundColor Yellow
}

if (-not $backendStarted -and (Test-Path (Join-Path $backendDir "start-backend.ps1"))) {
  Write-Host "Iniciando backend via start-backend.ps1 (sem tarefa)..." -ForegroundColor White
  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-WindowStyle",
    "Minimized",
    "-File",
    (Join-Path $backendDir "start-backend.ps1")
  ) | Out-Null
}

if (-not $frontendStarted -and (Test-Path (Join-Path $frontendDir "start-frontend.ps1"))) {
  Write-Host "Iniciando frontend via start-frontend.ps1 (sem tarefa)..." -ForegroundColor White
  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-WindowStyle",
    "Minimized",
    "-File",
    (Join-Path $frontendDir "start-frontend.ps1")
  ) | Out-Null
}

Write-Host "Aguardando serviços subirem..." -ForegroundColor White
$apiOk = $false
$webOk = $false
for ($i = 0; $i -lt 12; $i += 1) {
  try {
    $r = Invoke-RestMethod "http://localhost:3001/api/health" -TimeoutSec 2
    $apiOk = ($r.ok -eq $true)
  } catch {}

  try {
    $resp = Invoke-WebRequest "http://localhost:5174/" -UseBasicParsing -TimeoutSec 2
    $webOk = ($resp.StatusCode -eq 200)
  } catch {}

  if ($apiOk -and $webOk) { break }
  Start-Sleep -Seconds 2
}

Write-Host ("API (3001) OK: " + $apiOk)
Write-Host ("WEB (5174) OK: " + $webOk)
Write-Host "Abrir: http://localhost:5174/"
