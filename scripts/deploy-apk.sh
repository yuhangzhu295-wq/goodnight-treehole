#!/usr/bin/env bash
# Build the web bundle, package the debug APK, and install it so the app actually launches.
#
# `adb install -r` on this emulator intermittently leaves the package registered but the activity
# unresolvable: `am start` answers "Activity class ... does not exist" while `dumpsys package` still
# lists a MAIN/LAUNCHER filter. Only a clean uninstall + install fixes it, so that is what this does.
# App data is disposable here - every verification script creates the records it needs.
#
# Usage: scripts/deploy-apk.sh [--no-build]
set -euo pipefail

cd "$(dirname "$0")/.."
ADB="${ADB_PATH:-$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe}"
APK="apps/mp/android/app/build/outputs/apk/debug/app-debug.apk"

if [ "${1:-}" != "--no-build" ]; then
  echo "[deploy] building web bundle"
  pnpm --filter @goodnight/mp build:native-debug >/dev/null
  (cd apps/mp && npx cap sync android >/dev/null)
  echo "[deploy] packaging apk"
  (cd apps/mp/android && ./gradlew assembleDebug -q)
  # The gradle daemon holds ~1 GB. The host is the constraint on this machine (16 GB, and the WSL VM
  # gets killed when it runs out), so it does not get to stay resident between builds.
  (cd apps/mp/android && ./gradlew --stop >/dev/null 2>&1 || true)
fi

echo "[deploy] reinstalling"
MSYS_NO_PATHCONV=1 "$ADB" uninstall com.goodnight.treehole >/dev/null 2>&1 || true
MSYS_NO_PATHCONV=1 "$ADB" install "$APK" >/dev/null
MSYS_NO_PATHCONV=1 "$ADB" shell pm enable com.goodnight.treehole >/dev/null 2>&1 || true

if MSYS_NO_PATHCONV=1 "$ADB" shell cmd package resolve-activity --brief com.goodnight.treehole 2>/dev/null | grep -q MainActivity; then
  echo "[deploy] launcher resolves"
else
  echo "[deploy] ERROR: the launcher activity still does not resolve after a clean install" >&2
  exit 1
fi

MSYS_NO_PATHCONV=1 "$ADB" shell am start -n com.goodnight.treehole/.MainActivity >/dev/null 2>&1 || true
echo "[deploy] started"
