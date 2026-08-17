# GoodnightTreeHole 2.0 Baseline Audit

## Audit scope

- Audit date: 2026-08-16
- Upgrade style: incremental. Existing Post, Reply, Diary, Letter, media, privacy, moderation, AI job, frontend, and admin contracts remain in place.
- Authoritative runtime: `StoreService` loads and persists through `PrismaRuntimeService`; when the relational-primary marker is present, `relational-runtime.mapper.ts` maps the same runtime state into PostgreSQL tables.

## Verified existing capabilities

| Area | Baseline evidence | 2.0 handling |
| --- | --- | --- |
| Public content | Mood creation creates a Mood plus a public Post or private Diary; post replies, hugs, favorites, reports, hiding, and moderation already use API calls. | Preserve routes and extend posts/diaries with an optional journey link. |
| AI jobs | `queueAI` creates persisted queued/running/terminal `AiJob` records and the remote provider service calls DAPI through an OpenAI-compatible HTTPS endpoint. | New structured companion tasks reuse this queue and add task-specific structured outputs. |
| Privacy | Per-user privacy data already controls public posting, human replies, and monthly-report sharing. | Add opt-in flags for matching, recovery/long-term analysis, experience statistics, and memory. |
| Frontend | Vue routes already serve square, mood creation, post detail/reply sheet, letter, tools, diary, report, favorites, privacy, feedback, and profile views. | Keep every legacy URL and add 2.0 primary flows as additional routes. |
| Admin | Admin reads the same StoreService-backed state for dashboard, users, content, replies, AI jobs/routes/providers, feedback, and settings. | Add operational views and APIs over the same new records. |
| Storage | Image upload uses multipart files, persisted MediaAsset records, and a local storage adapter. | No metadata-only upload replacement is introduced. |

## Baseline risks and decisions

1. The prior `admin-rebuild-phase-0-to-6` checkpoint is still `IN_PROGRESS` and includes historical Ollama references. It is not accepted as current 2.0 verification evidence.
2. 2.0 does not invoke, configure, or fall back to a local/Ollama model. New agent jobs accept the configured DAPI provider only; a clearly marked safety fallback remains available when DAPI fails.
3. Runtime persistence has a relational mapper instead of direct repository CRUD for every old domain object. New 2.0 objects will be added to both the typed store payload and the relational mapper, so a refresh and a clean restart retain them.
4. Existing routes, API payload fields, and UI controls are compatibility surfaces. New fields are optional and legacy pages will not require a journey.

## Acceptance baseline

The upgrade is only considered complete after each new 2.0 flow proves UI interaction, API mutation, PostgreSQL readback, page refresh persistence, and relevant admin synchronization. Historical test reports are informative only; all final results must be run after the 2.0 implementation.
