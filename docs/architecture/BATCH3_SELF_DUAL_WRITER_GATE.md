# `SELF_DUAL_WRITER=false`

The Batch 3 §4 gate for the ten Self models. A **dual writer** is two code paths that both write one
table, where one does not know about the other. It is the failure mode that produces "saved
successfully" followed by the write being gone, or a delete that silently reverts.

Registry entry: `docs/architecture/BATCH3_SELF_SYSTEM_DESIGN.md` §4.
Script: `pnpm audit:self-dual-writer` (`scripts/self-dual-writer-inventory.mjs`).

---

## 1. What the gate asserts

Three assertions per model, each of which fails when the guard it names is removed.

**1. Registered.** The model has an entry in `DIRECT_DB_MODELS`. Without one the store still holds the
in-memory array the flush hydrates and writes, which is the dual writer itself.

**2. Guarded at load.** The load function carries the registry key, so the snapshot's rows are not
read back into the table at boot or reload. Otherwise an old flush re-inserts a row that a direct
write deleted.

**3. Guarded at the flush's writes.** The assertion anchors on the write statement itself
(`tx.<model>.<verb>`) and requires the guard token to appear shortly above it. Anchoring on the
statement is what makes it falsifiable: neutralising a guard to `if (true)` leaves the write
byte-identical and only moves the token, so the check fails. An earlier version searched for the
snapshot array (`state.memoryItems`) anywhere in the flush and found `MessageToFutureSelf`'s
unrelated read first — a false pass on a real guard and a false failure on the same run.

**4. Guarded at the sweep**, counted by the model's own key
(`deleteAbsent('memoryItem', ...)`). Without it, a row written straight to PostgreSQL is deleted as
absent on the next flush.

### Permitted exception, stated rather than worked around

`PrivacySetting` is written once and never swept: the row is `User`'s child, the flush writes it
alongside the user, and there is no set of rows absent from the snapshot to delete. The exception is
recorded in the script as a claim — `NO_SEPARATE_SWEEP` — and the script *fails* if a sweep for that
model appears, because then the exception is stale and a model is being swept that the inventory says
is not. A lowered threshold would have passed both a correctly folded write and a model missing its
sweep.

---

## 2. The writer inventory

The second half of the gate is the part the flush probe cannot cover: the flush is not involved, so
neither the triggers nor the registry can see it. The script walks `apps/api/src` and records every
direct write to a Self table, then fails on any writer outside the inventory.

| Model | Ordinary writers |
| --- | --- |
| `PrivacySetting` | `SelfPersistenceService` |
| `TrustedContact` | `SelfPersistenceService` |
| `StableSelfProfile` | `SelfPersistenceService` |
| `RealityHandoff` | `SelfPersistenceService`, `Batch1PersistenceService` (archive delete) |
| `PersonalSupportPlan` | `SelfPersistenceService`, `Batch1PersistenceService` (archive detach) |
| `MemoryItem` | `SelfPersistenceService`, `Batch1PersistenceService` (data clearing) |
| `RecoverySnapshot` | `SelfPersistenceService`, `Batch1PersistenceService` |
| `DecisionRecord` | `SelfPersistenceService`, `Batch1PersistenceService` |
| `CooldownItem` | `SelfPersistenceService` |
| `MessageToFutureSelf` | `SelfPersistenceService`, `Batch1PersistenceService`, `FollowUpWorkerService` (claim) |

### Permitted cross-boundary writes, with the reason each is permitted

These are listed in the script and asserted to still touch the table they name, so a stale entry is a
failure rather than a silent pass:

- **`RealityHandoff` from `Batch1PersistenceService`** — the journey archive cleanup deletes a handoff
  that belonged to the journey being deleted. Batch 1 owns that delete; the Self service only reads.
  One writer per operation, and the operation is the archive delete, not a handoff edit.
- **`PersonalSupportPlan` from `Batch1PersistenceService`** — the same archive path detaches a plan from
  the deleted journey. A detach is the FK three-case rule applied by the owner of the journey
  lifecycle, not a plan edit.
- **`MemoryItem` from `Batch1PersistenceService`** — the data-clearing path only. The Self service owns
  every user-facing memory operation.
- **`MessageToFutureSelf` from `FollowUpWorkerService`** — the claim writes `deliveredAt` inside its own
  transaction. The Self service creates the letter and the durable job; the worker is the only one
  that marks a delivery.
- **`PrivacySetting` from `FollowUpWorkerService`** — **read-only.** The claim reads the consent flag
  from the database inside the claim transaction (design §0.5/A6). Listed here because the file
  otherwise looks like a writer of the row.

---

## 3. The SQL trace

`SELF_FULL_FLUSH` establishes this with statement-level triggers on all ten tables plus probe
self-tests (`tests/business/batch3-self-full-flush.spec.ts`, 4/4) — a trigger that cannot see a
zero-row statement fails the run instead of reporting an empty probe as success. That trace is the
evidence for "the flush writes nothing to these tables", and this gate does not repeat it.

What that trace cannot show is a write the flush is not part of. The inventory above is the
complement: it reads the source and names every direct writer, so a second writer appearing anywhere
else fails `pnpm audit:self-dual-writer` at the point it is written.

---

## 4. Verification

Self-tested with three mutations, each applied and reverted in turn:

| Mutation | Result |
| --- | --- |
| `if (!DIRECT_DB_MODELS.CooldownItem)` → `if (true)` at the upsert | **caught** |
| the `CooldownItem` sweep block deleted | **caught** |
| a direct `prisma.memoryItem.update` added outside the inventory | **caught** |

```
$ pnpm audit:self-dual-writer
  PrivacySetting: guarded at load, upsert, and the row is User's child: written with the user, never swept separately
  TrustedContact: guarded at load, upsert and sweep
  ... (all ten)
[self-dual-writer] SELF_DUAL_WRITER=false holds: guarded hydrate + upsert + sweep, and no unnamed writer
```

`pnpm typecheck` is clean.

---

## 5. Limitations, stated so the claim is not read wider than it is

- This is a **selected-flow** claim about the ten Self models, not application-wide dual-writer
  safety. The Batch 1, 2 and 4 models have their own gates.
- The inventory reads the source, so it proves what the code says. It does not prove what a running
  instance does; that is what the statement-level probe in `batch3-self-full-flush.spec.ts` is for,
  and the two are complementary rather than redundant.
- "No unnamed writer" means "no unnamed *direct* writer found by this scan". A writer added behind a
  dynamic dispatch, a `$executeRaw` string, or a service loaded by reflection would not be seen. The
  `$executeRaw` path is bounded here because every flush statement goes through the mapper this
  script reads.
