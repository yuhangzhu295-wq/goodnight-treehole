# TEST ISOLATION DESIGN

How to replace the current test-database provisioning with isolated databases built from migrations.
Read-only design by the architecture-reviewer subagent. No file was modified and nothing was executed
that creates a database.

## 1. What is wrong today

| Current | Problem | Severity |
| --- | --- | --- |
| `resetTestDatabase()` drops and recreates a **schema** inside the shared `goodnight_treehole` database, then builds it with `prisma db push --skip-generate` (`scripts/test-database.ts:23-32`) | Business specs therefore never exercise the migration chain — they only prove that the current Prisma models can be pushed. `db push` is also the mechanism the round forbids for schema verification. The name starts with `test_`, but the isolation unit is a schema. | P0 |
| `tests/business/helpers.ts:7-17` does this at **import time** | **21 of 23** business specs import it, so all are affected by any change to provisioning. Provisioning happens during module load, with no run-level ownership, no failure cleanup and no keep-on-failure protocol. The name contains pid and pool id but that is not a `runId`; a worker reloading a file can reset the same schema again. | P0 |
| `scripts/verify-third-stage-migrations.ts:189-249` already uses `migrate deploy`, but creates two schemas inside the shared database and says so in its report (`:199`) | The command is right, the isolation boundary is not. | P0 |
| `prisma/seed.ts:1-2` only prints a note | `db:seed` cannot be treated as a database seed that inserts the test users. | P0 |

There are **12** migration directories with a `migration.sql`, and the verification script discovers them
from the directory rather than a list (`verify-third-stage-migrations.ts:17-34, 210-215`).

## 2. Provisioning design

Replace the schema-reset interface in `scripts/test-database.ts` with a **database lease**, owned by a
new `scripts/test-runner.ts` under `try/finally`, not by specs or import side effects.

1. **Naming.** The runner generates an unpredictable runId (lowercase letters, digits, underscore). Test
   database `goodnight_treehole_test_<runId>`, migration database `goodnight_treehole_migration_<runId>`.
   Validate prefix, character set and PostgreSQL's 63-byte limit, and refuse any name matching the
   development database. Concurrent runs get distinct runIds; **never `DROP` a fixed name at start**.
2. **Create through a maintenance connection.** Parse host, port and credentials from the configured
   `DATABASE_URL`, but never connect to the development database to create or drop anything. Connect to
   the maintenance database `postgres` (configurable) and issue `CREATE DATABASE` there. `CREATE`/`DROP
   DATABASE` cannot run inside a transaction. Build the lease URL with `schema=public`.
   `scripts/persistence-benchmark.ts:75-109` already demonstrates connecting to `postgres`, creating an
   isolated database and running deploy — but its fixed name and start-of-run `DROP` must not be copied.
3. **Migrate.** Run `prisma migrate deploy --schema prisma/schema.prisma` against the lease URL from the
   repository root, then verify that the number of successfully applied rows in `_prisma_migrations`
   matches the number of migration directories.
4. **Seed minimally, then run.** Apply the minimal seed (section 3), start the services this run needs,
   run the suite. Afterwards stop the services, disconnect Prisma, then `DROP DATABASE` from the
   maintenance connection. If connections are still open, terminate connections **to that lease database
   only** and retry — never touch the development database. Clean up by default; keep a failed run's
   database only with an explicit `--keep-db-on-failure`, printing its name and a reproduction command.
   A failure during create, migrate or seed must enter the same cleanup path.
5. **`helpers.ts` stops provisioning.** It should only read and validate the `DATABASE_URL` the runner
   provided — no creating, no rewriting, no deletion at import. The spec's Prisma client and the API child
   process inherit that URL. It must be set **before** importing
   `apps/api/src/prisma-runtime.service.ts`, which captures the URL at module load (`:8`). The direct
   reset calls in `tests/api/api.spec.ts`, `tests/cross/cross.spec.ts` and `tests/e2e/app.e2e.spec.ts`
   are removed the same way.

**Permission check.** A read-only query on this machine's server returned
`goodnight|rolcreatedb=t|rolsuper=t`, so this role can create databases **on this WSL2 Docker server**.
That must not be generalised to CI or any other instance. Before deploying, check the target:

```
psql -h <host> -p <port> -U goodnight -d postgres -Atc \
  "SELECT current_user, rolcreatedb, rolsuper FROM pg_roles WHERE rolname = current_user"
```

Without `CREATEDB`, the options are to grant it to a dedicated provisioning role, or have CI/container
orchestration create and drop the databases as an administrator. Falling back to a shared schema or
`db push` is not an option. Note also that on this machine `docker-compose.recovery.yml:3-13, 26-34`
documents ports 5432/6379 as occupied by unusable native Windows services, with the project's containers
mapped to **15432/16379** — the runner must not silently use the default ports.

The migration verification script keeps its semantics (first four migrations → insert the old-version
fixture → remaining migrations; `verify-third-stage-migrations.ts:191-193, 244-249`); only its fresh and
upgrade paths move to **two separate** `goodnight_treehole_migration_<runId>` leases, keeping the
migration-file integrity and data-preservation assertions.

## 3. Seed and per-test fixtures

"Minimal seed" does not mean copying the demo store. `seedData()` in `store.service.ts:726-925` defines
`user_demo`, `user_guest`, the `admin/admin123` account, privacy settings and demo posts, letters and
categories. Booting against an empty database loads the legacy JSON store if it exists, otherwise
`seedData()`, then runs several coverage and flush routines (`:1240-1253, 2043-2048, 2432-2495`). So
**migrated-but-empty tables are not an empty business state**, and the legacy JSON file is a second
source of environment contamination.

Recommended boundary:

- The runner gives each run its own non-existent `GOODNIGHT_STORE_FILE`, its own uploads directory and a
  unique `FOLLOW_UP_QUEUE_NAME`, and verifies the database starts empty with no legacy JSON present.
- The minimal common data is limited to what boot and authentication require: the two users, the privacy
  rows they need, and the admin identity. Use the application's own boot seed as the single source of
  business defaults and verify the required rows exist after boot, rather than hand-copying `seedData()`
  and `ensureSeedCoverage()` into `prisma/seed.ts` — the latter adds public posts by mood and cannot serve
  as a precise fixture (`:2432-2495`).
- For the strict "each test builds its own fixture" requirement, specs must not depend on `post_1`,
  `letter_today`, `cat_1` and similar boot demo rows. They should create records with explicit ids,
  ownership, status and relations through the API or a test fixture helper, and query only what they
  created. The fixed identities `user_demo`/`user_guest` may remain as controlled run-level base
  identities, but each test must obtain or construct the identity it uses explicitly rather than relying
  on a previous test's changes. If full per-test user isolation is required, each test creates two
  distinct users and passes the identity header explicitly; a request with no header falls back to
  `user_demo` (`store.service.ts:2297`) and that implicit use should be avoided in isolated tests.
- **Do not change the product seed to make this work.** Making the API in test mode generate no demo data
  and load only from an isolated database would change `store.service.ts` startup behaviour, which is
  outside this round's test-infrastructure boundary and must be approved as a separate product change. It
  cannot be achieved through `prisma/seed.ts` alone.

## 4. Cost and isolation granularity

Each new database pays `CREATE DATABASE`, 12 migrations, a seed, API start/stop and `DROP DATABASE`. The
repository records "12 migrations applied" but **no per-deploy timing**
(`docs/architecture/PERSISTENCE_BENCHMARK.md:30-34`), so no reliable figure can be quoted here. When
implementing, record the wall-clock cost of all five phases, repeat at least three times on a warm WSL2
server, and report median and worst. Running the whole thing for each of 21 helper specs would be
21 × (create + 12 migrations + seed + drop), not "12 migrations once". API start may also be expensive,
and the benchmark's large-dataset boot figure includes a reconciliation flush, so it must not be used as
a minimal-seed measurement.

**Recommendation:** one runId per test command, one database per parallel worker, with explicit per-file
cleanup of business fixtures, the Redis queue and runtime files/processes; migrations run once per worker
database. Prove cleanup reliability with a single worker before enabling parallelism. Because the store
holds state in memory and loads it at boot, **clearing SQL tables while reusing the same app instance is
not a valid reset** — the app must be closed and rebuilt between files. If per-file reset cannot be shown
to be reliable, fall back to one database per file during the transition and accept the measured cost
rather than accept cross-test contamination.

## 5. Fixture problems found

| Spec | Problem |
| --- | --- |
| `front-square-interaction.spec.ts:17-42` | uses a non-empty square, `items[0]` and the first reply; two `it` blocks share the app, so the second is affected by the first's favourite/hide actions |
| `app.e2e.spec.ts:12-18` | depends on `post_1` |
| `cross.spec.ts:38-40, 63-71` | depends on `letter_today`, `cat_1` and an admin login |
| `front-letter.spec.ts:17-32` | assumes today's letter already exists |
| `third-stage-security-independent.spec.ts:21-45` | asserts `user_demo`'s minimal privacy defaults |
| `admin-sync.spec.ts:33-35` | rewrites that user's status |
| `goodnight-2-incremental.spec.ts:226-234`, `peer-support-stage.spec.ts:10-36` | depend on the two existing users |
| `third-stage-monthly-report.spec.ts:23-42, 128-169, 181-185` | fixed user and current month, masking other records with baseline deltas |

Already sound and to be preserved: `peer-support-stage.spec.ts:44-84, 139-175` keys conversations off its
own `match.id`, and `third-stage-privacy-2.spec.ts:89-117` keys delivery off its own `followUpId`. Neither
should be replaced with "the first conversation" or a shared fixed conversation.

**Not found:** a fixed "report queue" dependency. The real risks are the fixed user plus current month,
and the shared Redis queue. An unproven fixed-queue dependency must not be recorded as fact.

## 6. The runner and failure classification

`scripts/qa-all.ts:2-22` only calls `pnpm` serially — it does not start, health-check or stop anything.
Many `test:*` scripts call Vitest directly. The browser scripts do manage their own services, but
`real-browser-utils.ts:14-29, 68-106` kills whatever holds a fixed port, which cannot distinguish its own
processes and cannot serve as a unified runner.

`test-runner.ts` should become the common owner of these entry points: preflight Docker/WSL2 PostgreSQL
and Redis (and MinIO if needed); take a lease and migrate; start **only the services this run created**
(API, worker, front end/admin when the suite needs them); poll `GET /api/health`
(`controllers.ts:255-266`) **plus** a database query, a Redis `PING` and child-process liveness, because
`/api/health` returns service information and does **not** prove DB or Redis readiness; run the suite; then
stop the children and clean the lease on signal, failure and timeout. `qa-all.ts` composes suites but
should not implicitly start a development API, and running a single `pnpm test:*` should go through the
same runner rather than requiring the developer to start services first.

When WSL2 Docker has idled and stopped, the runner should probe the Docker engine, container state and
the services on **15432/16379**, optionally start the declared compose dependencies and wait, and if
WSL/Docker is unavailable return **`INFRASTRUCTURE_FAILURE`** promptly with the probe command, the target
and logs — rather than counting `ECONNREFUSED` or a health timeout as a product test failure. Only stop
processes and containers it created; never kill a developer's services. A missing remote DAPI credential
(`cross.spec.ts:15-18`) is likewise a missing precondition, not a migration failure.

## 7. Change list and boundary

**Must change:** `scripts/test-database.ts`, `scripts/verify-third-stage-migrations.ts`,
`tests/business/helpers.ts`, `tests/api/api.spec.ts`, `tests/cross/cross.spec.ts`,
`tests/e2e/app.e2e.spec.ts`, `scripts/qa-all.ts`, `package.json`. **New:** `scripts/test-runner.ts` and a
test-only fixture helper.

**Call the old reset interface today and must move to the lease with `finally` cleanup:**
`scripts/front-rest-test-utils.ts`, `scripts/real-browser-utils.ts`, `scripts/test-business-flow.ts`,
`scripts/test-click-all.ts`, `scripts/notification-truth-state.ts`,
`scripts/reference-fidelity-peer-stage.ts`, `scripts/diagnose/diagnose-clickability.ts`,
`scripts/diagnose/diagnose-phase2-phase3-runtime.ts`,
`scripts/diagnose/diagnose-phase2-phase3-clickability.ts`. The old `resetTestDatabase` name must not be
kept with changed semantics and a missed cleanup. The 21 helper-importing business specs get fixture fixes
in batches; the pure AI-provider specs should not be forced to create databases.

**Must not change:** product behaviour under `apps/api/src/**`, `prisma/schema.prisma`, the existing
`prisma/migrations/**`, the development database, the visual-fixture database and its fixture scripts.
`prisma/seed.ts` is currently a no-op and may be turned into a real common seed in a **separate seed
normalisation task**, but this round must not copy `store.service.ts` demo state and create a second
source of truth. In particular, do not add test-only fixed conversations, reports or queues to product
code to make old specs pass.
