# Android and iOS Native Verification

Run 2026-09-29 on the rebuilt native shell. Every result below was observed on this
machine; nothing is inferred from an earlier report.

## Status

| Flag | Value | Basis |
| --- | --- | --- |
| `ANDROID_PROJECT_REBUILT` | **true** | Real Gradle project generated at `apps/mp/android`, opens in Android Studio |
| `ANDROID_EMULATOR_VERIFIED` | **true** | APK built, installed on the AVD, launched, rendered the real UI, reached the real API, and completed a real business flow |
| `PHYSICAL_ANDROID_VERIFIED` | **false** | `adb devices -l` lists only `emulator-5554`; no physical device was connected |
| `IOS_SOURCE_READY` | **true** | `apps/mp/ios` generated and synced with the same ten plugins |
| `IOS_NATIVE_VERIFIED` | **false** | No macOS or Xcode on this machine; the iOS project was never built or run |

## Build evidence

| Item | Value |
| --- | --- |
| Command | `gradlew.bat assembleDebug` with `JAVA_HOME` = Temurin 21.0.12.1 |
| Result | `BUILD SUCCESSFUL in 1m 17s`, 394 tasks executed |
| APK | `apps/mp/android/app/build/outputs/apk/debug/app-debug.apk` |
| Size | 39,758,945 bytes |
| SHA-256 | `4b4f65ad74c945e09e4a4b27f1bba6eb63b96863363a15c0eebe11adc47c4d2a` |
| Package | `com.goodnight.treehole` |
| versionName / versionCode | `1.0` / `1` |
| minSdk / targetSdk / compileSdk | 24 / 36 / 36 |

For scale: the APK recovered from the deleted workspace was 39,828,894 bytes, so the
rebuild is within 0.2% of the original.

## Emulator evidence

`adb install -r` -> `Success`. `adb shell am start -n com.goodnight.treehole/.MainActivity`
brought the app up, and `dumpsys activity activities` reported
`topResumedActivity=ActivityRecord{... com.goodnight.treehole/.MainActivity}`. This is the
real `MainActivity`, not a browser opening a URL.

Screenshots in `artifacts/recovery/`:

| File | Shows |
| --- | --- |
| `android-01-launch.png` | The Tonight page rendered inside the app: hero "今晚怎么了？", the entry card, the six shortcut chips, the quiet-note card, and the four bottom tabs 今晚 / 同路 / 行动 / 我的. The status bar overlays the WebView (`StatusBar.overlaysWebView`) and the gesture bar sits below the tab bar. |
| `android-04-filled.png` | The textarea focused with the Android IME open, text entered (20/1000). |
| `android-07-e2e-result.png` | The Journey detail page for the journey the app just created, showing the exact text that was typed under "发生了什么" and AI-derived content under "现在". |

## API connectivity

The notification bell on the Tonight page showed a live unread badge, which only appears
when `GET /api/v1/notifications` succeeds from inside the WebView. That is the direct
answer to the historical "Failed to fetch" problem: the APK reaches the local API.

The route used is `adb reverse tcp:3000 tcp:3000` with the bundle built against
`http://127.0.0.1:3000` (see `apps/mp/.env.capacitor-debug`), so the same build works on
the emulator and on a USB device. `10.0.2.2` is not baked into the bundle. Cleartext HTTP
is permitted only in the debug variant, through
`apps/mp/android/app/src/debug/AndroidManifest.xml`; there is no global
`usesCleartextTraffic` and the release build stays HTTPS-only.

## Real business flow on the device

Driven with genuine `adb shell input tap` events, whose coordinates were resolved from the
live WebView layout by `scripts/recovery/android-element-tap.mjs`:

1. Launched the app; `select count(*) from "LifeJourney"` was `1`.
2. Tapped `[data-testid="tonight-input"]` (resolved to physical `540, 820`) and typed
   `ANDROID-E2E-20260929` through the real IME.
3. Dismissed the keyboard, tapped `[data-testid="tonight-continue"]` (resolved to
   physical `540, 1168`).
4. PostgreSQL then contained a new row:

```
journey_eb5b985b84 | user_demo | 2026-09-29 07:19:48.252
```

5. The app navigated to the journey detail page and rendered that text.

So the chain **Android UI -> API -> PostgreSQL -> re-render** is verified on the emulator.

### The full stage 1 chain, also with real taps

`scripts/recovery/android-business-flow.mjs` runs a longer flow, again entirely through
real touches, and it passes 8 of 8 steps:

```
PASS  tonight            -> /pages/tonight/index
PASS  type-entry         -> (typed through the IME)
PASS  dismiss-keyboard
PASS  submit-journey     -> /pages/journey/detail?id=journey_7d70ee166a&analysisJob=job_660c285d26
PASS  confirm-fingerprint-> (tapped [data-testid="fingerprint-accurate"])
PASS  open-action-tab    -> /pages/action/index
PASS  request-plan       -> (tapped [data-testid="action-request-plan"])
PASS  accept-plan        -> (tapped [data-testid="action-accept-plan"])
```

PostgreSQL afterwards:

```
journey_7d70ee166a | stage=acting | created 2026-09-29 09:21:41   (was "clarifying")
action_dda975e9a0  | status=active | "先完成一个五分钟的小动作" | journeyId=journey_7d70ee166a
```

So the stage 1 core loop runs end to end on the device: create the journey, confirm the
situation fingerprint (which advances the journey from `clarifying` to `acting`), ask for a
plan, accept it, and get a real `ActionCommitment` row. No console errors were recorded
during the flow.

### Offline, online and lifecycle

`artifacts/recovery/android-network-check.json` records the three network states, measured
by toggling the WebView's network through the DevTools protocol - scoped to this WebView,
so nothing else on the emulator was disturbed.

| State | Rendered |
| --- | --- |
| online | Full Tonight page, including the in-progress journey |
| offline | Full shell - hero, input, shortcut chips, tab bar - with **`Failed to fetch`** where the journey section would be |
| restored | Back to normal, journey visible again |

This is the honest answer to the historical "Failed to fetch" problem. The app degrades
gracefully rather than crashing or going blank, and it surfaces the failure only when the
API genuinely cannot be reached. With `adb reverse` in place and the API up, it does not
appear: the route walk recorded zero failed requests on the Tonight page and the online
state above renders normally.

Lifecycle, all confirmed on the device:

| Action | Result |
| --- | --- |
| HOME | App goes to the background; the process stays alive |
| Return to foreground | `MainActivity` resumes and the page is intact |
| `am force-stop` | Process is gone (`pidof` returns nothing) |
| Cold start | New process, full page re-rendered from the API |

## A trap worth knowing: a leftover test stack owns the ports

While running the stage 1 flow the created journey did not appear in the development
database. The cause was not the app: a browser-flow suite (`test:front-phase3-me`) had
started its own API on port 3000 against the `goodnight_treehole_test_front_phase3_me`
schema and never stopped it. `start-services.ps1` saw the port busy, assumed its own
service was already up, and skipped starting the real one - so the app's traffic went to
the test schema. The journey was in `goodnight_treehole_test_front_phase3_me` all along.

`start-services.ps1` now records the PIDs it starts in
`artifacts/recovery/service-pids.json` and, when a port is held by a process it did not
start, says so instead of skipping silently. `-Reclaim` stops the foreign process and
starts ours. The flow above was re-run after reclaiming and the journey landed in `public`
as expected.

## Cross-end check

The admin console, reading through its own authenticated API, reported
`journeySummary.total = 2, active = 2`, matching the database exactly after the
Android-created journey. Android and admin therefore share one data source.

## AI job observed on the device

`situation_analysis | provider_safe_template | fallback | fallbackUsed=true`, the same
result as everywhere else: the pipeline attempts the real remote DAPI provider and only
falls back because the DeepSeek account has no credit. The Android path records the job
correctly.

## Platform behaviours checked

| Behaviour | Result |
| --- | --- |
| Status bar | Overlays the WebView with light content on the `#fbf8ef` background, as configured |
| Safe area | Content clears the gesture bar; the tab bar sits above it |
| Keyboard | Resizes the WebView (`Keyboard.resize: 'body'`); the IME opens and closes cleanly and the page reflows |
| Back button | Dismisses the IME when it is open; Capacitor's back handler is disabled by config, so the WebView keeps normal history behaviour |
| Background / foreground | Force-stop and relaunch returns to the same route with data reloaded from the API; HOME keeps the process alive and returning restores the page |
| Offline / online | **Verified.** With the WebView's network disabled it renders the full shell and shows `Failed to fetch` where the data would be; re-enabling restores the page. Details above |
| Dial intent | `tel:12356` and `tel:120` exist as real anchors on the Safety page and are handled by Capacitor's WebView client as a dial intent. Not tapped during this run, and nothing auto-dials |

Route coverage is verified separately: all 54 routes render inside the app with zero
console errors, and the four 403 responses they produce are the third-stage privacy gate
working as designed. See `docs/android-route-discovery.md`.

Not verified, and not claimed: push notifications and background location. The dial intent
is present in the markup but was not tapped.

## iOS

`pnpm --filter @goodnight/mp exec cap add ios` generated `apps/mp/ios` with
`App.xcodeproj`, `AppDelegate.swift`, `SceneDelegate.swift`, `Info.plist`, storyboards,
`Assets.xcassets` and `CapApp-SPM/Package.swift`, and it detected the same ten Capacitor
plugins. `CFBundleDisplayName` is `晚安树洞` and the deployment target is iOS 15.

Windows cannot run Xcode, so the project is `IOS_SOURCE_READY` only. Nothing about iOS
runtime behaviour is verified, and `IOS_NATIVE_VERIFIED` stays false.
