# GoodnightTreeHole 2.0 Phase 2 Progress

Baseline: `fc33307561b573d64a47b638d009a826ad46e531`  
Completed: 2026-08-17

| Phase | Status | Implementation and evidence |
| --- | --- | --- |
| A. Baseline and migration audit | DONE | Audited the existing front/admin/API/Prisma boundary; main schema and isolated clean-schema deploy both verified. |
| B. Tonight, SupportIntent, SituationFingerprint | DONE | Added guarded first-entry journey, typed snapshot/fingerprint, confirmation and intent routing. |
| C. Recommendation, barrier, adaptive action | DONE | Added async action-plan recommendation, explicit accept/reject, missed barrier and parent-child adaptation. |
| D. Follow-up queue and notifications | DONE | Added Redis/BullMQ queue and worker, persisted `FollowUpJob`, idempotent `UserNotification`, user-scoped inbox/read. |
| E. Peer network | DONE | Added bounded match summaries, detail, two-user request/accept/reject, 72-hour conversations and message persistence. |
| F. Graduation flywheel | DONE | Added graduation metrics, consented editable `PeerExperience` draft and admin review state. |
| G. Decision Vault and real-world support | DONE | Decision, cooldown, reality handoff, trusted contact, future self, support plan and bounded memory all have real routes/UI. Loop detection remains PARTIAL. |
| H. Recovery and personal surfaces | PARTIAL | Recovery check-in is complete and persisted; Me/report/privacy remain live but are not a fully consolidated 2.0 information architecture. |
| I. Admin operations | PARTIAL | Dashboard and new resource lists/review/read views are live; detailed mutations for every new operational resource remain. |
| J. Visual/browser evidence | DONE | Local capture produced 23 Phase 2 screenshots with `overflow=0`; 14 legacy front captures also passed no-horizontal-overflow. |
| K. Full regression | DONE | Latest `pnpm qa:all` exited 0 after the final clickability and monthly-report layout fixes. |

## Changed surface

- API: `apps/api/src/store.service.ts`, `apps/api/src/controllers.ts`,
  `apps/api/src/follow-up-queue.ts`, `apps/api/src/follow-up-worker.service.ts`,
  `apps/api/src/app.module.ts` and relational mapping.
- Front: journey/tonight/action/peer/reality/recovery/future-self views plus
  existing Square, PostDetail, MoodCreate, LetterToday, ToolIndex, Me and
  JourneyDetail surfaces; `ReportMonth.vue` now keeps actions above tabBar.
- Admin: router, dashboard and generic table/resource surfaces for the new
  journey, action, check-in, peer, follow-up, safety, support and memory data.
- Data/contracts: additive Prisma schema/migrations and shared 2.0 types.
- Verification: clickability scroll stabilization, business tests, browser
  regression and Phase 2 evidence capture.

## Honest remaining work

`loop_detection` currently exists as a structured asynchronous AI task contract,
but it has no complete user-facing intervention workflow. Admin operations and
the consolidated Me/report/recovery information architecture are usable but
partial. Legacy visual diff rates remain 10.42%–22.25%, with the diary page the
largest divergence. Redis is 5.0.14.1 while BullMQ recommends >=6.2.
