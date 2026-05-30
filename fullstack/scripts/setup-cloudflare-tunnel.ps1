param(
  [string]$Hostname = "vocosai.com",
  [string]$AliasHostname = "www.vocosai.com",
  [string]$TunnelName = "vocos",
  [string]$LocalService = "http://127.0.0.1:8090",
  [string]$Cloudflared = "cloudflared"
)

$ErrorActionPreference = "Stop"

$cloudflaredCommand = Get-Command $Cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflaredCommand) {
  throw "cloudflared not found on PATH: $Cloudflared"
}

Write-Host "Step 1: Login to Cloudflare in the browser."
& $cloudflaredCommand.Source tunnel login

Write-Host "Step 2: Create a named tunnel if it does not already exist."
& $cloudflaredCommand.Source tunnel create $TunnelName

Write-Host "Step 3: List tunnels. Copy the tunnel ID for '$TunnelName'."
& $cloudflaredCommand.Source tunnel list

$tunnelId = Read-Host "Paste tunnel ID for $TunnelName"
if (-not $tunnelId) {
  throw "Tunnel ID is required."
}

$cloudflaredDir = Join-Path $env:USERPROFILE ".cloudflared"
New-Item -ItemType Directory -Force -Path $cloudflaredDir | Out-Null
$configPath = Join-Path $cloudflaredDir "config.yml"
$config = @"
tunnel: $tunnelId
credentials-file: $cloudflaredDir\$tunnelId.json

ingress:
  - hostname: $Hostname
    service: $LocalService
  - hostname: $AliasHostname
    service: $LocalService
  - service: http_status:404
"@
$config | Set-Content -LiteralPath $configPath -Encoding UTF8

Write-Host "Step 4: Route DNS to the tunnel."
& $cloudflaredCommand.Source tunnel route dns $TunnelName $Hostname
if ($AliasHostname) {
  & $cloudflaredCommand.Source tunnel route dns $TunnelName $AliasHostname
}

Write-Host "Step 5: Install cloudflared as a Windows service."
& $cloudflaredCommand.Source service install

Write-Host "Cloudflare Tunnel configured for https://$Hostname"
Write-Host "Config written to $configPath"
