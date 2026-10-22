#!/usr/bin/env bash
# Report whether the stack, the API and the emulator are actually usable - and say which one is not.
#
# Every "the database is broken" in this project turned out to be one of three different things: the
# ports were never published (wrong compose invocation), the WSL VM had been shut down, or a genuine
# crash. They need different fixes, so this names the one it sees instead of restarting everything.
#
# Usage: scripts/stack-health.sh
set -uo pipefail

cd "$(dirname "$0")/.."
fail=0

port() { netstat.exe -ano 2>/dev/null | grep -q ":$1.*LISTENING"; }

echo "== ports"
for p in 15432 16379; do
  if port "$p"; then echo "  ok    $p listening"; else echo "  DOWN  $p not listening"; fail=1; fi
done

echo "== api"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3000/api/v1/feedback/faqs || echo 000)
if [ "$code" = "200" ]; then echo "  ok    200"; else echo "  DOWN  http $code"; fail=1; fi

echo "== wsl"
if wsl.exe -e bash -lc "docker ps --format '{{.Names}}' 2>/dev/null | head -1" >/dev/null 2>&1; then
  names=$(wsl.exe -e bash -lc "docker ps --format '{{.Names}} {{.Status}}'" 2>/dev/null | tr -d '\r')
  echo "  ok    wsl reachable"
  echo "$names" | sed 's/^/        /'
else
  echo "  DOWN  wsl unreachable"; fail=1
fi

echo "== emulator"
devices=$("$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" devices 2>/dev/null | tr -d '\r' | grep -c 'device$' || true)
if [ "$devices" -ge 1 ]; then echo "  ok    $devices device(s)"; else echo "  DOWN  no device"; fail=1; fi
multi=$("$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" devices 2>/dev/null | tr -d '\r' | grep -c 'device$' || true)
if [ "$multi" -gt 1 ]; then echo "  WARN  more than one device attached; adb commands will be ambiguous"; fi

echo
if [ "$fail" -eq 0 ]; then echo "stack healthy"; else echo "stack NOT healthy — see the DOWN lines above"; fi
exit "$fail"
