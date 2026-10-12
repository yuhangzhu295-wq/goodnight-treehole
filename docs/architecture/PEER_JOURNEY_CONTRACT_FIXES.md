# Peer and journey contract fixes, and the cleared test baseline

Date: 2026-10-12. Branch: `codex/ui-v2-native-redesign`.

## Why this exists

The full business suite had been reported as "0 new regressions" for several batches while six specs
were failing. CI does run the whole suite; the gate tolerates a documented baseline of known
failures (`docs/architecture/TEST_BASELINE_FAILURES.md`) and only fails on *new* regressions. Every
failure below was in that baseline, so nothing ever objected.

They are now fixed, the suite passes, and the baseline is empty.

## Defect 1 — `POST /journeys/:id/graduation-consent` always answered 401

**Impact:** a user could never share their graduated journey anonymously. Every call failed, for
every caller, regardless of credentials.

`saveGraduationConsent` resolved the journey correctly and then called
`this.graduationSummary(journeyId)` in all four of its return paths — without forwarding the resolved
user. `graduationSummary` calls `requireJourney(journeyId, requestedUserId)`, which calls
`resolveRuntimeUserId(undefined)` and throws `UnauthorizedException('缺少用户身份标识')`.

The neighbouring `/graduate` path (store.service.ts:4334) does pass `journey.userId`, which is why
graduation itself worked and only the consent step was broken.

**Fix:** pass `journey.userId` at all four call sites.

**Verified live** (`scripts/verify-graduation-consent.mjs`, against the running API):

| Call | Result |
|---|---|
| `decision=willing` | 201, draft created with `status=pending_review` |
| `decision=later` / `no` | 201, `draft=null` |
| no credential | 401 — the auth boundary is unchanged |

## Defect 2 — `POST /peer-experiences` never returned the draft's `status`

**Impact:** the author of a new experience could not tell it was awaiting review. The response item
is `peerExperienceSummary(...)`, which is the projection for *other* viewers and deliberately omits
the moderation status.

**Fix:** the three owner-facing write responses (`createPeerExperience`, and both branches of
`updatePeerExperience`) now add `status` back. The shared summary is untouched, so other viewers
still see no moderation state.

## Test changes (the tests were stale, not the product)

| Spec | What was stale | Now |
|---|---|---|
| `goodnight-2-incremental` | asserted `score` / `fingerprintSimilarity` on the C-end match response, which deliberately carries only the human `reasons`; those ranking internals live on the admin surface and in the table | ranking asserted against the persisted row, response asserted for the `reasons` it promises |
| `goodnight-2-incremental` | expected a conversation after **one** side consented | asserts the two-sided contract: acceptance alone changes nothing, one consent stays `pending`, the conversation opens on the second |
| `third-stage-monthly-report` | expected the same single-consent activation, and called `/reports/monthly` with no credential | adds the requester's consent and sends the demo identity |
| `front-me` | every call was unauthenticated, relying on the demo fallback that R-06 removed | sends the demo identity; the AI half is `it.skipIf`-gated |
| `front-publish-private` | read `store.aiJobs`, whose getter now throws because AIJob became database-authoritative in Batch 1 | counts rows via Prisma; AI half gated |

## DAPI-dependent tests

`DAPI_API_KEY` is empty in this environment, so an AI job stops at `fallback` instead of `succeeded`.
Those assertions are **not** passes and are not asserted into one:

- `helpers.ts` exports `dapiConfigured` and `requireDapi(ctx)`, which calls `ctx.skip(...)` with
  `NOT_RUN_NO_SECRET`.
- Seven tests across five specs report as **skipped**, not passed: `front-me` (1), `front-tools` (1),
  `front-publish-private` (1), `front-publish-public` (1), `third-stage-memory-independent` (1),
  `third-stage-monthly-report` (1), plus one more in `front-me`.
- Consequence to keep in mind: the memory-scoping behaviour in `third-stage-memory-independent` has
  **no coverage** until credentials exist. That is recorded rather than papered over with a stub —
  `mock DAPI / stub AI` is explicitly forbidden, and a green test there would be a false claim.

## Measured result

```
[test-runner] files: 41 passed / 0 failed of 41
[test-runner] tests: 272 passed / 0 failed of 279   (7 skipped)
[baseline-diff] Total Failures 0 | Known Baseline 0 | New Regressions 0 | exit 0
```

`pnpm typecheck` passes across the repo. The baseline file's tolerated set is now empty, so any
future failure is a new regression rather than a known one.
