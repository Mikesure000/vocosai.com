# VOCOS 后端一键启动/状态检查
# 用法: 右键 → "使用 PowerShell 运行"，或在终端: .\start.ps1

Set-Location $PSScriptRoot

Write-Host "=== VOCOS ===" -ForegroundColor Cyan

# 检查是否已经在运行
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "✅ 服务已在运行: v$($health.version)" -ForegroundColor Green
    Write-Host "   http://localhost:3000" -ForegroundColor White
    Write-Host "   账号: admin@vocos.local / admin123" -ForegroundColor White
    return
} catch {}

# 设置环境变量（一次性，之后存在 .env 中 dotenv 会自动加载）
Write-Host "启动中..."

# 后台启动（独立进程，关闭终端不受影响）
$node = "C:\Users\daxia\.workbuddy\binaries\node\versions\22.12.0\node.exe"
$job = Start-Job -Name "vocos-server" -ScriptBlock {
    param($nodePath, $workDir)
    Set-Location $workDir
    & $nodePath src/run-server.mjs 2>&1 | Out-Null
} -ArgumentList $node, $PSScriptRoot

Start-Sleep -Seconds 3

# 验证
try {
    $h = Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 5
    Write-Host "✅ 启动成功 v$($h.version) | http://localhost:3000" -ForegroundColor Green
    Write-Host "   管理员: admin@vocos.local / admin123" -ForegroundColor White
} catch {
    Write-Host "❌ 启动失败，请检查 E:\workbuddy\vocos\backend\.env 配置" -ForegroundColor Red
}
