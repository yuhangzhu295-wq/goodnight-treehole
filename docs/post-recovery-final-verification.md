# Post-Recovery Final Verification

Run 2026-09-30 on branch `codex/post-recovery-validation`, based on
`recovery/full-rebuild` @ `461d6359548f74e52fed5691e81b833635976896`.
This is a validation pass over the restored product, not a recovery; the recovery branch and
its tag were not modified.

## Git

| Item | Value |
| --- | --- |
| Validation branch | `codex/post-recovery-validation` |
| Base | `recovery/full-rebuild` @ `461d6359548f74e52fed5691e81b833635976896` |
| `recovery/full-rebuild` | unchanged, local and remote both `461d6359` |
| `recovery-baseline-20260929` | unchanged, `60627c6397510d57b290ac7fc1142667fb3a2361` -> `d5f2ddb` |
| Force push / tag rewrite / tag delete | none |
| Unpushed commits at the end | none |

## DAPI

**Not restored.** `pnpm test:dapi-live` fails, and the failure is external:

```
GET  https://api.deepseek.com/user/balance      -> 200, is_available false, balance -0.01
POST https://api.deepseek.com/chat/completions  -> 402 Insufficient Balance
job row -> provider_dapi_deepseek attempted, "Remote provider returned HTTP 402.",
           fell back to provider_safe_template, fallbackUsed=true
```

Classified `EXTERNAL_BLOCKER` / `BLOCKED_DAPI_BALANCE`. No workaround was applied and none
is permitted: no code change, local model, stub, mock, Ollama fallback or automatic
downgrade. `AI_LOCAL_MODEL_ENABLED`, `OLLAMA_ENABLED` and `AI_ALLOW_OLLAMA_FALLBACK`
remain `false`.

## Stage 1

**Verified.** Re-run after this round's front-end change (the back-button adapter) to prove
no regression:

| Check | Result |
| --- | --- |
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `test:first-batch-core` | exit 0, 2/2 |
| `test:reference-qa-journey` | exit 0 |
| `test:reference-qa-action` | exit 0 |
| `test:notification-truth-state` | exit 0 |
| On-device: Tonight -> Journey -> fingerprint -> action plan -> commitment | PASS, real rows in PostgreSQL |

`STAGE1_VERIFIED=true`.

## Stage 2

**Not verified, and gated.** The task requires DAPI to be restored before entering the
Android second-stage flow, and it is not. `test:peer-stage-business`, `-security`,
`-two-user` and `-expiry` all fail on `expected 'failed' to be 'succeeded'` from the peer
assist job, which is the same 402.

`STAGE2_VERIFIED=false`. Not attempted rather than partially claimed: the stage's own
completion condition includes a real DAPI draft-assist job, so a partial pass would be
misleading.

## Stage 3

**Not verified, and gated** for the same reason. Fresh results: `third-stage-business`,
`-persistence`, `-security`, `-decision`, `-privacy`, `-archive` and `-migrations` pass;
`-memory`, `-monthly-report` and `-future-self` fail on the AI balance.

`STAGE3_BUSINESS_VERIFIED=false`. The third-stage visual work remains `PARTIAL` and was
deliberately not touched, as the task requires.

## Android

| Item | Value |
| --- | --- |
| Project | `apps/mp/android`, AGP 8.13.0 / Gradle 8.14.3 / Java 21 / compileSdk 36 / minSdk 24 |
| Final APK | 39,812,037 bytes, sha256 `84143e09d49ce8412329499bf66c42dc578c42b0efce3266d0105394f9bbe07d` |
| Install | `adb install -r` -> Success, then launched as `com.goodnight.treehole/.MainActivity` |
| Routes | **54 of 54 render**, 0 console errors |
| Controls | 600 enumerated, 600 visible, 289 clicked, 33 destructive deliberately skipped |
| Keyboard | no occlusion on journey / peer composer / recovery / support plan |
| Back | walks in-app history after ISSUE-ANDROID-001 was fixed |
| Network | online / offline / recover / slow all PASS |
| Repeat taps | 4 taps on the primary CTA -> exactly 1 journey |
| Lifecycle | background, foreground, force-stop, cold start all verified |
| API reachability | `adb reverse` + `http://127.0.0.1:3000`; live data in the app, no `Failed to fetch` while online |

`ANDROID_EMULATOR_VERIFIED=true`, `ANDROID_ADMIN_SYNC_VERIFIED=true`,
`ANDROID_DB_PERSISTENCE_VERIFIED=true`, `ANDROID_FULL_CONTROL_COVERAGE=true`.

### One product bug found and fixed

**ISSUE-ANDROID-001 (P1, PRODUCT_BUG)** - the hardware back button exited the app from any
inner page. Root cause: the recovered `App.disableBackButtonHandler: true` disables
Capacitor's `OnBackPressedCallback` entirely, so the activity finished on every press.
Fixed with `false` plus a small `backButton` listener adapter; the documented `canGoBack`
signal turned out to be false for `history.pushState` entries, so the adapter gates on
`window.history.length`. Rebuilt, reinstalled and retested on the device. Full detail in
`docs/post-recovery-android-findings.md` and
`artifacts/post-recovery/issues/ANDROID-001/`.

## Physical Android

**Not verified.** `adb devices -l` lists only `emulator-5554`. `PHYSICAL_ANDROID_VERIFIED=false`,
reason `NO_PHYSICAL_ANDROID_CONNECTED`. The emulator is never reported as a physical device.

## iOS

`IOS_SOURCE_READY=true` - `apps/mp/ios` is generated and synced with the same ten plugins.
`IOS_NATIVE_VERIFIED=false` - Windows has no Xcode, and no iOS runtime behaviour is claimed.

## Database

PostgreSQL 16.15 in the container on 127.0.0.1:15432, 9 migrations applied, 52 tables.
Verified this round by reading back what the device wrote: `journey_7d70ee166a` with
`stage=acting`, `action_dda975e9a0` status `active`, and `LifeJourney` going 3 -> 4 on the
repeat-tap check (exactly one row).

## Admin

The admin console is the web console, as the task specifies. Read the same authoritative
data: `journeySummary.total` matched the PostgreSQL count after the Android-created journey.
Playwright drives it; the front end is never validated through the browser in place of the
device.

## BullMQ

Verified in this recovery cycle: a follow-up job survived a worker restart and produced a
real `UserNotification` row, and the delayed job left the Redis delayed set on delivery.
Redis 7.4.8 on 127.0.0.1:16379.

## Privacy

Not weakened anywhere. Every gate was exercised as a refusal and as a grant:

- `allowRecoveryData` off -> `/api/v1/me/recovery` and `/api/v1/me/stable-self` return 403;
  on -> 200. The Android page renders a consent prompt with a route to the settings rather
  than an error. Reverted afterwards.
- `allowAnonymousExperienceShare` gates `POST /api/v1/peer-experiences`; two test fixtures
  were missing it and were fixed **in the fixtures**, not in the server.
- `allowJourneyLongTermAnalysis` gates the monthly-report job; a fixture was missing it and
  was fixed in the fixture.

No server-side permission check was removed, relaxed or bypassed at any point.

## PII

Not weakened. `redactPeerPublicText` remains applied to peer experience titles, content,
domains and tags, and the peer match response deliberately omits internal scoring fields.
The PII question is one of the two places where a test expectation conflicts with a
deliberate privacy design, and the privacy design won - see CONTRACT-021.

## Test contract decisions

21 contracts adjudicated in `docs/post-recovery-test-contract-review.md` using only the five
allowed classifications:

| Classification | Count |
| --- | ---: |
| ENVIRONMENT (`BLOCKED_DAPI_BALANCE`) | 10 |
| FIXTURE_PERMISSION_BUG | 2 (both fixed and retested) |
| STALE_TEST | 7 (decided, edits deferred) |
| UNKNOWN | 2 (visual questions, deferred to the visual task) |
| PRODUCT_BUG | 0 from the suites, **1 from the device** (ANDROID-001, fixed) |

No test was deleted, skipped or had its assertions lowered. No failure was reported as a
pass.

## qa:all

**Not passing.** `QA_ALL_PASS=false`. Three steps fail on the AI balance (`diagnose:all`,
`test:click-all`, `test:cross`) and `test:visual` fails on the pre-existing admin spec
(CONTRACT-013). The other ten steps pass. `pnpm lint` and `pnpm typecheck` exit 0.

## Status variables

```
DAPI_RESTORED=false                    # BLOCKED_DAPI_BALANCE (EXTERNAL_BLOCKER)
STAGE1_VERIFIED=true
STAGE2_VERIFIED=false                  # gated on DAPI by the task rules
STAGE3_BUSINESS_VERIFIED=false         # gated on DAPI by the task rules
QA_ALL_PASS=false
ANDROID_EMULATOR_VERIFIED=true
PHYSICAL_ANDROID_VERIFIED=false        # NO_PHYSICAL_ANDROID_CONNECTED
ANDROID_ADMIN_SYNC_VERIFIED=true
ANDROID_DB_PERSISTENCE_VERIFIED=true
ANDROID_FULL_CONTROL_COVERAGE=true
NO_P0_ISSUES=true
NO_P1_ISSUES=true                      # ANDROID-001 was P1 and is fixed and retested
```

`NO_P1_ISSUES=true` refers to open issues: ANDROID-001 was found, fixed and retested in this
round, so no P1 remains open.

## Final tag

**Not created.** `post-recovery-verified-YYYYMMDD` requires `DAPI_RESTORED`,
`STAGE2_VERIFIED`, `STAGE3_BUSINESS_VERIFIED` and `QA_ALL_PASS` to all be true. They are
not, so no tag was made.

`main` was not merged or touched.

## Remaining issues

| Id | Severity | Status | Blocks |
| --- | --- | --- | --- |
| BLOCKED_DAPI_BALANCE | external | OPEN - owner action | DAPI, Stage 2, Stage 3, qa:all |
| CONTRACT-013, 016, 018, 019, 020, 021 | P3 | decided, edits deferred | `test:visual`, `audit:front-navigation-layout`, `test:problem02-ai`, `test:front-phase3-me`, `test:goodnight-2` |
| CONTRACT-014, 017 | P3 | UNKNOWN, deferred to the visual task | `test:reference-qa-first-stage-shells`, `test:problem01-layout` |
| Keyboard on memory / decision / future self | P3 | not measured | emulator contention |
| Physical Android, iOS runtime | - | not available | hardware |

## What to do next

1. **Top up the DeepSeek account.** That single action unblocks DAPI, Stage 2, Stage 3 and
   `qa:all`. Then re-run the ten blocked suites for a new failure set, and apply the seven
   deferred stale-test edits one at a time with an individual retest, which the task permits
   once real product business passes.
2. Decide the two UNKNOWN visual contracts as part of the separate visual task.
3. Re-run the Android keyboard checks on the remaining three routes when the emulator is not
   contended.
