# CONTINUOUS RUN LOG

Running record for the CONTINUOUS COMPLETION MASTER PLAN. Each phase appends its
starting HEAD, its evidence, and its closing HEAD so a later phase can prove what it
inherited and did not overwrite.

## PHASE 0 — environment and evidence freeze

| Item | Value |
| --- | --- |
| `PRE_CONTINUOUS_RUN_HEAD` | `ecaeda054032bb7b0f5119681663b4d828a786c2` |
| Branch | `codex/post-recovery-validation` |
| Remote HEAD at start | `ecaeda0` (pushed before the run began) |
| Working tree | clean |
| `PRE_CONTINUOUS_RUN_DB_BACKUP` | `C:\Users\zyu33\Backups\goodnight-treehole-db\goodnight_treehole-20261007-0425.dump` (350,350 bytes, 691 archive entries) |
| Backup summary | `C:\Users\zyu33\Backups\backup-all-20261007-0425.json` |
| Recovery evidence archive | `recovery-evidence-20261007-0425.zip` (29,216,669 bytes, 185 files) |

`backup-all.ps1` result: **code PASS / db PASS / minio PASS / evidence PASS**.

Live database at freeze: 54 tables, 12 applied migrations.

### Order note

The master plan places the C-end UI work at PHASE 6 and states it must not be done
mid-migration. The immediately preceding round delivered the ANTI-AI UI CONTRACT work
(global styles + 20 views + shared components), which is committed and pushed as
`ebeb1df`…`ecaeda0` **before** this run started. Those changes are presentation-only and
do not touch the persistence layer, so they are kept rather than reverted; the remaining
UI batches (TonightHome, SafetySupport, the content/list pages, and 8 shared components)
are deferred to PHASE 6 as the plan requires.

Nothing in PHASE 0 overwrote the Batch 1 benchmark evidence
(`artifacts/persistence-benchmark-*-results.json`).

## PHASE 1 — Persistence Batch 2 (Peer system)

**Design:** `docs/architecture/BATCH2_PEER_DESIGN.md` — `architecture-reviewer`, then a rebuttal review that **upheld both orchestrator overrides** (with corrections) and listed seven blocking items, all folded into §0.4.

The design surfaced a real product defect: **the conversation could be activated by one party.** The owner alone accepted and consented; the requester was rejected at the consent endpoint. The master plan's Batch 2 invariant requires *"只有双方 Consent：conversation 才能 active"*. The product's own copy supports that intent — `/pages/peer/consent` is role-neutral and `/pages/peer/wait` tells the requester that **both** must confirm — but no working requester consent path existed. Fixed in this batch via a **new** migration.

**Implementation:** five commits.

| Commit | Scope |
| --- | --- |
| `d51340a` | `PeerMatch.requesterConsentAt` + `ownerConsentAt`, and the grandfathering rule (legacy `active` conversations keep the owner fact; **`requesterConsentAt` stays NULL** — a legacy row is not represented as having consented) |
| `eeee418` | five registry entries + the triple exits (no hydration, no upsert, no sweep) |
| `68bc398` | `peer-persistence.service.ts`: owner-scoped direct writes, per-operation scopes, lock order `User` → `LifeJourney` → `PeerMatch`/`PeerConversation` with sorted `User.id` across two-party transactions, commit-then-notify, DB-clock expiry under the conversation lock, report as a single insert with derived reads |
| `b863406` | requester consent path + an honest pending state (the waiting screen previously marked the boundary step done at `connected`, before any consent) |
| `42e9f70` | `batch2-peer-verification.spec.ts` — bilateral flows, the seven races, two instances, omitted-field FK, SQL scope |

**Verification (independently reproduced by the orchestrator):**

| Check | Result |
| --- | --- |
| `batch2-peer-verification.spec.ts` | **15 / 15 pass** |
| `peer-support-stage.spec.ts` | 10 pass / 1 skipped (`AI_LIVE_BLOCKED_EXTERNAL`) |
| Full business suite | **7 failed / 23 passed** files, 8 failed / 120 passed tests |
| New failures vs baseline | **none** — the failing set is exactly the recorded baseline |
| `40P01` in the whole suite | **1** — Batch 1's intentional lock-inversion mutation test |
| `pnpm check:baseline-diff` | SUCCESS |
| `pnpm check:migrations` | 12 baseline migrations still immutable |
| New migration | a **new** directory; `git diff` shows no change to any applied migration |
| `pnpm typecheck` / `pnpm lint` | 0 errors |

**Mutation-tested guards:** making first consent activate the conversation fails 6 cases; removing the report de-duplication check fails the concurrent-report case (2 rows instead of 1).

**Gate position.** `PEER_FULL_FLUSH=false`, `PEER_DUAL_WRITER=false`, `PEER_STATE_MACHINE_PASS=true`, `PEER_CONCURRENCY_PASS=true`, `PEER_MULTI_INSTANCE_SAFE=true` (the five models and the tested paths only), `PEER_SECURITY_PASS=true`, `PEER_PII_PASS=true` — asserted from the tests above, which the orchestrator reproduced. An independent code review of this diff is **outstanding**: the `code-reviewer` model was quota-exhausted throughout this phase.

**Closing HEAD:** `42e9f70`, pushed. Backup: `backup-all-20261007-0712.json` — code / db / minio / evidence all PASS.

## PHASE 2 — Persistence Batch 3 (Self system)

_(pending)_

## PHASE 3 — Persistence Batch 4 (Legacy & Store retirement)

_(pending)_

## PHASE 4 — Test isolation

_(pending)_

## PHASE 5 — GitHub Actions CI

_(pending)_

## PHASE 6 — C-end UI de-AI

_(partially delivered before this run; see the order note above)_

## PHASE 7 — Android full verification

_(pending)_

## PHASE 8 — Admin

_(pending)_

## PHASE 9 — Security / Privacy

_(pending)_

## PHASE 10 — DAPI live

_(pending)_
