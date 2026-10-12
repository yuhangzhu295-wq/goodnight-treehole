# UI V2 — Issues

## ISSUE-001 — Page titles were drawn under the Android status bar (FIXED)

**Severity:** P0 for UI V2 — it affected every page, so no page could pass visual review.
**Found by:** rendering the current build on the emulator, not by reading source.
**Fixed in:** `b1252be`.

### Symptom

On `emulator-5554` (Pixel 7 / API 34) every page header collided with the system clock. On
同路人 the title `同路人` was drawn over `4:31`, and the same overlap was visible on 今晚.

### Two independent causes, both measured

**1. The top inset was never applied.** `styles.scss` used `env(safe-area-inset-bottom)` in a dozen
places and `env(safe-area-inset-top)` in exactly one unrelated file. The later, unscoped
`.phone-shell` rule set the top padding to `0`, overriding the earlier `22px`. The bottom inset
worked, which is why only the top collided.

**2. Adding the CSS inset was not enough — and this is the part worth recording.** With
`StatusBar.overlaysWebView: true` the WebView is laid out under the status bar and is expected to
inset itself with `env(safe-area-inset-top)`. Android WebView does not report that value: it resolves
to `0`.

This was verified rather than assumed. The CSS fix was built, synced, installed and rendered, and the
overlap was **identical** — the change was a no-op. Only then was the config changed.

### Fix

`overlaysWebView: false`, so Android lays the WebView out below the status bar and there is nothing to
correct and no dependence on an inset the platform does not report. The CSS now uses
`env(safe-area-inset-top)` instead of a hardcoded `22px`, which is correct if edge-to-edge is ever
re-enabled — and it is the form the V2 spec asks for, which forbids pinning a fixed top offset.

### Evidence

| File | What it shows |
| --- | --- |
| `artifacts/ui-v2/android/ISSUE-001_PeerNetwork_before.png` | 同路人 title drawn over the clock |
| `artifacts/ui-v2/android/ISSUE-001_PeerNetwork_after.png` | Status bar on its own band, title below it |

Build trail: `pnpm --filter @goodnight/mp build` → `cap sync android` → `gradlew assembleDebug` →
`adb install -r` → relaunch → navigate to 同路人 → screenshot. APK SHA and device details are in
`artifacts/ui-v2/android/device.json`.

### Not yet verified

- 360 and 430 px widths, and larger font scales. Only the 390 px baseline and the default font scale
  have been rendered.
- The keyboard-open case (`Tonight_keyboard`, `Chat_keyboard` in the state set).
- A device with a display cutout. The emulator is a Pixel 7 profile without a notch.

## ISSUE-002 — Content appears under the bottom tab bar (UNVERIFIED — may not be a defect)

**Status:** reported by me from a single screenshot, then found to be untested. Kept as a record of
the mistake rather than deleted.

On the recaptured 我的 render the last visible rows (`自我支持`, `我的现实支持`) are drawn underneath
the floating bottom navigation, with the nav labels over the row text. I wrote that the rows were
"unreachable rather than merely clipped".

**That conclusion was not tested, and the reasoning behind it is wrong.** A fixed bottom navigation
having content scroll beneath it is normal; it is only a defect if the final row cannot be scrolled
clear of the nav. The capture was taken at the initial scroll position, so it shows the middle of a
scrollable page, which is what a page with more content than one screen looks like.

The geometry does not obviously support a defect either: the tab bar is 64px tall at
`bottom: calc(8px + env(safe-area-inset-bottom))`, so it occupies 72px, and the active
`.phone-shell` rule sets `padding-bottom: 88px` — 16px of clearance, and more once the bottom inset
is non-zero.

**The test that would settle it:** open 我的, scroll to the very bottom, and check whether the last
row sits fully above the nav. If it does, close this as not-a-defect. If it does not, the scroll
container is not reserving the nav height and it is a real P0.

Not run: the emulator stopped (`adb devices` empty, no emulator process) before the scroll could be
performed, and it has not been restarted.

## ISSUE-003 — Seven of eight Round-1 screenshots showed a different application (EVIDENCE INVALID)

**Severity:** P0 for the verification chain — it made three pages look verified when they were not.
**Found by:** the `visual-judge` pass, then confirmed by opening `R1_Me_after.png` myself.

`R1_PeerNetwork_after.png`, `R1_ActionCenter_after.png`, `R1_Me_after.png`,
`R1_TonightHome_keyboard.png`, `R1_TonightHome_topics.png`,
`R1_ActionCenter_completion_sheet.png` and `R1_Me_cleanup_confirm.png` are renders of a **different
app**: a pomodoro/focus app with a rabbit mascot ("Mochi 专注中"), tabs 今天/进行中/已完成, cards
今天的专注/今日计划/任务/分心箱, and a 首页/记录/成长 bottom nav. `com.yuhangzhu295.cozyfocus` is
installed on the same emulator, and it was in the foreground when those captures were taken. Three of
the four pages — and every required interaction state — therefore had **no valid evidence at all**.

`R1_TonightHome_after.png` is genuine (I checked it directly), which is why the failure was not
obvious: one real capture sat beside seven wrong ones.

Corrected by recapturing with the other package force-stopped and the foreground verified via
`dumpsys activity activities` before each capture. `R1_Me_after_RECAPTURED.png` and
`R1_TonightHome_after_RECAPTURED.png` are the first two; **the remaining pages and all four
interaction states still need recapturing**, and until they are, Round 1's Android verification is
incomplete.

The generalisable lesson: a screenshot is only evidence once something confirms *which app* is on
screen. `adb shell dumpsys activity activities | grep topResumedActivity` costs one line and would
have caught this immediately.
