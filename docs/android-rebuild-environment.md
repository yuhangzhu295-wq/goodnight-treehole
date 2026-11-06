# Android Rebuild Environment

What the machine had, what it needed, and what was added, recorded while rebuilding the
native Android shell on 2026-09-29.

## Detected before any change

| Component | Value |
| --- | --- |
| Android Studio | `C:\Program Files\Android\Android Studio` (bundled JBR is **17.0.10**) |
| `ANDROID_HOME` | not set |
| `ANDROID_SDK_ROOT` | not set |
| Android SDK | `C:\Users\zyu33\AppData\Local\Android\Sdk` |
| SDK platforms | `android-34`, `android-35`, `android-36` |
| SDK build-tools | `34.0.0`, `35.0.0`, `36.1.0`, `37.0.0` |
| SDK system images | `android-34/google_apis_playstore/x86_64` |
| AVD | `GoodnightPixel7Api34` |
| emulator | 36.6.11.0 |
| platform-tools / adb | present |
| `JAVA_HOME` | not set |
| `java` on PATH | not present |

The AVD survived the workspace loss, so it did not need to be recreated. Its configuration
is a Pixel 7 at Android API 34:

| AVD setting | Value |
| --- | --- |
| `abi.type` | `x86_64` |
| `tag.id` | `google_apis_playstore` |
| `PlayStore.enabled` | `no` |
| screen | 1080 x 2400, density 420 |
| `hw.gpu.enabled` | `no` (software rendering) |

Because the brief asked for exactly this device (Pixel 7 / API 34) and it was already
present, no new AVD was created and no system image was downloaded.

## What the build actually required

Capacitor 8 generates `app/capacitor.build.gradle` with

```
sourceCompatibility JavaVersion.VERSION_21
targetCompatibility JavaVersion.VERSION_21
```

so a **JDK 21 toolchain is mandatory**. Android Studio's bundled JBR is 17, and no other
JDK was installed, so the build failed immediately with
`Could not determine the dependencies of task ':app:compileDebugJavaWithJavac'` until a
JDK 21 was provided.

The machine also has **no administrator rights**, so a machine-wide JDK install was not an
option. A portable Temurin build was downloaded and extracted into the user profile
instead:

| Item | Value |
| --- | --- |
| Distribution | Eclipse Temurin 21.0.12.1+1 LTS |
| Source | `https://mirrors.tuna.tsinghua.edu.cn/Adoptium/21/jdk/x64/windows/OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip` |
| Installed to | `C:\Users\zyu33\Tools\jdk-21.0.12.1+1` |
| `java -version` | `openjdk version "21.0.12.1" 2026-08-18 LTS` |

The Tsinghua mirror was used because it is reachable from this network and serves the same
build the Adoptium API points at (`api.adoptium.net` redirects to GitHub releases, and
`github.com` is blocked here). Nothing was installed system-wide and `JAVA_HOME` is passed
per build command.

## Generated project settings

`cap add android` produced a project whose defaults match the recovered one exactly, which
is a useful cross-check that the recovered Gradle files were not stale:

| Setting | Value | Recovered APK project |
| --- | --- | --- |
| `applicationId` / `namespace` | `com.goodnight.treehole` | same |
| `versionCode` / `versionName` | `1` / `1.0` | same |
| `minSdkVersion` | 24 | same |
| `compileSdkVersion` / `targetSdkVersion` | 36 | same |
| Android Gradle Plugin | 8.13.0 | same |
| Gradle wrapper | 8.14.3 | same |
| Java compatibility | 21 | same |

Gradle 8.14.3 was already in `~/.gradle/wrapper/dists`, so no distribution download was
needed. Both `dl.google.com` and `repo.maven.apache.org` are reachable, so no Maven mirror
was configured.

## Local configuration

`apps/mp/android/local.properties` (gitignored) points at the SDK:

```
sdk.dir=C:/Users/zyu33/AppData/Local/Android/Sdk
```

Forward slashes avoid the escaping trap in Java properties files - writing
`C:\Users\...` produces `C:Users...` because `\U` is consumed as an escape, which surfaces
as `java.io.IOException: The filename, directory name, or volume label syntax is incorrect`.

## Rebuilding from scratch on a new machine

```powershell
# 1. JDK 21 (see the table above), then
$env:JAVA_HOME = 'C:\Users\<you>\Tools\jdk-21.0.12.1+1'

# 2. SDK path
Set-Content apps\mp\android\local.properties 'sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk'

# 3. Web bundle, native sync, APK
pnpm --filter @goodnight/mp build:native-debug
pnpm --filter @goodnight/mp exec cap sync android
cd apps\mp\android
cmd /c "gradlew.bat assembleDebug"
```

The debug APK lands in `apps/mp/android/app/build/outputs/apk/debug/app-debug.apk`.

## Emulator notes

The AVD renders in software (`hw.gpu.enabled=no`), which is slow but works for screenshots
and UI interaction.

One practical trap: the Capacitor WebView's CSS viewport is **411 x 890 at
devicePixelRatio 2.625** inside the 1080 x 2400 screen, and the page scrolls. Hard-coded
screen coordinates therefore miss. `scripts/recovery/android-element-tap.mjs` resolves an
element's live rect through the WebView DevTools protocol, converts it to physical pixels,
and then issues a real `adb shell input tap`, which is how the business flow in
`docs/android-native-verification.md` was driven.

The DevTools endpoint needs a port forward per app process:

```bash
adb forward tcp:9333 localabstract:webview_devtools_remote_$(adb shell pidof com.goodnight.treehole)
```

Port 9222 is already taken on this machine, hence 9333.
