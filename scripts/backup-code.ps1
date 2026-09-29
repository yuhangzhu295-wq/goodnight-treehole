# Backs up the Goodnight TreeHole repository: git bundle, local mirror, and a report.
#
# Produces a self-contained bundle of every branch and tag, keeps a bare mirror in
# sync, and verifies both. Contains no secrets - a bundle carries committed history
# only, and .env is gitignored so it can never enter the repository.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/backup-code.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/backup-code.ps1 -BackupRoot E:\Backups

param(
  [string]$BackupRoot
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$failures = @()

function Resolve-BackupRoot([string]$Requested) {
  if ($Requested) { return $Requested }
  # D: is the documented location, but it is a removable volume on this machine and
  # is not always present, so fall back to the user profile rather than failing.
  if (Test-Path 'D:\') { return 'D:\Backups' }
  return (Join-Path $env:USERPROFILE 'Backups')
}

$backupRoot = Resolve-BackupRoot $BackupRoot
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
Write-Host "backup root: $backupRoot"

Push-Location $repoRoot
try {
  Write-Host '==> git fetch --all --tags --prune'
  git fetch --all --tags --prune
  if ($LASTEXITCODE -ne 0) { throw "git fetch failed with exit code $LASTEXITCODE" }

  $bundle = Join-Path $backupRoot "goodnight-treehole-$stamp.bundle"
  Write-Host "==> git bundle create $bundle --all"
  git bundle create $bundle --all
  if ($LASTEXITCODE -ne 0) { $failures += "git bundle create exited $LASTEXITCODE" }

  if (Test-Path $bundle) {
    $size = (Get-Item $bundle).Length
    Write-Host "bundle size: $size bytes"
    if ($size -le 0) { $failures += 'bundle is empty' }

    Write-Host '==> git bundle verify'
    git bundle verify $bundle
    if ($LASTEXITCODE -ne 0) { $failures += "git bundle verify exited $LASTEXITCODE" }
  } else {
    $failures += 'bundle file was not created'
  }

  $mirror = Join-Path $backupRoot 'goodnight-treehole.git'
  if (Test-Path $mirror) {
    Write-Host "==> git remote update --prune in $mirror"
    git --git-dir $mirror remote update --prune
    if ($LASTEXITCODE -ne 0) { $failures += "mirror update exited $LASTEXITCODE" }
  } else {
    Write-Host "==> git clone --mirror -> $mirror"
    git clone --mirror $repoRoot $mirror
    if ($LASTEXITCODE -ne 0) { $failures += "git clone --mirror exited $LASTEXITCODE" }
  }

  if (Test-Path $mirror) {
    Write-Host '==> mirror refs'
    git --git-dir $mirror for-each-ref --format='%(refname)' | ForEach-Object { Write-Host "  $_" }
    Write-Host '==> mirror integrity'
    git --git-dir $mirror fsck --connectivity-only
    if ($LASTEXITCODE -ne 0) { $failures += "mirror fsck exited $LASTEXITCODE" }
  }

  # Anything committed locally but never pushed is the exact loss this whole exercise
  # is meant to prevent, so surface it loudly.
  $branch = git rev-parse --abbrev-ref HEAD
  $unpushed = git log "origin/$branch..HEAD" --oneline 2>$null
  if ($unpushed) {
    Write-Host ''
    Write-Host "WARNING: $($unpushed.Count) commit(s) on ${branch} are not on origin/${branch}:"
    $unpushed | ForEach-Object { Write-Host "  $_" }
    $failures += "unpushed commits on $branch"
  } else {
    Write-Host "no unpushed commits on $branch"
  }

  $report = [ordered]@{
    timestamp      = (Get-Date).ToString('o')
    repository     = $repoRoot
    backupRoot     = $backupRoot
    bundle         = $bundle
    bundleBytes    = if (Test-Path $bundle) { (Get-Item $bundle).Length } else { 0 }
    mirror         = $mirror
    branch         = $branch
    head           = (git rev-parse HEAD)
    unpushedCount  = if ($unpushed) { @($unpushed).Count } else { 0 }
    failures       = $failures
    ok             = ($failures.Count -eq 0)
  }
  $reportPath = Join-Path $backupRoot "backup-code-$stamp.json"
  $report | ConvertTo-Json -Depth 4 | Set-Content -Path $reportPath -Encoding UTF8
  Write-Host "report: $reportPath"
} finally {
  Pop-Location
}

if ($failures.Count -gt 0) {
  Write-Host "`n=== code backup FAILED ==="
  $failures | ForEach-Object { Write-Host "  - $_" }
  exit 1
}
Write-Host "`n=== code backup PASS ==="
exit 0
