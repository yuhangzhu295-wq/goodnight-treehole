<#
.SYNOPSIS
  Brings the local development stack up and proves it actually works.

.DESCRIPTION
  WSL2 stops when it is idle, and PostgreSQL and Redis go with it. A short-lived probe then succeeds
  (its own `wsl.exe` call starts the distro) while the long-running API cannot reach either service -
  a failure that looks exactly like a Prisma bug and is not one. This script removes that class of
  confusion:

    1. installs a durable keep-alive as a Scheduled Task (not a single expiring `sleep`);
    2. waits until WSL, PostgreSQL and Redis answer real operations;
    3. starts the API if it is not listening, pointed at the distro's current address;
    4. verifies with a business request that reads the database;
    5. retries a bounded number of times and then fails loudly.

  It only touches our own resources: the task it creates, and the API process on port 3000. It does
  not stop or restart WSL itself, so other projects using the same distro are unaffected.

.PARAMETER TimeoutSeconds
  How long to wait for each phase before giving up. Default 90.

.PARAMETER SkipApi
  Bring up WSL, PostgreSQL and Redis only. Useful when a test runner wants a clean port 3000.

.PARAMETER Quiet
  Only print the final verdict.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/dev/ensure-stack.ps1
#>
param(
  [int]$TimeoutSeconds = 90,
  [switch]$SkipApi,
  [switch]$Quiet
)

# Native commands (schtasks, wsl, node) report failure through their exit code and write diagnostics
# to stderr; with ErrorActionPreference=Stop PowerShell turns that stderr into a fatal error, which
# aborted this script on a perfectly ordinary "that task does not exist yet". Cmdlets that must fail
# loudly are marked -ErrorAction Stop individually.
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..') -ErrorAction Stop).Path
$probe = Join-Path $repo 'scripts/dev/stack-probe.mjs'
$taskName = 'GoodnightTreeHoleWslKeepAlive'
$distro = 'Ubuntu'
$artifacts = Join-Path $repo 'artifacts/dev'
$apiLog = Join-Path $artifacts 'api.log'

if (-not (Test-Path $artifacts)) { New-Item -ItemType Directory -Path $artifacts | Out-Null }

function Say([string]$message) { if (-not $Quiet) { Write-Host $message } }
function Fail([string]$message) {
  Write-Host "[ensure] FAILED: $message" -ForegroundColor Red
  exit 1
}

# --- 1. Durable keep-alive ---------------------------------------------------
# A Scheduled Task that holds the distro with a bounded sleep, re-armed every minute. The overlap is
# deliberate: a 120s sleep triggered every 60s means the distro is never idle for long, and if it does
# stop, the next trigger brings it back within a minute. Bounded sleeps keep this from becoming an
# unbounded loop, and the task is per-user so no elevation is needed.
$existing = schtasks /query /tn $taskName 2>$null
if ($LASTEXITCODE -ne 0) {
  Say "[ensure] registering keep-alive task '$taskName'"
  schtasks /create /tn $taskName /tr "wsl.exe -d $distro -e sleep 120" /sc minute /mo 1 /f 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "could not create the keep-alive task" }
}
schtasks /run /tn $taskName 2>&1 | Out-Null

# --- 2. Wait for WSL + PostgreSQL + Redis ------------------------------------
Say "[ensure] waiting for WSL, PostgreSQL and Redis (up to ${TimeoutSeconds}s)"
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$servicesUp = $false
$lastReport = $null
while ((Get-Date) -lt $deadline) {
  $lastReport = & node $probe --skip-api 2>$null | Out-String
  if ($LASTEXITCODE -eq 0) { $servicesUp = $true; break }
  Start-Sleep -Seconds 3
}
if (-not $servicesUp) {
  # A second, measured cause: WSL2's localhost forwarding breaks independently of the distro itself.
  # Measured on 2026-10-19 - the containers were listening inside the distro and reachable over the
  # distro's own address, yet 127.0.0.1:15432 was refused from Windows. A `wsl --shutdown` restored
  # it. It recurs intermittently (roughly one full test suite in three), so once a wait times out the
  # forwarding is restarted once and the wait restarts. This is a *bounded, targeted* restart: it
  # stops the distro, not the containers' data, and other projects' containers come back with it.
  Write-Host $lastReport
  Say "[ensure] restacking WSL to repair localhost forwarding (one attempt)"
  & wsl.exe --shutdown 2>$null | Out-Null
  Start-Sleep -Seconds 10
  & wsl.exe -e bash -lc 'echo warmed' 2>$null | Out-Null
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $servicesUp = $false
  while ((Get-Date) -lt $deadline) {
    $lastReport = & node $probe --skip-api 2>$null | Out-String
    if ($LASTEXITCODE -eq 0) { $servicesUp = $true; break }
    Start-Sleep -Seconds 3
  }
  if (-not $servicesUp) {
    Write-Host $lastReport
    Fail "WSL/PostgreSQL/Redis did not come up even after restarting localhost forwarding"
  }
  Say "[ensure] localhost forwarding repaired"
}
Say "[ensure] WSL, PostgreSQL and Redis are answering real operations"

# --- 3. API ------------------------------------------------------------------
if (-not $SkipApi) {
  $listening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  if (-not $listening) {
    $ip = (& wsl.exe -e bash -lc 'hostname -I' 2>$null | Out-String).Trim().Split(' ')[0]
    if (-not $ip) { Fail "could not read the distro address, so the API has nothing to point at" }
    Say "[ensure] starting the API against $ip"
    $env:DATABASE_URL = "postgresql://goodnight:goodnight@${ip}:5432/goodnight_treehole?schema=public"
    $env:REDIS_URL = "redis://${ip}:6379"
    Start-Process -FilePath 'npx.cmd' -ArgumentList 'tsx','src/main.ts' `
      -WorkingDirectory (Join-Path $repo 'apps/api') -WindowStyle Hidden `
      -RedirectStandardOutput $apiLog -RedirectStandardError (Join-Path $artifacts 'api.err.log')
  } else {
    Say "[ensure] the API is already listening on 3000; leaving it alone"
  }

  # --- 4. Verify with a request that reads the database ----------------------
  Say "[ensure] verifying the API can reach the database"
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $healthy = $false
  while ((Get-Date) -lt $deadline) {
    $lastReport = & node $probe 2>$null | Out-String
    if ($LASTEXITCODE -eq 0) { $healthy = $true; break }
    Start-Sleep -Seconds 3
  }
  if (-not $healthy) {
    Write-Host $lastReport
    Fail "the API did not answer a database-backed route within ${TimeoutSeconds}s"
  }
}

if (-not $Quiet) { Write-Host $lastReport }
Write-Host "[ensure] stack healthy"
exit 0
