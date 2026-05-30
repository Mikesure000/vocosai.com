param(
  [string]$ProjectRoot = "E:\codex\vocos-local\my-vocos-project-main\fullstack",
  [string]$ShortcutName = "VocosFullstack.lnk"
)

$ErrorActionPreference = "Stop"

$startScript = Join-Path $ProjectRoot "scripts\start-server.ps1"
if (-not (Test-Path -LiteralPath $startScript)) {
  throw "Missing start script: $startScript"
}

$startup = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startup $ShortcutName

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`""
$shortcut.WorkingDirectory = $ProjectRoot
$shortcut.IconLocation = "powershell.exe,0"
$shortcut.Save()

Write-Host "Installed startup shortcut: $shortcutPath"
