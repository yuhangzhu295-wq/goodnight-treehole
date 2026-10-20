# Restart the API so we own its stdout, and keep it running after this session ends.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\zyu33\Projects\goodnight-treehole'
$log = Join-Path $repo 'artifacts\api-console.log'
$errLog = Join-Path $repo 'artifacts\api-console-err.log'
$tsx = Join-Path $repo 'node_modules\.bin\tsx.CMD'
if (-not (Test-Path $tsx)) { throw "tsx not found at $tsx" }
$old = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($old) { Stop-Process -Id $old.OwningProcess -Force; Start-Sleep -Seconds 3 }
if (Test-Path $log) { Remove-Item $log -Force }
if (Test-Path $errLog) { Remove-Item $errLog -Force }
Start-Process -FilePath $tsx `
  -ArgumentList 'src\main.ts' `
  -WorkingDirectory (Join-Path $repo 'apps\api') `
  -RedirectStandardOutput $log -RedirectStandardError $errLog `
  -WindowStyle Hidden
$ok = $false
foreach ($i in 1..60) {
  Start-Sleep -Seconds 2
  $c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  if ($c) { $ok = $true; break }
}
"listening: $ok"
$c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
$pidOut = if ($c) { $c.OwningProcess } else { '' }
"pid: $pidOut"
