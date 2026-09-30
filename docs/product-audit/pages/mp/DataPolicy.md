# DataPolicy

Source: `apps/mp/src/views/DataPolicy.vue`

Routes: `/pages/settings/data-policy`

## PURPOSE

DataPolicy is the plain-language account of what the product stores and what the privacy switches change. It is a static explanatory page with no data of its own: it exists so that the 账号与数据说明 entry in PrivacySettings lands somewhere with the full text rather than a one-line modal.

## USER_JOB

"I want to know what you keep about me and what my privacy choices actually affect, before I decide whether to trust this app with my feelings."

## ENTRY

- PrivacySettings explain modal, 查看完整说明, `data-testid=btn-data-policy-route` -> `router.push('/pages/settings/data-policy')` (`apps/mp/src/views/PrivacySettings.vue:366`).

That is the only entry. A repo-wide search for `/pages/settings/data-policy` in `apps/mp/src` returns the route declaration (`apps/mp/src/router.ts:103`), the modal button above, and nothing else.

## EXIT

Back only: `router.back()` (`DataPolicy.vue:10`). There is no forward control on the page and no next step in a job flow; the user returns to the privacy screen they came from.

## ROUTES

`/pages/settings/data-policy` (`apps/mp/src/router.ts:103`). Single route, no aliases. It is **not** in `tabbarPaths` (`apps/mp/src/App.vue:7-40`), so the bottom tab bar is hidden, even though `activeTab` would classify it as 我的 (`App.vue:62-68`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| static content | none - the component declares only `router` | `DataPolicy.vue:1-6` |

There is exactly one state. The view has no refs, no fetch and no conditionals in the template, so it cannot render loading, empty or error.

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| ‹ (`front-data-policy-back`) | `router.back()` | history back |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 2 controls for this view (the click and its testid, both at line 10); `artifacts/post-recovery/control-coverage.json` records 1 visible control on the real APK, clicked, result "changed".

## API_READS

None. No `api.` call and no `fetch` in the file.

## API_WRITES

None.

## DB_ENTITIES

None read or written by this page. The copy describes retention of **Mood**, **Letter**, **Diary**, **Favorite** and **FeedbackTicket**; those are the models the sentence names, not records the page touches.

## ADMIN_VISIBILITY

Not applicable - the page owns no data. The behaviour it describes is operator-visible elsewhere: `/users` (`apps/admin/src/router.ts:41`) exposes each user's privacy row through `GET /api/admin/v1/users/:id`, which returns `{ item, privacy }` (`apps/api/src/controllers.ts:2102-2105`).

## AI_USAGE

None. No AiJob is created or read, and the page makes no claim about AI. The text does not mention AI at all.

## PRIVACY

This page is the human-readable companion of `PrivacySetting`. Its two substantive claims check out as follows.

- "隐私设置会影响新内容的默认可见范围" - the flag exists (`prisma/schema.prisma:207-226`, `allowDataExport` and `defaultVisibility`) and is written by `PUT /api/v1/settings/privacy` (`apps/api/src/controllers.ts:1620-1652`), but the compose screen hardcodes `visibility: 'PRIVATE'` (`apps/mp/src/views/MoodCreate.vue:35`) and never reads the setting, so on the client the claim is not implemented. See ISSUES.
- "是否允许真人回应" - real: `decoratePost` computes `allowHumanReplies` from the owner's privacy row and the system default (`apps/api/src/store.service.ts:1863-1877`).
- "月报分享图的生成偏好" - real: `MonthlyReportService.poster()` throws `ForbiddenException` unless `allowMonthlyReportShare` is true (`apps/api/src/monthly-report.service.ts:452-455`).

## ERROR_STATES

None. The page performs no I/O, so there is no failure path to render. This is correct for a static page, not a finding.

## EMPTY_STATES

Not applicable - there is no collection.

## NATIVE_RISKS

- Safe area: the file carries no styles, so it relies on the shared `.goodnight-page` rule (`apps/mp/src/styles.scss:4145-4147`), which pads `calc(130px + env(safe-area-inset-bottom))`. Because the route is not a tab route, that 130px is dead space above the bottom edge.
- Back button: no custom handling; BACK walks WebView history (`apps/mp/src/native/back-button.ts:30-36`), returning to PrivacySettings.
- No keyboard, dial intent, clipboard or external link on this page.

## ISSUES

- P2 FUNCTIONAL: the page states that privacy settings govern "新内容的默认可见范围", but the only compose screen ignores the setting and hardcodes PRIVATE (`apps/mp/src/views/MoodCreate.vue:35`, no read of `/api/v1/settings/privacy` anywhere in `apps/mp/src/views` except MemoryCenter and PrivacySettings). A user who flips 默认仅自己可见 to PUBLIC sees no change in behaviour, and the operator bulk-write of `defaultVisibility` (`apps/api/src/controllers.ts:2949-2951`) has no client effect either.
- P3 UX: the page is a fixed block of prose with no version, effective date or link back to the switches it describes, so a user cannot tell when the policy changed or act on it from here.

## FINAL_STATUS

DONE - the page is static, its single control, its route and its two substantive claims are traced to lines, and the APK manifest shows it rendered with 1 control and 0 console errors.

### Static evidence

- Controls discovered: 2
- API reads (static): (none)
- API writes (static): (none)
- Candidate fake markers: 0
- Appended: runtime cross-check `artifacts/recovery/android-route-manifest.json` - `/pages/settings/data-policy` rendered=true, textLength 104, 1 visible control, 0 console errors, 0 failed requests.