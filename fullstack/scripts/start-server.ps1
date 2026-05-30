param(
  [string]$ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path,
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command $Python -ErrorAction SilentlyContinue)) {
  throw "Python executable not found on PATH: $Python"
}

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "app.py"))) {
  throw "app.py not found under: $ProjectRoot"
}

Set-Location -LiteralPath $ProjectRoot
& $Python "app.py"
