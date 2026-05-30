param(
  [string]$Cloudflared = "cloudflared",
  [string]$Config = "$env:USERPROFILE\.cloudflared\config.yml",
  [string]$ShortcutName = "VocosCloudflared.lnk"
)

$ErrorActionPreference = "Stop"

$cloudflaredCommand = Get-Command $Cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflaredCommand) {
  throw "cloudflared not found on PATH: $Cloudflared"
}

if (-not (Test-Path -LiteralPath $Config)) {
  throw "cloudflared config not found: $Config"
}

$startup = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startup $ShortcutName

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $cloudflaredCommand.Source
$shortcut.Arguments = "tunnel --config `"$Config`" run"
$shortcut.WorkingDirectory = Split-Path $cloudflaredCommand.Source
$shortcut.IconLocation = "$($cloudflaredCommand.Source),0"
$shortcut.Save()

Write-Host "Installed startup shortcut: $shortcutPath"
