param(
  [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot\..

if (-not $NoBuild) {
  docker compose --env-file .env.example up -d --build
} else {
  docker compose --env-file .env.example up -d
}

Write-Host "SOMB Vault services started."
Write-Host "Frontend: http://localhost"
Write-Host "API health: http://localhost/api/v1/health"
