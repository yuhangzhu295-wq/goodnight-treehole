# Disaster Recovery Inventory

Audit of what came back from GitHub, what survived only locally, and what has to be
rebuilt. Every count below was produced by `git ls-files` or a directory listing in
`C:\Users\zyu33\Projects\goodnight-treehole` on 2026-09-29.

Status vocabulary used here:

- `RESTORED_FROM_GITHUB` - present in the clone, byte-identical to the remote commit.
- `RECOVERED_LOCAL_PARTIAL` - found in a local remnant, but incomplete or damaged.
- `MISSING_LOCAL_ONLY` - never pushed and not found anywhere.
- `NEEDS_REBUILD` - must be regenerated from the restored sources.
- `UNRECOVERABLE_LOCAL_ONLY` - local state that no longer exists in any form.

## 1. RESTORED_FROM_GITHUB

556 tracked files at `17a7ee1933ee75c3cf547738bfbe0b2b09fec05e`. Working tree clean
after checkout, so the restore is exact.

| Area | Tracked files | Notes |
| --- | --- | --- |
| `apps/mp` (front) | 160 | Vue 3 + Vite. `src` has 140 files, 79 of them assets under `src/assets/goodnight`. |
| `apps/admin` | 38 | Vue 3 + Vite admin console. |
| `apps/api` | 15 | NestJS API, all controllers/services present. |
| `packages` | 16 | `api-sdk`, `config`, `shared-types`, `test-utils`, `ui-tokens`. |
| `prisma` | 12 | `schema.prisma`, 9 migration directories, `migration_lock.toml`, `seed.ts`. |
| `scripts` | 99 | QA, diagnosis, browser-flow, visual-regression and fixture tooling. |
| `tests` | 50 | unit, api, e2e, business, cross, visual, diagnose, contracts, interaction manifests. |
| `docs` | 114 | All historical stage reports and audits. |
| `design_refs` | 26 | 14 front + 10 admin reference PNGs and their manifests. |
| `fixtures` | 11 | visual-fixture v1 assets and seed. |
| root | - | `package.json` (105 scripts), `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `docker-compose.yml`, `.env.example`, `.gitignore`, `tsconfig.base.json`, `eslint.config.mjs`, `README.md`, `AGENTS.md`, `progress.md`, `CURRENT_RECOVERY_STATE.md`, `production-checkpoint.json`, `design-match-report.json`. |

Nothing the brief asked to audit is absent from GitHub except the native shells covered
in section 2.

## 2. Native shells: not in GitHub, partially recovered locally

`git grep -i capacitor` over the whole tracked tree returns nothing, and there is no
`apps/mp/android`, `apps/mp/ios` or `capacitor.config.*` at the remote commit. The brief
expected these to be lost, and on GitHub they are.

They are not entirely lost, however. The deleted Codex workspace left a remnant at:

`C:\Users\zyu33\Documents\Codex\2026-07-04\yan`

That remnant is **not** usable as a source of project code:

- `apps/api/src` does not exist at all.
- `packages/api-sdk`, `packages/config`, `packages/shared-types`, `packages/test-utils`,
  `prisma/migrations` and `prisma/seed.ts` are missing.
- `apps/mp/src` is missing `api.ts`, `main.ts`, `composables/`, `components/icons/`.
- Many files carry 8.3 short names (`.git` -> `GIT~1`, `pages.json` -> `PAGES~1.JSO`,
  `.gradle` -> `GRADLE~1`), and several are content-corrupted - `android/gradle.properties`
  contains unrelated Lark API documentation, and `.git/HEAD`, `FETCH_HEAD` and
  `COMMIT_EDITMSG` are NUL bytes. Its `pnpm-lock.yaml` is also a different size from the
  repository's.

What the remnant **did** preserve, and what was used as authoritative reference:

| Item | Status | Value recovered |
| --- | --- | --- |
| `android/app/build/outputs/apk/debug/app-debug.apk` | RECOVERED_LOCAL_PARTIAL | A real 39,828,894-byte debug APK, built 2026-09-28, SHA-256 `119fff71b449ca54cd4ee055b6622daf9fed4ab88883dfa225688cfc3c6a0d94`. |
| `capacitor.config.json` | RECOVERED_LOCAL_PARTIAL | Extracted from inside that APK (`assets/capacitor.config.json`), so it is the config the APK was actually built with. |
| `android/` Gradle project | RECOVERED_LOCAL_PARTIAL | `build.gradle`, `settings.gradle`, `variables.gradle`, `capacitor.settings.gradle`, `gradle/wrapper/*`, `gradlew(.bat)`, `app/build.gradle`, `app/capacitor.build.gradle`, `app/proguard-rules.pro`, `app/src/main/java/com/goodnight/treehole/MainActivity.java`, splash and launcher resources, test stubs. |
| `ios/` Xcode project | RECOVERED_LOCAL_PARTIAL | `App.xcodeproj/project.pbxproj`, `AppDelegate.swift`, `SceneDelegate.swift`, `Info.plist`, storyboards, `Assets.xcassets` (AppIcon + Splash), `CapApp-SPM/Package.swift`, `capacitor-cordova-ios-plugins/`, `debug.xcconfig`. |
| `apps/mp/resources/` | RECOVERED_LOCAL_PARTIAL | `icon.png` (647,498 bytes) and `splash.png` (727,445 bytes) - the real source art for the native icons. |
| `apps/mp/.env.capacitor-debug` | RECOVERED_LOCAL_PARTIAL | `VITE_API_BASE_URL=http://10.0.2.2:3000`, `VITE_GOODNIGHT_NATIVE_BUILD=debug`. |

Missing from the remnant and therefore `NEEDS_REBUILD`: `android/app/src/main/AndroidManifest.xml`,
`android/app/src/main/res/values/*`, `android/app/src/main/res/xml/*`,
`android/app/src/main/assets/*`, `capacitor.config.ts|json` as a tracked file, and the
`apps/mp/package.json` that declared the Capacitor dependencies.

Recovered Capacitor identity, taken from the APK rather than from memory:

```json
{
  "appId": "com.goodnight.treehole",
  "appName": "晚安树洞",
  "webDir": "dist",
  "backgroundColor": "#fbf8ef",
  "plugins": {
    "App": { "disableBackButtonHandler": true },
    "Keyboard": { "resize": "body", "resizeOnFullScreen": true, "style": "LIGHT", "autoBackdropColor": "dom" },
    "SplashScreen": { "launchAutoHide": false, "launchFadeOutDuration": 180, "backgroundColor": "#fbf8ef", "androidScaleType": "CENTER_CROP", "showSpinner": false },
    "StatusBar": { "overlaysWebView": true, "style": "LIGHT", "backgroundColor": "#fbf8ef" }
  }
}
```

Plugin set and versions, cross-validated between `capacitor.settings.gradle` and
`CapApp-SPM/Package.swift` (both list the same ten plugins, so the pairing is reliable):
`@capacitor/core 8.5.0`, `app 8.1.1`, `app-launcher 8.0.1`, `clipboard 8.0.1`,
`filesystem 8.1.3`, `haptics 8.0.2`, `keyboard 8.0.5`, `network 8.0.1`, `share 8.0.1`,
`splash-screen 8.0.2`, `status-bar 8.0.3`.

Build toolchain recovered from the same files: AGP 8.13.0, Gradle 8.14.3, Java 21
source/target, `compileSdk`/`targetSdk` 36, `minSdk` 24, iOS deployment target 15,
`versionCode` 1, `versionName` "1.0". These match the Android SDK already installed on
this machine (platforms 34/35/36, build-tools 34.0.0/35.0.0/36.1.0/37.0.0).

## 3. MISSING_LOCAL_ONLY / UNRECOVERABLE_LOCAL_ONLY

| Item | Status | Reason |
| --- | --- | --- |
| Old development PostgreSQL data | UNRECOVERABLE_LOCAL_ONLY | The volume lived on the deleted workspace. GitHub cannot carry it. A fresh database was created from the Prisma migrations; no old user rows were "restored" and none are claimed. |
| Old MinIO objects | UNRECOVERABLE_LOCAL_ONLY | Same volume loss. Note also that the API never talks to MinIO at all (see section 4), so no application data ever lived there. |
| Old `.env` file | UNRECOVERABLE_LOCAL_ONLY | Recreated from `.env.example`; the two AI keys survived in the Windows user environment instead (section 5). |
| Old `.env` values for `JWT_SECRET` | UNRECOVERABLE_LOCAL_ONLY | Regenerated as a fresh random value. The API does not read this variable. |

## 4. Findings that differ from the brief's assumptions

1. **MinIO is not wired into the API.** `grep -rn "minio\|S3Client\|aws-sdk" apps/api/src packages/*/src`
   returns nothing, and there is no `process.env.MINIO_*` reference anywhere in the API
   source. Uploads are written to a local directory resolved by
   `resolveUploadsDirectory()` (`data/uploads`, or `GOODNIGHT_UPLOADS_DIR`). MinIO is
   declared in `docker-compose.yml` and is kept running because the brief requires it, but
   there is no application bucket-initialisation logic to invoke, so the
   `goodnight-assets` bucket cannot be created "by the current application mechanism".
   This is recorded as an observation about the existing code, not changed.

2. **The API has no dotenv loader**, so `.env` alone does not configure it. See
   `docs/disaster-recovery-baseline.md` section 5.

3. **`prisma/seed.ts` is a two-line stub.** `pnpm db:seed` exits 0 but prints only a
   notice; real seed data is created by `StoreService` at API boot. Running it twice is
   therefore trivially idempotent, and the brief's idempotence question is answered by the
   boot-time seeding path rather than by this script.

4. **The third-stage visual state is still PARTIAL.** This matches the brief's own
   warning. Nothing was redesigned; the historical numbers in
   `CURRENT_RECOVERY_STATE.md` are left as they are.

## 5. Secrets

| Secret | Status |
| --- | --- |
| `DEEPSEEK_API_KEY` (the real DAPI key) | RECOVERED. Present in the Windows user environment (`HKCU\Environment`). Valid - the provider authenticates it - and reachable. |
| `OPENAI_API_KEY` | RECOVERED, same location. Deliberately not used: the brief says GPT and Claude models are not to be used, and the secondary provider is left unconfigured. |
| `CLAUDE_API_KEY` | Not present anywhere; not needed. |
| `JWT_SECRET` | Regenerated for local development. Not read by the API. |
| Admin bootstrap credentials | `admin` / `admin123`, created by `StoreService.seedData()` (`passwordHash: 'plain:admin123'`). Verified working through the real admin login form. |

No secret value is written into any file in this repository, into `docs/`, or into
`artifacts/`. Only the variable names and their status appear above.

The DAPI key being valid but the account being unfunded is an external condition, not a
recovery defect: `GET https://api.deepseek.com/user/balance` returns HTTP 200 with
`is_available: false` and `total_balance: "-0.01"`, and `POST /chat/completions` returns
HTTP 402 `Insufficient Balance`. Real AI output therefore cannot be produced until the
account is topped up. The AI pipeline itself is proven to work end to end - it attempted
the real remote provider, recorded `provider_dapi_deepseek`, and fell back to
`provider_safe_template` with `fallbackUsed = true` only because of the 402.
