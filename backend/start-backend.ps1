$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $here

function Resolve-Npm {
  $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $cmd) { $cmd = Get-Command npm -ErrorAction SilentlyContinue }
  if (-not $cmd) { throw "npm não encontrado. Instale Node.js e reabra o terminal." }
  return $cmd.Source
}

$npm = Resolve-Npm

if (-not (Test-Path (Join-Path $here "node_modules"))) {
  Write-Host "node_modules não encontrado. Rodando npm install..." -ForegroundColor White
  & $npm install | Out-Host
}

function Wait-Postgres {
  $deadline = (Get-Date).AddMinutes(2)
  while ((Get-Date) -lt $deadline) {
    try {
      $c = Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue
      if ($c) { return $true }
    } catch {}
    Start-Sleep -Seconds 2
  }
  return $false
}

while ($true) {
  try {
    Wait-Postgres | Out-Null
    & $npm run dev | Out-Host
  } catch {
    Write-Host ("Backend caiu: " + $_.Exception.Message) -ForegroundColor Yellow
  }
  Start-Sleep -Seconds 3
}
