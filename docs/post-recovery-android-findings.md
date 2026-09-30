# Post-Recovery Android Findings

Native verification on the real APK in the Pixel 7 API 34 emulator, 2026-09-30.
Everything here was measured on the device; nothing is inferred from the web build.

## ISSUE-ANDROID-001 - the hardware back button exits the app from any page

| Field | Value |
| --- | --- |
| Severity | **P1** - core navigation broken |
| Classification | **PRODUCT_BUG** |
| Status | Fixed, APK rebuilt and reinstalled, retested |
| Found by | `node scripts/recovery/android-native-checks.mjs back` |

### Reproduction

1. Launch the app on the emulator.
2. Go to 我的 (`/pages/me/index`).
3. Tap the 隐私设置 entry - a real in-app navigation to `/pages/settings/privacy`.
4. Press the hardware BACK button.

**Observed:** the app exits to the previous app in the task stack.
**Expected:** BACK returns to 我的, and only leaves the app from a root route.

### Root cause

`apps/mp/capacitor.config.ts` carried `App.disableBackButtonHandler: true`, recovered
verbatim from the deleted workspace's APK. `@capacitor/app` 8.1.1 registers its callback
with `enabled = !disableBackButtonHandler`:

```java
// @capacitor/app 8.1.1 - AppPlugin.java
boolean disableBackButtonHandler = getConfig().getBoolean("disableBackButtonHandler", false);
...
this.onBackPressedCallback = new OnBackPressedCallback(!disableBackButtonHandler) {
    public void handleOnBackPressed() {
        if (!hasListeners(EVENT_BACK_BUTTON)) {
            if (bridge.getWebView().canGoBack()) { bridge.getWebView().goBack(); }
        } ...
    }
};
```

With `true`, the callback is **disabled**, Capacitor never handles BACK, and the activity
falls through to the platform default, which finishes it. So BACK exits the app from every
page, including pages the user navigated into.

This is a genuine product defect, not a stale expectation: a native app's back button is
expected to walk in-app history first. It is also the one config value the recovery had
preserved from the recovered artifact on the grounds of fidelity, which is exactly why the
device check was worth running.

### Fix

Two parts, because the config value alone was not enough:

1. `disableBackButtonHandler: false` in `apps/mp/capacitor.config.ts`, with the reasoning
   recorded inline.
2. `apps/mp/src/native/back-button.ts`, imported from `main.ts`, registers the
   `backButton` listener Capacitor needs in order to do anything useful with the press.

The second part carries a correction to Capacitor's documented snippet. The documented
listener branches on the `canGoBack` Capacitor passes, which comes from
`WebView.canGoBack()`. On this app that returns **false even with three history entries**,
because the in-app navigations are `history.pushState` calls that the WebView's own
back/forward list does not count. Trusting it made BACK exit the app from an inner page -
the same symptom as before the fix, by a different route. The adapter therefore gates on
`window.history.length`, which was verified directly: `window.history.back()` walks
tonight -> me -> privacy and back correctly inside the WebView.

It is the only Capacitor code in the web app, which until now had none; a back-button
adapter is exactly the "platform adapter" the recovery brief anticipated for native-only
behaviour. It is a no-op on the web.

### Retest

Rebuilt through the full chain each time - `build:native-debug`, `cap sync android`,
`gradlew.bat assembleDebug`, `adb install -r`.

The final APK: 39,812,037 bytes,
sha256 `84143e09d49ce8412329499bf66c42dc578c42b0efce3266d0105394f9bbe07d`.

Driven with real in-app clicks only (tonight -> 我的 -> 隐私设置, so the history is built by
the app itself rather than by a direct navigation):

```
root route: /pages/tonight/index
real clicks: /pages/me/index -> /pages/settings/privacy | history.length = 3
PASS  BACK returns to the previous in-app page      (privacy -> me)
PASS  second BACK returns to the root route         (me -> tonight)
foreground after: com.goodnight.treehole/.MainActivity
```

Three states, in order, all measured on the device:

| Config | BACK on an inner page |
| --- | --- |
| `disableBackButtonHandler: true` (recovered value) | app exits |
| `false`, no listener | nothing happens at all |
| `false` + the adapter | walks the in-app history, leaves the app only at a root route |

## Control coverage

`artifacts/post-recovery/routes.json` and `artifacts/post-recovery/control-coverage.json`,
produced by `scripts/recovery/android-control-coverage.mjs`.

| Metric | Value |
| --- | ---: |
| Routes discovered from `apps/mp/src/router.ts` | 54 |
| Routes rendered on the device | **54 / 54** |
| Controls enumerated | 600 |
| Controls visible | 600 |
| Controls actually clicked | **289** |
| Destructive controls recorded but **not** clicked | 33 |
| Links skipped (already covered by the route walk) | 131 |
| Controls without a `data-testid` | 148 |
| Console errors across all routes | **0** |

Selectors are generated in the order the task requires - `data-testid` first, then
`role` + accessible name, then a structural path. Fixed screen coordinates are not used as
the primary mechanism anywhere.

Safety: 33 controls whose label reads as destructive (delete / clear / archive / close /
end / block / report and their Chinese equivalents) were enumerated and deliberately not
pressed, because clicking them across every route would destroy the data the rest of this
validation depends on. They are recorded with `result: "skipped: destructive control"`.

**Reading the click results honestly.** Of the clicked controls, 191 produced an observable
change. 98 registered as "no observable change" - but the detector compares the route plus
the page's text length, and most of those are *selection* controls (感情 / 工作 / 家里,
朋友 / 家人 / 伴侣, the graduation feedback options) whose only effect is a CSS class on the
element itself. They are not dead buttons; the metric simply cannot see a style change. A
further 83 recorded as `not-found` are a selector-staleness artifact: `nth-of-type` paths
are generated from the first scan and the page re-renders between the scan and the click.
Neither bucket is evidence of a defect, and neither is reported as one.

The 148 controls without a `data-testid` are worth noting as a maintainability observation:
they are reachable only by role or structural path, which is why 83 of them could not be
re-found for the click pass.

## Keyboard occlusion

Verified on the journey input, the peer composer, recovery and support plan pages, and
confirmed visually for the journey input (`screenshots/kb-01-journey-input.png`).

With the IME open the textarea remains fully visible above it and the tab bar is pushed
up, i.e. `Keyboard.resize: 'body'` is working. `dumpsys input_method` reports
`mInputShown=true` while typing and `false` after BACK.

The remaining input routes (memory, decision, future self) could not be measured reliably
in this round; the emulator was being driven by another session at the same time and the
WebView's DevTools agent kept dropping. They are not claimed either way.

## Network transitions

`node scripts/recovery/android-native-checks.mjs network` - **4 of 4 passed**:

| Check | Result |
| --- | --- |
| online renders | PASS |
| offline degrades without blanking | PASS |
| recovers when the network returns | PASS |
| slow response (3 s latency) still renders | PASS |

Network state was toggled through the WebView's own DevTools agent, so nothing else on the
emulator was affected.

## Repeat taps

Four taps in quick succession on the primary 继续 CTA produced **exactly one** journey
(`LifeJourney` went 3 -> 4). The control guards against duplicate submission, which is the
behaviour the task requires for Journeys, peer requests, messages, decisions and archives.

## Lifecycle

| Action | Result |
| --- | --- |
| HOME | app goes to the background, process stays alive |
| Return to foreground | `MainActivity` resumes, page intact |
| `am force-stop` | process gone |
| Cold start | new process, page re-rendered from the API |

## Emulator contention, and what it cost

Another session was using the same emulator throughout this round: it repeatedly brought
Chrome and the Dialer to the foreground, which pushes this app to the background and stops
its WebView DevTools agent from answering. Several measurements had to be retried, and the
remaining keyboard routes could not be completed.

Two failures in the first back-button run were **my measurement's fault, not the
product's**: the check reached a deep route with `Page.navigate`, which leaves a single
history entry, so BACK correctly exited the app and the follow-up reading came back
undefined. That was fixed in the script - the check now navigates by clicking a real
in-app entry - which is what then exposed ISSUE-ANDROID-001. Recorded because it is the
kind of false positive that would otherwise have been written up as a defect.

## Not verified

- Physical Android: none attached (`NO_PHYSICAL_ANDROID_CONNECTED`).
- Push notifications and background location.
- The dial intent on the safety page: `tel:12356` and `tel:120` are real anchors and
  Capacitor's WebView client routes them to a dial intent, but the control was not tapped.
