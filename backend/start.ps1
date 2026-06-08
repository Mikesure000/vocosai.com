# VOCOS Backend Launcher
Set-Location $PSScriptRoot
$node = "C:\Users\daxia\.workbuddy\binaries\node\versions\22.12.0\node.exe"

try {
    $h = Invoke-RestMethod "http://localhost:3000/health" -TimeoutSec 2
    Write-Host "VOCOS already running v$($h.version) | http://localhost:3000"
    exit 0
} catch {}

$p = Start-Process -FilePath $node -ArgumentList "src/run-server.mjs" -WindowStyle Hidden -PassThru
Start-Sleep 3

try {
    Invoke-RestMethod "http://localhost:3000/health" -TimeoutSec 3 | Out-Null
    Write-Host "VOCOS started | http://localhost:3000"
    Write-Host "Login: admin@vocos.local / admin123"
} catch {
    Write-Host "Start failed. Run manually: node src/run-server.mjs"
}
