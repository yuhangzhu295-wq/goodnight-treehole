# Runs every Goodnight TreeHole backup: code, database, and a MinIO note.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/backup-all.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/backup-all.ps1 -BackupRoot E:\Backups
#
# Exits non-zero if any component failed. The .env file is deliberately NOT copied by
# this script: it holds secrets, and docs/private-env-backup-guide.md explains where the
# owner should keep it instead.

param(
  [string]$BackupRoot
)

$ErrorActionPreference = 'Continue'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$results = [ordered]@{}

function Invoke-Step([string]$Name, [scriptblock]$Action) {
  Write-Host ''
  Write-Host "################ $Name ################"
  try {
    & $Action
    $code = $LASTEXITCODE
  } catch {
    Write-Host "exception: $_"
    $code = 1
  }
  if ($null -eq $code) { $code = 0 }
  $results[$Name] = $code
  Write-Host "$Name exit code: $code"
}

Invoke-Step 'backup-code' {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'backup-code.ps1') @(
    if ($BackupRoot) { '-BackupRoot', $BackupRoot }
  )
}

Invoke-Step 'backup-db' {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'backup-db.ps1') @(
    if ($BackupRoot) { '-BackupRoot', $BackupRoot }
  )
}

Write-Host ''
Write-Host '################ minio ################'
# MinIO is declared in docker-compose.yml but the API never uses it: uploads are written
# to a local directory (resolveUploadsDirectory in apps/api/src/runtime-environment.ts),
# and no MINIO_* variable is read anywhere in the API source. There is therefore no
# application object store to back up. The check below only records whether the service
# is running, so a future change that starts using it is noticed.
$minioRunning = $false
try {
  $connection = Get-NetTCPConnection -LocalPort 19000 -State Listen -ErrorAction SilentlyContinue
  $minioRunning = [bool]$connection
} catch { }
Write-Host "minio reachable on 19000: $minioRunning"
Write-Host 'no application objects are stored in MinIO; see docs/disaster-recovery-inventory.md section 4'
$results['minio'] = 0

Write-Host ''
Write-Host '################ summary ################'
$failed = @()
foreach ($key in $results.Keys) {
  $status = if ($results[$key] -eq 0) { 'PASS' } else { 'FAIL' }
  Write-Host ("{0,-14} {1}" -f $key, $status)
  if ($results[$key] -ne 0) { $failed += $key }
}

$root = if ($BackupRoot) { $BackupRoot } elseif (Test-Path 'D:\') { 'D:\Backups' } else { Join-Path $env:USERPROFILE 'Backups' }
New-Item -ItemType Directory -Force -Path $root | Out-Null
$summaryPath = Join-Path $root "backup-all-$stamp.json"
([ordered]@{
  timestamp = (Get-Date).ToString('o')
  repo      = $repoRoot
  backupRoot = $root
  results   = $results
  failed    = $failed
  ok        = ($failed.Count -eq 0)
}) | ConvertTo-Json -Depth 4 | Set-Content -Path $summaryPath -Encoding UTF8
Write-Host "summary: $summaryPath"

if ($failed.Count -gt 0) {
  Write-Host "`n=== backup-all FAILED: $($failed -join ', ') ==="
  exit 1
}
Write-Host "`n=== backup-all PASS ==="
exit 0
