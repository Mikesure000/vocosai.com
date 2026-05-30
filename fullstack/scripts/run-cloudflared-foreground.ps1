param(
  [string]$Config = "$env:USERPROFILE\.cloudflared\config.yml",
  [string]$Cloudflared = "cloudflared"
)

$ErrorActionPreference = "Stop"

$cloudflaredCommand = Get-Command $Cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflaredCommand) {
  throw "cloudflared not found on PATH: $Cloudflared"
}

if (-not (Test-Path -LiteralPath $Config)) {
  throw "cloudflared config not found: $Config"
}

& $cloudflaredCommand.Source tunnel --config $Config run
