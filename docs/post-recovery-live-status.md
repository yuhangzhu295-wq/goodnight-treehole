# Post-Recovery Validation - Live Status

Updated continuously during the run. Run id: `post-recovery-20260930044709`

| # | Step | Result | Evidence |
| ---: | --- | --- | --- |
| 1 | Validation branch created and pushed | PASS | `codex/post-recovery-validation` @ `461d6359548f` |
| 2 | Environment snapshot | PASS | `docs/post-recovery-validation-baseline.md` |
| 3 | **DAPI gate (`pnpm test:dapi-live`)** | **FAIL** | `provider_dapi_deepseek` HTTP 402 Insufficient Balance -> `BLOCKED_DAPI_BALANCE` |
| 4 | Fresh failure set | in progress | `artifacts/post-recovery/failure-set.txt` |

## Blockers

| Id | Type | Name | Status |
| --- | --- | --- | --- |
| BLOCKED_DAPI_BALANCE | EXTERNAL_BLOCKER | DeepSeek account has no credit | OPEN - owner action required |

## Status variables (current, real)

```
DAPI_RESTORED=false            # BLOCKED_DAPI_BALANCE
STAGE1_VERIFIED=true           # carried over from the recovery, re-checked in step 10
STAGE2_VERIFIED=false          # gated on DAPI by the task rules
STAGE3_BUSINESS_VERIFIED=false # gated on DAPI by the task rules
QA_ALL_PASS=false
ANDROID_EMULATOR_VERIFIED=true
PHYSICAL_ANDROID_VERIFIED=false # NO_PHYSICAL_ANDROID_CONNECTED
```
