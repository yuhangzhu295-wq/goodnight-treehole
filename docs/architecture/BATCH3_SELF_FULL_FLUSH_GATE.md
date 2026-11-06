# Batch 3 gate — `SELF_FULL_FLUSH=false`

**Status: ESTABLISHED** for the ten Self tables, with one limitation stated in §5.

**Claim.** A legacy flush issues **no statement** against the ten Self tables, so it can neither
overwrite a DB-authoritative row with a stale snapshot nor sweep one away.

The ten tables: `PrivacySetting`, `TrustedContact`, `StableSelfProfile`, `RealityHandoff`,
`PersonalSupportPlan`, `MemoryItem`, `RecoverySnapshot`, `DecisionRecord`, `CooldownItem`,
`MessageToFutureSelf`.

**Harness:** `tests/business/batch3-self-full-flush.spec.ts` (4 tests, all passing).

## 1. Method, and why the probe is statement-level

Each table carries a **statement-level** trigger:

```sql
CREATE TRIGGER self_flush_probe AFTER INSERT OR UPDATE OR DELETE ON "<Table>"
  FOR EACH STATEMENT EXECUTE FUNCTION self_flush_probe_fn();
```

The audit's defect had two shapes: an upsert that overwrites a row with a stale snapshot, and a sweep
that collapsed to `deleteMany({})` and wiped a whole table when the in-memory array was empty. Both
are visible only as **statements** — the zero-row delete changes nothing, so a row-level trigger
records nothing and would report a false pass. A statement-level trigger fires even when the statement
matches zero rows, which is exactly the signature being guarded.

## 2. The probe self-tests before it is trusted

A detector that cannot see the thing it looks for would report an empty probe as success. Two tests
run first:

| Test | Asserts |
| --- | --- |
| the probe sees a statement that changes no rows | `UPDATE "StableSelfProfile" … WHERE false` is recorded |
| the probe sees a zero-row DELETE, the exact shape of the old sweep | `DELETE FROM "MemoryItem" WHERE false` is recorded |

Both pass, so an empty probe result means "no statement", not "blind detector".

## 3. Result

| Test | Result |
| --- | --- |
| a legacy flush writes nothing to any Self table | **pass** — the probe is empty after a real flush, and it names the table and operation when it is not |
| a Self write goes straight to the database and is never swept by a following flush | **pass** — a memory created through the API and a row inserted by an **independent writer** both survive a following flush |

The flush is real in both tests: a legacy-owned `Mood` is created, which gives the flush work to do.

## 4. The mutation that proves the harness discriminates

`MemoryItem` was removed from `DIRECT_DB_MODELS` (a one-line change), restoring all three legacy
behaviours for it. The gate then **fails**, naming the table:

```
expected [ { table: 'MemoryItem', …(2) }, …(1) ] to deeply equal []
```

Source restored afterwards; `git status` shows only the new spec file.

## 5. Limitation — a single guard's removal is not observable, and that is not a gap in the harness

Two narrower mutations were tried first and **both passed**, which is worth recording:

| Mutation | Result |
| --- | --- |
| the sweep guard `if (!DIRECT_DB_MODELS.MemoryItem)` before `deleteAbsent` → `if (true)` | gate still passes |
| the upsert guard before `tx.memoryItem.upsert` → `if (true)` | gate still passes |

The reason is that the three guards are a **chain**, not three independent defences:

1. boot hydration is skipped for a DB-authoritative model, so the store's array stays empty;
2. with an empty array the upsert loop body never runs;
3. with an empty array `deleteAbsent` has nothing it owns to remove, and the ownership rule issues no
   statement at all.

Removing any one link leaves the others holding, so **no statement is issued and the observable
behaviour is unchanged**. That is defence in depth working as intended, and it also means this harness
**cannot** serve as the mutation proof for an individual guard — only for the model's authority as a
whole. The sweep's own guard is proven separately by
`tests/business/legacy-sweep-ownership.spec.ts` (4/4) and mutation **M50**, which restores the old
sweep and fails those tests.

Stated plainly: this gate establishes the *observable* property (no statement touches the ten tables
during a flush). It does not, and cannot, attribute that property to one particular guard.

## 6. What this gate does not claim

- It is not `SELF_DUAL_WRITER=false`. The legacy writer still exists for these models; the gate shows
  it does not touch them. Retiring it is Batch 4.
- It covers the flush path, not every writer in the process. A direct write elsewhere would be
  legitimate and is not what the gate forbids.
- It says nothing about reads. The DB-only read requirement is a separate gate.
