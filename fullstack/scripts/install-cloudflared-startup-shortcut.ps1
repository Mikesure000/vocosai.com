param(
  [string]$Cloudflared = "E:\codex\vocos-local\.tools\cloudflared.exe",
  [string]$Config = "$env:USERPROFILE\.cloudflared\config.yml",
  [string]$ShortcutName = "VocosCloudflared.lnk"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Cloudflared)) {
  throw "cloudflared not found: $Cloudflared"
}

if (-not (Test-Path -LiteralPath $Config)) {
  throw "cloudflared config not found: $Config"
}

$startup = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startup $ShortcutName

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $Cloudflared
$shortcut.Arguments = "tunnel --config `"$Config`" run"
$shortcut.WorkingDirectory = Split-Path $Cloudflared
$shortcut.IconLocation = "$Cloudflared,0"
$shortcut.Save()

Write-Host "Installed startup shortcut: $shortcutPath"
