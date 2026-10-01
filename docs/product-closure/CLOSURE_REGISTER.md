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
| ISSUE-012 decorative captcha | P2 | OPEN_CONFIRMED | |
| ISSUE-013 admin login rate limit | P2 | OPEN_CONFIRMED | |
| ISSUE-014 orphan admin endpoints | P3 | OPEN_CONFIRMED | |
| ISSUE-015 dead aliases | P3 | OPEN_CONFIRMED | |
| ISSUE-016 Square reachability | P3 | OPEN_CONFIRMED | product decision, not a code defect |
| ISSUE-017 letter ownership | P1 | FIXED_VERIFIED | `ea52129`; regression above |
| ISSUE-018 peer experience ownership | P1 | FIXED_VERIFIED | `ea52129`; regression above |
| ISSUE-019 handoff ownership | P1 | FIXED_VERIFIED | `ea52129`; regression above |
| ISSUE-020 hug / report counters | P2 | OPEN_CONFIRMED | |
| ISSUE-021 monthly privacy | P2 | OPEN_CONFIRMED | |
| ISSUE-022 memory permission | P2 | OPEN_CONFIRMED | |
| ISSUE-023 admin error visibility | P2 | OPEN_CONFIRMED | |
| ISSUE-024 support-plan admin render | P2 | OPEN_CONFIRMED | |
| ISSUE-025 safety event closure | P2 | OPEN_CONFIRMED | |
| ISSUE-026 admin search / pagination | P3 | OPEN_CONFIRMED | |
| ISSUE-027 user note persistence | P2 | OPEN_CONFIRMED | |
| ISSUE-028 peer conversation reports | P3 | OPEN_CONFIRMED | |

## Newly found in this round

| Issue | Severity | Status | Evidence |
| --- | --- | --- | --- |
| ISSUE-029 `reloadRuntimeState` lost updates | **P1** | FIXED_VERIFIED | A concurrent BullMQ follow-up delivery replaced in-memory state with an older snapshot, so a handoff created with 201 did not exist a moment later and a journey could graduate then revert to active. Fixed by draining the write queue and refusing to adopt a stale snapshot (`mutationVersion`). Verified: `work/verify-core-flow.mjs` 15/15, including `visibleInList=true` |

## Gates

```
OPEN_P0=0
OPEN_P1=1            (ISSUE-007 product-side; its verification is BLOCKED_EXTERNAL)
FAKE_BUTTON_COUNT=1  (ISSUE-012)
FAKE_FUNCTION_COUNT=1 (ISSUE-012 is also the remaining decorative control)
WRITE_ONLY_OPERATION_COUNT=0
DECORATIVE_SECURITY_CONTROL_COUNT=1 (ISSUE-012)
```
