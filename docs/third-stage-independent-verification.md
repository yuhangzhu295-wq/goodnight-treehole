# Third-stage Independent Verification

## Scope and baseline

- Branch: `codex/third-stage-self-system`
- Audit-start HEAD: `ff8f52697fcc011ea730403b770a524b291c7af7`
- `origin/main`: `99c84de678abf1bc5359b5d360699ce7dbb6d383`
- Merge base: `99c84de678abf1bc5359b5d360699ce7dbb6d383`
- Reference source: `C:\Users\zyu33\Desktop\图片素材88\晚安树洞_UI_01-41_业务说明`

This is a new independent review. It does not inherit the prior `DONE` or
freeze claims from `docs/third-stage-truth-review.json`.

## Audit fixes made during verification

1. Privacy fields introduced by the third-stage migration now default to the
   least-privilege `false` state. Legacy memory and peer settings do not
   silently grant new consent.
2. Third-stage user resources and AI task/status endpoints bind the user from
   `x-goodnight-user-id`; a request body cannot select another user's data.
3. Safety Support still places Reality Handoff, `12356`, `120`, and the
   temporary-safety action before the optional user-saved support plan. The
   plan is fetched from the API and shown only as a supplement.
4. `test:click-all` now logs the selector before acting, so a future
   clickability timeout is attributable to an exact visible control.

The frozen-area diff against `origin/main` was checked for `JourneyDetail.vue`,
`SafetySupport.vue`, `App.vue`, `router.ts`, and `styles.scss`. The retained
changes are third-stage integration and the first/second-stage reference
regressions passed below. No unrelated frozen-page visual repair was added.

## Added independent coverage

- `pnpm test:third-stage-business`: real API coverage across Me, Recovery,
  Support Plan, Stable Self, Memory, Decision, Future Self, Privacy, Monthly
  Report, and Archive.
- `pnpm test:third-stage-persistence`: PostgreSQL write/read/restart checks,
  including four Recovery dates and a 20x read-idempotence count check.
- `pnpm test:third-stage-security`: cross-user isolation and direct API
  authorization checks.
- `pnpm test:third-stage-memory`: consent-gated real DAPI memory context
  checks, including active, scoped, expired, disabled, and deleted memory.
- `pnpm test:third-stage-migrations`: isolated clean-schema and stage-two
  upgrade migration verification using `prisma migrate deploy`, never
  `db push`.

## Persistence, migration, DAPI, and workers

- The persistence suite verified Recovery, Support Plan, Stable Self, Memory,
  Decision, Future Self, Privacy, Monthly Report, and Archive through API,
  PostgreSQL, restart, and reread. GET-only refreshes did not create business
  records or AI jobs.
- Clean and upgrade migration paths passed with nine migrations. Upgrade data
  for User, Privacy, Journey, PeerExperience, PeerConversation, Notification,
  AiJob, and existing Memory was preserved. All new consent defaults are
  explicitly `false`. Evidence:
  `artifacts/test-report/third-stage-migration-verification.json`.
- Current DAPI-only proof used `AI_LOCAL_MODEL_ENABLED=false`,
  `OLLAMA_ENABLED=false`, and `AI_ALLOW_OLLAMA_FALLBACK=false`. The recorded
  live job is `job_a5359482e1`, provider `provider_dapi_deepseek`, model
  `deepseek-v4-flash`, terminal status `succeeded`, and `fallbackUsed=false`.
  Evidence: `artifacts/test-report/dapi-live-report.json`.
- The independent memory test additionally asserted the persisted AI trace
  contains only eligible memory IDs; expired, disabled, deleted, and
  disallowed-scope entries were absent. With memory consent disabled, direct
  writes were rejected and the next DAPI context was empty.
- Decision cooldown, Future Self delivery/notification gates, and monthly
  DAPI summary/BullMQ paths passed through the existing dedicated third-stage
  suites. The tests assert persisted terminal outcomes rather than HTTP 200.

## Regression and product-flow commands

All commands below completed with exit code `0` under the DAPI-only
environment above unless they are pure static/reference checks:

```text
pnpm lint
pnpm typecheck
pnpm test:third-stage-migrations
pnpm test:third-stage-business
pnpm test:third-stage-persistence
pnpm test:third-stage-security
pnpm test:third-stage-memory
pnpm test:third-stage-decision
pnpm test:third-stage-future-self
pnpm test:third-stage-privacy
pnpm test:third-stage-monthly-report
pnpm test:third-stage-archive
pnpm test:reference-fidelity-first-stage
pnpm test:reference-qa-first-stage-shells
pnpm test:reference-qa-journey
pnpm test:reference-qa-action
pnpm test:notification-truth-state
pnpm test:reference-fidelity-peer-stage
pnpm test:peer-stage-business
pnpm test:peer-stage-security
pnpm test:peer-stage-two-user
pnpm test:peer-stage-expiry
pnpm test:click-all
pnpm test:business-flow
pnpm test:cross
pnpm test:dapi-live
pnpm qa:all
```

`test:click-all` exercised all visible front and admin manifest controls,
including DAPI provider testing, route testing, moderation, feedback, and
configuration persistence. `test:business-flow` and `test:cross` verified
front to API to database to refresh and cross-end synchronization.

## Independent visual review

New reference, actual, side-by-side, difference, and responsive captures are
under `artifacts/reference-fidelity/third-stage-independent/`. The detailed,
non-inherited per-page decision is in
`docs/third-stage-independent-review.json`.

| Reference         | Route                       | Result  | Independent finding                                                                                                 |
| ----------------- | --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| #38 My Final      | `/pages/me/index`           | PARTIAL | Blue hero and white modular cards do not match the warm hand-journal hierarchy.                                     |
| #9 Recovery       | `/pages/recovery/index`     | PARTIAL | Real records persist, but the page remains a conventional form rather than the illustrated single-card composition. |
| #41 Support Plan  | `/pages/support-plan/index` | PARTIAL | Real plan and Safety readback work, but the dark dense-input treatment differs from the paper plan.                 |
| #27 Stable Self   | `/pages/stable-self/index`  | PARTIAL | Profile persistence is correct; form density and narrative grouping still diverge.                                  |
| #15 Memory        | `/pages/memory/index`       | PARTIAL | Transparency and controls work, but it reads as a management list instead of the light explanatory surface.         |
| #12 Decision      | `/pages/decision/index`     | PARTIAL | Cooldown data is correct; the vault card, pacing, and support graphics differ.                                      |
| #35 Future Self   | `/pages/future-self/index`  | PARTIAL | Scheduling is real; dark hero and control geometry do not match the letter reference.                               |
| #7 Privacy        | `/pages/settings/privacy`   | PARTIAL | Explicit consent is correct; the tree-list visual language differs from the private-card reference.                 |
| #8 Monthly Report | `/pages/report/month`       | PARTIAL | Real report data and DAPI use pass; the dashboard/chart treatment differs from the reflection narrative.            |
| #30 Archive       | `/pages/archive/index`      | PARTIAL | Archive/restore/export use real data; the tabbed list differs from the diary-and-letter composition.                |

All ten pages loaded and were horizontally overflow-free at the independent
420px capture plus 375/390/393/430px responsive captures. This is not used to
upgrade reference fidelity to `DONE`; the material hierarchy and composition
differences above remain.

## Final cold-start browser check

After `qa:all`, API, MP/H5, and Admin were restarted with local/Ollama paths
disabled. `GET /api/health`, `/pages/me/index`, and `/login` each returned
`200`. In the in-app browser at `430x764`, the following routes all mounted,
had no horizontal overflow, no blank screen, and no console error:

```text
/pages/me/index
/pages/memory/index
/pages/decision/index
/pages/archive/index
/pages/safety/index
/pages/peers/index
```

The only environment warning during suites was that Redis `5.0.14.1` is below
the recommended `6.2.0`; it did not cause a failed assertion.

## Freeze and PR decision

`THIRD_STAGE_SELF_SYSTEM_FROZEN=false`.

Business, persistence, migration, DAPI, worker, first-stage, second-stage,
cross-end, and full QA evidence pass. However, all ten independently reviewed
third-stage reference pages remain `PARTIAL` for reference fidelity. Therefore
this branch is not pushed as a merge-ready change, no PR is created, and
`main` is not modified.
