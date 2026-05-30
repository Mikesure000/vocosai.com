param(
  [string]$Config = "$env:USERPROFILE\.cloudflared\config.yml",
  [string]$Cloudflared = "E:\codex\vocos-local\.tools\cloudflared.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Cloudflared)) {
  throw "cloudflared not found: $Cloudflared"
}

if (-not (Test-Path -LiteralPath $Config)) {
  throw "cloudflared config not found: $Config"
}

& $Cloudflared tunnel --config $Config run
