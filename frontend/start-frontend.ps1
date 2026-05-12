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

while ($true) {
  try {
    & $npm run dev -- --host 0.0.0.0 --port 5174 | Out-Host
  } catch {
    Write-Host ("Frontend caiu: " + $_.Exception.Message) -ForegroundColor Yellow
  }
  Start-Sleep -Seconds 3
}
