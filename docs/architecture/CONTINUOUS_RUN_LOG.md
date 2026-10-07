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

**Gate position — CORRECTED, PHASE 1 IS REOPENED.** The paragraph originally here claimed the
`PEER_*` predicates were established by the tests above. **That claim was withdrawn.** An
independent conformance review of the diff returned **`REQUEST_CHANGES`** with three P0 and three
P1 defects, and it established that the new tests **do not prove what they claim** — the
concurrency barriers rendezvous the HTTP requests before they start rather than the transactions at
their read/lock points, two race cases never assert *exactly one* transition, and the omitted-field
foreign-key test actually exercises the empty-set case. A green run was therefore not evidence.

Full findings: `docs/architecture/BATCH2_PEER_REVIEW.md`. In summary:

- **P0** — `updateMatchRequest` / `respondMatch` / `blockMatchDirect` read status then update
  unconditionally by id, so `connected` and `declined` can race and overwrite `blocked`; the
  suggestion refresh can rewrite a match already in the request flow.
- **P0** — `closeConversation` / `saveConversationFeedback` pre-check then update by id; the assist
  path checks expiry with the **application** clock, not the database's.
- **P0** — the lock order is not followed on two-party paths, and peer writes touching a Journey FK
  do not use `User → LifeJourney → peer child`. No `40P01` was seen, so this is an **unproved** lock
  order rather than a reproduced deadlock — but this project has already produced `40P01` twice.
- **P1** — the expire-on-send branch sets `closedReason='expired'` and then throws, rolling back its
  own closure; the batch expiry uses `new Date()`.
- **P1** — the AI draft output PII gap the design flagged is still open.
- **P1** — the tests do not discriminate (four specific construction faults).

Confirmed correct and not to be disturbed: the migration (new directory, honest grandfathering), the
consent main path, the report narrowing, the triple exits, the feedback-derived redaction fix,
commit-before-notify, and AI-assist-not-writing-a-message.

`PEER_STATE_MACHINE_PASS`, `PEER_CONCURRENCY_PASS`, `PEER_MULTI_INSTANCE_SAFE`, `PEER_SECURITY_PASS`
and `PEER_PII_PASS` are **not** established. `PERSISTENCE_BATCH2_STABLE` is **not** claimed.

**State at this checkpoint:** `42e9f70` pushed (the implementation), `b4f87c3` pushed (the Batch 3
design). Backup: `backup-all-20261007-0712.json` — code / db / minio / evidence all PASS. The fix
for the six defects above is **not started**: the `code-implementer` model returned
`RESOURCE_EXHAUSTED` ("resets in 73h"), and the alternative agent types either route to an
unavailable provider or were cancelled. This is an external model-availability blocker, not a
technical one.

## Note — the visual baseline now encodes the aesthetic the UI contract removes

`design_refs/` holds 26 tracked reference PNGs, and `docs/claude-page-by-page-visual-checklist.md`
is generated by `visual:compare-front` by diffing the current pages against them. The ANTI-AI UI
CONTRACT work moved the pages **away** from those references on purpose, so the regenerated
checklist shows **higher** diff rates (e.g. `01-square` 12.95% → 18.91%). The checklist is a
faithful measurement of the wrong target. PHASE 6 must either regenerate `design_refs/` from the
post-contract UI or retire the comparison; until then its pass/fail signal should not be read as a
quality gate.

## PHASE 2 — Persistence Batch 3 (Self system)

**Design: done, not yet reviewed or implemented.** `docs/architecture/BATCH3_SELF_SYSTEM_DESIGN.md`
(`b4f87c3`), with four escalations resolved by orchestrator decision in its §0.4:

- **Scope** — the reviewer derived the real list from the schema (there is no `Archive`, `Recovery`
  or generic `Self` table): `DecisionRecord`, `CooldownItem`, `RealityHandoff`, `TrustedContact`,
  `MessageToFutureSelf`, `PersonalSupportPlan`, `StableSelfProfile`, `MemoryItem`,
  `RecoverySnapshot` + `PrivacySetting`. `FollowUpJob` stays **outside** the registry (it is shared
  with action follow-ups and decision cooldowns); `AgentDecisionLog` is excluded despite its name.
- **Memory** — the plan's prohibition is **violated today**: a date extension sets any status other
  than `disabled` back to `active`, so it **silently reactivates an explicitly expired row**, and
  `deleteMemory` writes `status='expired'` so the required `deleted` state has no representation.
  Decided: `expired` is terminal until a newly consented explicit reactivation; deletion is terminal
  and represented as `deleted` + `deletedAt`; the four AI-eligibility predicates move into one
  owner-scoped database query.
- **Decision** — `outcome` is a text field, not a reachable status. Decided: implement the reviewed
  `decided → outcome → archived` transition, which matches the UI's existing "保存结果并归档" step —
  the same shape as Batch 2's missing consent half.
- **Admin disclosure** — the admin support-plan and memory lists currently return full plan JSON and
  memory content. Decided: metadata in list/search; full content only via an audited single-record
  read.
- **FutureSelf notification policy** — notifications off means delivered silently and retained.

**A new failure mode this batch must handle, which Batches 1 and 2 did not face:** `PrivacySetting`
has no absence sweep, but its per-user upsert is `state.privacySettings?.[id] ?? {}`
(`mapper:1034–1070`) — so **an omitted privacy entry is a destructive write**. A stale snapshot
missing `allowAiMemoryUse` writes `false` on the next flush.

Implementation is blocked behind the reopened PHASE 1 fixes and the model-availability blocker noted
above.

## PHASE 3 — Persistence Batch 4 (Legacy & Store retirement)

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
