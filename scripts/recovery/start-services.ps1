# Starts the Goodnight TreeHole development services as detached processes.
#
# The API, front and admin dev servers are long-lived. Launching them from a shell
# that owns the process group means they die when that shell is recycled, so they are
# started with Start-Process and their output is written to artifacts/recovery/.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/recovery/start-services.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/recovery/start-services.ps1 -Only api
#   powershell -ExecutionPolicy Bypass -File scripts/recovery/start-services.ps1 -Reclaim
#   powershell -ExecutionPolicy Bypass -File scripts/recovery/start-services.ps1 -Stop
#
# -Reclaim stops whatever else holds a service port first. Browser-flow suites in this
# repository start their own API/front/admin against a test schema and do not always stop
# them, and a leftover stack serving a different database would otherwise silently receive
# this project's traffic.
#
# Prerequisites: Node on PATH, and the infrastructure up (scripts/recovery/ensure-infra.mjs).

param(
  [ValidateSet('api', 'front', 'admin', 'all')]
  [string[]]$Only = @('all'),
  [switch]$Stop,
  [switch]$Reclaim
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$logDir = Join-Path $repoRoot 'artifacts\recovery'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$services = @{
  api   = @{ Script = 'dev:api';   Port = 3000; Health = 'http://127.0.0.1:3000/api/health' }
  front = @{ Script = 'dev:h5';    Port = 5173; Health = 'http://127.0.0.1:5173/pages/tonight/index' }
  admin = @{ Script = 'dev:admin'; Port = 5174; Health = 'http://127.0.0.1:5174/login' }
}

if ($Only -contains 'all') { $Only = @('api', 'front', 'admin') }

function Get-ServiceProcess([int]$Port) {
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($connection) { Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue }
}

# PIDs of the processes this script started, so a port held by something else is not
# mistaken for our own service.
$pidFile = Join-Path $logDir 'service-pids.json'
$knownPids = @{}
if (Test-Path $pidFile) {
  try {
    (Get-Content $pidFile -Raw | ConvertFrom-Json).PSObject.Properties |
      ForEach-Object { $knownPids[$_.Name] = [int]$_.Value }
  } catch { }
}

function Save-KnownPids([hashtable]$Map) {
  $object = [ordered]@{}
  foreach ($key in $Map.Keys) { $object[$key] = $Map[$key] }
  $object | ConvertTo-Json | Set-Content -Path $pidFile -Encoding UTF8
}

if ($Stop) {
  foreach ($name in $Only) {
    $process = Get-ServiceProcess $services[$name].Port
    if ($process) {
      Write-Host "stopping $name (pid $($process.Id))"
      Stop-Process -Id $process.Id -Force
    } else {
      Write-Host "$name not listening on $($services[$name].Port)"
    }
    $knownPids.Remove($name)
  }
  Save-KnownPids $knownPids
  exit 0
}

foreach ($name in $Only) {
  $service = $services[$name]
  $existing = Get-ServiceProcess $service.Port
  if ($existing) {
    $isOurs = $knownPids.ContainsKey($name) -and $knownPids[$name] -eq $existing.Id
    if ($isOurs) {
      Write-Host "$name already running (pid $($existing.Id), started by this script)"
      continue
    }
    # Something else owns the port - typically a browser-flow suite that started its own
    # stack against a test schema and never stopped it. Skipping silently would send this
    # project's traffic to that schema, so say so and let the caller decide.
    Write-Host "WARNING: port $($service.Port) for $name is held by a foreign process (pid $($existing.Id))."
    Write-Host "         That process may be serving a different database. Pass -Reclaim to stop it and start ours."
    if (-not $Reclaim) { continue }
    Write-Host "         reclaiming port $($service.Port) from pid $($existing.Id)"
    Stop-Process -Id $existing.Id -Force
    Start-Sleep -Seconds 2
  }

  $stdout = Join-Path $logDir "$name.log"
  $stderr = Join-Path $logDir "$name.err.log"
  $process = Start-Process -FilePath 'node' `
    -ArgumentList @('scripts/recovery/with-env.mjs', 'pnpm', $service.Script) `
    -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -WindowStyle Hidden -PassThru
  Write-Host "started $name (pid $($process.Id)) -> $stdout"
  $knownPids[$name] = $process.Id
}
Save-KnownPids $knownPids

$deadline = (Get-Date).AddSeconds(60)
foreach ($name in $Only) {
  $service = $services[$name]
  $ready = $false
  while ((Get-Date) -lt $deadline -and -not $ready) {
    try {
      $response = Invoke-WebRequest -Uri $service.Health -TimeoutSec 5 -UseBasicParsing
      $ready = $response.StatusCode -eq 200
    } catch {
      Start-Sleep -Milliseconds 1500
    }
  }
  if ($ready) { Write-Host "$name healthy on $($service.Port)" }
  else { Write-Host "$name NOT healthy on $($service.Port) after 60s" }
}
