# VOCOS 注册为 Windows 开机自启动
# 右键 → "使用 PowerShell 运行"（以管理员身份）

$taskName = "VocosBackend"
$workDir = "E:\workbuddy\vocos\backend"
$node = "C:\Users\daxia\.workbuddy\binaries\node\versions\22.12.0\node.exe"

Write-Host "=== VOCOS 开机自启动注册 ===" -ForegroundColor Cyan

# 删除旧任务（如果存在）
schtasks /Delete /TN $taskName /F 2>$null | Out-Null

# 创建计划任务：开机自动运行，30秒延迟等网络就绪
schtasks /Create /TN $taskName /TR "$node src/run-server.mjs" /SC ONLOGON /DELAY 0000:30 /IT /F /RU "$env:USERDOMAIN\$env:USERNAME" /RP *
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 已注册开机自启动" -ForegroundColor Green
}
else {
    Write-Host "正在尝试系统级注册..." -ForegroundColor Yellow
    # 管理员模式：SYSTEM 账户运行
    schtasks /Create /TN $taskName /TR "cmd /c cd /d $workDir && $node src/run-server.mjs" /SC ONSTART /DELAY 0000:30 /F /RU SYSTEM
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ 已注册系统级自启动" -ForegroundColor Green
    } else {
        Write-Host "❌ 注册失败，请以管理员身份运行此脚本" -ForegroundColor Red
    }
}

# 现在立即启动一次
Write-Host "正在启动服务..."
$process = Start-Process -FilePath $node -ArgumentList "src/run-server.mjs" -WorkingDirectory $workDir -WindowStyle Hidden -PassThru
Start-Sleep 3
try {
    $h = Invoke-RestMethod "http://localhost:3000/health" -TimeoutSec 5
    Write-Host "✅ 服务运行中 v$($h.version)" -ForegroundColor Green
    Write-Host ""
    Write-Host "=== 以后直接打开浏览器 ===" -ForegroundColor Cyan
    Write-Host "http://localhost:3000" -ForegroundColor White
    Write-Host "admin@vocos.local  /  admin123" -ForegroundColor White
} catch {
    Write-Host "⚠ 可能需要重启电脑后生效" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "按任意键关闭..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
