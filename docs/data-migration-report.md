# Data Migration Report

Project PostgreSQL is isolated at `127.0.0.1:55432`, database `goodnight_treehole`, user `goodnight`. Prisma schema, client generation, db push, and baseline migration have been applied.

One-time import command: `pnpm db:import-json apps/api/data/goodnight-store.json`. JSON backups are placed under `data/json-backups/`.

Database assertions on 2026-07-12 confirmed `RuntimeState` contained PRIVATE Mood `mood_0f1e57c4ed`, Diary attachment `media_99619e0225`, and AI job `job_85a230843c`; relational `MediaAsset` contained that asset with dimensions 941×1672.

Known boundary: PostgreSQL is authoritative, but the RuntimeState JSONB aggregate still needs future per-entity repository decomposition.
