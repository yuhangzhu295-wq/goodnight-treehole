# GoodnightTreeHole 2.0 Phase 2 Gap Audit

Baseline: `fc33307561b573d64a47b638d009a826ad46e531`  
Audit date: 2026-08-17  
Acceptance rule: `DONE` requires a real API/data path and current evidence;
`PARTIAL` means a real path exists but the product contract is incomplete;
`MISSING` means no complete user-facing implementation; `BLOCKED` means an
external prerequisite prevents honest acceptance.

| Area | Status | Current evidence / remaining gap |
| --- | --- | --- |
| Existing journey/action/peer/support tables | DONE | Prisma schema, relational mapper, isolated PostgreSQL business tests and readback. |
| Tonight first-entry UX | DONE | `/pages/tonight/index` creates a real journey and loads the persisted item. |
| SupportIntent routing | DONE | Persisted intent, guarded confirmation, and route-specific next-step selection. |
| SituationSnapshot facts/feelings/needs/constraints/risks | DONE | AI draft, user confirmation, protected overwrite and database readback. |
| SituationFingerprint typed fields | DONE | Domain/subdomain/stage/tags/behavior/recovery fields and matching inputs are persisted. |
| User confirmation/editing | DONE | Confirmation and later updates are explicit user actions. |
| AI action recommendation | DONE | Async job, structured recommendation, user accept/reject, persisted commitment. |
| Barrier and adaptive action | DONE | Missed barrier, adaptive-plan route, parent action and attempt metadata are persisted. |
| Redis/BullMQ follow-up | DONE | Delayed queue, worker, idempotent notification delivery and test against Redis 6380. |
| UserNotification/inbox | DONE | Runtime identity is respected for list/read; notification is persisted and read back. |
| Peer matching | DONE | Bounded summaries, score breakdown, fingerprint/stage/recovery/trust scoring and explanation. |
| Peer detail | DONE | Journey timeline, later updates and check-ins are returned from the real owner record. |
| Peer request/acceptance | DONE | Two distinct users, request, recipient inbox, accept/reject and self-accept guard tested. |
| 72-hour peer conversation | DONE | Conversation/message tables, both-user messages, expiry and close routes tested. |
| Graduation flywheel | DONE | Metrics, consent, editable draft, pending moderation and admin review path. |
| Decision Vault/cooldown | DONE | Real create/list/update paths and browser actions are covered. |
| Reality handoff | DONE | Real save/share API; default channel is bound in UI and browser flow verifies share. |
| Future self | DONE | Persisted scheduled message page and follow-up scheduling path. |
| Support plan | DONE | Persisted JSON plan and guarded front/admin list paths. |
| Loop detection | PARTIAL | `loop_detection` is an async structured AI task contract, but no dedicated user-facing intervention page or persisted loop case workflow. |
| Recovery check-in | DONE | Structured yes/partial/no records, privacy guard, real persistence and readback. |
| Me/report/privacy surfaces | PARTIAL | Existing pages consume live APIs and are functional; journey/recovery/loop detail is not yet consolidated into one complete 2.0 information architecture. |
| Admin operations | PARTIAL | Dashboard, lists, review and live read-only experience/safety/follow-up views exist; detailed mutation workflows for every new operational resource are incomplete. |
| DAPI-only AI routing | DONE | Live audit recorded `provider_dapi_deepseek` / `deepseek-v4-flash`, succeeded with `fallbackUsed=false`; local/Ollama policy rejection is tested. |
| Migration deploy | DONE | Main schema is up-to-date; clean temporary schema applied all three migrations successfully. |
| Visual evidence | DONE | 23 Phase 2 screenshots captured with `overflow=0`; legacy 14-page visual checks also have no horizontal overflow. |

## Runtime notes

- PostgreSQL is authoritative for the real API runtime and business tests.
- Redis is the configured service at `127.0.0.1:6380`; it reports version
  `5.0.14.1`. BullMQ emits its documented recommendation for Redis >= 6.2,
  but the queue and persistence tests passed on the installed service.
- No Ollama or local model was used. The DAPI live test records provider/model
  and terminal status without printing credentials.
- The historical admin checkpoint remains historical evidence only; it is not
  used to upgrade any status in this audit.
