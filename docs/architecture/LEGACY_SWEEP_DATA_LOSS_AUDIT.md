# Legacy sweep data-loss audit

**Status:** P0 fixed centrally (`486d01a`); this document records the exposure, the models still
carrying an active sweep, and what remains.

## 1. What happened

The legacy flush ended with an absence sweep per model:

```ts
async function deleteAbsent(model: any, ids: string[]) {
  await model.deleteMany(ids.length ? { where: { id: { notIn: ids } } } : {});
}
```

Two separate faults in one line:

1. **Absence was treated as a deletion instruction.** "This row is not in my in-memory snapshot" and
   "the user wants this row gone" are different statements. A row written directly to PostgreSQL — by
   a test, a script, another process, or another API instance — is absent from this process's
   snapshot and was therefore deleted.
2. **An empty snapshot collapsed to `deleteMany({})`.** With `ids.length === 0` the `where` clause
   vanished and the sweep deleted **every row in the table**.

Reproduced against the development database, not inferred (`scripts/p0-legacy-sweep-repro.ts`,
evidence in `artifacts/persistence/p0-legacy-sweep/`):

```
before: {"moodCount":13,"moodExists":true}
after:  {"moodCount":0,"moodExists":false}
verdict: DATA LOSS CONFIRMED
```

CI surfaced the same defect independently as `batch1-journey` test 7, where a Mood that must survive
archive deletion (`onDelete: SetNull`) was gone.

## 2. The fix, and why it is central rather than per-model

`deleteAbsent` now requires **evidence of ownership**:

```ts
const flushedIdsByModel = new Map<string, Set<string>>();

async function deleteAbsent(modelKey: string, model: any, ids: string[]) {
  const current = new Set(ids);
  const previouslyOwned = flushedIdsByModel.get(modelKey);
  if (previouslyOwned) {
    const removable = [...previouslyOwned].filter((id) => !current.has(id));
    if (removable.length > 0) await model.deleteMany({ where: { id: { in: removable } } });
  }
  flushedIdsByModel.set(modelKey, current);
}
```

The sweep may only delete ids **this process previously wrote through the flush and no longer
carries**. Consequences:

- A row the store never wrote is never deleted, whatever the snapshot says — this closes the fault for
  all 38 swept models at once, not only the one CI happened to catch.
- Legitimate deletions still work: the row a user removes was written by an earlier flush and is
  therefore owned.
- After a restart the set is empty, so the first flush deletes nothing. That is the safe direction,
  and any real deletion lands on the following flush.

Verified in both directions: a directly written row survives, and a store-owned row removed from the
snapshot is still deleted (`tests/business/legacy-sweep-ownership.spec.ts`, 4/4). Mutation **M50**
restores the old sweep and those tests fail, so they discriminate.

## 3. Model matrix

`LEGACY_SWEEP_ACTIVE = yes` means the model is swept **and** is not in `DIRECT_DB_MODELS`, so the
`if (!DIRECT_DB_MODELS.X)` guard does not protect it. 38 models are swept; **16 carry an active
sweep**.

Direct-writer counts are `prisma.<delegate>.<write>` / `tx.<delegate>.<write>` sites **outside the
mapper**, measured by grep — they show where a row can enter the database without the store knowing.

### 3.1 Active sweep (16 models — the risk set before the fix)

| MODEL | SOURCE OF TRUTH | WRITERS | LEGACY SWEEP ACTIVE | DIRECT WRITE COEXISTS | DATA-LOSS RISK | REMEDIATION |
| --- | --- | --- | --- | --- | --- | --- |
| `Mood` | legacy store | store + 5 direct sites | yes | yes | was P0 (reproduced: 13 → 0) | ownership rule `486d01a`; convert in Batch 4 |
| `Post` | legacy store | store + 4 direct sites | yes | yes | high | ownership rule; convert in Batch 4 |
| `Diary` | legacy store | store + 2 direct sites | yes | yes | high | ownership rule; convert in Batch 4 |
| `AgentDecisionLog` | legacy store | store + 2 direct sites | yes | yes | high | ownership rule; convert in Batch 4 |
| `Letter` | legacy store | store only | yes | possible (tests, scripts, other instances) | high | ownership rule; convert in Batch 4 |
| `Favorite` | legacy store | store only | yes | possible | high | ownership rule; convert in Batch 4 |
| `Reply` | legacy store | store only | yes | possible | high | ownership rule; convert in Batch 4 |
| `MediaAsset` | legacy store | store only | yes | possible | medium (uploads write here) | ownership rule; convert in Batch 4 |
| `FeedbackTicket` | legacy store | store only | yes | possible | medium | ownership rule; convert in Batch 4 |
| `FeedbackCategory` | legacy store | store only | yes | possible | medium | ownership rule; convert in Batch 4 |
| `FaqItem` | legacy store | store only | yes | possible | medium | ownership rule; convert in Batch 4 |
| `ReplyPreset` | legacy store | store only | yes | possible | medium | ownership rule; convert in Batch 4 |
| `AIProvider` | legacy store | store only | yes | possible | medium (also swept twice, if/else) | ownership rule; convert in Batch 4 |
| `AIStyleRoute` | legacy store | store only | yes | possible | medium | ownership rule; convert in Batch 4 |
| `AdminUserNote` | legacy store | store only | yes | possible | medium (`onDelete: Cascade` from admin) | ownership rule; convert in Batch 4 |
| `PeerReputation` | legacy store | store only | yes | possible | medium | ownership rule; convert in Batch 4 |

FK notes for this set: `Mood`, `Post`, `Diary`, `AgentDecisionLog` reference `LifeJourney` with
`onDelete: SetNull`; `AdminUserNote` cascades from its admin. `SetNull` is why the archive-deletion
contract expects the row to **survive** with a null journey — the sweep was what broke it.

### 3.2 Inactive sweep (22 models — swept but guarded)

These are in `DIRECT_DB_MODELS`, so `if (!DIRECT_DB_MODELS.X)` skips the sweep entirely and
PostgreSQL is the source of truth. No sweep exposure.

`AIJob`, `ActionCommitment`, `CooldownItem`, `DecisionRecord`, `JourneyUpdate`, `LifeJourney`,
`MemoryItem`, `MessageToFutureSelf`, `OutcomeCheckin`, `PeerConversation`, `PeerExperience`,
`PeerMatch`, `PeerMessage`, `PeerReport`, `PersonalSupportPlan`, `RealityHandoff`, `RecoverySnapshot`,
`SafetyEvent`, `SituationSnapshot`, `StableSelfProfile`, `TrustedContact`, `UserNotification`

### 3.3 Registered but never swept

`PrivacySetting` — direct PostgreSQL authority, unique per user, no sweep at all.

## 4. What this audit does not claim

- **The ownership rule removes the exposure; it does not retire the legacy writer.** The store still
  writes these 16 models through the bulk flush, so the dual-writer condition described in the design
  documents still exists. Batch 4 removes it model by model.
- **A deletion is now delayed by one flush** for a row created and removed between two flushes. That
  is the deliberate safe direction, not an oversight.
- **The in-memory ownership set does not survive a restart or span instances.** This is what makes the
  first flush after a restart delete nothing. It is safe in the direction that matters (no data loss)
  and is the reason no persisted watermark was introduced: a watermark in the store file would have to
  be correct on every instance, and a wrong one deletes data.
- **Direct-writer counts are grep measurements**, not a proof of reachability. A model showing 0 sites
  can still receive rows from tests, scripts, or another instance — which is exactly the case the fix
  covers.
- **M51** (the over-correction mutation) is now proven by direct observation: with the ownership rule
  inverted, test 4 fails with `expected { …(11) } to be null` - the store-owned row was not deleted.
  The earlier "inconclusive" reading was the mutation harness running while the local database was
  down, not a real result.
- **The mutation harness cannot always parse a run.** With M50 it reported `PROVEN` on one attempt and
  `INCONCLUSIVE :: could not parse the summary` on another, depending on what the child printed. It
  fails safe - `INCONCLUSIVE` is never reported as `PROVEN` - but a harness that cannot distinguish
  "the run did not happen" from "the guard held" is the same class of gap as the PATCH-FAILED
  anchors found earlier, and should be hardened before its verdicts are relied on in bulk.

## 5. Follow-up

| # | Item | Status |
| --- | --- | --- |
| 1 | Ownership rule for every swept model | done `486d01a` |
| 2 | Tests pinning both directions | done, 4/4 |
| 3 | Mutation proving the old sweep is caught | M50 proven |
| 4 | Mutation proving the over-correction is caught | M51 inconclusive — re-run on a stable database |
| 5 | Retire the bulk flush for the 16 active models | Batch 4, not started |
