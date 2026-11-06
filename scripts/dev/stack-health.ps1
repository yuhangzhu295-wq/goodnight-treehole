<#
.SYNOPSIS
  Reports whether the development stack is actually working. Read-only.

.DESCRIPTION
  Runs scripts/dev/stack-probe.mjs and prints one line per dependency. Every check performs the
  operation the product performs - a real query, a real PING, a real database-backed HTTP request -
  because a listening port proves only that something is bound to it.

  This script changes nothing: it does not start WSL, the API, or any task. Use ensure-stack.ps1 for
  that.

  Exit codes: 0 = healthy, 1 = at least one dependency is down.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/dev/stack-health.ps1
#>
param(
  [string]$ApiBase = 'http://127.0.0.1:3000'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$probe = Join-Path $repo 'scripts/dev/stack-probe.mjs'

$json = & node $probe --api-base $ApiBase 2>$null | Out-String
$exit = $LASTEXITCODE

try {
  $report = $json | ConvertFrom-Json
} catch {
  Write-Host 'could not parse the probe output:' -ForegroundColor Red
  Write-Host $json
  exit 1
}

function Line([string]$name, $check, [string]$extra = '') {
  $mark = if ($check.ok) { 'OK  ' } else { 'DOWN' }
  $color = if ($check.ok) { 'Green' } else { 'Red' }
  Write-Host ("  {0}  {1,-10} {2} {3}" -f $mark, $name, $check.detail, $extra) -ForegroundColor $color
}

Write-Host ""
Write-Host "GoodnightTreeHole stack - $($report.at)"
Write-Host "  WSL        $($report.wsl.distro) / $($report.wsl.state) / $($report.wsl.ip)"
Line 'PostgreSQL' $report.postgres
Line 'Redis'      $report.redis
Line 'API'        $report.api "($ApiBase)"
Write-Host ""

if ($exit -eq 0) {
  Write-Host 'VERDICT: healthy' -ForegroundColor Green
} else {
  Write-Host 'VERDICT: unhealthy - run scripts/dev/ensure-stack.ps1' -ForegroundColor Red
}
exit $exit
