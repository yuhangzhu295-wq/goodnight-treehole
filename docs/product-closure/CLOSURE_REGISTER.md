# CLOSURE REGISTER

Live status of every issue from `docs/product-audit/ISSUE_REGISTER.md`, re-checked in this
closure round rather than trusted from the historical record (closure task section 20).

Status vocabulary: `FIXED_VERIFIED` / `OPEN_CONFIRMED` / `NO_LONGER_APPLIES` /
`BLOCKED_EXTERNAL`.

## Re-verification of the previously fixed issues (section 21)

`work/verify-fixed-issues.mjs` - 9/9 PASS against the running stack. None of these were
rewritten; they were regression-tested:

| Issue | Check | Result |
| --- | --- | --- |
| ISSUE-001 | five admin endpoints reject a missing token; accept a valid one; reject a forged one | PASS |
| ISSUE-002 | `users/export` returns a real file (`format=goodnight-treehole-user-export/v1`) and requires a token | PASS |
| ISSUE-004 | the tool route serves | PASS |
| ISSUE-017 | letters are owner-only (`owner=200 other=404`) | PASS |
| ISSUE-018 | peer experience reads require a relationship | PASS |
| ISSUE-019 | handoffs are caller-scoped (`owner=3 other=0`) | PASS |

## Current status

| Issue | Severity | Status | Evidence |
| --- | --- | --- | --- |
| ISSUE-001 admin auth | P0 | FIXED_VERIFIED | `356457f`; regression above |
| ISSUE-002 user export | P1 | FIXED_VERIFIED | `91ba899`; regression above |
| ISSUE-003 write-only settings | P1 | **FIXED_VERIFIED** | `ae285b1`; 4 settings wired, 10 refused; `work/verify-settings-enforced.mjs` 7/7 |
| ISSUE-004 tool entrance | P1 | FIXED_VERIFIED | `082dca0`; regression above |
| ISSUE-005 privacy link | P2 | FIXED_VERIFIED | `082dca0` |
| ISSUE-006 support intents | P1 | **FIXED_VERIFIED** | `work/verify-core-flow.mjs`; all 8 intents map to real destinations |
| ISSUE-007 AI degradation invisible | P1 | OPEN_CONFIRMED (product side) / BLOCKED_EXTERNAL (verification) | needs a funded DAPI to exercise the failure UI end to end |
| ISSUE-008 smaller action | P2 | **FIXED_VERIFIED** | `mode=smaller` produces a different request; verified |
| ISSUE-009 follow-up entry | P2 | **FIXED_VERIFIED** | real entry + sheet; check-in writes and persists |
| ISSUE-010 notification deep link | P2 | **FIXED_VERIFIED** | target carries `commitmentId`; read receipt decoupled from navigation |
| ISSUE-011 graduation / handoff share | P2 | **FIXED_VERIFIED** | graduate + consent + share all reachable and persisting |
| ISSUE-012 decorative captcha | P2 | **FIXED_VERIFIED** | `a94e119`; the field is removed, not faked; `work/verify-login-throttle.mjs` 7/7 |
| ISSUE-013 admin login rate limit | P2 | **FIXED_VERIFIED** | `a94e119`; real 429 with a retry hint after 5 failures per (IP, username) |
| ISSUE-014 orphan admin endpoints | P3 | OPEN_CONFIRMED | |
| ISSUE-015 dead aliases | P3 | OPEN_CONFIRMED | |
| ISSUE-016 Square reachability | P3 | OPEN_CONFIRMED | product decision, not a code defect |
| ISSUE-017 letter ownership | P1 | FIXED_VERIFIED | `ea52129`; regression above |
| ISSUE-018 peer experience ownership | P1 | FIXED_VERIFIED | `ea52129`; regression above |
| ISSUE-019 handoff ownership | P1 | FIXED_VERIFIED | `ea52129`; regression above |
| ISSUE-020 hug counter | P2 | **FIXED_VERIFIED** | `260030b`; derived from real `HugAction` rows, idempotent per user; `work/verify-hug.mjs` 7/7 |
| ISSUE-020 report counter | P2 | BLOCKED_ENVIRONMENT | needs a new Prisma model; `prisma generate` cannot update the runtime client on this machine |
| ISSUE-021 monthly privacy | P2 | **FIXED_VERIFIED** | `a94e119`; caller-scoped and `allowRecoveryData`-gated; `work/verify-privacy-data.mjs` 8/8 |
| ISSUE-022 memory permission | P2 | **FIXED_VERIFIED** | `a94e119`; correct flag for AI use, disabled memories no longer re-activate |
| ISSUE-023 admin error visibility | P2 | **FIXED_VERIFIED** | `a94e119`; six screens now render their status line; `work/verify-admin-error-visible.mjs` 4/4 |
| ISSUE-024 support-plan admin render | P2 | **FIXED_VERIFIED** | `a94e119`; real plan fields, real `active` column; no `[object Object]` |
| ISSUE-025 safety event closure | P2 | OPEN_CONFIRMED | needs an acknowledgement column; same generate blocker |
| ISSUE-026 admin search / pagination | P3 | OPEN_CONFIRMED | |
| ISSUE-027 user note persistence | P2 | OPEN_CONFIRMED | needs its own model; same generate blocker |
| ISSUE-028 peer conversation reports | P3 | OPEN_CONFIRMED | |

## Newly found in this round

| Issue | Severity | Status | Evidence |
| --- | --- | --- | --- |
| ISSUE-029 `reloadRuntimeState` lost updates | **P1** | FIXED_VERIFIED | A concurrent BullMQ follow-up delivery replaced in-memory state with an older snapshot, so a handoff created with 201 did not exist a moment later and a journey could graduate then revert to active. Fixed by draining the write queue and refusing to adopt a stale snapshot (`mutationVersion`). Verified: `work/verify-core-flow.mjs` 15/15, including `visibleInList=true` |

## Gates

```
OPEN_P0=0
OPEN_P1=1            (ISSUE-007 product-side; its verification is BLOCKED_EXTERNAL)
FAKE_BUTTON_COUNT=0
FAKE_FUNCTION_COUNT=0
WRITE_ONLY_OPERATION_COUNT=0
DECORATIVE_SECURITY_CONTROL_COUNT=0
BLOCKED_ENVIRONMENT=3 (ISSUE-020 report counter, ISSUE-025, ISSUE-027 - each needs a new
                       Prisma model, and prisma generate cannot update the client here)
DAPI_VERIFIED=false  (HTTP 402)
PHYSICAL_ANDROID_VERIFIED=false (no device attached)
```

## Fix commits in this round

| Commit | Scope |
| --- | --- |
| `ae285b1` | ISSUE-003 - every admin setting is enforced or refused |
| `62712f1` | ISSUE-006 / 008 / 009 / 010 / 011, plus ISSUE-029 (lost-update race) |
| `a94e119` | ISSUE-012 / 013 / 021 / 022 / 023 / 024 |
| `260030b` | ISSUE-020 hug counter |
