# CURRENT CLOSURE STATUS

Regenerated at the start of the final closure round from `docs/product-closure/CLOSURE_REGISTER.md`
and the product audit register, then re-checked against the running stack. Every status below
carries evidence produced in **this** round; nothing is carried over on the strength of an earlier
claim. Where a row still rests on the previous round's regression run, it says so.

Status vocabulary: `FIXED_VERIFIED` / `OPEN` / `BLOCKED_EXTERNAL` / `BLOCKED_ENVIRONMENT`.

Round scope (the five items the closure round was asked to close): ISSUE-025, ISSUE-026,
ISSUE-028, the Prisma environment blocker, and DAPI.

## Environment at the start of this round

| Item | Value |
| --- | --- |
| HEAD | `87fb958` (branch `codex/post-recovery-validation`) |
| Working tree | **not** clean: `apps/api/package.json` + `pnpm-lock.yaml` carried an uncommitted Prisma pin |
| Database | PostgreSQL 16.15 in WSL2 Docker, host port 15432; reachable, 2 users, 13 safety events |
| WSL2 | stops when idle, taking the containers down; a keep-alive process was started and held for the whole round |
| Prisma CLI / runtime | both 5.22.0 after the fix below |
| `prisma migrate status` | broken by an empty, untracked `20261001000000_action_plan_mode/` directory (P3015) |

## Issues closed in this round

| Issue | Severity | Status | Evidence |
| --- | --- | --- | --- |
| ISSUE-025 safety event closure | P2 | **FIXED_VERIFIED** | `506162c` + `c1f0642`; `work/verify-safety-closure.mjs` 19/19; `work/verify-admin-closure-ui.mjs` 18/18; native Android run created a real `SafetyEvent` |
| ISSUE-026 admin search / pagination | P3 | **FIXED_VERIFIED** | `c1f0642`; `work/verify-admin-search-pagination.mjs` 58/58 across all 11 experience+safety endpoints; browser pager check 18/18 |
| ISSUE-028 peer conversation reports | P3 | **FIXED_VERIFIED** | `c1f0642`; `work/verify-peer-report-admin.mjs` 24/24 through the real two-user peer flow |
| ISSUE-007 AI degradation invisible | **P1** | **FIXED_VERIFIED** (product side) / **BLOCKED_EXTERNAL** (live-model half) | `427c647`; `work/verify-ai-degradation-ui.mjs` 9/9 against a real HTTP 402 |
| Prisma runtime sync blocker | — | **FIXED_VERIFIED** | `ad3ae74`; stale client deleted, regenerated, runtime queried from repo root and `apps/api`; a schema change now reaches the client (proved by the ISSUE-025 migration) |
| DAPI live model | — | **BLOCKED_EXTERNAL** | `provider_dapi_deepseek` returns HTTP 402; `provider_openai_remote` returns HTTP 401 |

## Full issue ledger

| Issue | Severity | Status | Evidence / note |
| --- | --- | --- | --- |
| ISSUE-001 admin auth | P0 | FIXED_VERIFIED | `356457f`; regression `work/verify-fixed-issues.mjs` 9/9 |
| ISSUE-002 user export | P1 | FIXED_VERIFIED | `91ba899`; same regression |
| ISSUE-003 write-only settings | P1 | FIXED_VERIFIED | `ae285b1`; `work/verify-settings-enforced.mjs` 7/7 |
| ISSUE-004 tool entrance | P1 | FIXED_VERIFIED | `082dca0`; regression |
| ISSUE-005 privacy link | P2 | FIXED_VERIFIED | `082dca0` |
| ISSUE-006 support intents | P1 | FIXED_VERIFIED | `work/verify-core-flow.mjs` |
| ISSUE-007 AI degradation invisible | P1 | FIXED_VERIFIED (product) / BLOCKED_EXTERNAL (live model) | `427c647`; 9/9; see above |
| ISSUE-008 smaller action | P2 | FIXED_VERIFIED | `62712f1`; `work/verify-core-flow.mjs` |
| ISSUE-009 follow-up entry | P2 | FIXED_VERIFIED | `62712f1` |
| ISSUE-010 notification deep link | P2 | FIXED_VERIFIED | `62712f1` |
| ISSUE-011 graduation / handoff share | P2 | FIXED_VERIFIED | `62712f1` |
| ISSUE-012 decorative captcha | P2 | FIXED_VERIFIED | `a94e119`; `work/verify-login-throttle.mjs` 7/7 |
| ISSUE-013 admin login rate limit | P2 | FIXED_VERIFIED | `a94e119` |
| ISSUE-014 orphan admin endpoints | P3 | OPEN | product decision, not a defect; 39 endpoints have no reachable caller |
| ISSUE-015 dead alias routes | P3 | OPEN | product decision |
| ISSUE-016 Square reachability | P3 | OPEN | product decision |
| ISSUE-017 letter ownership | P1 | FIXED_VERIFIED | `ea52129`; regression |
| ISSUE-018 peer experience ownership | P1 | FIXED_VERIFIED | `ea52129`; regression |
| ISSUE-019 handoff ownership | P1 | FIXED_VERIFIED | `ea52129`; regression |
| ISSUE-020 hug counter | P2 | FIXED_VERIFIED | `260030b`; `work/verify-hug.mjs` 7/7 |
| ISSUE-020 report counter | P2 | OPEN (was BLOCKED_ENVIRONMENT) | unblocked by the Prisma fix: `PeerExperience.reportCount` now persists and increments (2 rows at 1 after two report runs). Still aggregate-only — there is no per-report history model, so an individual report cannot be reopened or audited after a later report overwrites the conversation's fields |
| ISSUE-021 monthly privacy | P2 | FIXED_VERIFIED | `a94e119`; `work/verify-privacy-data.mjs` 8/8 |
| ISSUE-022 memory permission | P2 | FIXED_VERIFIED | `a94e119` |
| ISSUE-023 admin error visibility | P2 | FIXED_VERIFIED | `a94e119`; `work/verify-admin-error-visible.mjs` 4/4 |
| ISSUE-024 support-plan admin render | P2 | FIXED_VERIFIED | `a94e119` |
| ISSUE-025 safety event closure | P2 | FIXED_VERIFIED | this round; see above |
| ISSUE-026 admin search / pagination | P3 | FIXED_VERIFIED | this round; see above |
| ISSUE-027 user note persistence | P2 | OPEN | `userNote` still writes only an `AuditLog` row; `model User` has no note field. The Prisma blocker is gone, so this is now a normal, small model change rather than a blocked one |
| ISSUE-028 peer conversation reports | P3 | FIXED_VERIFIED | this round; see above |
| ISSUE-029 `reloadRuntimeState` lost updates | P1 | FIXED_VERIFIED | `62712f1`; `work/verify-core-flow.mjs` 15/15 |

## New findings in this round

| Finding | Severity | Status | Evidence |
| --- | --- | --- | --- |
| Prisma client could never be regenerated | **blocker** | FIXED_VERIFIED | `apps/api` declared `@prisma/client@^7.8.0` while the CLI, the root devDependency and the schema generator were all 5.22. Prisma 7 dropped the `prisma-client-js` generated-client layout, so `prisma generate` wrote `.prisma/client` into the 5.22 package while `apps/api` resolved the 7.8 package, which ships no generated client. Pinned to 5.22.0 (`ad3ae74`) |
| Empty phantom migration directory | P2 | FIXED_VERIFIED | `prisma/migrations/20261001000000_action_plan_mode/` existed, was empty and untracked, while `_prisma_migrations` records that migration as applied. It made every `prisma migrate` command fail with P3015. The empty directory was removed; **the migration's SQL file is still missing from the repository**, so that migration is not reproducible from source (see "Known gaps") |
| Stale visual spec | P3 | FIXED_VERIFIED | `tests/visual/admin-layout.spec.ts` expected bare names (`login.png`) that nothing writes; the capture script emits `<name>-<width>.png`. It could never pass. It now derives the expected files from the producer's own page list (`2d0faf8`) |
| Click diagnostics required a funded provider | P2 | FIXED_VERIFIED | `diagnose-clickability` and `test-click-all` aborted the whole `qa:all` gate on `aiJobStatus: 'fallback'`, conflating "DAPI has a balance" with "the report actions are clickable" (`9d4b8e4`) |
| Java 21 toolchain missing | environment | FIXED_VERIFIED | The Capacitor plugin subprojects require a Java 21 toolchain; only Android Studio's JBR 17 was installed, so the APK could not be built. Temurin 21.0.12.1 was installed and the APK then built in 23s |

## Gates

```
OPEN_P0=0
OPEN_P1=0                     (ISSUE-007's product side is fixed; its live-model half is
                               BLOCKED_EXTERNAL, not open work)
OPEN_P2=3                     (ISSUE-020 report history, ISSUE-027 user note, plus the
                               missing action_plan_mode migration SQL)
OPEN_P3=3                     (ISSUE-014, ISSUE-015, ISSUE-016 - all product decisions)
FAKE_BUTTON_COUNT=0
FAKE_FUNCTION_COUNT=0
WRITE_ONLY_OPERATION_COUNT=0
DECORATIVE_SECURITY_CONTROL_COUNT=0
BLOCKED_EXTERNAL=2            (DAPI HTTP 402, OpenAI HTTP 401)
BLOCKED_ENVIRONMENT=0         (the Prisma blocker is resolved)
DAPI_VERIFIED=false           (HTTP 402 on the primary, HTTP 401 on the secondary)
ANDROID_VERIFIED=true
ADMIN_VERIFIED=true
QA_ALL_PASS=false             (13 of 14 steps pass; test:cross is blocked on the DAPI balance)
BACKUP_SAFE=true
FULL_PRODUCT_VERIFIED=false   (QA_ALL_PASS is false, so the verified tag is NOT created)
```

## Gate evidence

| Gate | How it was measured | Result |
| --- | --- | --- |
| lint | `pnpm lint` | 0 errors, 6 pre-existing warnings |
| typecheck | `pnpm typecheck` (api, admin, mp, shared-types, api-sdk) | pass |
| test:unit | `pnpm test:unit` | 2 files / 7 tests pass |
| test:api | `pnpm test:api` | pass |
| test:e2e | `pnpm test:e2e` | 12 files / 12 tests pass |
| test:visual | `pnpm test:visual` | 2 files pass |
| diagnose:all | `pnpm diagnose:all` | pass, including clickability |
| real-browser front / admin / cross | `pnpm test:real-browser-*` | pass |
| test:click-all | `pnpm test:click-all` | pass |
| test:business-flow | `pnpm test:business-flow` | pass |
| test:cross | `pnpm test:cross` | **2 pass, 1 fail** — `uses the supplied remote DAPI and persists the completed AiJob` expects `status: 'succeeded'` from `provider_dapi_deepseek`; the account returns 402 so the job is a fallback |
| Android | emulator `emulator-5554`, APK built from committed source | `work/verify-android-native.mjs` 8/8; native `SafetyEvent` created; screenshots in `artifacts/product-closure/` |

## Known gaps carried forward (not defects hidden, defects recorded)

1. **`20261001000000_action_plan_mode` migration SQL is missing from the repository.** The database
   has it applied and `schema.prisma` reflects it, but the file is absent, so the migration cannot be
   replayed from source on a fresh database. Reconstructing it was out of scope for this round (it
   would mean authoring SQL for changes made before this round); it needs the original file or a
   deliberate `migrate diff` reconstruction against a shadow database.
2. **Two pre-existing schema/DB drift items**, both unrelated to this round and left untouched:
   an index on `DecisionRecord(userId, cooldownUntil)` exists in the database but not in the schema,
   and `MemoryItem.updatedAt` has a database default that the schema does not declare.
3. **`tests/business/third-stage-monthly-report.spec.ts` cannot pass in this environment.** It asserts
   a live `provider_dapi_deepseek` success with `fallbackUsed: false`. It is not part of `qa:all` and is
   blocked on the same account balance.
4. **ISSUE-014/015/016** remain open as product decisions; they are recorded as such in the audit
   register and are not code defects.

## Fix commits in this round

| Commit | Scope |
| --- | --- |
| `ad3ae74` | Prisma client alignment - the environment blocker |
| `506162c` | ISSUE-025 data layer: `SafetyEvent` handled state, trigger text, migration, mapper |
| `c1f0642` | ISSUE-025 operator surface, ISSUE-026 search/pagination, ISSUE-028 report display |
| `427c647` | ISSUE-007 product side: user-visible AI degradation notice |
| `2d0faf8` | stale admin visual spec |
| `9d4b8e4` | click diagnostics no longer require a funded provider |

The three UI/API issues share one commit because they are interleaved in the same two files
(`apps/api/src/controllers.ts`, `apps/admin/src/views/TablePage.vue`) and could not be split into
separately-runnable commits. Each issue has its own verification script and its own row above.
