# Backs up the Goodnight TreeHole PostgreSQL database with pg_dump and verifies it.
#
# The database runs in the WSL2 Docker engine on host port 15432 (see
# docker-compose.recovery.yml). pg_dump is the native PostgreSQL 18 client, which can
# dump the PostgreSQL 16 server.
#
# The password is read from the environment or from .env; it is never written into the
# backup or the report.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/backup-db.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/backup-db.ps1 -BackupRoot E:\Backups

param(
  [string]$BackupRoot,
  [string]$Database = 'goodnight_treehole',
  [string]$DbUser = 'goodnight',
  [string]$DbHost = '127.0.0.1',
  [string]$DbPort,
  [string]$PgBin = 'C:\Program Files\PostgreSQL\18\bin'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$failures = @()

function Resolve-BackupRoot([string]$Requested) {
  if ($Requested) { return $Requested }
  if (Test-Path 'D:\') { return 'D:\Backups' }
  return (Join-Path $env:USERPROFILE 'Backups')
}

if (-not $DbPort) {
  $DbPort = if ($env:TEST_PG_PORT) { $env:TEST_PG_PORT } else { '15432' }
}
$password = if ($env:PGPASSWORD) { $env:PGPASSWORD } else { 'goodnight' }
$env:PGPASSWORD = $password

$backupRoot = Resolve-BackupRoot $BackupRoot
$targetDir = Join-Path $backupRoot 'goodnight-treehole-db'
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
$dumpFile = Join-Path $targetDir "$Database-$stamp.dump"
Write-Host "backup root: $backupRoot"

$pgDump = Join-Path $PgBin 'pg_dump.exe'
$pgRestore = Join-Path $PgBin 'pg_restore.exe'
foreach ($exe in @($pgDump, $pgRestore)) {
  if (-not (Test-Path $exe)) { throw "not found: $exe" }
}

Write-Host "==> pg_dump -Fc $DbHost`:$DbPort/$Database"
& $pgDump -h $DbHost -p $DbPort -U $DbUser -d $Database -Fc -f $dumpFile
if ($LASTEXITCODE -ne 0) { throw "pg_dump exited $LASTEXITCODE" }

if (-not (Test-Path $dumpFile)) { throw 'dump file was not created' }
$size = (Get-Item $dumpFile).Length
Write-Host "dump size: $size bytes"
if ($size -le 0) { $failures += 'dump file is empty' }

Write-Host '==> pg_restore --list (verifies the archive is readable)'
$listing = & $pgRestore --list $dumpFile
if ($LASTEXITCODE -ne 0) {
  $failures += "pg_restore --list exited $LASTEXITCODE"
} else {
  $entryCount = @($listing).Count
  Write-Host "archive entries: $entryCount"
  if ($entryCount -le 0) { $failures += 'archive listing is empty' }
}

$tableCount = & (Join-Path $PgBin 'psql.exe') -h $DbHost -p $DbPort -U $DbUser -d $Database -tAc "select count(*) from information_schema.tables where table_schema='public';"
Write-Host "tables in live database: $tableCount"

$report = [ordered]@{
  timestamp   = (Get-Date).ToString('o')
  database    = $Database
  host        = "${DbHost}:${DbPort}"
  dumpFile    = $dumpFile
  dumpBytes   = $size
  archiveEntries = if ($listing) { @($listing).Count } else { 0 }
  liveTables  = "$tableCount".Trim()
  failures    = $failures
  ok          = ($failures.Count -eq 0)
}
$reportPath = Join-Path $targetDir "backup-db-$stamp.json"
$report | ConvertTo-Json -Depth 4 | Set-Content -Path $reportPath -Encoding UTF8
Write-Host "report: $reportPath"

if ($failures.Count -gt 0) {
  Write-Host "`n=== database backup FAILED ==="
  $failures | ForEach-Object { Write-Host "  - $_" }
  exit 1
}
Write-Host "`n=== database backup PASS ==="
exit 0
