# GoodnightTreeHole 2.0 Final Delivery Report

Date: 2026-08-17

## 1. Architecture

2.0 is an incremental, database-backed addition to the existing Vite front end,
admin application, Nest API, Prisma schema, and shared type package. No existing
front/admin/API contract was removed. Both ends read the same runtime store and
relational mapper.

## 2. Pages

Added the real routes `pages/tonight/index`, `pages/journey/detail`,
`pages/action/index`, and `pages/peers/index`. They use live API data for situation
analysis, commitments, check-ins, peer matching, privacy consent, and life-support
records.

## 3. Old pages

Legacy square, compose, post-detail/reply sheet, letter, tool, diary, report,
favorites, privacy, feedback, and profile flows remain available. Their existing
buttons still call real APIs and remain covered by the interaction manifest.

## 4. API

Added 2.0 endpoints for Tonight, journeys, snapshots, actions, check-ins, peer
experiences/matches, decisions, cooldowns, reality handoffs, contacts, future
messages, support plans, bounded memory, recovery data, and feature flags. Admin
has corresponding list/moderation/operations endpoints.

## 5. Data tables

The additive Prisma migration introduces `LifeJourney`, `SituationSnapshot`,
`JourneyUpdate`, `ActionCommitment`, `OutcomeCheckin`, `PeerExperience`, `PeerMatch`,
`PeerReputation`, `DecisionRecord`, `CooldownItem`, `RealityHandoff`,
`TrustedContact`, `MessageToFutureSelf`, `PersonalSupportPlan`, `MemoryItem`,
`RecoverySnapshot`, `SafetyEvent`, `AgentDecisionLog`, and `FollowUpJob`.

## 6. Agent

Structured analysis is an asynchronous, persisted `AiJob` with provider/model/status
and a linked `AgentDecisionLog`. New 2.0 AI work uses an approved remote DAPI provider
only; no Ollama or local model is used in the test flows. A `user_confirmed`
SituationSnapshot is protected from AI overwrite.

## 7. Follow-up

Creating a commitment produces a pending outcome check-in and `FollowUpJob`.
Submitting a check-in updates the same records to completed status and contributes to
the journey timeline and recovery view.

## 8. Matching

Peer experience matching is opt-in, anonymous, moderated, and reputation-aware. The
peer page creates an API-backed match only when the matching and anonymous-statistics
privacy flags permit it.

## 9. Safety

Safety events, cooldown decisions, trusted contacts, and reality handoffs are
persisted. The product records the user's selected real-world support route; it does
not claim diagnosis or fabricate emergency intervention.

## 10. Privacy

New flags cover peer matching, anonymous experience statistics, recovery data,
long-term journey analysis, and bounded long-term memory. Protected endpoints reject
access until the associated consent is enabled.

## 11. Admin

The admin router and table views expose journeys, commitments, check-ins, peer
experiences/matches, safety events, support plans, and memories. They consume the
same live API/runtime data as the user application.

## 12. Flags

Feature flags and privacy flags are stored and retrieved through the API. Browser
tests explicitly enable needed consent, exercise the business path, and restore the
test state instead of bypassing a guarded route.

## 13. Migration

The 2.0 migration is additive:
`prisma/migrations/20260816000000_goodnight_2_incremental/migration.sql`. The
public schema reports up to date and a clean temporary schema accepted all three
migrations through `prisma migrate deploy`; details are in
`docs/goodnight-2.0-migration-repair.md`.

## 14. Unit

`pnpm lint` and `pnpm typecheck` passed. The unit suite passed 7/7 within the final
`pnpm qa:all` run.

## 15. API

The API suite passed 2/2 within `pnpm qa:all`. Direct compatibility probes returned
200 for Tonight, cooldown, handoff, support-plan, and memory endpoints; recovery
correctly returned 403 while its privacy flag was disabled.

## 16. E2E

The end-to-end suite passed 12/12. It includes route/API behavior rather than only
static rendering.

## 17. Visual

Local capture and layout checks passed for all 14 front references: no horizontal
overflow was detected. Current source-to-reference diff rates are 10.42%-22.25%; this
is documented as a remaining visual-convergence task, not claimed as pixel-perfect.

## 18. Click-all

`pnpm test:click-all` passed 124/124 manifest actions across front and admin. Each
state-changing control asserted its API request, navigation, or actual DOM result.
Evidence: `artifacts/test-report/click-all-report.md`.

## 19. Business flow

`pnpm test:goodnight-2` passed. It verifies situation confirmation, action
commitment, follow-up completion, peer review/match, decision/cooldown/handoff,
trusted contact, future message, support plan, memory, graduation, and recovery with
database persistence readback.

## 20. Cross-end

The cross-end suite passed 3/3 in the final quality run. It verifies front-to-admin
visibility from the authoritative source, including a completed DAPI `AiJob`.

## 21. QA all

`pnpm qa:all` completed with exit code 0. The final run included lint, typecheck,
unit, API, E2E, local visual regression, overlay/clickability diagnostics, visible
artifact audit, real-browser front/admin/cross flows, click-all, business flow, and
cross-end tests.

## 22. Database validation

Business and cross-end tests use isolated PostgreSQL schemas. They validate UI/API
changes through direct Prisma reads after refresh-sensitive actions. The local runtime
does not rely on frontend fixture data for the new 2.0 records.

## 23. Unrelated existing issues

See `docs/unrelated-existing-issues.md`: the local database role cannot create a
new database, Redis is below the BullMQ recommendation, and the historical admin
checkpoint is stale. The current migration chain itself is deployable.

## 24. Remaining risks

- Run a production backup and staging migration rollout before production deploy.
- Run a dedicated visual tuning pass for legacy reference diffs, especially diary.
- Configure production DAPI credentials and provider allow-lists outside source
  control, then repeat the DAPI job audit in staging.

## Evidence and screenshots

- `artifacts/test-report/real-browser-goodnight-2.md`
- `artifacts/test-report/click-all-report.md`
- `artifacts/diagnosis/clickability-report.md`
- `artifacts/screenshots/real-user/front/13-action-advanced.png`
- `artifacts/screenshots/claude-after/01-square.png` through
  `artifacts/screenshots/claude-after/14-feedback.png`
