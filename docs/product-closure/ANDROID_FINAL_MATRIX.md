# ANDROID FINAL MATRIX

`ANDROID_VERIFIED = true`

Everything below was observed on this machine in this round, on the running emulator, from an APK
built out of the committed source at `c1f0642` / `427c647`. Nothing is inferred from the earlier
recovery report.

`PHYSICAL_ANDROID_VERIFIED = false` — `adb devices` lists only `emulator-5554`; no physical device
was connected.

## Build

| Item | Value |
| --- | --- |
| JDK | Temurin **21.0.12.1** (installed during this round; the only JDK present beforehand was Android Studio's JBR 17, which the Capacitor plugin subprojects reject — they require a Java 21 toolchain) |
| Web bundle | `pnpm --filter @goodnight/mp build:native-debug` (`vite build --mode capacitor-debug`, `VITE_API_BASE_URL=http://127.0.0.1:3000`) |
| Sync | `npx cap sync android` — copied `dist` → `android/app/src/main/assets/public`, 10 Capacitor plugins detected |
| Native build | `gradlew.bat assembleDebug` → **BUILD SUCCESSFUL in 23s**, 394 actionable tasks |
| APK | `apps/mp/android/app/build/outputs/apk/debug/app-debug.apk` |
| Size | 39,812,264 bytes |
| SHA-256 | `57e2cd96878cec15091361ecf7994b3f939b41e5817664647b0f01368ecaa9ae` |
| Package | `com.goodnight.treehole` |
| versionName / versionCode | 1.0 / 1 |
| minSdk / targetSdk / compileSdk | 24 / 36 / 36 |

## Install and launch

| Step | Result |
| --- | --- |
| `adb install -r app-debug.apk` | `Success` |
| `adb reverse tcp:3000 tcp:3000` | ok (this is how the debug bundle reaches the API; `10.0.2.2` is deliberately not baked in) |
| `adb shell am start -n com.goodnight.treehole/.MainActivity` | started |
| `dumpsys activity activities` | `topResumedActivity=ActivityRecord{... com.goodnight.treehole/.MainActivity}` — the real native activity, not a browser |

## Verification matrix

Driven over the WebView DevTools protocol
(`adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`, target
`https://localhost/pages/...`), so the assertions ran inside the APK's own bundled assets talking to
the real API. Script: `work/verify-android-native.mjs`.

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Target is the native app WebView | PASS | `https://localhost/pages/tool/decompose` |
| 2 | Native app renders the tool page | PASS | 1 input element |
| 3 | Native app reaches the real API and completes an AI task | PASS | fallback result returned after a real round trip |
| 4 | Native app labels the fallback instead of faking a model answer | PASS | notice text rendered (ISSUE-007) |
| 5 | Native app shows the real result content | PASS | 1 result card |
| 6 | The AI job from the native app is persisted in PostgreSQL | PASS | `job_cfbed97b78`, `status=fallback`, `provider=provider_safe_template`, age 4s |
| 7 | A second surface carries the same notice | PASS | emotion-decompose page |
| 8 | API still serving after the native flows | PASS | admin config route returns 401 without a token |

`8/8 pass`.

## Closure flows exercised on the native app

| Flow | What the native app did | Result |
| --- | --- | --- |
| ISSUE-007 degradation | Submitted a real tool task; the app rendered the safety-fallback notice above the result | notice visible, `artifacts/product-closure/android-02-ai-fallback-notice.png` |
| ISSUE-025 risk trigger | Typed risk text into 今晚, tapped 继续 → the app routed to the safety-first screen and created a real `SafetyEvent` | row `safety_f4c65b1baa`, `status=open`, persisted in PostgreSQL; `artifacts/product-closure/android-03-safety-trigger.png` |

The safety-first screen rendered the real crisis resources (12356 hotline, 110/120, three concrete
first steps), so the highest-stakes path in the product was exercised on the native shell, not just
in a browser.

## Screenshots (this round)

| File | Content |
| --- | --- |
| `artifacts/product-closure/android-01-launch.png` | cold launch, real 今晚 page with bottom navigation |
| `artifacts/product-closure/android-02-ai-fallback-notice.png` | emotion-decompose result with the degradation notice |
| `artifacts/product-closure/android-03-safety-trigger.png` | safety-first screen after a risk trigger |

## Environment notes

- WSL2 stops when idle and takes the Postgres/Redis containers with it. A keep-alive process was held
  for the whole round; the API must be up (`adb reverse`) for the native app to reach it.
- The APK was rebuilt from the committed source, so the bundle under test contains this round's
  `aiStatus.ts` and `AiDegradationNotice.vue` rather than the pre-round bundle that was in
  `app-debug.apk` beforehand.
- `JAVA_HOME` must point at Temurin 21 for the Gradle build:
  `C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot`.
