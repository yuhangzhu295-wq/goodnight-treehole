# MIGRATION REPRODUCIBILITY

`MIGRATIONS_REPRODUCIBLE = true`
`EMPTY_DATABASE_MIGRATION_PASS = true`

The RC round was told this was the first priority, and that the project must not be left in the
state this disaster recovery started from: a database that runs and a source tree that cannot be
rebuilt from zero.

## What was actually wrong

The recorded finding was that `20261001000000_action_plan_mode` had been applied to the development
database with no `migration.sql` in the repository, so a new environment could not be rebuilt. That
was measured rather than assumed, and the measurement says something different:

```
diff(tracked migrations -> live database)  = empty
diff(tracked migrations -> schema.prisma)  = 2 statements
diff(schema.prisma      -> live database)  = 2 statements
```

The live database is exactly what the tracked migrations produce. The missing file is therefore not
needed to reproduce the schema: the DDL it applied is already in the tracked set —
`20260816000000_goodnight_2_incremental` creates the action-plan columns `parentActionId`,
`adaptationReason` and `attemptNumber` (migration.sql lines 38-40). The local migration re-applied
DDL that was already tracked.

What was genuinely wrong is that **`schema.prisma` was the stale side of two drifts**, and the
previous round recorded the direction backwards:

| Drift | Created by | Schema said | Verdict |
| --- | --- | --- | --- |
| `DecisionRecord_userId_cooldownUntil_idx` | `20260821003000_third_stage_decision_vault` (migration.sql lines 6-7) | nothing — the declaration had been lost | `SCHEMA_SHOULD_MATCH_DB` |
| `MemoryItem.updatedAt` default | `20260820020000_third_stage_memory_transparency` adds it as `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` | `@updatedAt` with no default | `SCHEMA_SHOULD_MATCH_DB` |

Both were fixed by declaring what the migrations have always created. **No new migration is needed
for either**, because a database built from zero already has both. After the fix, all three diffs
above are empty, which is the property that actually matters: migrations, schema and database agree.

## The orphan history row

`_prisma_migrations` held a row for `20261001000000_action_plan_mode` (applied 2026-10-01 16:05:02,
checksum `1bd4dd30...`, one step, no file). It was deleted so the development database's history
matches what a fresh `migrate deploy` produces — ten rows, all with files.

This discards no schema and no data. The empty `migrations -> live database` diff above is the proof:
whatever that migration did, the tracked set already reproduces it. Both the development database and
a fresh database now record the same ten migrations.

## Proof on an empty database

A brand-new database, created empty, migrated from zero:

```
created goodnight_rc_clean                      0 tables
prisma migrate deploy                           all 10 migrations applied
clean database                                  10 migration rows, 52 tables
diff(clean -> schema)                           empty
diff(schema -> clean)                           empty
prisma generate                                 ok
API started against the clean database
```

Smoke test against that clean database — 8/8:

| Check | Result |
| --- | --- |
| admin login on a virgin database | 201 |
| bootstrap persisted real rows | users=2 adminUsers=1 |
| a real journey write succeeds on the clean schema | 201 |
| the journey reads back through the API | 200 |
| the journey is persisted in the clean DB | found, title correct |
| related rows written (snapshot + update) | snapshots=1 updates=1 |
| the newest migration is usable (`SafetyEvent.status='open'`, `handledAt=null`) | ok |
| clean DB has the full table set | 52 |

## Repeatable proof, not a one-off

`scripts/verify-third-stage-migrations.ts` now **discovers migrations from the directory** instead of
reading a hardcoded list of nine. That hardcoded list is precisely why this was never caught: the
check never looked at the two newest migrations, so a database that ran and a source tree that could
not be rebuilt both passed. It also now refuses to pass if any migration directory lacks a
`migration.sql`.

Its two paths, both on isolated PostgreSQL schemas via `migrate deploy` (no `db push`):

- **fresh** — apply every tracked migration to an empty schema, then assert the count and that the
  privacy defaults are opt-in.
- **upgrade** — apply the first four, seed rows that must survive, apply the rest, then assert the
  seeded rows are all still there and the new columns/defaults are correct.

Result on the full set of 12 migrations (after the report-history and user-note migrations were
added):

```
fresh:   PASS  migrationCount 12, all opt-in privacy defaults false
upgrade: PASS  migrationCount 12, user/journey/peerExperience/peerConversation/notification/aiJob
               all preserved, memory defaults intact
cleanup: PASS  fresh + upgrade
```

## Later migrations added in this round

Both were generated with `prisma migrate diff` against a shadow database and applied with
`migrate deploy`, and each was checked for drift immediately after:

| Migration | Adds | Drift after apply |
| --- | --- | --- |
| `20261004000000_peer_report_history` | `PeerReport` + 4 indexes + 3 FKs | empty |
| `20261004010000_admin_user_note` | `AdminUserNote` + 2 indexes + 2 FKs | empty |

After both, the clean database was rebuilt from zero again: **12 migrations, 54 tables**, and
`diff(clean -> schema)`, `diff(schema -> clean)` and `diff(migrations -> schema)` were all empty.

## Client regeneration

Per the round's Phase D, the generated Prisma client was deleted and regenerated, then the runtime
was exercised:

```
rm -rf .../@prisma+client@5.22.0.../.prisma
prisma generate                          Generated Prisma Client (v5.22.0)
runtime client version                   5.22.0
query                                    peerReports=6 adminUserNotes=3 users=2
pnpm typecheck                           clean
pnpm test:api                            2/2 pass
```

## How to re-verify

```bash
# schema, migrations and the live database must all agree
prisma migrate diff --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url <a disposable database> --script          # expect "empty migration"

# from zero, on a disposable database
createdb goodnight_rc_clean
DATABASE_URL=...goodnight_rc_clean prisma migrate deploy           # expect all migrations applied
DATABASE_URL=...goodnight_rc_clean prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script              # expect "empty migration"

# the committed harness, which covers every migration in the directory
TEST_PG_PORT=15432 pnpm test:third-stage-migrations
```

## Residual note

The development database was rebuilt during the 2026-09-29 recovery, so its recorded checksums match
the current files. `20260821005000_third_stage_privacy_2/migration.sql` was edited after it was first
applied (commit `4cbb809` changed the defaults from true to false and removed a backfill `UPDATE`);
that edit is why the privacy defaults are opt-in, and the harness asserts them. It is recorded here
because editing an applied migration is normally a checksum hazard — it is safe in this case only
because the database was rebuilt afterwards.
