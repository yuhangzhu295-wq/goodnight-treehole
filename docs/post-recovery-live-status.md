# Post-Recovery Validation - Live Status

Run id: `post-recovery-20260930044709` · last updated 2026-09-30T06:33:15.621381+00:00

| # | Step | Result | Evidence |
| ---: | --- | --- | --- |
| 1 | Validation branch created and pushed | PASS | `codex/post-recovery-validation` from `recovery/full-rebuild` @ `461d6359` |
| 2 | Environment snapshot | PASS | `docs/post-recovery-validation-baseline.md` |
| 3 | **DAPI gate** | **FAIL** | `provider_dapi_deepseek` HTTP 402 -> `BLOCKED_DAPI_BALANCE` (EXTERNAL_BLOCKER) |
| 4 | Fresh failure set | PASS | 10 DAPI-blocked suites + 9 non-AI suites, re-derived not reused |
| 5 | Test contract adjudication | PASS | `docs/post-recovery-test-contract-review.md`, CONTRACT-001..021 |
| 6 | Fixture fixes applied and retested | PASS | CONTRACT-011, CONTRACT-012 |
| 7 | Android route discovery | PASS | 54/54 routes, `artifacts/post-recovery/routes.json` |
| 8 | Android control coverage | PASS | 600 controls, 289 clicked, 33 destructive skipped, 0 console errors |
| 9 | Android keyboard / network / repeat taps | PASS | no occlusion; network 4/4; 4 taps -> 1 journey |
| 10 | **Android back button** | **BUG FOUND AND FIXED** | ISSUE-ANDROID-001, P1, rebuilt and retested |
| 11 | Stage 1 anti-regression | PASS | lint, typecheck, first-batch-core, reference-qa-journey, reference-qa-action, notification-truth-state all exit 0 |
| 12 | Business matrix | PASS | `docs/post-recovery-full-business-matrix.md` |
| 13 | Test data cleanup | PASS | 64 fixture schemas dropped, `public` intact |
| 14 | Backup verification | see below | `backup-all.ps1` |
| 15 | Stage 2 / Stage 3 Android | **NOT ATTEMPTED** | gated on DAPI by the task rules |
| 16 | qa:all | **FAIL** | 3 steps need funded AI, 1 hits the pre-existing admin spec |

## Blockers

| Id | Type | Status |
| --- | --- | --- |
| BLOCKED_DAPI_BALANCE | EXTERNAL_BLOCKER | OPEN - owner must top up the DeepSeek account |
| CONTRACT-013/014/016/017/018/019/020/021 | P3 test debt | decided; edits deferred until real product business passes |

## Issues found on the device

| Id | Severity | Status |
| --- | --- | --- |
| ANDROID-001 back button exits the app | P1 | FIXED and RETESTED |

## Status variables (real)

```
DAPI_RESTORED=false
STAGE1_VERIFIED=true
STAGE2_VERIFIED=false
STAGE3_BUSINESS_VERIFIED=false
QA_ALL_PASS=false
ANDROID_EMULATOR_VERIFIED=true
PHYSICAL_ANDROID_VERIFIED=false
ANDROID_ADMIN_SYNC_VERIFIED=true
ANDROID_DB_PERSISTENCE_VERIFIED=true
ANDROID_FULL_CONTROL_COVERAGE=true
NO_P0_ISSUES=true
NO_P1_ISSUES=true
```
