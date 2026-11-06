# HelpFaqs

Source: `apps/mp/src/views/HelpFaqs.vue`

Routes: `/pages/help/faqs`

## PURPOSE

HelpFaqs is the full FAQ list. It renders every enabled FAQ item with an accordion, and nothing else - no form, no ticket history, no support card. It is the "see all questions" destination that FeedbackHelp's five-item preview links to.

## USER_JOB

"I want to read the complete list of questions and answers before I bother the team with a ticket."

## ENTRY

- FeedbackHelp `btn-faq-all` ("查看全部问题") -> `router.push('/pages/help/faqs')` (`apps/mp/src/views/FeedbackHelp.vue:174`). This is the only inbound control.

The route is not in `tabbarPaths` (`apps/mp/src/App.vue:14-39`), so no bottom bar renders here.

## EXIT

None forward. The only control is `front-faqs-back` -> `router.back()` (`HelpFaqs.vue:31`). The page's job ends by returning to FeedbackHelp.

## ROUTES

`/pages/help/faqs` (`apps/mp/src/router.ts:105`; `mp-routes.json` `aliasCount: 1`, CURRENT). Single route.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading ("正在读取常见问题…") | `loading` | `HelpFaqs.vue:10`, `:13`, `:29` |
| load error line | `loadError` | `HelpFaqs.vue:11`, `:33` |
| populated accordion | `faqs` | `HelpFaqs.vue:8`, `:35-44` |
| empty ("暂时没有可展示的常见问题。") | `!faqs.length` | `HelpFaqs.vue:45` |
| open question | `opened` | `HelpFaqs.vue:9`, `:40`, `:43` |

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| `front-faqs-back` | `router.back()` (`HelpFaqs.vue:31`) | history back |
| question row `faq-full-<n>` | `opened = opened === faq.id ? '' : faq.id` (`HelpFaqs.vue:40`) | toggles that answer; accordion, one open at a time |

Cross-check: `control-manifest.json` lists 4 controls for this view (the back click and test id, the toggle click and the test id); `android-route-manifest.json` shows 3 buttons and 3 test ids, 0 console errors.

## API_READS

- `GET /api/v1/feedback/faqs` (`HelpFaqs.vue:17`) -> `controllers.ts:1676-1687` -> enabled `FaqItem` rows sorted by `sortOrder`, with `?? []` defensive defaulting on the client (`HelpFaqs.vue:17`).

## API_WRITES

None. (Matches `mp-routes.json`: writes "(none)".)

## DB_ENTITIES

- Reads: **FaqItem**.
- Writes: none.
- Cross-checked against `artifacts/product-audit/db-models.json`.

## ADMIN_VISIBILITY

Yes, and this page is the read side of that admin resource. Resource **faqs** -> admin route `/ops/faqs` (`apps/admin/src/router.ts:47`, label FAQ 管理) -> `GET/POST/PUT/PATCH/DELETE /api/admin/v1/faqs` (`apps/api/src/controllers.ts:2713-2776`). The public controller deliberately serves exactly the rows the admin CRUD writes and refuses to inject display-only fallback questions (`controllers.ts:1677-1679`), so a disabled or deleted FAQ disappears here after the next reload.

## AI_USAGE

None. No AiJob is created or read; the questions and answers are human-authored admin content and there is no `generationStatus` on this path.

## PRIVACY

None. The endpoint is unscoped - every enabled FAQ is served to every caller and no `PrivacySetting` flag gates it. There is no user-specific data on the page.

## ERROR_STATES

Yes: `loadError` renders as `<p class="help-faq-error" role="status">` (`HelpFaqs.vue:11`, `:33`), set by the `catch` in `load()` with the fallback "常见问题加载失败，请稍后重试。" (`HelpFaqs.vue:20-22`). It is rendered inside the `<template v-else>` branch, so it only appears after loading finishes - which is correct ordering. Unlike FeedbackHelp, a failure here does not also render an empty list, because `v-if="loadError"` and `v-if="faqs.length"` are separate siblings (`HelpFaqs.vue:33`, `:35`); a failed load therefore shows the error line with no list and no "no FAQs" copy. Good.

## EMPTY_STATES

Yes: `<p v-else class="help-faq-state">暂时没有可展示的常见问题。</p>` (`HelpFaqs.vue:45`). Because the `v-else` pairs with `v-if="faqs.length"` inside the loaded branch, this copy is shown only when the load succeeded and returned zero rows - a genuine empty state, correctly distinguished from the error.

## NATIVE_RISKS

- Safe area: `padding: 0 14px calc(132px + env(safe-area-inset-bottom))` (`HelpFaqs.vue:57`). The page is not in `tabbarPaths`, so the 132px reserve is generous but harmless.
- Keyboard: no text input on the page.
- Back button: no custom handling; Android BACK walks WebView history (`native/back-button.ts:26-33`). Reached from FeedbackHelp, so BACK returns there.
- No dial intent, no clipboard, no file input.

## ISSUES

- P2 UX: the narrow-screen layout is broken. The `@media (max-width: 374px)` block sets `grid-template-columns: 38px minmax(0, 18px)` on the question row (`HelpFaqs.vue:103`), where the intent is clearly `minmax(0, 1fr)`. On any device narrower than 375px the question text is squeezed into an 18px column, so every question renders as a sliver. The desktop/wide rule at `HelpFaqs.vue:77` uses the correct `minmax(0, 1fr)`.
- P2 DUPLICATE: the FAQ accordion is implemented twice - here (all items, `HelpFaqs.vue:35-44`) and in FeedbackHelp (first 5, `FeedbackHelp.vue:157-172`). They share the same `/api/v1/feedback/faqs` endpoint and the same open/close semantics but have separate markup, styles and test-id schemes (`faq-full-<n>` vs `faq-item-<n>`). A change to one does not reach the other.
- P3 UX: the question label is `white-space: nowrap` with `text-overflow: ellipsis` (`HelpFaqs.vue:92`), so a long question is truncated with no way to read it in full before expanding; expanding shows the answer but never the full question.
- P3 UX: `opened` is not reset when the list reloads, so if a reload returns a different set of ids the previously open item simply closes without explanation. Minor.
- P3 ORPHAN: `/pages/help/faqs` has exactly one inbound control and no tab entry; if FeedbackHelp is ever reworked the page becomes unreachable.

## FINAL_STATUS

PARTIAL - the single read, both states, the admin counterpart and the accordion are traced from source, and the route renders on the real Android APK with 3 controls and 0 console errors; the narrow-screen media query defect was found by reading the CSS and was not reproduced on the 430px-wide emulator.

Group recommendation: **MERGE_CANDIDATE**. HelpFaqs is a thin, single-purpose page that duplicates the FAQ accordion already inside FeedbackHelp and shares its only entry point with it. It complements the newer Journey/Peer/Self system in no way (that system has no FAQ surface), so it is not a conflict - but it is a merge candidate: the "see all" affordance could be an expand-in-place in FeedbackHelp, retiring the duplicate markup and the broken narrow-screen rule. Do not delete.

### Static evidence

- Controls discovered: 4
- API reads (static): `/api/v1/feedback/faqs`
- API writes (static): (none)
- Candidate fake markers: 0
- Appended: `controllers.ts:1677-1679` documents that the public FAQ list intentionally serves the same records the admin CRUD writes, with no display-only fallback injection.
- Appended: the `max-width: 374px` rule at `HelpFaqs.vue:103` uses `minmax(0, 18px)` where `minmax(0, 1fr)` is required.

