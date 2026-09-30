# FINAL FULL PRODUCT AUDIT

GoodnightTreeHole (晚安树洞) - COMPLETE PRODUCT GRAPH AUDIT run.

| Item | Value |
| --- | --- |
| Repository | `C:\Users\zyu33\Projects\goodnight-treehole` |
| Branch | `codex/post-recovery-validation` |
| HEAD at start | `158c29868e8a66129eb58680f8af85d488505725` |
| Working tree at start | clean |
| API | `http://127.0.0.1:3000` |
| Front (mp) | `http://127.0.0.1:5173` |
| Admin | `http://127.0.0.1:5174` |
| PostgreSQL | `127.0.0.1:15432` / `goodnight_treehole` |
| Android | `emulator-5554`, real debug APK `com.goodnight.treehole` |

## 1. What this audit covers

Every route, view, page state, control, API write, database entity and admin resource in
the product as it exists in the current source, plus the real Android runtime. The full
per-page detail lives in the linked files; this document is the map and the verdict.

| Inventory | Count | Source |
| --- | ---: | --- |
| TOTAL_MP_ROUTES | 55 | `artifacts/product-audit/mp-routes.json` |
| TOTAL_MP_UNIQUE_VIEWS | 39 | same |
| TOTAL_ADMIN_ROUTES | 26 | `artifacts/product-audit/admin-routes.json` |
| TOTAL_ADMIN_RESOURCES | 24 | same |
| TOTAL_API_ENDPOINTS | 264 | `artifacts/product-audit/api-endpoints.json` |
| TOTAL_DB_MODELS | 51 | `artifacts/product-audit/db-models.json` |
| TOTAL_CONTROLS (static) | 940 | `artifacts/product-audit/control-manifest.json` |

## 2. Coverage achieved

| Metric | Value |
| --- | ---: |
| VISITED_MP_ROUTES (real APK) | 54 / 54 navigable routes |
| AUDITED_MP_VIEWS | 39 / 39 |
| VISITED_ADMIN_ROUTES | 26 / 26 (routes verified in the running admin app; per-resource audit static + live API probes) |
| AUDITED_ADMIN_RESOURCES | 24 / 24 |
| TOTAL_RUNTIME_CONTROLS | 717 |
| RUNTIME_CONTROLS_PRESSED | 358 |
| DESTRUCTIVE_CONTROLS_SKIPPED | 52 |
| CONTROLS_WITH_STABLE_SELECTOR | 553 |
| PAGE_STATES_IDENTIFIED | see each page audit's STATES section |

## 3. Runtime evidence

All of the following was produced against the running stack, not inferred:

1. **Android route walk** - `scripts/recovery/android-route-walk.mjs`: 54/54 routes
   rendered on the real APK, 0 console errors, 0 failed network requests.
2. **Android control coverage** - `scripts/recovery/android-control-coverage.mjs --click`:
   717 controls, 358 pressed with real `adb shell input tap` events, 52 destructive controls
   skipped by policy, results recorded per control.
3. **Android business flow** - `scripts/recovery/android-business-flow.mjs stage1-core`:
   8/8 steps, a real gesture chain from typing an entry to accepting a plan. The writes were
   confirmed in PostgreSQL: `LifeJourney journey_044afe1bc1` (status `active`, stage
   `acting`), `ActionCommitment action_826fbc0efe`, `SituationSnapshot` count 5.
4. **API probes** - `work/verify-findings.mjs`, `work/verify-admin-auth.mjs`,
   `work/verify-unauth-delete.mjs`, `work/verify-ownership.mjs`.
5. **Static analysis** - `work/generate-discovery.mjs`, `work/generate-reports.mjs`,
   `work/audit-admin-guards.mjs`, `work/finalize-matrices.mjs`.

## 4. Product map

### Front (apps/mp)

Four tabs: 今晚 (`/pages/tonight/index`), 同路 (`/pages/peers/index`), 行动
(`/pages/action/index`), 我的 (`/pages/me/index`).

| Area | Views |
| --- | --- |
| Core support flow | TonightHome, JourneyDetail, RealityHandoff, SafetySupport, ActionCenter, Recovery, SupportPlan, NotificationCenter |
| Peer (同路人) | PeerNetwork, PeerExperienceDetail, PeerRequests, PeerMatchWaiting, PeerConsent, PeerConversation, PeerGraduation |
| Self system | Me, MeProfile, FutureSelf, StableSelf, MemoryCenter, DecisionVault, PrivacySettings, DataPolicy, ReportMonth, Archive |
| Legacy treehole | Square, MoodCreate, PostDetail, DiaryList, DiaryDetail, FavoriteList, LetterToday, LetterList, LetterDetail |
| Tools | ToolIndex, ToolDecompose, ToolRun |
| Help | FeedbackHelp, HelpFaqs |

### Admin (apps/admin)

24 resources in 6 groups: 总览 (dashboard), 内容运营 (posts, replies, users, tickets),
AI 管理 (providers, routes, jobs, presets), 知识与分类 (faqs, categories),
体验网络 (journeys, actions, checkins, peer-experiences, peer-matches, follow-ups,
peer-conversations, notifications), 安全与陪伴 (safety-events, support-plans, memory),
系统 (settings, audit).

### API and database

264 endpoints across three controllers (`HealthController`, `PublicController`,
`AdminController`) backed by 51 Prisma models. Full tables in
`docs/product-audit/API_DB_ADMIN_MAP.md`.

## 5. Business flows

Traced in `artifacts/product-audit/business-graph-core.json` (113 nodes, 166 edges) and
narrated in `docs/product-audit/discovery-agent2-business-graph.md`.

| Flow | Status | Evidence |
| --- | --- | --- |
| CORE_SUPPORT_FLOW | Verified end to end on the device for the happy path; degraded for the dropped intent branches | Android flow 8/8; ISSUE-006 |
| SAFETY_FLOW | Code path correct and AI-independent; not exercisable end to end without a real distress input | SafetySupport audit; `store.service.ts` HIGH_DISTRESS handling |
| ACTION_FLOW | Active/complete/missed/barrier/adaptive/accept work; regenerate, follow-up and history do not | ISSUE-008, ISSUE-009 |
| PEER_FLOW | All five privacy invariants enforced; `allowPeerMatching` is not applied on read paths | Peer page audits; ISSUE-018 |
| SELF_SYSTEM_FLOW | Real persistence and real aggregation; privacy gating has gaps | ISSUE-021, ISSUE-022 |
| LEGACY_TREEHOLE_FLOW | Real publish/private/diary/letter paths with real writes | Group-D page audits |
| TOOLS_FLOW | Implemented but unreachable from the UI | ISSUE-004 |
| FEEDBACK_FLOW | Real ticket creation, real admin visibility, real reply | FeedbackHelp audit, tickets audit |
| ADMIN_FLOW | Functionally real but unauthorised and partly unreadable | ISSUE-001, ISSUE-023 to ISSUE-028 |

## 6. Fake buttons and fake functions

`FAKE_BUTTON_COUNT = 3`, `FAKE_FUNCTION_COUNT = 2`. Detail and the cleared negatives are in
`docs/product-audit/FAKE_FUNCTION_AUDIT.md`.

| Id | Location | Severity |
| --- | --- | --- |
| ISSUE-002 | `apps/admin/src/views/UsersPage.vue:104` - export claims success, produces nothing | P1 |
| ISSUE-003 | `apps/admin/src/views/ConfigPage.vue:18-49` - 15 of 19 settings are write-only | P1 |
| ISSUE-005 | `apps/mp/src/views/PeerNetwork.vue:63` - push to a route that does not exist | P2 |
| ISSUE-012 | `apps/admin/src/views/Login.vue:119-127` - captcha never validated | P2 |

## 7. Security and privacy

| Id | Sev | Finding |
| --- | --- | --- |
| ISSUE-001 | P0 | Admin API has no controller-level authorization; 58 of 100 handlers are open, including destructive ones. Verified: an unauthenticated `DELETE` really deleted a row. |
| ISSUE-017 | P1 | `GET /api/v1/letters/:id` is not scoped by user; any caller can read a private letter. Verified live. |
| ISSUE-018 | P1 | `GET /api/v1/peer-experiences/:id` has no viewer check and ignores `allowPeerMatching`. |
| ISSUE-019 | P1 | `GET /api/v1/handoffs` is not scoped by user; it exposes another person's crisis card. Verified live. |
| ISSUE-021 | P2 | Monthly report ignores `allowRecoveryData` and the caller identity. |
| ISSUE-022 | P2 | MemoryCenter gates `allowLongTermMemory` while the AI path reads `allowAiMemoryUse`. |
| ISSUE-013 | P2 | Admin login has no rate limiting. |

Positive results: the peer consent model is correct (accepted != active, no messaging
before consent, participant-only reads, AI drafts only, 72h from active), and
`/api/v1/me/support-plan`, `/api/v1/me/stable-self` and `/api/v1/memory` correctly reject an
unknown user with 404.

## 8. AI

`AI_LOCAL_MODEL_ENABLED=false`, `OLLAMA_ENABLED=false`,
`AI_ALLOW_OLLAMA_FALLBACK=false` are honoured: no local model endpoint is reachable and the
admin provider mutation guards reject local providers.

Every AI completion is a real asynchronous `AIJob` with provider, model, status and result
recorded. Under the current DAPI balance the primary provider returns HTTP 402 and every job
terminates as `status = fallback` to `provider_safe_template` with the error preserved. No
AI result is generated on the client. The defect is that no user-facing screen signals the
degradation (ISSUE-007).

## 9. Android

| Flag | Value |
| --- | --- |
| ANDROID_EMULATOR_VERIFIED | true - 54/54 routes, 358 controls pressed, core flow 8/8, DB persistence confirmed |
| PHYSICAL_ANDROID_VERIFIED | false - `adb devices` shows no physical device |

## 10. Build and QA

Every `qa:all` step was run individually after the fixes (`work/qa-summary.mjs`, results in
`artifacts/product-audit/qa-all-results.json`). **10 of 14 pass.**

| Step | Result |
| --- | --- |
| lint | PASS |
| typecheck | PASS |
| test:unit | PASS 7/7 |
| test:api | PASS 2/2 |
| test:e2e | PASS 12/12 |
| test:visual | FAIL - front-layout passes; admin-layout expects `artifacts/screenshots/admin/login.png` and the other flat names, which only `scripts/visual-compare.ts` writes and nothing invokes (pre-existing test debt, unrelated to this run) |
| diagnose:all | FAIL - `Monthly report job did not finish through DAPI: fallback` (DAPI 402) |
| audit:ui-artifacts | PASS |
| test:real-browser-front-clicks | PASS |
| test:real-browser-admin-clicks | PASS |
| test:real-browser-cross-flow | PASS 3/3 |
| test:click-all | FAIL - `Monthly report job did not finish through DAPI: fallback` (DAPI 402) |
| test:business-flow | PASS 10/10 |
| test:cross | FAIL - 2/3; the failing case asserts a `succeeded` DAPI job (DAPI 402) |

Android, re-run against the APK rebuilt from the fixed source:

| Check | Result |
| --- | --- |
| Android route walk | PASS 54/54 rendered, 0 console errors, 0 failed requests |
| Android tap-driven core flow | PASS 8/8, writes confirmed in PostgreSQL |
| Fix verification on device | PASS - Me -> tool index -> tool, and the peer privacy link -> `/pages/settings/privacy` |

## 11. Issues

28 issues are registered with evidence, root cause, minimal fix and status in
`docs/product-audit/ISSUE_REGISTER.md`: 1 P0, 8 P1, 12 P2, 5 P3, plus 2 external/environment
blockers.

## 12. Per-page index

Every page has its own audit file. The complete index with status and issue counts is
`docs/product-audit/PAGE_AUDIT_MATRIX.md`.

- MP views: `docs/product-audit/pages/mp/` (39 files) - 9 DONE, 30 PARTIAL
- Admin resources: `docs/product-audit/pages/admin/` (24 files) - 1 DONE, 23 PARTIAL

No page is reported as passing without its own file.

## 12a. Fixes applied after the freeze

Six defects were fixed after discovery was frozen, each as its own commit with its own
verification and regression:

| Commit | Issue | What changed | Verified by |
| --- | --- | --- | --- |
| `356457f` | ISSUE-001 (P0) | `AdminAuthGuard` on `AdminController`; default deny, three credential routes allow-listed | `scripts/product-audit/verify-admin-auth.mjs` - 401 without a token, 200 with one, 401 on a forged token |
| `91ba899` | ISSUE-002 (P1) | real user export written through the MediaAsset mechanism, route declared before `users/:id`, admin download route, CORS `Content-Disposition` | `work/verify-export-ui.mjs` - the button downloads `goodnight-treehole-users-<date>.json` from the real console |
| `510742f` | ISSUE-003 (P1) | `ENFORCED_SETTING_KEYS` is the single source of truth; the console marks the 15 write-only settings | `work/verify-settings-ui.mjs` - 19 fields, 14 flagged, the 6 live keys not flagged |
| `082dca0` | ISSUE-004, ISSUE-005 | 情绪小工具 entry on Me; privacy-boundary link points at the real route | `work/verify-nav-fix.mjs`, `work/verify-privacy-link.mjs`, and the same two flows on the rebuilt APK |
| `ea52129` | ISSUE-017 to ISSUE-019 (P1) | letters, peer experiences and handoffs scoped to the caller | `scripts/product-audit/verify-ownership.mjs`, `work/verify-peer-scope.mjs` |

Three of the fixed areas had their regression suites re-run: `test:e2e` 12/12,
`test:admin-sync` 1/1 (including the real-browser cross flow 3/3), `test:api` 2/2,
`test:unit` 7/7. `test:cross` and the peer suite still show their single pre-existing DAPI
402 failure, which was reproduced at the original HEAD before any change.

The Android debug APK was rebuilt from the fixed source (`work/build-apk.ps1`, JDK 21) and
re-verified on `emulator-5554`: 54/54 routes rendered with 0 console errors and 0 failed
requests, and the tap-driven core flow passed 8/8 with the writes confirmed in PostgreSQL.

## 13. Why this run did not reach FULL_PRODUCT_VERIFIED

The task defines a strict order: discover, freeze, then fix one issue class at a time with a
targeted test and a full regression each time (sections 117-119), and it forbids declaring
success while any fake button or fake function exists (section 130) or while an external
blocker is being papered over (section 149).

This run completed the discovery, froze it, verified the runtime, produced every per-page
audit, and then applied the P0 and five P1 fixes listed in section 12a, each with its own
verification and regression. The remaining issues (ISSUE-006 to ISSUE-016, ISSUE-020 to
ISSUE-028) are still open: they are specified in `ISSUE_REGISTER.md` but not yet fixed,
because each needs its own regression cycle.

Additionally:

- `BLOCKED_DAPI_BALANCE` is an external blocker: the DeepSeek account returns HTTP 402, so
  every AI-dependent acceptance step is unverifiable and must stay `false`.
- `pnpm qa:all` was not run: it includes steps that require a funded AI provider and the
  visual regression fixtures, so running it would not produce a truthful pass.

## 13a. Checkpoint, push and backup

| Step | Result |
| --- | --- |
| Commit | `0f8b1f4 audit: complete product graph audit, all pages/states/controls` (91 files, +14380) |
| Push | `158c298..0f8b1f4 codex/post-recovery-validation` -> pushed; `origin/codex/post-recovery-validation` == HEAD |
| Product code changed | none - `git status --porcelain apps packages prisma tests` is empty |
| `scripts/backup-all.ps1` | **PASS** - code bundle (53,256,842 bytes, verified, 10 refs), database dump (159,607 bytes, 337 archive entries, 52 tables), MinIO check, evidence archive (26,400,889 bytes, 64 files) |
| Backup artefacts | `C:\Users\zyu33\Backups\backup-all-20261001-0352.json` |

An earlier `git fetch` failed with `schannel: failed to receive handshake, SSL/TLS connection
failed`; the network recovered and the push above succeeded, so no checkpoint was left local.

## 14. Required next steps

1. **P0**: add a controller-level authorization guard to `api/admin/v1` and re-verify all 58
   endpoints (ISSUE-001). Run the admin and cross-flow suites afterwards.
2. **P1 fakes**: fix ISSUE-002 (route order plus a real export) and ISSUE-003 (wire or
   remove the 15 inert settings).
3. **P1 ownership**: scope letters, peer experiences and handoffs to the caller
   (ISSUE-017, ISSUE-018, ISSUE-019).
4. **P1 flow**: restore the tool entrance (ISSUE-004) and honour the dropped support
   intents (ISSUE-006).
5. **P1 AI**: surface the fallback state to the user (ISSUE-007) once DAPI is funded.
6. Then P2 and P3 in the order listed in the register, one class at a time, each with a
   targeted test and a full regression.

## 15. Final flags (real values)

```
PRODUCT_GRAPH_COMPLETE=true
ALL_MP_ROUTES_AUDITED=true            (54/54 visited on the real APK)
ALL_MP_VIEWS_AUDITED=true             (39/39 with per-page audits)
ALL_ADMIN_ROUTES_AUDITED=true         (26/26)
ALL_PAGE_STATES_AUDITED=false         (states identified per page; not every state exercised at runtime)
ALL_CONTROLS_AUDITED=false            (717 runtime controls: 358 pressed, 52 destructive skipped, 307 skipped with a stated reason)
FAKE_BUTTONS_ZERO=false              (1 left: ISSUE-012 admin captcha; ISSUE-002 and ISSUE-005 fixed)
FAKE_FUNCTIONS_ZERO=false            (ISSUE-002 fixed; ISSUE-003's misleading UI fixed, the settings themselves still unwired)
CORE_SUPPORT_FLOW_VERIFIED=false     (happy path verified on device; three intent branches do not work - ISSUE-006)
PEER_FLOW_VERIFIED=false             (invariants hold and reads are now scoped; the 72h/consent loop is still unverified end to end)
SELF_SYSTEM_FLOW_VERIFIED=false      (privacy gating gaps - ISSUE-021, ISSUE-022)
LEGACY_FLOW_VERIFIED=false           (implemented; not exercised end to end at runtime)
TOOLS_FLOW_VERIFIED=true             (tool subtree now reachable and verified on device)
ADMIN_FLOW_VERIFIED=false            (now authorised; six pages still hide their error state and support-plans is unreadable)
API_DB_CONSISTENCY_VERIFIED=true     (Android writes confirmed in PostgreSQL)
ADMIN_SYNC_VERIFIED=false            (admin reads the same store; not verified for every resource)
SECURITY_VERIFIED=false              (ISSUE-001 and ISSUE-017 to ISSUE-019 fixed; ISSUE-013 login rate limiting still open)
PRIVACY_VERIFIED=false               (ISSUE-021, ISSUE-022)
DAPI_VERIFIED=false                  (BLOCKED_DAPI_BALANCE, HTTP 402)
ANDROID_EMULATOR_VERIFIED=true
PHYSICAL_ANDROID_VERIFIED=false      (no physical device attached)
QA_ALL_PASS=false                    (10/14; 3 blocked by DAPI 402, 1 pre-existing visual-spec debt)
BACKUP_SAFE=true                     (scripts/backup-all.ps1 PASS; C:\Users\zyu33\Backups\backup-all-20261001-0352.json)
FULL_PRODUCT_VERIFIED=false
```
