param(
  [string]$ProjectRoot = "E:\codex\vocos-local\my-vocos-project-main\fullstack",
  [string]$Python = "C:\Users\daxia\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Python)) {
  throw "Python executable not found: $Python"
}

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "app.py"))) {
  throw "app.py not found under: $ProjectRoot"
}

Set-Location -LiteralPath $ProjectRoot
& $Python "app.py"
