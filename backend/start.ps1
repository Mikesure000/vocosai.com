# VOCOS Backend Starter
Set-Location $PSScriptRoot
$node = "C:\Users\daxia\.workbuddy\binaries\node\versions\22.12.0\node.exe"

# check if already running
try {
    $h = Invoke-RestMethod "http://localhost:3000/health" -TimeoutSec 2
    Write-Host "=== Already running v$($h.version) ===" -ForegroundColor Green
    Write-Host "http://localhost:3000 | admin@vocos.local / admin123"
    return
} catch {}

# start server directly in this window
Write-Host "=== Starting Vocos Backend ===" -ForegroundColor Cyan
Write-Host "Account: admin@vocos.local / admin123"
Write-Host "Press Ctrl+C to stop`n"
& $node src/run-server.mjs
