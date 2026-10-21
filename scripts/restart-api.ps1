# Restart the API so we own its stdout, and keep it running after this session ends.
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\zyu33\Projects\goodnight-treehole'
$log = Join-Path $repo 'artifacts\api-console.log'
$errLog = Join-Path $repo 'artifacts\api-console-err.log'
$tsx = Join-Path $repo 'node_modules\.bin\tsx.CMD'
if (-not (Test-Path $tsx)) { throw "tsx not found at $tsx" }

# The previous instance holds the log file open, so the port check is what actually finds it.
$old = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($old) { Stop-Process -Id $old.OwningProcess -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 4 }

# Truncate rather than delete: deleting fails while the old process still holds the handle.
foreach ($f in @($log, $errLog)) {
  if (Test-Path $f) {
    try { [System.IO.File]::WriteAllText($f, '') } catch { Write-Host "could not truncate $f" }
  }
}

Start-Process -FilePath $tsx -ArgumentList 'src\main.ts' `
  -WorkingDirectory (Join-Path $repo 'apps\api') `
  -RedirectStandardOutput $log -RedirectStandardError $errLog -WindowStyle Hidden

$ok = $false
foreach ($i in 1..60) {
  Start-Sleep -Seconds 2
  $c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  if ($c) { $ok = $true; break }
}
"listening: $ok"
$c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
"pid: $(if ($c) { $c.OwningProcess } else { '' })"
