# Persistence Batch 4 — retire the legacy flush, model by model

**Status: NOT STARTED. This document is the plan and the per-model contract; no model has been converted.**

**Related:** `LEGACY_SWEEP_DATA_LOSS_AUDIT.md` (the exposure and the ownership rule that closed it),
`BATCH3_SELF_FULL_FLUSH_GATE.md` (the method a per-model gate copies),
`direct-db-models.ts` (the registry that makes a conversion take effect).

## 1. What Batch 4 is, measured rather than assumed

Converting a model to database authority in this codebase is **not** writing its database paths from
scratch. Measured across the 16 models `LEGACY_SWEEP_DATA_LOSS_AUDIT.md` §3.1 lists:

| Shape | Count | Models |
| --- | --- | --- |
| DB read present (`mapper` `findMany`) **and** legacy upsert **and** sweep | 14 | `Mood`, `Post`, `Diary`, `Letter`, `Favorite`, `Reply`, `MediaAsset`, `FeedbackTicket`, `FeedbackCategory`, `FaqItem`, `ReplyPreset`, `AdminUserNote`, `PeerReputation`, `AgentDecisionLog` |
| no mapper path at all | 2 | `AIProvider`, `AIStyleRoute` |

So for 14 of the 16, Batch 4 is **registration plus three exits plus verification** — the expensive
part (the read, the write, the mapping) is already there and is already exercised by the flush. That
is why the registry exists, and it is why `BATCH3_SELF_FULL_FLUSH_GATE.md` could establish a gate by
registering ten Self tables and asserting the flush then issued **no statement at all** against them.

`AIProvider` and `AIStyleRoute` are the exception and need their mapper paths written first; the audit
notes `AIProvider` is additionally **swept twice** (an `if/else` in the sweep), so converting it also
removes a duplicate sweep.

## 2. The per-model contract

A model is converted when **all six** hold. Anything less is partial and must be recorded as such.

1. **Registered.** `DIRECT_DB_MODELS.<Model> = '<collection>'`. This single line applies three
   pre-wired guards: no boot hydration, no legacy upsert, no absence sweep.
2. **Every reader converted.** The store must not read `this.<collection>` anywhere on a request
   path. Measured, not eyeballed — currently `posts` has 9 in-memory reads, `letters` 8, `moods` 5.
   A reader left behind serves a value frozen at boot until a flush writes it, which is *worse* than
   the legacy behaviour because it never refreshes.
3. **Every writer converted.** Writes go through a database-authoritative path. A model where some
   writes still go to the in-memory array and are persisted by a later flush is **not** converted,
   even if that flush is now the only writer.
4. **A gate test exists.** The statement-level trigger method of `BATCH3_SELF_FULL_FLUSH_GATE.md`,
   scoped to this model: a forced legacy flush issues no INSERT/UPDATE/DELETE against the table. With
   the probe's own self-tests (a zero-row UPDATE and a zero-row DELETE are recorded, so an empty
   result means "no statement" rather than "blind detector").
5. **A reverse proof exists.** The registering guard is removed and the gate test fails. Without it
   the gate is a claim, not a guard — and note the gate document's stated limitation: for a model
   whose other guards are already ineffective, removing the single registration is not observable, so
   the reverse proof must target something the observers can see.
6. **A read-back check exists.** A row written by a **direct** database write (a test, a script,
   another instance) is still returned by the read path after a flush. This is the regression the
   ownership rule was written for and is what proves the sweep is truly gone rather than merely
   delayed.

## 2a. A coupling the order in §4 did not anticipate (found on model 3)

`FeedbackCategory` looked independent - admin-authored, two readers, no user relationship - so it was
scheduled third. It is not independent, and the failure is instructive about how the flush works:

the legacy `FeedbackTicket` upsert carries a `categoryId` FK, and its rows are hydrated **from the
same snapshot** that hydrates the categories. Register `FeedbackCategory` while `FeedbackTicket` still
belongs to the flush and the flush stops writing the category table while continuing to write tickets
that reference it - every stored ticket is then stranded on a row that the snapshot no longer carries.

The symptom is not a routing error but a **foreign-key failure inside a later flush** with a
backtrace that names the ticket table, which is where the temptation is to conclude the ticket mapping
is at fault. It is not; the missing row is the category.

**Consequence for the order:** the console's category routes already read and write the table
(`feedback-persistence.service.ts`, and the admin tally is a database `groupBy` rather than the legacy
array filter that made this impossible before). What is deferred is the *registration*.
`FeedbackCategory` and `FeedbackTicket` convert **together**, as one unit, with the category's
registration landing in the same change as the ticket's.

Two further models pair with their referrers:

| Model | Pair with | Because |
| --- | --- | --- |
| `FeedbackCategory` | `FeedbackTicket` | the ticket's `categoryId` FK and shared hydration |
| `MediaAsset` | its publishers | `Mood.attachmentIds` and `FeedbackTicket.screenshots` store ids, not FKs — but the upload path owns the row, so an uploaded asset written after a flush would be swept |

The 14 conversions are independent and cheap individually. Doing them in one change would mean a
single regression — a reader left behind, a flush that still upserts — would have 14 candidate causes
and no way to attribute it. The rule is therefore **one model per commit**, each with its own gate and
reverse proof, and each verified by a suite run, not by reasoning.

## 3. Why one at a time

Each conversion is independent in cost but not in risk. A single change that converts several models
turns one failure into an attribution problem: a leftover reader, a flush that still upserts, or an FK
that loses its referent all look the same in a red suite. One model per commit, verified on its own,
keeps the cause inside the change that introduced it.

The §2a coupling is the exception that refines the rule rather than breaking it: a model whose
referrer still belongs to the flush is not an independent unit, so the pair converts together — which
is still one *commit*, just not one *model*.

## 4. Order, and why this order

Most independent first, most entangled last, so a failure is attributable:

1. `FaqItem` — no user relationship, two readers, admin-authored. Lowest blast radius.
2. `ReplyPreset` — same shape.
3. `FeedbackCategory` — converted to DB read/write, **registration deferred** (§2a: its pair `FeedbackTicket` still belongs to the flush).
4. `MediaAsset` — referenced by `Mood.attachmentIds` and `FeedbackTicket.screenshots`; the FK work
   starts here, but only inward (upload/read), not from the parents.
5. `FeedbackTicket` — depends on 4.
6. `AdminUserNote` — cascades from an admin; worth doing before the user-facing models.
7. `PeerReputation` — single-owner counters.
8. `AgentDecisionLog` — written by AI flows; needs the AI paths checked.
9. `Favorite` — read from `PostDetail` and lists.
10. `Reply` — read with its post.
11. `Letter` — read by several views and the home dashboard.
12. `Diary` — derived from `Mood`; converting `Mood` first is required.
13. `Post` — derived from `Mood`; the square and moderation read it.
14. `Mood` — last of the 14: both `Post` and `Diary` derive from it, so it converts cleanly only once
    its readers are database-authoritative.
15. `AIProvider` — needs its mapper path written, and carries the duplicate sweep.
16. `AIStyleRoute` — needs its mapper path written.

## 5. What Batch 4 does not claim

- **It does not make the application multi-instance safe.** The 14 conversions remove the legacy
  dual writer for those models; other concerns (`store` arrays that are still authoritative for
  un-converted models, caches, and the reload/flush interplay) are unchanged. The design's own wording
  is that Batch 4 "removes the dual writer", not that it finishes persistence.
- **It does not change any schema.** No migration is required for a registration; the tables and
  columns already exist. Any schema change would be a new migration, and **applied migrations are
  immutable**.
- **It must not be run against production data to "see what happens".** Conversions are verified on
  the leased test database, and the read-back check in §2.6 is what stands in for that.

## 5a. How to build a reverse proof that actually discriminates

Model 5 (`AdminUserNote`) produced the first gate whose obvious reverse proof did **not** work, and the
reason generalises to every model that is written directly and only read afterwards.

Removing the registration (M-N) left the first two cases green. That is not a hole in the product - it
is the **ownership rule** from the P0 fix doing its job: `deleteAbsent` may only remove ids this process
previously wrote through the flush, so a row written straight to the table is never swept. And a fresh
test database has an **empty snapshot** at boot, so the flush's upsert loop has nothing to iterate. Both
halves of the registration are therefore inert until the snapshot is non-empty.

The discriminating case is therefore: **boot a second app so it hydrates the row, then flush that
instance.** With the model registered the flush issues no statement against the table; unregistered it
writes the row it just hydrated (`['AdminUserNote:INSERTx4', ...]`). The probe is what makes the
difference visible, which is why a statement-level probe and not a row check is the right instrument.

Two consequences for the remaining models:

- A model whose reverse proof passes on the first try deserves the same suspicion as a test that
  cannot fail. For an append-only or directly-written model, check whether the ownership rule is what
  is passing it.
- The "boot a second instance and flush" shape is the general form. `createApiTestApp()` already
  hydrates from the database, so the second app is cheap; the gate file's boot case is reusable.

## 5b. Finding on model 6: `PeerReputation` is declared but never written

Converting `PeerReputation` is mechanical, and doing it silently would have been the wrong call,
because the model turns out to be **inert**: nothing in the product ever creates or updates one.

Measured across the repository, not inferred:

| Check | Result |
| --- | --- |
| any `peerReputations.push` / `.unshift` / indexed write | none |
| any setter for the array (a getter exists at `store.service.ts:1774`) | none |
| any assignment to `helpfulCount` / `reportCount` / `restrictedUntil` | none — the single hit is `experience.reportCount`, a `PeerExperience` field |
| any `.create` / `.upsert` / `.update` on the Prisma delegate outside the mapper | none; the mapper's flush upsert is the only writer, and it only writes what hydration put in the snapshot |
| rows in the development database | 0 |

Two consequences, both of which read as working features today:

1. **The peer-matching trust term is a constant.** `store.service.ts:4796` looks up the candidate's
   reputation row and, finding none, falls back to `0.5`; that value is weighted `* 0.1` into the
   match score. Because no row ever exists, the term is identical for every candidate - it is 10% of
   the score that cannot distinguish anything.
2. **`restrictedUntil` is dead.** It is written by the mapper's serialization and declared in the
   store's type, and **no business logic reads it**. A restriction, if one were ever set, would have no
   effect.

This is not recorded anywhere else. `BATCH2_PEER_DESIGN.md:188` treats the model as a live scoring
input whose only defect is process-local staleness, and `:224` treats its in-memory read as a legacy
dependency to be tolerated - both assume something writes it.

**What this change does and does not do.** It registers the model, which removes the sweep and is
otherwise a no-op given the table is empty. It does **not** implement the capability, change the
matching weight, or drop the column: whether peer reputation should exist, and what should feed it, is
a product decision, and the design documents record such questions rather than deciding them. The
finding is recorded here so the next reader does not convert this model believing it works.

## 5c. A statement-level probe cannot tell you that data was lost

While building the reverse proof for `PeerReputation`, the mutation run reported:

```
expected [ 'PeerReputation:DELETEx1', 'PeerReputation:INSERTx4', 'PeerReputation:UPDATEx4' ]
```

The first reading of `DELETEx1` was "the sweep deleted a row", which would be the P0 data-loss shape
and would matter for the **11 models that still carry an active sweep**. That reading was wrong, and
the way it was caught is the point of this section.

The probe is **statement-level on purpose** - it fires for a zero-row `DELETE`, which is exactly the
signature of the old `deleteMany({})` defect that a row-level trigger cannot see. The same property
means it **cannot distinguish a one-row DELETE from a zero-row one**. So the probe can prove "the
flush issued a statement"; it can never prove "a row was lost".

The row check is what distinguishes, and it belongs **first**: the case now asserts the directly
written row still exists *before* it asserts the probe is empty. With that order the mutation run
fails on the probe assertion while the survival assertion **passes** - and re-running the same
mutation produced a different composition (`['PeerReputation:INSERTx4', ...]`, no DELETE at all),
which says the statement set depends on flush interleaving.

So the reverse proof for this model rests on "the flush wrote to the table when the model was
unregistered and did not when it was registered". It does **not** claim, and has no evidence for,
that an unregistered model loses rows here. Two general rules fall out:

- When a statement-level probe is the instrument, pair it with a row-level assertion and put the row
  assertion first, so a failure says which of the two actually broke.
- A single mutation run is not a stable observation when the number of statements varies between
  runs. Re-run before drawing a conclusion from a statement count.

## 5d. The remaining nine models are one cluster, not nine conversions

The first seven models could be converted one per commit because each was independent of the others.
Re-measuring the remaining nine on `61dd20e` says that is no longer true, and the reason is **Post**:

| Model | Coupling that blocks a solo conversion |
| --- | --- |
| `Favorite` | `addFavorite` increments `post.favoriteCount`; `applyFavoriteRemoval` decrements it. It also sets `letter.favorite`. |
| `Reply` | `post.replyCount` is recomputed from `this.replies` on publish and on moderation (`store.service.ts:8225,8253`). |
| `Post` | Holds both counters above, so it is the hub rather than a leaf. |
| `Diary` | Derived from `Mood` (`moodId`), and `Letter` is referenced by it. |
| `Mood` | Upstream of `Post` and `Diary`; both derive from it. |
| `Letter` | `sourceMoodId` FK into `Mood`; read by several views and the home dashboard. |
| `MediaAsset` | Referenced by `Mood.attachmentIds`, `FeedbackTicket.screenshots` and `decoratePost`'s `mediaByIds`. |
| `AIProvider` | Pairs with `AIStyleRoute` (three FKs), and `enforceRemoteAiProviderPolicy` bulk-rewrites **both** tables - it is also called from `reloadRuntimeState`, so it re-runs on every worker-triggered reload. |
| `AIStyleRoute` | Same pair; three FKs to `AIProvider`. |

Two consequences, and they change the plan rather than merely annotating it:

1. **"One model per commit" cannot be applied to these nine.** Registering `Favorite` alone empties the
   array `post.favoriteCount` is maintained from, so the counter stops moving; registering `Post` alone
   would strand the two models that write into it. The cluster has to move as a unit, or `Post` has to
   move first and absorb the counter maintenance into database statements.
2. **`decoratePost` is the read-side of the same knot.** It reads `this.favorites` (for
   `favoritedByCurrentUser`) and `this.assets` (via `mediaByIds`, for attachments) from two call sites
   that are **inside loops** - the public feed at `store.service.ts:6610` and the admin list at
   `controllers.ts:3062`. Converting either model without this makes the field silently constant:
   every post would report "not favourited" and "no attachments", with no error anywhere.

So the next Batch 4 step is not "convert `Favorite`". It is a design step: decide the cluster's unit,
and give `decoratePost` a per-request pre-fetch (one query for the viewer's favourites, one for the
page's assets) instead of a per-row lookup. That is recorded as `B4-DECORATE-READ-PATH` and
`B4-FAVORITE-COUNTER-COUPLING` in `docs/automation/MASTER_TASK_QUEUE.json`.

## 6. Position at the last update

| Model | Status | Evidence |
| --- | --- | --- |
| `FaqItem` | **DONE** | `37b909a`, gate `batch4-faq-item-gate.spec.ts`, mutation M-K |
| `ReplyPreset` | **DONE** | `3f2409d`, same gate widened, mutation M-L |
| `FeedbackCategory` | **DONE** | `bd4b726`, registered jointly with its pair, mutation M-M |
| `FeedbackTicket` | **DONE** | `bd4b726`, write path in `feedback-persistence.service.ts` |
| `AdminUserNote` | **DONE** | `admin-notes-persistence.service.ts`, gate case plus a boot-and-flush discriminator, mutation M-N |
| `PeerReputation` | **DONE** | registered; **inert model** (§5b: no writer anywhere), gate case with a boot-and-flush discriminator, mutation M-O |
| `AgentDecisionLog` | **DONE** | writer + both readers in `Batch1PersistenceService`; the archive path deletes and the export path detaches, and that difference is preserved deliberately; mutation M-P |
| `Favorite` | **DONE** | `favorite-persistence.service.ts`; gate case covers the table read, the feed flag, the `Post.favoriteCount` projection, the flush, and the write path; mutation M-Q (unregistering it makes a directly written favourite invisible to the feed) |
| `Reply` | **DONE** | `reply-persistence.service.ts`; writers are the human reply route, the three AI-reply completions and the seed coverage (idempotent on `id`); `Post.replyCount` is derived from the table; mutation M-R (unregistering it hides a directly written reply from the public list) |
| `AIProvider` | **DONE** | Registered as a pair with `AIStyleRoute` (three FKs); `ai-routing-persistence.service.ts` owns both tables and the DAPI policy writes through it. Gate case plus mutation M-T |
| `AIStyleRoute` | **DONE** | Same pair; `resolveAiRouteRecord` is the read seam `runAiJob` uses. Mutation M-T covers both |
| `Mood` | **DONE** | `mood-persistence.service.ts`; all eleven read sites moved; boot/reload write the snapshot's moods and posts (`Post.moodId` is a Restrict FK). Gate case plus mutation M-U |
| `MediaAsset` | not started | 8 write sites (`this.assets.unshift`) and readers across store + controllers; converts with its publishers |
| the other 3 | not starting | `Diary`, `Letter`, `MediaAsset`

**What converting `Favorite` changed beyond the model.** `buildPostDecorationContext` is async and
reads the viewer's post ids from the table once per request; `getPost`, `moderatePost` and five
controllers became async because they build that context; `Letter.favorite` and
`Post.favoriteCount` are kept as denormalised columns by `FavoritePersistenceService.afterWrite`, and
boot reconciliation recomputes both from the table.

**What converting `Reply` changed beyond the model.** The flush still sweeps `Post` and `Mood`, but
`Reply` is no longer swept, so a post that still has replies would have been deleted and the sweep
would fail on `Reply_postId_fkey`. The post sweep now keeps every post id that appears in the reply
table (read from the whole table, because the post may already be gone from the snapshot), and the
mood sweep keeps every mood still referenced by a surviving post. The reply counter is recomputed
from the table after every write; that also fixed the old `createMood` completion, which overwrote
`replyCount` with the number of completed AI jobs and dropped any human reply published first.

The 78-file suite passes, including the three zero-legacy-write probes that read `store.data`
directly and the multi-instance spec, which now inserts the same seed reply from two instances (the
insert is an upsert on the supplied id for exactly that reason).



The gate file is now shared by four models, with a statement-level probe on each table and a
self-test per table. Adding a model means adding its name to `TARGET_TABLES`, its two self-test
statements, and its read-back case — not writing a new file.
