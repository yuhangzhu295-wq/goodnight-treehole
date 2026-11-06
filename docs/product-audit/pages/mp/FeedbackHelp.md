# FeedbackHelp

Source: `apps/mp/src/views/FeedbackHelp.vue`

Routes: `/pages/help/feedback`, `/pages/feedback/index`

## PURPOSE

FeedbackHelp is the in-app support surface. It shows the five most relevant FAQs, hosts the feedback form that creates a real operator ticket (text plus up to two screenshot attachments and a category), lists the user's own past tickets with their admin replies, and surfaces the emergency-support card and dialog.

## USER_JOB

"I have a problem or an idea; I want to check whether it is already answered, tell the team about it with a screenshot, and see whether they answered my earlier reports."

## ENTRY

- Me 帮助与反馈 entry `entry-feedback` -> `/pages/help/feedback` (`apps/mp/src/views/Me.vue:102`).
- Both paths are in `tabbarPaths` (`apps/mp/src/App.vue:35-36`), so the bottom bar renders and `activeTab` resolves to `me` (`App.vue:59-66`).
- No other control pushes this route; `/pages/feedback/index` is URL-only in the MP UI (the API still seeds a ticket with that `sourcePage`, `store.service.ts:885`).

## EXIT

- `btn-faq-all` -> `/pages/help/faqs` (`FeedbackHelp.vue:174`).
- `front-feedback-back` -> `router.back()` (`FeedbackHelp.vue:146`).
- Submitting a ticket stays on the page and re-reads the ticket list (`FeedbackHelp.vue:128-129`).

## ROUTES

`/pages/help/feedback` and `/pages/feedback/index` both mount `FeedbackHelp` (`apps/mp/src/router.ts:104`, `:106`; `mp-routes.json` aliasGroup of size 2, `legacyOrCurrent: ALIAS`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading (whole page replaced) | `loading` | `FeedbackHelp.vue:19`, `:141`, `:271` |
| load error banner | `loadError` | `FeedbackHelp.vue:20`, `:154` |
| FAQ accordion open | `openedFaq` | `FeedbackHelp.vue:16`, `:161`, `:167` |
| visible FAQs (max 5) | `visibleFaqs` | `FeedbackHelp.vue:28`, `:158` |
| feedback text + counter | `content` / `characterCount` | `FeedbackHelp.vue:10`, `:29`, `:194` |
| upload slots (2), each occupied or uploading | `assets` / `uploadingSlot` / `removingSlot` | `FeedbackHelp.vue:11`, `:21-22`, `:199-215` |
| prepared-screenshot notice | `attachmentCount` | `FeedbackHelp.vue:30`, `:218` |
| submitting | `submitting` | `FeedbackHelp.vue:23`, `:108`, `:220` |
| form status message | `formMessage` | `FeedbackHelp.vue:21`, `:223` |
| category picker sheet open | `categoryPickerOpen` | `FeedbackHelp.vue:26`, `:225` |
| ticket history (or empty) | `tickets` | `FeedbackHelp.vue:13`, `:250-258` |
| emergency support dialog open | `support` | `FeedbackHelp.vue:18`, `:247`, `:261` |
| per-ticket status label | `statusLabel(ticket.status)` | `FeedbackHelp.vue:54-56`, `:253` |

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| `front-feedback-back` | `router.back()` (`FeedbackHelp.vue:146`) | history back |
| FAQ row `faq-item-first` / `faq-item-<n>` | `openedFaq = ...` (`FeedbackHelp.vue:165`) | toggles the answer |
| `btn-faq-all` | inline push (`FeedbackHelp.vue:174`) | `/pages/help/faqs` |
| 更改类型 | `categoryPickerOpen = true` (`FeedbackHelp.vue:181`) | opens the category sheet |
| `input-feedback-content` | `v-model` | free text, maxlength 500 |
| `input-feedback-upload` (file) | `chooseFile` (`FeedbackHelp.vue:197`) | uploads the picked file into the pending slot |
| `btn-feedback-upload` / `btn-feedback-upload-2` | `chooseUploadSlot(slot)` (`FeedbackHelp.vue:207`) | sets `pendingSlot`, opens the picker |
| per-slot remove button | `removeAsset(slot)` (`FeedbackHelp.vue:203`) | `deleteMedia(asset.id)` |
| `btn-feedback-submit` | `submit` (`FeedbackHelp.vue:220`) | validates, `POST /api/v1/feedback`, re-reads tickets |
| `select-feedback-category` | `v-model="categoryId"` (`FeedbackHelp.vue:230`) | picks the category |
| 确认 (sheet) | `categoryPickerOpen = false` (`FeedbackHelp.vue:235`) | closes the sheet |
| `btn-support-more` | `support = true` (`FeedbackHelp.vue:247`) | opens the emergency dialog |
| `btn-support-close` | `support = false` (`FeedbackHelp.vue:266`) | closes it |

Cross-check: `control-manifest.json` lists 27 controls; `android-route-manifest.json` shows 9 buttons + 1 input + 1 textarea + 4 links + 4 tabs (15 visible), 16 test ids, 0 console errors.

## API_READS

- `GET /api/v1/feedback/faqs` (`FeedbackHelp.vue:39`) -> `controllers.ts:1676-1687` -> enabled `FaqItem` rows sorted by `sortOrder`. The controller comment at `controllers.ts:1677-1679` explicitly refuses to inject display-only fallback questions.
- `GET /api/v1/feedback/categories` (`FeedbackHelp.vue:40`) -> `controllers.ts:1669-1674` -> enabled `FeedbackCategory` rows sorted by `sortOrder`.
- `GET /api/v1/feedback` (`FeedbackHelp.vue:41`, and again at `:128` after submit) -> `controllers.ts:1704-1711` -> the caller's own **FeedbackTicket** rows, decorated.

All three are issued together in one `Promise.all` (`FeedbackHelp.vue:38-42`), so a single failure trips the shared `loadError`.

## API_WRITES

- `POST /api/v1/feedback` (`FeedbackHelp.vue:119-124`) with `{categoryId, content, sourcePage: '/pages/help/feedback', assetIds}`. Handler `controllers.ts:1689-1702` -> `store.createFeedbackTicket` (`apps/api/src/store.service.ts:1527-1569`). Model written: **FeedbackTicket** (`status: 'open'`, `priority: 'medium'`).
- `POST /api/v1/media/upload` (`apps/mp/src/api.ts:17-24`) per screenshot -> **MediaAsset**.
- `DELETE /api/v1/media/:id` (`api.ts:26-32`) on remove/replace -> **MediaAsset**.

The `sourcePage` is validated server-side to start with `/pages/` and be ≤160 chars (`store.service.ts:1544-1550`), and `assetIds` are resolved through `resolveFeedbackScreenshotIds` so raw URLs cannot be smuggled in as screenshots (`store.service.ts:1552`, comment at `controllers.ts:1697-1699`).

## DB_ENTITIES

- Reads: **FaqItem**, **FeedbackCategory**, **FeedbackTicket**.
- Writes: **FeedbackTicket** (create), **MediaAsset** (upload/delete).
- Cross-checked against `artifacts/product-audit/db-models.json`.

## ADMIN_VISIBILITY

Yes, and it is the direct counterpart. Resource **tickets** -> admin route `/ops/feedback` (`apps/admin/src/router.ts:40`, label 反馈工单) -> `GET /api/admin/v1/feedback` (`apps/admin/src/views/TablePage.vue:47`, `apps/api/src/controllers.ts:2644`). The operator replies with `POST/PATCH /api/admin/v1/feedback/:id/reply` (`controllers.ts:2663-2686`) -> `store.replyToFeedbackTicket` (`store.service.ts:1576-1592`), which sets `reply`, `repliedBy`, `repliedAt` and moves `open -> processing`. That reply is exactly what this page renders at `FeedbackHelp.vue:255`. The FAQ list is admin-managed through **faqs** -> `/ops/faqs` (`apps/admin/src/router.ts:47`) and the category list through **categories** -> `/ops/feedback-categories` (`apps/admin/src/router.ts:48`).

## AI_USAGE

None. No AiJob is created or read by this page, and no `generationStatus` is consulted. The FAQ answers are human-authored admin content; the ticket reply is a human operator's text. There is no AI in this path, so the DAPI 402 blocker does not affect it.

## PRIVACY

- The ticket read is scoped to the caller: `controllers.ts:1707-1709` filters `item.userId === getDemoUserId()`.
- The page collects and uploads screenshots; `createFeedbackTicket` resolves them to assets owned by the current user (`store.service.ts:1552` -> `resolveFeedbackScreenshotIds`).
- No `PrivacySetting` flag gates this page - support is available regardless of privacy choices. Note the emergency card always shows the national hotline 12356 (`FeedbackHelp.vue:245`) to every user unconditionally.

## ERROR_STATES

Yes, two distinct ones:
1. `loadError` banner under the hero when any of the three parallel reads fails (`FeedbackHelp.vue:20`, `:36-52`, `:154`), with the fallback copy "帮助内容加载失败，请稍后重试。".
2. `formMessage` under the submit button for validation and submit failures (`FeedbackHelp.vue:21`, `:223`): "请先写下你遇到的问题或建议。" for empty text (`:111-114`), the server message or "提交失败，请确认网络后重试。" on failure (`:130-132`), and upload/delete failures (`:85`, `:101-103`).

Note that `loadError` does not suppress the rest of the page: the FAQ section, the form and the history still render (with empty data), so a failed load shows the banner plus an empty FAQ list and an empty history at the same time.

## EMPTY_STATES

Yes, three:
- FAQs: "暂时没有可展示的常见问题。" (`FeedbackHelp.vue:173`).
- Ticket history: "还没有提交过反馈，遇到问题可以告诉我们。" (`FeedbackHelp.vue:258`).
- Screenshot slots: two empty upload buttons (`FeedbackHelp.vue:205-215`), with the preview notice hidden when `attachmentCount` is 0.

The FAQ empty copy is honest and, per `controllers.ts:1677-1679`, is not papered over with fake questions.

## NATIVE_RISKS

- Safe area: `padding: 0 14px calc(132px + env(safe-area-inset-bottom))` (`FeedbackHelp.vue:279`). Clears the tab bar.
- Keyboard: the 500-char textarea and the file picker both raise the keyboard; the submit button follows in flow (`FeedbackHelp.vue:220`), so a raised keyboard can cover it. No viewport handling. UNCONFIRMED at runtime.
- File input: the hidden `<input type="file">` (`FeedbackHelp.vue:197`) delegates to the Android document picker. On Capacitor this opens an external activity; returning from it without choosing leaves `pendingSlot` set but no upload, which is harmless.
- Back button: no custom handling; Android BACK walks WebView history (`native/back-button.ts:26-33`). The category sheet and the support dialog are plain `v-if` overlays with no history entry, so BACK on Android closes the page rather than the overlay. UNCONFIRMED at runtime.
- No dial intent: the emergency card shows the number 12356 as text (`FeedbackHelp.vue:245`) with no `tel:` link, unlike SafetySupport which does use `href="tel:12356"` (`docs/product-audit/pages/mp/SafetySupport.md`). Tapping it does nothing.

## ISSUES

- P2 FUNCTIONAL: the emergency hotline is not tappable. `FeedbackHelp.vue:245` renders "全国心理援助热线：12356（24小时）" as plain text inside `<small>`, with no `tel:` anchor, on a page whose own copy says "如遇严重情绪危机，请及时联系专业帮助。" The SafetySupport page does link `tel:12356`, so the capability exists in the codebase.
- P2 UX: the ticket history has no refresh affordance and no polling; the only way to see a new operator reply is to reload the page or submit another ticket (`FeedbackHelp.vue:128` is the only re-read).
- P3 UX: `loadError` and the empty FAQ/history states can appear simultaneously (`FeedbackHelp.vue:154`, `:173`, `:258`), so a load failure looks like "there are no FAQs" with a small banner above it.
- P3 UX: the form's status message is a single shared `formMessage` (`FeedbackHelp.vue:21`), so an upload error is overwritten by a later submit message and vice versa.
- P3 DATA: the seeded ticket `ticket_1` carries `sourcePage: '/pages/feedback/index'` (`store.service.ts:885`), an alias path the MP UI never navigates to; the value is only ever displayed in admin, so this is cosmetic drift.
- P3 DUPLICATE: the FAQ accordion is implemented twice in the product - here (max 5) and in HelpFaqs (all). See HelpFaqs.md.

## FINAL_STATUS

PARTIAL - all three reads, the ticket write, the media flow, the admin round trip and every state are traced from source, and the route renders on the real Android APK with 0 console errors; the submit round trip and the keyboard behaviour could not be exercised at runtime.

Group recommendation: **KEEP**. This is the only support channel and it is fully wired end to end (user ticket -> admin reply -> user sees reply). The newer Journey/Peer/Self system has no support surface. It complements the newer system and should not be merged or deprecated. The inert emergency hotline is a fix, not a merge signal.

### Static evidence

- Controls discovered: 27
- API reads (static): `/api/v1/feedback`, `/api/v1/feedback/categories`, `/api/v1/feedback/faqs`
- API writes (static): `POST /api/v1/feedback`
- Candidate fake markers: 1
- Adjudication: NOT_FAKE - the claim "反馈已提交，后台工单已创建" (`FeedbackHelp.vue:125`) is backed by a real `FeedbackTicket` write and an immediate re-read of `GET /api/v1/feedback` before the message is shown (`FeedbackHelp.vue:128-129`); `placeholder` at `:192` is the textarea attribute. See `discovery-agent5-fake-candidates.md` M06, M31.
- Appended: `POST /api/v1/feedback` also accepts legacy `images`, but `StoreService` rejects raw URLs (`controllers.ts:1697-1699`, `store.service.ts:1552`).

