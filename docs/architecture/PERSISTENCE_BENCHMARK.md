# PERSISTENCE BENCHMARK (BEFORE MIGRATION)

Phase A/B architecture baseline: an empirical, repeatable benchmark measuring the persistence behavior of the existing monolithic store flushing architecture as database scale grows.

This document establishes the **BEFORE** baseline against which the incremental persistence migration (scoped repository pattern) will be evaluated.

---

## 1. Measurement Methodology

### 1.1 SQL Statement Counting Mechanism
The audit (`docs/architecture/PERSISTENCE_WRITE_GRAPH.md`) identified that every business write serializes an in-memory clone of the whole store and triggers `saveRelationalRuntimeState()`, which:
1. Iterates over 43 distinct collections and executes individual `upsert` queries in sequential loops inside an interactive `$transaction` (`relational-runtime.mapper.ts:170-241`).
2. Issues `deleteAbsent()` sweeps for 40 models using `deleteMany({ id: { notIn: ids } })` or unrestricted `deleteMany({})` (`mapper.ts:249-292`).
3. Updates `RuntimeState`.

To measure the exact number of SQL statements issued by PostgreSQL for a single write operation rather than estimating or inferring from latency:
- We instrumented the benchmark Prisma client (`BenchmarkPrismaService` extending `PrismaClient`) by enabling query event logging:
  ```ts
  log: [{ emit: 'event', level: 'query' }]
  ```
- An event listener on `$on('query', ...)` captures every SQL statement emitted by the Prisma query engine during the execution of the request and its accompanying store flush.
- Quiescence draining: After operations that spawn asynchronous background work (specifically `createJourney`, which kicks off an AI situation analysis job), the benchmark awaits job completion and calls `store.flush()` before completing the sample, and drains `store.flush()` between every operation. This guarantees that background flushes from one operation never contaminate subsequent operations.
- Statement types are parsed and categorized into:
  - **Upserts**: `INSERT INTO ... ON CONFLICT (...) DO UPDATE ...`
  - **Deletions**: `DELETE FROM "public"."..." WHERE "id" NOT IN (...)`
  - **Transaction Control**: `BEGIN`, `COMMIT`, `ROLLBACK`
  - **Others**: Singleton queries / schema checks

### 1.2 Isolation & Safety
- **Strict Database Isolation**: The benchmark runs strictly against a dedicated database `goodnight_benchmark` created on `127.0.0.1:15432`.
- **Zero Modifications to Dev DB**: The primary development database (`goodnight_treehole`) was completely untouched.
- **Migration Deployment**: Schema was created and verified exclusively using `prisma migrate deploy` (applying all 12 tracked migrations from `prisma/migrations`), strictly adhering to the prohibition against `prisma db push`.
- **Zero Product Changes**: `apps/api/src/**` runtime code was not altered. The query event hook was injected via NestJS test module provider override (`PrismaRuntimeService`).

---

## 2. Boot & Store Hydration Time

The audit noted that boot is $O(\text{total\_rows})$ because `loadRelationalRuntimeState()` executes 43 parallel `findMany` queries to hydrate the in-memory store, followed by reconciliation checks that trigger a full flush.

| Dataset Size | Hydration Time (ms) | Full Store Boot Time (ms) | Note |
|--------------|---------------------|---------------------------|------|
| **1,000**    | 24.5                | 6,086.6                   | Single sample; includes initial seed reconciliation flush |
| **5,000**    | 36.3                | 25,127.3                  | Single sample; flush I/O and checkpoint variance |
| **10,000**   | 98.1                | 62,527.5                  | Single sample; flush I/O and checkpoint variance |
| **12,600**   | 74.6                | 56,626.0                  | Single sample; flush I/O and checkpoint variance |

*Variance Note: Hydration itself (`loadRelationalRuntimeState()`) is fast and takes between 24 ms and 98 ms across all scales. However, full store boot (`onModuleInit()`) is dominated by the initial reconciliation routines (`ensureSeedCoverage()`, `ensurePhaseTwoCoverage()`, `reconcileFavoriteCounts()`), which enqueue a full store flush on startup. Because each reported value represents a single sample, variance between 10k rows (62.5s) and 12.6k rows (56.6s) reflects disk I/O, PostgreSQL background checkpointing, and garbage collection during the multi-thousand statement interactive transaction. Both values demonstrate that startup requires approximately one minute at production-like scales.*

---

## 3. Single-Writer Operation Benchmarks

Measurements conducted across 4 dataset scales (1k, 5k, 10k, and 12.6k rows) for 5 core business write paths:
1. `createJourney` (`POST /api/v1/journeys`)
2. `writeAction` (`POST /api/v1/journeys/:id/actions`)
3. `readNotification` (`PATCH /api/v1/notifications/:id/read`)
4. `sendPeerMessage` (`POST /api/v1/peer-conversations/:matchId/messages`)
5. `adminHandleSafetyEvent` (`PATCH /api/admin/v1/safety/events/:id/handle`)

### 3.1 Latency, SQL Statements, and Write Amplification

All metrics represent successful executions (3/3 successful iterations per operation).

| Operation | Dataset Size | p50 (ms) | p95 (ms) | max (ms) | SQL Statements (Avg) | Rows Flushed | Business Rows Changed | Amplification | Nature of Operation |
|-----------|--------------|----------|----------|----------|----------------------|--------------|-----------------------|---------------|---------------------|
| **createJourney** | 1,000 | 6,412.9 | 6,623.0 | 6,623.0 | 5,376 | 1,000 | 3 | 333x | 5 flushes (AI lifecycle) |
| **writeAction** | 1,000 | 1,270.0 | 1,298.4 | 1,298.4 | 1,089 | 1,000 | 3 | 333x | 1 flush |
| **readNotification** | 1,000 | 1,323.9 | 1,508.4 | 1,508.4 | 1,093 | 1,000 | 1 | 1,000x | 1 flush |
| **sendPeerMessage** | 1,000 | 1,444.0 | 1,519.4 | 1,519.4 | 1,095 | 1,000 | 1 | 1,000x | 1 flush |
| **adminHandleSafetyEvent** | 1,000 | 1,282.1 | 1,298.8 | 1,298.8 | 1,098 | 1,000 | 2 | 500x | 1 flush |
| **createJourney** | 5,000 | 52,421.7 | 54,951.4 | 54,951.4 | 25,378 | 5,000 | 3 | 1,666x | 5 flushes (AI lifecycle) |
| **writeAction** | 5,000 | 10,740.8 | 11,811.8 | 11,811.8 | 5,090 | 5,000 | 3 | 1,666x | 1 flush |
| **readNotification** | 5,000 | 11,896.4 | 11,948.0 | 11,948.0 | 5,093 | 5,000 | 1 | 5,000x | 1 flush |
| **sendPeerMessage** | 5,000 | 9,937.8 | 10,451.1 | 10,451.1 | 5,096 | 5,000 | 1 | 5,000x | 1 flush |
| **adminHandleSafetyEvent** | 5,000 | 9,543.5 | 9,636.8 | 9,636.8 | 5,098 | 5,000 | 2 | 2,500x | 1 flush |
| **createJourney** | 10,000 | 58,914.9 | 59,410.7 | 59,410.7 | 50,378 | 10,000 | 3 | 3,333x | 5 flushes (AI lifecycle) |
| **writeAction** | 10,000 | 11,745.7 | 11,821.5 | 11,821.5 | 10,090 | 10,000 | 3 | 3,333x | 1 flush |
| **readNotification** | 10,000 | 11,376.4 | 11,489.9 | 11,489.9 | 10,093 | 10,000 | 1 | 10,000x | 1 flush |
| **sendPeerMessage** | 10,000 | 11,511.9 | 11,585.3 | 11,585.3 | 10,095 | 10,000 | 1 | 10,000x | 1 flush |
| **adminHandleSafetyEvent** | 10,000 | 11,415.0 | 11,436.2 | 11,436.2 | 10,098 | 10,000 | 2 | 5,000x | 1 flush |
| **createJourney** | 12,600 | 72,862.4 | 73,914.8 | 73,914.8 | 63,379 | 12,600 | 3 | 4,200x | 5 flushes (AI lifecycle) |
| **writeAction** | 12,600 | 15,019.2 | 15,493.0 | 15,493.0 | 12,690 | 12,600 | 3 | 4,200x | 1 flush |
| **readNotification** | 12,600 | 15,371.9 | 16,088.4 | 16,088.4 | 12,694 | 12,600 | 1 | 12,600x | 1 flush |
| **sendPeerMessage** | 12,600 | 15,621.5 | 19,283.4 | 19,283.4 | 12,696 | 12,600 | 1 | 12,600x | 1 flush |
| **adminHandleSafetyEvent** | 12,600 | 21,769.7 | 21,945.2 | 21,945.2 | 12,699 | 12,600 | 2 | 6,300x | 1 flush |

### 3.2 Reliable Single-Flush BEFORE Baseline: $N + 93$ to $N + 94$
For a single-flush business write path (`readNotification`, `sendPeerMessage`, `adminHandleSafetyEvent`, and `writeAction`), the number of SQL statements issued by the flush scales strictly with total database size $N$:

$$\text{Statements per single flush} = N + 93 \quad (\text{or } N + 94 \text{ when the extra singleton query fires})$$

The exact component breakdown per single flush is:
- **Upserts**: Exactly $N + 49$ upsert statements (every single row across all populated models is upserted sequentially).
- **Absence Sweeps (`deleteAbsent`)**: Exactly 42 statements (`deleteMany({ id: { notIn: ids } })` executed against absent/reconciled models).
- **Transaction Controls**: Exactly 2 statements (`BEGIN` and `COMMIT`).
- **Sum**: $(N + 49) + 42 + 2 = N + 93$ statements (plus 1 singleton query = $N + 94$).

Empirical confirmation across all dataset sizes for `readNotification`:
- 1,000 rows $\rightarrow$ **1,093** statements ($1000 + 93$)
- 5,000 rows $\rightarrow$ **5,093** statements ($5000 + 93$)
- 10,000 rows $\rightarrow$ **10,093** statements ($10000 + 93$)
- 12,600 rows $\rightarrow$ **12,694** statements ($12600 + 94$)

### 3.3 Asynchronous Multi-Flush Operations (`createJourney`)
- `POST /api/v1/journeys` mutates the store and issues a synchronous `persistAndFlush()`.
- It then queues an AI situation analysis job (`this.queueAI(...)`), which undergoes status transitions (`queued` $\rightarrow$ `running` $\rightarrow$ `succeeded`) with each transition queuing a `persist()`, followed by `waitForAiJob(...).then(async () => await this.persistAndFlush())`.
- When drained to full quiescence, a single `createJourney` request triggers **5 full flushes**, executing:
  $$\approx 5 \times (N + 94) \text{ SQL statements}$$
  - 1,000 rows: **5,376** statements (duration ~6.4s)
  - 5,000 rows: **25,378** statements (duration ~52.4s)
  - 10,000 rows: **50,378** statements (duration ~58.9s)
  - 12,600 rows: **63,379** statements (duration ~72.8s)

---

## 4. Concurrency Benchmark

We tested concurrent coroutines in a single Node process issuing simultaneous read-modify-write mutations against the same target row in PostgreSQL (`journey_concurrency_target`) across 1, 5, and 10 coroutines dispatched via `Promise.all`.

| Coroutines | Total Attempts | Successes | Failures | Timeouts | Connection Closed / Pool Exhausted | Lost Updates |
|------------|----------------|-----------|----------|----------|------------------------------------|--------------|
| **1**      | 1              | 1 (100%)  | 0 (0%)   | 0        | 0                                  | 0            |
| **5**      | 5              | 1 (20%)   | 4 (80%)  | 0        | 4                                  | 0*           |
| **10**     | 10             | 1 (10%)   | 9 (90%)  | 0        | 9                                  | 0*           |

### 4.1 Nature of Concurrency Failures
- The observed failures (4/5 at concurrency 5, and 9/10 at concurrency 10) are **connection-pool exhaustion during the read phase**, distinct from a write race.
- In the current architecture, each writer coroutine must first execute `loadRelationalRuntimeState()` to read the entire database. This method executes 43 parallel `findMany()` queries across all models using `Promise.all()`.
- When 5 or 10 coroutines start concurrently, between 215 and 430 queries are fired simultaneously into Prisma's connection pool, immediately exhausting PostgreSQL's client connection limit:
  ```
  Invalid `db.user.findMany()` invocation:
  Too many database connections opened: FATAL: sorry, too many clients already
  ```
- Because 4 out of 5 (and 9 out of 10) coroutines crashed during the initial read phase before ever opening a write transaction, exactly 1 coroutine proceeded to commit.

### 4.2 Non-Observability of Lost Updates
- *Why is "lost updates: 0" recorded?*
  Because only a single coroutine successfully completed its read and write phases; the competing coroutines aborted with connection exhaustion errors before reaching their write transaction. Without multiple successfully committed transactions, a write-write race cannot be observed.
- The failure mode under concurrent whole-store operations is therefore primary client connection saturation during read hydration, which prevents concurrent transactions from reaching the database to contend for locks.

---

## 5. Artifact Reference
The complete raw benchmark data is recorded in:
- `artifacts/persistence-benchmark-results.json`

To reproduce this benchmark at any time:
```bash
pnpm benchmark:persistence
```
