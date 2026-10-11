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
