<#
.SYNOPSIS
  Watches the development stack during a long task and repairs it a bounded number of times.

.DESCRIPTION
  Long runs (a full test suite, an Android capture pass) outlive WSL's idle timer. When the stack
  drops mid-run the failures look like product regressions - a different file each time, all
  "Can't reach database server". This script turns that into one recoverable event:

    - every IntervalSeconds it runs the real probe;
    - on failure it calls ensure-stack.ps1, which repairs and re-verifies with a business request;
    - consecutive failures are counted, and after MaxConsecutiveFailures it stops with a non-zero
      exit instead of looping forever.

  Run it in a separate window while working. It only touches our own task and our own API process.

.PARAMETER IntervalSeconds
  Seconds between checks. Default 60.

.PARAMETER MaxConsecutiveFailures
  How many repairs in a row may fail before giving up. Default 3.

.PARAMETER DurationMinutes
  0 (default) watches until interrupted. Otherwise stops after this many minutes.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/dev/stack-watch.ps1 -DurationMinutes 120
#>
param(
  [int]$IntervalSeconds = 60,
  [int]$MaxConsecutiveFailures = 3,
  [int]$DurationMinutes = 0
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$probe = Join-Path $repo 'scripts/dev/stack-probe.mjs'
$ensure = Join-Path $PSScriptRoot 'ensure-stack.ps1'
$artifacts = Join-Path $repo 'artifacts/dev'
if (-not (Test-Path $artifacts)) { New-Item -ItemType Directory -Path $artifacts | Out-Null }
$log = Join-Path $artifacts 'stack-watch.log'

function Log([string]$message) {
  $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message
  Write-Host $line
  Add-Content -Path $log -Value $line
}

Log "[watch] started (interval ${IntervalSeconds}s, give up after $MaxConsecutiveFailures consecutive repair failures)"

$consecutiveFailures = 0
$checks = 0
$repairs = 0
$started = Get-Date

while ($true) {
  if ($DurationMinutes -gt 0 -and ((Get-Date) - $started).TotalMinutes -ge $DurationMinutes) {
    Log "[watch] duration reached; checks=$checks repairs=$repairs"
    exit 0
  }

  $checks += 1
  & node $probe 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    if ($consecutiveFailures -gt 0) { Log "[watch] recovered (was $consecutiveFailures failure(s))" }
    $consecutiveFailures = 0
  } else {
    $repairs += 1
    Log "[watch] probe failed; repairing (attempt $($consecutiveFailures + 1)/$MaxConsecutiveFailures)"
    & powershell -NoProfile -ExecutionPolicy Bypass -File $ensure -Quiet 2>&1 | ForEach-Object { Log "  $_" }
    if ($LASTEXITCODE -eq 0) {
      Log "[watch] repair verified with a business request"
      $consecutiveFailures = 0
    } else {
      $consecutiveFailures += 1
      if ($consecutiveFailures -ge $MaxConsecutiveFailures) {
        Log "[watch] giving up after $consecutiveFailures consecutive repair failures - this needs a human"
        exit 1
      }
      Start-Sleep -Seconds ([Math]::Min(300, $IntervalSeconds * $consecutiveFailures))
      continue
    }
  }

  Start-Sleep -Seconds $IntervalSeconds
}
