$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\.."
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outFile = Join-Path $root "backups\vault_backup_$timestamp.sql"

Write-Host "Creating PostgreSQL backup to $outFile"
docker compose exec -T postgres pg_dump -U vault -d somb_vault > $outFile
Write-Host "Backup complete"
