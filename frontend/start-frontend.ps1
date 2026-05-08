$ErrorActionPreference = "Continue"

Set-Location -LiteralPath "C:\Users\andre\Desktop\gestao andreoli\frontend"

$npm = "C:\Program Files\nodejs\npm.cmd"
if (-not (Test-Path $npm)) { $npm = "npm" }

while ($true) {
  try {
    & $npm run dev -- --host 0.0.0.0 --port 5174 | Out-Host
  } catch {
    $_ | Out-Host
  }
  Start-Sleep -Seconds 3
}
