# Disaster Recovery Final Report

Recovery session: 2026-09-29, on the workstation that lost the Codex workspace.
Source of truth: GitHub `yuhangzhu295-wq/goodnight-treehole`.
Everything below was observed in this session; no claim is copied from an earlier report.

## 1. Source and branches

| Item | Value |
| --- | --- |
| Source branch | `codex/third-stage-self-system` |
| Source SHA (verified with `git rev-parse`) | `17a7ee1933ee75c3cf547738bfbe0b2b09fec05e` |
| Source subject | `fix: harden DAPI persistence and peer privacy` |
| `origin/main` | `99c84de678abf1bc5359b5d360699ce7dbb6d383` |
| `origin/codex/second-stage-peer-final` | `8ebcfaea644516daf7eb318632df225477223a6c` |
| Recovery branch | `recovery/full-rebuild` @ `d5f2ddb98d8ba25a6b5e580f48ef4b4fcfe268b0` |
| Recovery tag | `recovery-baseline-20260929` (`60627c6397510d57b290ac7fc1142667fb3a2361`) |
| Local path | `C:\Users\zyu33\Projects\goodnight-treehole` |
| Remote state at the end | branch and tag both present on `origin` |

The remote SHA matched the one stated in the brief exactly, and no newer commit existed on
that branch, so the recovery started from the same commit the brief named. No `reset
--hard`, no `clean -fdx`, no force push, no history rewrite.

`D:\Projects\goodnight-treehole` from the brief was not used because `D:` is a removable
volume that was not mounted; the brief's own fallback to the user profile was applied.

## 2. Environment

| Component | Value |
| --- | --- |
| Node.js | v24.14.0 (brief suggested Node 20 LTS; 24 was already installed and no version manager exists) |
| pnpm | 9.15.0, resolved from `packageManager` |
| Docker | Engine 29.1.3 + Compose 2.40.3, inside WSL2 Ubuntu 24.04.4 - **no Docker Desktop, no admin rights** |
| PostgreSQL | 16.15, container, Windows port 15432 |
| Redis | 7.4.8, container, Windows port 16379 |
| MinIO | RELEASE.2025-09-07T16-13-09Z, Windows ports 19000/19001 |
| JDK for Android | Temurin 21.0.12.1 (downloaded, user profile) |
| Android SDK | platforms 34/35/36, build-tools 36.1.0, AVD `GoodnightPixel7Api34` |

The two native Windows services were left alone and untouched: PostgreSQL 18 on 5432
(neither `postgres` nor `goodnight` role exists and the superuser password is unknown) and
Redis 3.0.504 on 6379 (too old for BullMQ). Because WSL2 cannot forward a port a native
process already owns, `docker-compose.recovery.yml` remaps the published ports. That file
is additive; `docker-compose.yml` is unmodified.

## 3. Restored and verified

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit 0; `pnpm-lock.yaml` byte-identical afterwards |
| `prisma generate` | exit 0 |
| `prisma migrate deploy` | 9 of 9 migrations applied to an empty database, exit 0, 52 tables |
| `pnpm db:seed` | exit 0 (`prisma/seed.ts` is a stub; real seeding happens at API boot) |
| `GET /api/health` | HTTP 200 |
| Front on 5173 | HTTP 200, four tabs 今晚 / 同路 / 行动 / 我的 |
| Admin on 5174 | HTTP 200, `admin` / `admin123` login works |
| Front -> API -> PostgreSQL -> reload -> admin | **PASS**, `docs/recovery-smoke-test.md` |
| BullMQ, including worker restart | **PASS**: job survived a worker restart and produced a real `UserNotification` |
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0 |
| APK build | `BUILD SUCCESSFUL in 1m 17s` |
| Android emulator business flow | **PASS**: real taps created `journey_eb5b985b84` in PostgreSQL |
| Admin sees the Android-created journey | **PASS**: `journeySummary.total = 2`, matching the database |
| Clean-room replay from the tag | **PASS**: clone, install, migrate, API 200, journey written and read back |

## 4. Test suites

Stage 1, stage 2 and stage 3, run on the restored environment:

| Suite | Result |
| --- | --- |
| `test:first-batch-core` | PASS |
| `test:peer-stage-business` / `-security` / `-two-user` / `-expiry` | FAIL (all four are the same spec, all fail identically) |
| `test:reference-fidelity-peer-stage` | PASS |
| `test:third-stage-business` | PASS |
| `test:third-stage-persistence` | PASS |
| `test:third-stage-security` | PASS |
| `test:third-stage-memory` | FAIL |
| `test:third-stage-decision` | PASS |
| `test:third-stage-future-self` | FAIL |
| `test:third-stage-privacy` | PASS |
| `test:third-stage-monthly-report` | FAIL |
| `test:third-stage-archive` | PASS |
| `test:third-stage-migrations` | PASS (fresh and upgrade both) |

`qa:all`, step by step:

| Step | Result |
| --- | --- |
| lint, typecheck, test:unit, test:api, test:e2e | PASS |
| test:visual | FAIL - pre-existing spec defect, see section 6 |
| diagnose:all | FAIL - DAPI |
| audit:ui-artifacts | PASS |
| test:real-browser-front-clicks, -admin-clicks, -cross-flow | PASS |
| test:click-all | FAIL - DAPI |
| test:business-flow | PASS |
| test:cross | FAIL - DAPI |

**Every single failure has one of exactly two causes**, and neither is a code regression
introduced by the recovery:

1. **The DeepSeek account has no credit.** The tests assert `provider_dapi_deepseek` with
   `status: succeeded` and `fallbackUsed: false`. The account returns HTTP 402
   `Insufficient Balance`, so those assertions cannot pass. Evidence in section 5.
2. **A pre-existing defect in `tests/visual/admin-layout.spec.ts`**, described in section 6.

No test was skipped, weakened or edited to make it pass. No failure was reported as a pass.

## 5. DAPI is not restored, and why

The real key survived - it is in the Windows user environment as `DEEPSEEK_API_KEY`, and
`apps/api/src/remote-ai-provider.service.ts` resolves the primary key as
`DAPI_API_KEY ?? AI_PRIMARY_API_KEY ?? DEEPSEEK_API_KEY`, so no secret had to be
recreated. The endpoint is reachable and the key authenticates:

```
GET  https://api.deepseek.com/user/balance
  -> 200 {"is_available":false,"balance_infos":[{"currency":"CNY","total_balance":"-0.01",...}]}

POST https://api.deepseek.com/chat/completions
  -> 402 {"error":{"message":"Insufficient Balance ..."}}
```

So the blocker is the account balance, not a lost or invalid secret. The pipeline itself is
proven: it attempts the real remote provider, records `providerId` and `modelName`, and
falls back only on the 402. `DAPI_RESTORED` is therefore **false** and `fallbackUsed=false`
is **not** achieved. Topping up the account is the only action needed; nothing in the
repository has to change.

Local inference stays off, as required: `AI_LOCAL_MODEL_ENABLED`, `OLLAMA_ENABLED` and
`AI_ALLOW_OLLAMA_FALLBACK` are all `false`, and `runtime-environment.ts` hard-codes
`localInferenceAllowed = false`. GPT and Claude are not used; the secondary provider is
left unconfigured on purpose.

## 6. The one code change made to make a test pass, and the one refused

`pnpm test:visual` failed on a clean checkout before any recovery change. `test:visual`
asserts that `artifacts/screenshots/front/*.png` exist, but no script in the repository
wrote to that directory, and the admin capture was never run by `test:visual-capture`.

Fixed by making the documented artifact path real rather than by editing assertions:
`visual:capture-front-canonical` was added and wired into `test:visual-capture`, and
`test:visual-capture` now also runs the admin capture. `tests/visual/front-layout.spec.ts`
passes.

`tests/visual/admin-layout.spec.ts` was **left untouched and still fails**. It expects
`login.png`, `dashboard.png`, `users.png`, `posts.png`, `replies-moderation.png`,
`ai-providers.png`, `ai-routes.png`, `ai-jobs.png`, `ops-feedback.png`, `ops-config.png`,
while every admin capture script in this codebase produces `<name>-<width>.png`
(`01-admin-login-1366.png`). Those filenames do not exist anywhere in the repository, so
the spec cannot pass without either renaming tooling output or rewriting its assertions.
It is reported as a pre-existing defect rather than papered over.

## 7. What was found that the brief did not expect

1. **A remnant of the deleted workspace still exists** at
   `C:\Users\zyu33\Documents\Codex\2026-07-04\yan`. It is not a usable source of project
   code - `apps/api/src` is gone entirely, several packages are missing, `.git` internals
   are NUL bytes, and many filenames are truncated to 8.3 form. Its binary assets are also
   unreliable: 13 of 50 PNGs have invalid headers, and `resources/splash.png` is corrupt.
2. **That remnant did preserve the native work**, which is what made a faithful rebuild
   possible: the Capacitor Android and iOS projects, `apps/mp/resources/icon.png`,
   `.env.capacitor-debug`, and - most valuable - a real debug APK whose embedded
   `assets/capacitor.config.json` and `assets/capacitor.plugins.json` gave the exact
   original appId, appName, webDir and plugin versions. Launcher icons and splash screens
   were extracted from that APK rather than from the corrupt source files.
3. **MinIO is not wired into the API at all.** No `MINIO_*` variable is read anywhere in
   `apps/api/src`, and there is no S3 client. Uploads go to a local `data/uploads`
   directory. MinIO is declared in compose and is kept running because the brief requires
   it, but there is no application bucket-initialisation mechanism to invoke.
4. **The API has no dotenv loader.** Prisma CLI and Vite load `.env` themselves, but the
   API reads `process.env` only. `scripts/recovery/with-env.mjs` fills that gap.
5. **The recovered Capacitor config would have frozen the app on its splash screen.**
   `SplashScreen.launchAutoHide` was `false`, and nothing in the web app ever calls
   `SplashScreen.hide()`. It is set to `true` here, and that is the only value changed from
   the recovered config.
6. **The clean-room replay found a real reproducibility gap**: on a machine with a warm
   pnpm store, pnpm skips `@prisma/client`'s postinstall, the root `node_modules/.prisma`
   is never created, and the API dies with `does not provide an export named 'Prisma'`.
   `prisma generate` does not fix it; `pnpm rebuild @prisma/client` does. This is now in
   the runbook.

## 8. Native shells

`ANDROID_PROJECT_REBUILT=true`, `ANDROID_EMULATOR_VERIFIED=true`,
`PHYSICAL_ANDROID_VERIFIED=false` (only `emulator-5554` was attached, no physical device),
`IOS_SOURCE_READY=true`, `IOS_NATIVE_VERIFIED=false` (no macOS or Xcode).

APK: `apps/mp/android/app/build/outputs/apk/debug/app-debug.apk`,
39,758,945 bytes, SHA-256 `4b4f65ad74c945e09e4a4b27f1bba6eb63b96863363a15c0eebe11adc47c4d2a`,
package `com.goodnight.treehole`, versionName `1.0`, versionCode `1`. The recovered APK was
39,828,894 bytes, so the rebuild is within 0.2% of it.

The app launched as the real `MainActivity`, rendered the real UI, showed live API data in
the notification badge, and created a Journey through real taps that then appeared in
PostgreSQL and in the admin console. Full detail in `docs/android-native-verification.md`
and `docs/android-rebuild-environment.md`.

## 9. Backups

`D:` was not mounted, so all backups went to `%USERPROFILE%\Backups` (the scripts prefer
`D:\Backups` and fall back automatically).

| Artifact | Result |
| --- | --- |
| `goodnight-treehole-20260929-1421.bundle` | 49,138,876 bytes, 7 refs, `git bundle verify` says "records a complete history" |
| `goodnight-treehole.git` (bare mirror) | created, refs listed, `fsck --connectivity-only` clean |
| Unpushed-commit check | none on `recovery/full-rebuild` |
| `goodnight_treehole-20260929-1421.dump` | 3,471,800 bytes, `pg_restore --list` returns 6,398 entries, 52 live tables |
| MinIO | nothing to back up - the API stores no objects there |

`docs/private-env-backup-guide.md` explains what is actually secret, where to keep `.env`
(which the code backup deliberately does not cover), and how to rebuild it from scratch.

## 10. Status

```
GITHUB_SOURCE_RESTORED=true
DEPENDENCIES_RESTORED=true
POSTGRES_RESTORED=true
REDIS_RESTORED=true
MINIO_RESTORED=true            # running and healthy; note the API never uses it
API_RESTORED=true
FRONT_RESTORED=true
ADMIN_RESTORED=true
DAPI_RESTORED=false            # key valid and endpoint reachable, but HTTP 402: no credit
BULLMQ_RESTORED=true
STAGE1_VERIFIED=true
STAGE2_VERIFIED=false          # peer-stage spec requires funded remote AI
STAGE3_BUSINESS_VERIFIED=false # 7 of 10 suites pass; memory, future-self and monthly-report need funded AI
QA_ALL_PASS=false              # 3 steps need funded AI, 1 step hits a pre-existing spec defect

CAPACITOR_REBUILT=true
ANDROID_PROJECT_REBUILT=true
ANDROID_EMULATOR_VERIFIED=true
PHYSICAL_ANDROID_VERIFIED=false
IOS_SOURCE_READY=true
IOS_NATIVE_VERIFIED=false

GIT_MIRROR_BACKUP_VERIFIED=true
GIT_BUNDLE_BACKUP_VERIFIED=true
POSTGRES_BACKUP_VERIFIED=true
DISASTER_RECOVERY_REPRODUCIBLE=true
```

No flag is set true because other modules passed. `PHYSICAL_ANDROID_VERIFIED` is false
because no device was attached; `IOS_NATIVE_VERIFIED` is false because there is no Mac;
`DAPI_RESTORED` is false because the account has no balance. Old PostgreSQL rows, old MinIO
objects and old secrets were **not** recovered and are not claimed to have been.

## 11. What the owner should do next

1. **Top up the DeepSeek account.** That single action is what unblocks `DAPI_RESTORED`,
   `STAGE2_VERIFIED`, `STAGE3_BUSINESS_VERIFIED` and `QA_ALL_PASS`; no code change is
   needed. Re-run `pnpm test:dapi-live` and expect `fallbackUsed=false`.
2. Decide what to do about `tests/visual/admin-layout.spec.ts`, whose expected filenames
   exist nowhere in the codebase.
3. Keep the third-stage visual work (front diffs 11.5%-27.3%) as its own follow-up task, as
   the brief intended. Nothing was redesigned.
4. Copy `.env` somewhere durable per `docs/private-env-backup-guide.md`, and consider
   moving backups onto a real drive when `D:` is attached.
5. Run the Android and iOS builds on a machine with macOS when iOS runtime verification
   actually matters.
