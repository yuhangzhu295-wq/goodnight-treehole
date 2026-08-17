# GoodnightTreeHole 2.0 Migration Repair Report

Date: 2026-08-17  
Baseline: `fc33307561b573d64a47b638d009a826ad46e531`

## Result

Migration acceptance is `DONE` for the current chain.

1. With `DATABASE_URL` pointed at the authoritative `goodnight_treehole` public
   schema, `pnpm exec prisma migrate status` reported three migrations and
   `Database schema is up to date!`.
2. A clean temporary schema named `migration_0817_final` was created in the
   existing PostgreSQL database.
3. `pnpm exec prisma migrate deploy` applied, in order:
   `20260712000000_runtime_state`, `20260808010000_hidden_post`, and
   `20260816000000_goodnight_2_incremental`.
4. The temporary schema was dropped after the deploy check. The public schema
   was not reset or replaced.

The old audit note that described `20260808010000_hidden_post` as currently
blocking deploy is stale. It is now verified as part of the deployable chain;
the current hidden-post migration is a historical marker compatible with the
current baseline.

## Scope and limitation

No `db push` result was used as migration acceptance. Isolated business tests may
provision their own schemas with `db push` for test setup; that is separate from
the direct clean-schema `migrate deploy` check above.

The local database role `goodnight` does not have permission to create a new
database, so the clean-chain check used a temporary schema inside the existing
database. Production rollout still requires an operator-owned backup,
staging deploy, and change-control window. No production backup is claimed by
this report.
