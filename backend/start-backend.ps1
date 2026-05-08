$ErrorActionPreference = "Continue"

Set-Location -LiteralPath "C:\Users\andre\Desktop\gestao andreoli\backend"

$npm = "C:\Program Files\nodejs\npm.cmd"
if (-not (Test-Path $npm)) { $npm = "npm" }

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
    $_ | Out-Host
  }
  Start-Sleep -Seconds 3
}
