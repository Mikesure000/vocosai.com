# VOCOS 后端一键启动脚本
# 用法: 在 PowerShell 中右键此文件 → "使用 PowerShell 运行"
#       或在终端中: .\start.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=== VOCOS Backend Starter ===" -ForegroundColor Cyan

# 1. 杀掉旧进程
Write-Host "[1/4] 清理旧进程..." -ForegroundColor Yellow
Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*run-server*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# 2. 清理旧数据库（密码已和JWT_SECRET同步，旧DB必须删）
Write-Host "[2/4] 清理旧数据库..." -ForegroundColor Yellow
Remove-Item -Path "data\vocos.sqlite*" -Force -ErrorAction SilentlyContinue

# 3. 设置环境变量
Write-Host "[3/4] 加载配置..." -ForegroundColor Yellow
$env:PORT = "3000"
$env:VOCOS_JWT_SECRET = "f8c3b2a1d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4"
$env:DEEPSEEK_API_KEY = "sk-2eebae347f0e446cbf76a5e9aa585e7d"
$env:VOCOS_MODEL_MODE = "live"

# 4. 启动服务器（新窗口，关闭终端不影响）
Write-Host "[4/4] 启动服务..." -ForegroundColor Yellow
$nodePath = "C:\Users\daxia\.workbuddy\binaries\node\versions\22.12.0\node.exe"

Start-Process -FilePath $nodePath -ArgumentList "src/run-server.mjs" -NoNewWindow -PassThru

Start-Sleep -Seconds 3

# 验证
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 5
    Write-Host "`n✅ 服务启动成功！" -ForegroundColor Green
    Write-Host "   地址: http://localhost:3000" -ForegroundColor White
    Write-Host "   账号: admin@vocos.local / admin123" -ForegroundColor White
    Write-Host "   管理: http://localhost:3000 (登录后左侧\"系统管理\")" -ForegroundColor White
} catch {
    Write-Host "`n❌ 服务启动失败，请检查错误日志" -ForegroundColor Red
}

Write-Host "`n按任意键关闭此窗口（服务仍在后台运行）" -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
