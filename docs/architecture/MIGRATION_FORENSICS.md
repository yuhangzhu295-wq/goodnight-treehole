# MIGRATION FORENSICS

Phase D of the production architecture stabilisation round: is the migration history self-consistent,
and can the schema be rebuilt from a clone?

Read-only investigation by the architecture-reviewer subagent. Commands and their actual output are
reproduced below rather than summarised, so a reader can challenge the conclusion.

## Verdict

**The migration history on the checked-out branch is self-consistent: yes.** At `18c2103`
(`codex/post-recovery-validation`): all 12 migration directories have a `migration.sql`; all 12
recorded ledger checksums in the development database match those files; `prisma migrate status`
reports up to date; and a database built from zero with this chain has the same schema as the
development database.

**The verdict does not extend to a fresh clone of the default branch — that is a P0.** `origin/HEAD`
points at `origin/main`, which is at `99c84de` (2026-08-20) and contains **4** migration SQL files
against the branch's **12**. A new developer cloning the default branch cannot rebuild the current
schema. Verified directly:

```
git ls-tree -r --name-only origin/main prisma/migrations | grep -c migration.sql   ->  4
git ls-tree -r --name-only HEAD        prisma/migrations | grep -c migration.sql   ->  12
origin/main = 99c84de (2026-08-20, "Merge pull request #1 from …/codex/second-stage-peer-final")
```

This is not a defect in the branch: it is what an unmerged two-month-old feature branch looks like. It
is closed by merging the branch — the RC pull request — and not by any code change. It is recorded here
because the round's own goal statement is "a new machine can rebuild the database from migrations from
zero", and that is currently false of the default branch.

## A. Privacy migration checksum today — no mismatch

```
psql -h 127.0.0.1 -p 15432 -U goodnight -d goodnight_treehole -X -At \
  -c 'SELECT migration_name, checksum FROM "_prisma_migrations" ORDER BY migration_name;'
20260821005000_third_stage_privacy_2|7b67177a53a4138298a22228aa52928ff75a2f9f2ddeeebfc57b55a23b583d71
```

`sha256sum` of the current
`prisma/migrations/20260821005000_third_stage_privacy_2/migration.sql` returns the **same**
`7b67177a…`. All eleven other ledger checksums likewise match their files, and no row is unfinished or
rolled back.

**There is no checksum mismatch on this database today.** No ledger or file repair is warranted. What
is worth keeping is the comparison itself as a recurring integrity check — P1 preventive, not a current
incident.

## B. The pre-edit migration is recoverable, verbatim

| Search | Result |
| --- | --- |
| `git log --all --oneline -- prisma/migrations/20260821005000_third_stage_privacy_2/` | `4cbb809` "fix: harden third-stage self recovery system"; `ff8f526` "feat: complete third-stage self recovery system" |
| `git log -p --follow` on the file | `ff8f526` added it; `4cbb809` changed three defaults `true`→`false` and removed its `UPDATE` |
| `git tag -l` | one tag, `recovery-baseline-20260929`, containing the later edited version |
| Bundles and mirror under `C:\Users\zyu33\Backups\` | the mirror resolves `ff8f526` and returns the pre-edit SQL, sha256 `d15bcb63cf42abf6cd196412dafd1343589f90e8f74fb57758c5fb6b42355420` |
| `git reflog --all` | no distinct pre-edit version beyond the committed object |

Recovered verbatim from `ff8f52697fcc011ea730403b770a524b291c7af7:prisma/migrations/20260821005000_third_stage_privacy_2/migration.sql`:

```sql
ALTER TABLE "PrivacySetting"
ADD COLUMN "allowAiMemoryUse" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowAnonymousExperienceShare" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowJourneyArchiveRetention" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "allowFutureSelfNotifications" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "allowDataExport" BOOLEAN NOT NULL DEFAULT true;

UPDATE "PrivacySetting"
SET
  "allowAiMemoryUse" = "allowLongTermMemory",
  "allowAnonymousExperienceShare" = "allowPeerMatching";
```

So the original committed bytes are **recoverable, not inferred**. What is *not* proven is that these
bytes are what every historical database actually applied — the present ledger was recorded later.
Do **not** overwrite the current migration with this version: that would create a mismatch on the
database checked here. Retain the object as provenance; P2 for historical provenance, P0 only if an
older surviving deployment is found to mismatch.

## C. The orphan action-plan entry, and reproducibility

`git log --all` and `git rev-list --objects --all` find no `20261001000000_action_plan_mode` directory
on any branch, and the ledger count for it is `0`. The prior round deleted that orphan ledger row after
proving with `migrate diff` that the live schema is exactly what the tracked migrations produce, so
this is the expected state.

```
prisma migrate status                     -> 12 migrations found; Database schema is up to date!
diff(migrations -> schema.prisma)         -> -- This is an empty migration.
diff(goodnight_rc_clean -> goodnight_treehole) -> -- This is an empty migration.
```

`goodnight_rc_clean` holds 12 migration rows and 54 public tables and reports up to date. The archived
zero-to-clean run in `artifacts/product-closure/evidence/migration-reproducibility.txt` records an
empty database, `migrate deploy` ending "All migrations have been successfully applied", 12 rows,
54 tables, and empty diffs. The clean-to-development diff above independently confirms those two
schemas still agree.

A fresh database can therefore be built from the tracked chain on this branch and reaches the
development schema. No new deployment was run in this read-only round.

## D. Honest characterisation of the historical edit

The file was genuinely edited after it had been applied (`git log -p --follow` proves it). The ledger
records this migration starting **2026-09-29 05:23:48 UTC** — after the August edit — and its checksum
equals the edited file, because the database was rebuilt during the 2026-09-29 disaster recovery.

So this is the case: **edited after application, but the database was rebuilt afterwards, so the
recorded checksum reflects the edited file and there is no live problem.** It is not a current
mismatch.

The conclusion is scoped and must be read as such. A database that applied the pre-edit file and was
*not* rebuilt could hold a different checksum and possibly different defaults or backfilled values.
Nothing here establishes the state of such a deployment, and a clean `migrate status` on this database
is not a certificate for it. Schema equality is also not equality of historical data transformations.

## E. Forward rule, and the gap that nothing enforces it

**Once a migration has been applied anywhere, never edit or replace its `migration.sql`. Every
subsequent schema or data change goes in a new, ordered migration.**

What exists today: `scripts/verify-third-stage-migrations.ts` discovers migrations from the directory,
rejects a directory without a `migration.sql`, and tests both a fresh and a seeded upgrade path;
`docs/product-closure/MIGRATION_REPRODUCIBILITY.md` documents the edit and the checksum hazard.

What does not exist: **nothing enforces immutability of an applied file.** The harness does not compare
committed migration contents against an applied baseline, and there is no CI. Enforcing this belongs
with the CI work — compare migration hashes against a protected baseline, and keep a from-zero
deployment check in the pipeline. P1.

## F. Other findings

| Finding | Severity | Note |
| --- | --- | --- |
| The default branch cannot reproduce the current schema (4 migrations vs 12) | **P0** | closed by merging the branch; see the verdict above |
| Nothing enforces migration immutability | P1 | belongs with CI |
| Stale historical text still describes `action_plan_mode` as open or missing | P2 | some files under `docs/product-closure/` predate the fix; leaving both unqualified invites a false incident report |
| All 12 file hashes match all 12 ledger hashes; no missing `migration.sql`; no unfinished ledger row | — | no repair needed |
| Migration ordering | monitor | the recorded application sequence follows the ordered names and the archived zero-to-clean deploy succeeded; this shows the tracked order deploys, it is not a general audit of application-level data dependencies |

## Cannot determine

1. The exact checksum and applied bytes held by any **non-rebuilt, older database**. `ff8f526` proves
   the pre-edit committed SQL; no such database's ledger was queried.
2. Whether an application-level smoke test against a newly created database passes **today**. The
   archived clean deployment and smoke evidence support it; this round created no database and ran no
   mutating test.
3. A **current** execution result for `test:third-stage-migrations`. Running it creates and drops
   schemas and writes files, which the read-only restriction forbade. The archived report from
   2026-10-03 records fresh PASS and upgrade PASS at 12 migrations, cleanup PASS — that is archived
   evidence, not a newly observed run.
