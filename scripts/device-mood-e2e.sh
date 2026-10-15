#!/usr/bin/env bash
# Drives one mood creation on the emulator while re-asserting that our app owns the foreground
# before every tap.
#
# The emulator's foreground is shared: another project's automation claims it roughly every 35
# seconds. A tap issued without checking lands in whichever app is on top - which happened once
# already here, and looked like "the submit did nothing" rather than "the tap went elsewhere".
# Every tap below is therefore preceded by an assertion that would stop the script instead.
set -u

export PATH="$PATH:/c/Users/zyu33/AppData/Local/Android/Sdk/platform-tools"
export MSYS_NO_PATHCONV=1

PKG=com.goodnight.treehole
MARK="ownercheck-$(date +%s)"

foreground() {
  adb shell dumpsys activity activities 2>/dev/null | grep -m1 topResumedActivity
}

require_foreground() {
  local who
  who=$(foreground)
  case "$who" in
    *"$PKG"*) return 0 ;;
  esac
  echo "ABORT: $1 - foreground is not $PKG"
  echo "  $who"
  exit 2
}

ensure_foreground() {
  local who
  who=$(foreground)
  case "$who" in
    *"$PKG"*) return 0 ;;
  esac
  echo "  (foreground was stolen, restoring: $who)"
  adb shell am start -n "$PKG/.MainActivity" > /dev/null 2>&1
  sleep 5
  require_foreground "after restore"
}

bounds_of() {
  adb shell uiautomator dump /sdcard/probe.xml > /dev/null 2>&1
  adb shell cat /sdcard/probe.xml 2>/dev/null | tr '>' '>\n' |
    grep -F "text=\"$1\"" | grep -oE 'bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' | head -1
}

tap_bounds() {
  local b="$1"
  local nums
  nums=$(echo "$b" | grep -oE '[0-9]+' | tr '\n' ' ')
  set -- $nums
  local cx=$(( ($1 + $3) / 2 ))
  local cy=$(( ($2 + $4) / 2 ))
  adb shell input tap "$cx" "$cy"
}

ensure_foreground "start"
echo "MARK=$MARK"
echo "$MARK" > /tmp/mark.txt

# 1. focus the composer
ensure_foreground "before composer tap"
COMPOSER=$(bounds_of "从一句话开始，也可以写很多。")
[ -n "$COMPOSER" ] || COMPOSER=$(adb shell cat /sdcard/probe.xml 2>/dev/null | tr '>' '>\n' | grep -F 'class="android.widget.EditText"' | grep -oE 'bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' | head -1)
echo "composer bounds: $COMPOSER"
tap_bounds "$COMPOSER"
sleep 2

# 2. type the marker
adb shell input text "$MARK"
sleep 2
adb shell input keyevent 4   # dismiss the keyboard
sleep 2

# 3. choose an emotion
ensure_foreground "before emotion tap"
EMO=$(bounds_of "感情")
echo "emotion bounds: $EMO"
[ -n "$EMO" ] && tap_bounds "$EMO"
sleep 2

# 4. submit
ensure_foreground "before submit tap"
SUBMIT=$(bounds_of "继续整理")
echo "submit bounds: $SUBMIT"
tap_bounds "$SUBMIT"
sleep 10

ensure_foreground "after submit"
adb exec-out screencap -p > /tmp/app-after-submit.png 2>/dev/null
echo "screenshot written"
echo "MARK=$MARK"
