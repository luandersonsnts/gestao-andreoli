$ErrorActionPreference = "Continue"

Set-Location -LiteralPath "C:\Users\andre\Desktop\gestao andreoli\automation-backend"

$backendEnvPath = "C:\Users\andre\Desktop\gestao andreoli\backend\.env"
if (Test-Path $backendEnvPath) {
  Get-Content $backendEnvPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line) { return }
    if ($line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim()
    if ($val.StartsWith('"') -and $val.EndsWith('"')) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    if ($key -eq "DATABASE_URL") {
      $env:DATABASE_URL = $val
    }
  }
}

if (-not $env:DATABASE_URL) {
  Write-Host "DATABASE_URL não encontrado. Verifique o arquivo backend\\.env"
  exit 1
}

$root = (Get-Location).Path
$boletosDir = (Join-Path $root "boletos")
$enviadosDir = (Join-Path $root "enviados")
$erroDir = (Join-Path $root "erro")
$env:BOLETOS_DIR = $boletosDir
$env:ENVIADOS_DIR = $enviadosDir
$env:ERRO_DIR = $erroDir

Write-Host ("Pasta boletos:   " + $boletosDir)
Write-Host ("Pasta enviados: " + $enviadosDir)
Write-Host ("Pasta erro:     " + $erroDir)

$pyCmd = "python"
if (Get-Command "py" -ErrorAction SilentlyContinue) { $pyCmd = "py" }

if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
  try {
    & $pyCmd -m venv .venv | Out-Host
  } catch {
    $_ | Out-Host
  }
}

$python = "python"
if (Test-Path ".\.venv\Scripts\python.exe") { $python = ".\.venv\Scripts\python.exe" }

$port = 8000
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $owningPid = $listener.OwningProcess
  $proc = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $owningPid) -ErrorAction SilentlyContinue
  $cmd = ""
  if ($proc) { $cmd = [string]$proc.CommandLine }
  if ($cmd -and ($cmd -match "uvicorn") -and ($cmd -match "main:app") -and ($cmd -match "automation-backend")) {
    try {
      Stop-Process -Id $owningPid -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 1
    } catch {
      Write-Host ("Porta 8000 em uso e não consegui encerrar o processo PID " + $owningPid)
      exit 1
    }
  } else {
    Write-Host ("Porta 8000 já está em uso (PID " + $owningPid + "). Feche o processo que está usando a porta e rode novamente.")
    exit 1
  }
}

& $python -m pip install -r requirements.txt | Out-Host
& $python -m uvicorn main:app --host 127.0.0.1 --port 8000 | Out-Host
