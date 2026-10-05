# TEST BASELINE FAILURES

The business suite does not currently pass in full. This file records the failing set **before**
the Batch 1 persistence work, so that each sub-batch can be judged by whether it *adds* a
failure rather than by an absolute pass count that the environment cannot produce.

Measured by the orchestrator, not taken from an implementer's summary.

## Command and baseline

```
npx vitest run tests/business/ --reporter=basic
```

| | Baseline `5de2d0e` | Branch `270a61c` (sub-batch A, pre-fix) |
| --- | --- | --- |
| Test files | 10 failed / 13 passed (23) | 10 failed / 14 passed (24) |
| Tests | 12 failed / 33 passed (45) | 11 failed / 39 passed (50) |

The file and test counts differ because sub-batch A adds `batch1-usernotification.spec.ts`
(5 tests). The 23-file baseline is the comparable figure.

## The baseline failing set (12 tests)

```
first-batch-core-loop.spec.ts        pauses ordinary routing for a safety event, persists the real-world handoff, and records notification readback
front-me.spec.ts                     loads profile, stats, report, and persists privacy settings
front-publish-private.spec.ts        keeps a private mood out of the square and persists its asynchronous private letter
front-publish-public.spec.ts         creates a public post, queues AI, and becomes visible after admin approval
front-tools.spec.ts                  runs decompose and generic tools, then saves a real diary record
goodnight-2-incremental.spec.ts      connects two distinct persisted users through a reviewed experience and a 72 hour human conversation
goodnight-2-incremental.spec.ts      delivers an overdue follow-up through Redis/BullMQ and persists the unread notification
goodnight-2-incremental.spec.ts      persists situation, action, peer, safety and recovery records across refreshes
peer-support-stage.spec.ts           requires privacy, consent, and an active conversation before messages can cross users
persistence-durability.spec.ts       Defect 1: PATCH /api/v1/journeys/:id persists title and summary to database before response
third-stage-memory-independent.spec.ts  uses only consented, active, in-scope memory in a real DAPI AI job and records the exact memory ids
third-stage-monthly-report.spec.ts   summarizes persisted recovery facts without sending data to AI before long-term analysis is allowed
```

## Causes actually verified

Only two causes were diagnosed; the rest are recorded as observed, not explained.

**1. External AI unavailable — `.env` has `DAPI_API_KEY=""` (length 2, i.e. empty).**

`DAPI_BASE_URL` is set but the key is empty, so any assertion that a real DAPI call reaches
`succeeded` cannot hold. Confirmed directly on `peer-support-stage.spec.ts`:
`AssertionError: expected 'failed' to be 'succeeded'`, and the same assertion fails identically
at the baseline commit. This is the `AI_LIVE_BLOCKED_EXTERNAL` class, not a product defect and
not a migration defect — it is the same condition that blocks `QA_ALL_PASS` and `DAPI_VERIFIED`
in the closure register. It must be reported as blocked-external, never as a pass.

**2. Connection-pool exhaustion under parallel suite load.**

`persistence-durability.spec.ts` Defect 1 fails with
`Too many database connections opened: FATAL: sorry, too many clients already` when the suite
runs in parallel. It fails on the baseline commit as well, so it is pre-existing infrastructure
behaviour, not a product defect — and equally not a pass. The same class of artifact invalidated
the benchmark's first concurrency trial (read-phase pool exhaustion), which is why the benchmark
document refuses to claim "no lost updates" from it. Running the spec in isolation passes.

**Everything else** in the list above is recorded as "present on both commits, cause not
individually diagnosed". It is not claimed to be external-AI, and it is not claimed to be
harmless. A sub-batch is only required to keep the set from growing.

## How this is used

A sub-batch's regression evidence is a diff against this list, not a pass count:

- the failing set must remain a **subset** of the baseline set;
- any test that newly fails, or that changes from failing to passing, must be explained with a
  cause — a newly passing notification test is not automatically good news, and a newly failing
  one is not automatically a flake.

Sub-batch A initially **added** one failure,
`third-stage-decision-vault.spec.ts > holds a user decision, delivers a real cooldown
notification, and only then lets the user decide and archive`, which failed intermittently
(measured 1 of 3 isolated runs). It was a real regression — the notification became
database-visible at commit while `/api/v1/decisions` still read the legacy store, so a reader
could see "cooldown released" against a decision still reading `cooling`. It was fixed in the
worker's delivery ordering rather than by relaxing the assertion. See the sub-batch A report.
