$ErrorActionPreference = "Stop"
Set-Location -Path "$PSScriptRoot\.."

git config core.hooksPath .githooks
Write-Host "Git hooks path set to .githooks"
Write-Host "Pre-commit secret guard is now active"
