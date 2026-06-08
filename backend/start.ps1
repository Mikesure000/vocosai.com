# VOCOS 后台启动（隐藏窗口，常驻运行）
Set-Location $PSScriptRoot
$node = "C:\Users\daxia\.workbuddy\binaries\node\versions\22.12.0\node.exe"

try {
    $h = Invoke-RestMethod "http://localhost:3000/health" -TimeoutSec 2
    Write-Host "VOCOS 已在运行 v$($h.version) | http://localhost:3000"
    exit 0
} catch {}

$p = Start-Process -FilePath $node -ArgumentList "src/run-server.mjs" -WindowStyle Hidden -PassThru
Start-Sleep 3

try {
    Invoke-RestMethod "http://localhost:3000/health" -TimeoutSec 3 | Out-Null
    Write-Host "VOCOS 已启动 | http://localhost:3000"
} catch {
    Write-Host "启动失败，请检查 E:\workbuddy\vocos\backend\.env"
}
