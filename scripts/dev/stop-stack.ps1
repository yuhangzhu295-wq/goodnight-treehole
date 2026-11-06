<#
.SYNOPSIS
  Stops what ensure-stack.ps1 started: our API process, and optionally the keep-alive task.

.DESCRIPTION
  Deliberately narrow. It does not stop WSL, PostgreSQL or Redis, because other projects share the
  same distro and stopping it would break them. It stops:

    - the process listening on port 3000, after checking that it is a node process, so an unrelated
      service that happens to hold that port is reported rather than killed;
    - the keep-alive Scheduled Task, only when -RemoveKeepAlive is passed.

.PARAMETER RemoveKeepAlive
  Also delete the GoodnightTreeHoleWslKeepAlive task. Without it, WSL will idle out again.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/dev/stop-stack.ps1
#>
param(
  [switch]$RemoveKeepAlive
)

$ErrorActionPreference = 'Stop'
$taskName = 'GoodnightTreeHoleWslKeepAlive'

$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  if (-not $process) {
    Write-Host "[stop] port 3000 is held by pid $($listener.OwningProcess), which is already gone"
  } elseif ($process.ProcessName -notmatch '^(node|npx|tsx)') {
    Write-Host "[stop] port 3000 is held by '$($process.ProcessName)' (pid $($process.Id)), which is not ours - leaving it alone" -ForegroundColor Yellow
  } else {
    Write-Host "[stop] stopping the API ($($process.ProcessName), pid $($process.Id))"
    Stop-Process -Id $process.Id -Force
  }
} else {
  Write-Host "[stop] nothing is listening on 3000"
}

if ($RemoveKeepAlive) {
  schtasks /delete /tn $taskName /f 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "[stop] removed the keep-alive task; WSL will idle out again"
  } else {
    Write-Host "[stop] the keep-alive task was not present"
  }
} else {
  Write-Host "[stop] keep-alive task left in place (pass -RemoveKeepAlive to delete it)"
}

Write-Host "[stop] WSL and its services were left running for other projects"
exit 0
