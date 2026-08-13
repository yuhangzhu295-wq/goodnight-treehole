# Goodnight Treehole Progress

## Current authoritative recovery (2026-07-21)

Phase 6 isolated visual-fixture remediation remains `IN_PROGRESS`; this section supersedes the older Phase 2/5 continuation wording below. The authoritative continuation file is `production-checkpoint.json`. The current fixture-only services (55433, 3001, 5175, 5176, 11435) have been restarted and verified without touching live PostgreSQL or live uploads. A complete 24-reference state map now exists at `artifacts/visual-fixtures/v1/reference-state-map.json`.

The old front reply-sheet visual capture was invalid because it used a query parameter to open the sheet. The runner now clicks the real `btn-open-reply` control, waits for the actual sheet, freezes capture locale/timezone/date, waits for fonts/images, disables animation, writes overlays, and rejects unknown page/scope filters. Current single-frame evidence for admin 09 is raw 8.01% / masked 7.76%, therefore it remains failed. Continue only from the exact action in `CURRENT_RECOVERY_STATE.md`; do not treat historical visual diffs as current-source acceptance.

## Current Stage

Admin rebuild Phases 0–1 are complete. The next planned work is Phase 2 content-operation page reconstruction, using `docs/admin-rebuild-audit.md` and `artifacts/checkpoints/admin-rebuild.json` as the authoritative continuation checkpoint. Existing API, PostgreSQL, Ollama, and front/admin business flows remain preserved during visual and usability reconstruction.

Phase 1 evidence (2026-07-12): all 13 real admin navigation routes were exercised in the in-app browser; row click opens and closes the detail drawer; sidebar collapse works. The production UI no longer exposes first/last-row or “查看选中” test controls. Typecheck and lint are current-run clean.

Phase 2 is complete. Dedicated user, post, reply-moderation, and feedback-ticket pages now replace the generic resource page for those four routes; browser write/reload cycles and PostgreSQL audit records confirm the real API chain. Phase 3 AI-management page reconstruction is next. The overall status remains `INCOMPLETE` until the remaining phases and cross-end acceptance are complete.

Recovery audit: Phases 1–4 are `VERIFIED_PASS`. Phase 2 includes a current-run, full `pnpm diagnose:front-layout` exit code 0 in 20.61 seconds; Docker is recorded only as `DEPLOYMENT_DOCKER_UNVERIFIED`. Phase 3 uses relation-backed PostgreSQL runtime reads/writes, with `RuntimeState` reduced to a 132-byte `relational-primary` marker. Phase 4 completed current-run browser flows across all 14 front pages. The next active work is Phase 5's 10-page admin operation and cross-end synchronization flows.

Authoritative recovery state: `docs/resume-reconciliation.md` and `artifacts/resume/checkpoint.json`.

Current overall status: `IN_PROGRESS`.

## Current Recovery Chain (2026-07-13)

- Phase 3/4 dedicated-admin browser verification passed: provider scan/test/toggle, route persistence and AI-job detail tabs, reply presets, FAQ, feedback categories, system-setting refresh persistence, and audit before/after drawers.
- Current-run lint, typecheck, e2e, business-flow, admin/front/cross real-browser flows, admin-sync-full, and AI routing with real Ollama plus template fallback all passed.
- A clean service restart restored API, front, admin, PostgreSQL, and Ollama health.
- Phase 6 remains active: front layout diagnostics pass with no horizontal scroll, but current reference-image diffs remain above the required visual threshold (admin 7.58%–11.84%; front 11.39%–24.00%).

## Recovery Evidence

- 2026-07-12 visual-reconstruction baseline: current services and admin functional evidence were frozen in `artifacts/test-report/admin-functional-baseline-before-visual.md`; visual work is limited to the current admin UI shell and page structures.
- 2026-07-12 Phase 5 replay: completed provider/routing/job, feedback, system-setting, audit, restart, and front/admin synchronization flows. Current 10-page admin capture/diff is complete but fails visual thresholds (8.89%–27.47%); Phase 5 remains `PARTIAL`. See `artifacts/test-report/phase5-admin-sync-report.md`.
- 2026-07-12 19:00 Phase 2 replay: the complete parent command `pnpm diagnose:front-layout` exited 0 in 22.4s, current screenshot/diff smoke commands exited 0, and `pnpm typecheck` exited 0. See `artifacts/test-report/phase2-toolchain-replay-20260712-1900.md`.
- `pnpm audit:design-references` exited 0 on 2026-07-12 and wrote `artifacts/resume/phase1-design-reference-audit.json`.
- Process/port restart evidence: `artifacts/resume/process-and-port-audit.md`.
- PostgreSQL real-schema evidence: `artifacts/test-report/postgresql-real-schema-audit.md`.
- Phase 2 current-run checks: `artifacts/test-report/phase2-toolchain-audit.md`.
- Phase 2 timeout repair and full-layout evidence: `artifacts/test-report/phase2-toolchain-report.md`.
- Phase 3 relational migration, SQL, foreign-key, restart, front/admin consistency, and typecheck evidence: `artifacts/test-report/phase3-relational-migration-report.md`.
- Phase 4 browser, upload, AI, persistence, clear-data, feedback, and cross-end evidence: `artifacts/test-report/phase4-front-business-flow-report.md`.

## Historical Implementation Inventory (not current-run verification)

- Removed the front and admin design-image shell / transparent hotspot interaction pattern.
- Rebuilt the front app as visible Chinese DOM routes with stable `data-testid` controls.
- Rebuilt the admin app as visible Chinese DOM pages with stable `data-testid` controls.
- Kept `04-树洞详情-回复抽屉打开态` as a bottom sheet state inside `/pages/post/detail`.
- Bound front actions to `/api/v1/*` and admin actions to `/api/admin/v1/*`.
- Added `/api/health` and runtime fingerprint checks.
- Added diagnosis scripts for runtime, DOM overlays, routes, API bindings, clickability, and UI artifact audits.
- Rewrote real-browser front/admin/cross-flow tests to use real visible controls instead of coordinate-only checks.
- Generated contracts, DOM maps, clickability reports, screenshots, traces, and real-user reports.
- 2026-07-10: Rebuilt the generic admin resource shell into resource-specific tables, actions, and structured details.
- 2026-07-10: Replaced fake dashboard trend text with API-aggregated dashboard metrics.
- 2026-07-10: Removed default admin credentials from the login UI while preserving real seeded login.
- 2026-07-10: Added public/admin config linkage so `allowHumanRepliesDefault` saved in admin disables the front reply sheet.
- 2026-07-10: Added `scripts/admin-sync-full-report.ts` and generated admin API, UI, cross-flow, and consistency reports.

## Main Files Changed

- `apps/mp/src/App.vue`
- `apps/mp/src/InteractionLayer.vue`
- `apps/mp/src/styles.scss`
- `apps/mp/src/views/*`
- `apps/admin/src/App.vue`
- `apps/admin/src/InteractionLayer.vue`
- `apps/admin/src/styles.scss`
- `apps/admin/src/views/*`
- `apps/api/src/controllers.ts`
- `apps/api/src/app.module.ts`
- `scripts/diagnose/*`
- `scripts/real-browser-front-clicks.ts`
- `scripts/real-browser-admin-clicks.ts`
- `scripts/real-browser-cross-flow.ts`
- `tests/e2e/*`
- `docs/current-interaction-audit.md`
- `docs/admin-current-diagnosis.md`
- `docs/data-source-audit.md`
- `docs/front-admin-api-matrix.md`
- `docs/admin-page-function-matrix.md`
- `docs/front-admin-business-flow.md`
- `docs/admin-rebuild-report.md`
- `docs/front-admin-sync-report.md`

## Required Reports

- `artifacts/diagnosis/runtime-fingerprint.json`
- `artifacts/diagnosis/dom-overlay-report.md`
- `artifacts/diagnosis/route-binding-report.json`
- `artifacts/diagnosis/api-binding-report.md`
- `artifacts/diagnosis/clickability-report.json`
- `artifacts/diagnosis/clickability-report.md`
- `artifacts/diagnosis/ui-artifact-audit.md`
- `tests/contracts/front-interactions.json`
- `tests/contracts/admin-interactions.json`
- `artifacts/test-report/real-user-front.md`
- `artifacts/test-report/real-user-admin.md`
- `artifacts/test-report/real-user-cross-flow.md`
- `artifacts/test-report/click-all-report.md`
- `artifacts/test-report/business-flow-report.md`
- `artifacts/test-report/admin-api-report.md`
- `artifacts/test-report/admin-ui-report.md`
- `artifacts/test-report/front-admin-cross-flow-report.md`
- `artifacts/test-report/database-consistency-report.md`
- `artifacts/screenshots/real-user`
- `artifacts/screenshots/admin`
- `artifacts/screenshots/cross-flow`
- `artifacts/traces`

## Historical Verification Claims (unverified after interruption)

The following entries are retained as historical context only. They cannot be used as PASS evidence until their corresponding command is rerun in the current recovery chain with new artifacts, exit code 0, API/database evidence, and (where required) screenshots/diffs/traces.

Passed on 2026-07-04:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:api`
- `pnpm test:e2e`
- `pnpm test:visual`
- `pnpm diagnose:all`
- `pnpm audit:ui-artifacts`
- `pnpm test:real-browser-front-clicks`
- `pnpm test:real-browser-admin-clicks`
- `pnpm test:real-browser-cross-flow`
- `pnpm test:click-all`
- `pnpm test:business-flow`
- `pnpm test:cross`
- `pnpm qa:all`

Latest report summary:

- Clickability diagnosis: 109 total, 109 passed, 0 failed.
- Click-all: 109 total, 109 passed, 0 failed.
- Business flow: 10 total, 10 passed, 0 failed.
- Real browser front: 8 total, 8 passed, 0 failed.
- Real browser admin: 6 total, 6 passed, 0 failed.
- Real browser cross-flow: 3 total, 3 passed, 0 failed.

Passed on 2026-07-10:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:api`
- `pnpm test:admin-sync-full`
- `pnpm test:real-browser-admin-clicks`
- `pnpm test:real-browser-cross-flow`
- `pnpm test:real-browser-front-clicks`

Latest 2026-07-10 report summary:

- Admin API: 3 total, 3 passed, 0 failed.
- Admin UI: 17 total, 17 passed, 0 failed.
- Front/Admin cross-flow: 4 total, 4 passed, 0 failed.
- Database consistency: 1 total, 1 passed, 0 failed.
