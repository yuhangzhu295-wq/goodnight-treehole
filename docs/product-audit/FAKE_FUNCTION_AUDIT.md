# FAKE FUNCTION AUDIT

Scope: the whole product surface at HEAD `158c298` - 39 mp views, 16 admin view
components across 24 admin resources, and the 264 API endpoints in
`apps/api/src/controllers.ts`.

## 1. Scanning method

Static pass (reproducible with `node work/generate-discovery.mjs`):

1. Every `.vue` file under `apps/mp/src/views` and `apps/admin/src/views` was scanned for
   `@click`, `@submit`, `@change`, `@input`, `RouterLink`, `router.push`, `window.open`,
   `tel:`, `role=button|link|switch|tab` and `data-testid`. That produced 940 static
   bindings in `artifacts/product-audit/control-manifest.json`.
2. A marker sweep produced `artifacts/product-audit/fake-markers.json` for `TODO`, `FIXME`,
   `mock`, `fake`, `placeholder`, `demo`, `stub`, `console.log`, `setTimeout`,
   `Math.random`, `localStorage`, `simulate`, `dummy` and hard-coded arrays.
3. Every API target reachable from a view was extracted and matched against the 264 real
   endpoints, which is what exposed the dead `router.push('/pages/privacy/index')` target.

Marker hits are candidates only. Each one was opened and judged on its real business
purpose, per task section 25. Local UI state (modal open, selected tab, input draft) is not
a fake by definition (task section 26).

Runtime pass (real Android debug APK on `emulator-5554`, CDP over
`adb forward tcp:9333 localabstract:webview_devtools_remote`):

1. `scripts/recovery/android-route-walk.mjs` - all 54 routes navigated; every page rendered,
   0 console errors, 0 failed network requests.
2. `scripts/recovery/android-control-coverage.mjs --click` - 717 controls enumerated on the
   device, 358 pressed with real `adb shell input tap`, 52 destructive controls skipped by
   policy, 49 text fields and 131 links skipped with a stated reason. Result of every press
   recorded in `artifacts/post-recovery/control-coverage.json`.
3. `scripts/recovery/android-business-flow.mjs stage1-core` - a real gesture-driven flow:
   type an entry, submit, confirm the fingerprint, open the action tab, request and accept a
   plan. 8/8 steps passed and the writes were confirmed in PostgreSQL
   (`LifeJourney journey_044afe1bc1`, `ActionCommitment action_826fbc0efe`,
   `SituationSnapshot` count 5).
4. Direct API probes with and without credentials (`work/verify-findings.mjs`,
   `work/verify-admin-auth.mjs`, `work/verify-unauth-delete.mjs`).

## 2. Result

| Class | Count |
| --- | ---: |
| Static marker candidates adjudicated | 64 |
| FAKE | 4 |
| NOT_FAKE (false positives) | 58 |
| NEEDS_RUNTIME_CHECK | 2 |

`FAKE_BUTTON_COUNT = 3` (ISSUE-002, ISSUE-005, ISSUE-012).
`FAKE_FUNCTION_COUNT = 2` (ISSUE-002, ISSUE-003).

## 3. The fake findings

| Id | Location | Claim | What actually happens | Severity |
| --- | --- | --- | --- | --- |
| ISSUE-002 | `apps/admin/src/views/UsersPage.vue:104` (dup `TablePage.vue:471`) | 导出文件已生成 | `GET /api/admin/v1/users/export` returns `{}` because `users/export` is shadowed by `users/:id`; the returned `downloadUrl` points at a file nothing writes. Verified live. | P1 |
| ISSUE-003 | `apps/admin/src/views/ConfigPage.vue:18-49` (mirror `TablePage.vue:817-839`) | setting saved and effective | 19 keys are written to `SystemSetting` but 15 are never read by any backend logic. The write is real; the capability is not. | P1 |
| ISSUE-005 | `apps/mp/src/views/PeerNetwork.vue:63` | 看看隐私边界 | `router.push('/pages/privacy/index')` - the route does not exist in `apps/mp/src/router.ts`; the real route is `/pages/settings/privacy`. | P2 |
| ISSUE-012 | `apps/admin/src/views/Login.vue:119-127` | captcha required | The captcha value is never validated on the client or the server. | P2 |

## 4. The two runtime checks, resolved

Both were resolved without a new runtime probe, because the code already answers them:

- `apps/admin/src/views/TablePage.vue:842-912` action-panel branches - the admin router
  only feeds `TablePage` the `experience/*` and `safety/*` resources
  (`apps/admin/src/router.ts` filter), so the users/posts/replies/providers/routes/jobs/
  tickets/settings/faqs/presets/categories branches never render. Dead code, not a
  clickable fake. Recorded as P3 in ISSUE-014.
- `apps/mp/src/views/MoodCreate.vue:78-87` optimistic upload placeholder - the placeholder
  object is replaced by the real `uploadMedia()` response and removed on failure, so the UI
  never claims an upload that did not happen.

## 5. Confirmed NOT fake (the important negative results)

These are the categories the task calls out explicitly, and the product is clean on all of
them:

- **No mock business data presented as production data.** All lists are read from the API;
  the only hard-coded arrays are empty-state fallbacks (`LetterToday.vue:51`) and label
  dictionaries (`TablePage.vue:86`).
- **No `setTimeout` simulating an AI result.** All eight `setTimeout` sites are polling
  loops on `GET /api/v1/ai/tasks/:id` that stop on `succeeded`/`fallback`/`failed`.
- **No `localStorage` pretending to be server persistence.** It holds the admin token and
  backs a genuine device-cache clear.
- **No frontend-generated match results.** Matching is server-side
  (`store.service.ts:3800`) and persisted.
- **No randomly generated monthly report.** Figures come from real aggregation in
  `monthly-report.service.ts`; there is no `Math.random` in either front end.
- **No fake notifications.** `NotificationCenter` reads `GET /api/v1/notifications` and
  marks read through the API.
- **No fake FutureSelf delivery.** A real BullMQ `FollowUpJob` and worker create the
  notification and stamp `deliveredAt`.
- **No fake archive export URL.** `POST /api/v1/archive/journeys/:id/export` writes a real
  file served by `GET /api/v1/exports/:assetId/download`. This is the honest counterpart to
  the admin export defect in ISSUE-002.
- **No admin table backed by fixed arrays.** `Dashboard` and every `TablePage` resource read
  live endpoints.
- **AI failure is recorded, not hidden.** Every `AIJob` keeps `status = fallback` and the
  provider error string (`provider_dapi_deepseek: Remote provider returned HTTP 402`).
  The defect is that the *user interface* does not surface it (ISSUE-007), not that the
  system lies in its records.

## 6. Why this file exists even with findings

Task section 142 requires the report to exist and to state the method even when the count is
zero. The count is not zero, so the four findings above are the actionable output; the
negative results in section 5 are recorded so a future run does not re-litigate them.
