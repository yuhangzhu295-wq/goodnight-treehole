# Current Runtime Audit

## CURRENT SOURCE OF TRUTH

Runtime state is loaded from PostgreSQL `RuntimeState(id='default').payload` through `PrismaRuntimeService`. The legacy JSON store is import/backup-only; API writes do not mutate it at runtime. `User` and `MediaAsset` also have synchronized relational records. This is a deliberate transitional JSONB aggregate: most domain entities are not yet individual Prisma repositories.

## CURRENT MEDIA STORAGE

Files are stored at `apps/api/data/uploads/<storageKey>` and served by `/uploads/<storageKey>`. `MediaAsset` records keep owner, MIME, byte size, dimensions, usage, and status.

## CURRENT AI EXECUTION MODEL

`OllamaService` calls the enabled Ollama providers. The verified primary model was `qwen2.5:7b-instruct-q4_K_M`; an admin route test verified `llava:7b` after a live route update.

## CURRENT JOB MODEL

Every production AI entry point queues an `AIJob`, returns `jobId` immediately, then records queued/running/succeeded|fallback|failed with provider, model, duration, result, error, and trace.

## CURRENT FRONT/ADMIN SYNC METHOD

Both Vue apps call the same Nest API and `StoreService`, whose persisted runtime is PostgreSQL. Moderation changes are visible to the front after a fresh API read.

Verified 2026-07-12: API `3000`, front `5173`, admin `5174`, PostgreSQL `55432`.
