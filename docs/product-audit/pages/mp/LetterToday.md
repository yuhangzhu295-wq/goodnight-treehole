# LetterToday

Source: `apps/mp/src/views/LetterToday.vue`

Routes: `/pages/letter/index`, `/pages/letter/today`, `/pages/reply/today`

## PURPOSE

LetterToday is the daily 今日回信: one AI-written letter addressed to the user's current mood, with four tone styles, three advice chips, a save-to-diary action and a share-poster action. It is the private counterpart to the public Square replies, and it is the only place in the product where the user can re-roll an AI letter in a different voice.

## USER_JOB

"Give me something warm to read tonight about what I just wrote, in the tone I want, and let me keep it."

## ENTRY

- ToolIndex's 去试试 button, `data-testid=tool-letter` -> `/pages/letter/today` (`apps/mp/src/views/ToolIndex.vue:73`). This is the only in-app control that reaches the route.
- DiaryList's letter action when a diary has **no** `letterId` -> `/pages/letter/today` (`apps/mp/src/views/DiaryList.vue:54`).
- LetterDetail's 查看今日回信 -> `/pages/letter/today` (`apps/mp/src/views/LetterDetail.vue:42`).
- `safeBack` falls back to `/pages/square/index` when there is no history (`LetterToday.vue:63-66`).
- No bottom tab and no RouterLink reaches it; the three paths are aliases of one component (`apps/mp/src/router.ts:76-78`). ToolIndex itself has no inbound control anywhere in `apps/mp/src` (ISSUE-004), so in practice this page is close to DIRECT_ONLY.

## EXIT

- `safeBack` -> `router.back()` if `window.history.state?.back`, else `/pages/square/index` (`LetterToday.vue:63-66`).
- The share modal's 完成 / × / mask click -> `shareOpen = false`; no navigation (`LetterToday.vue:239-250`).
- Every other control stays on the page; there is no forward navigation from the letter itself.

## ROUTES

Three aliases of one component (`apps/mp/src/router.ts:76-78`): `/pages/letter/index` and `/pages/letter/today` and `/pages/reply/today`. All three are in `tabbarPaths` (`apps/mp/src/App.vue:20-22`), so the bottom tab bar renders, and `activeTab` maps any `/pages/letter` or `/pages/reply` path to the 今晚 tab (`App.vue:53`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading (empty card 正在读取今天的回信...) | `loading` | `LetterToday.vue:27`, `:82`, `:103`, `:255` |
| loaded letter | `letter` | `LetterToday.vue:19`, `:155` |
| load failure card | `loadError` | `LetterToday.vue:28`, `:100`, `:257` |
| first-generation in progress | `busyAction === 'initial'` + `statusText` | `LetterToday.vue:90-92` |
| active style tab | `style` | `LetterToday.vue:20`, `:87`, `:187` |
| regenerating (all four style buttons disabled) | `busyAction` truthy | `LetterToday.vue:25`, `:188`, `:208` |
| saved-to-diary label | `letter.savedToDiary` via `savedText` | `LetterToday.vue:38`, `:212` |
| advice chips / selected advice | `adviceItems`, `activeAdvice` | `LetterToday.vue:24`, `:49-61`, `:227` |
| AI advice present vs fallback | `aiStructured.advice` | `LetterToday.vue:26`, `:50-51`, `:117` |
| share modal open | `shareOpen` | `LetterToday.vue:21`, `:141`, `:239` |
| share URL | `shareUrl` | `LetterToday.vue:22`, `:140`, `:247` |
| floating status text | `statusText` | `LetterToday.vue:23`, `:237` |

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| ‹ 返回 `letter-back` | `safeBack` | history back, else `/pages/square/index` |
| 温柔 / 理性 / 轻松 / 文艺 `btn-letter-warm` `btn-letter-rational` `btn-letter-light` `btn-letter-poetic` | `regenerate(item.key)` | POSTs `/regenerate {style}`, polls the job, replaces the letter body |
| ↻ 换一种风格 `btn-letter-regenerate` | `regenerate()` | re-runs the current style |
| ▣ 保存到日记 / 已保存 `btn-letter-save` | `saveToDiary` | POSTs `/save-to-diary`, which also creates a Diary row |
| ⇧ 分享图片 `btn-letter-poster` | `makeShareImage` | POSTs `/poster`, opens the modal with the returned URL |
| ♨ / ◷ / ☾ advice chips `letter-advice-water` `letter-advice-rest` `letter-advice-sleep` | `chooseAdvice(item.key)` | local selection only; shows the chip's text |
| share modal × `letter-share-close` | `shareOpen = false` | closes the modal |
| share modal 完成 (no testid) | `shareOpen = false` | closes the modal |
| share modal mask | `shareOpen = false` | closes the modal |
| 重新读取 `letter-retry` | `load` | re-runs the whole load, including the generation poll |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 19 controls; `artifacts/post-recovery/control-coverage.json` records `/pages/letter/index` in state `default` with 15 visible controls and 15 testids: all four style buttons and all three advice chips `changed`, 换一种风格 `no observable change`, 保存到日记 already reading 已保存 and `changed`, 分享图片 `changed`, 返回 `changed` (0 console errors, 0 failed requests).

## API_READS

- `GET /api/v1/letters/today` (`LetterToday.vue:85`, and again at `:93` after a first-generation poll). Handler `PublicController.today` (`apps/api/src/controllers.ts:1030-1053`). Note this handler calls `this.store.getDemoUserId()` (`controllers.ts:1032`) and **ignores the `x-goodnight-user-id` header entirely**, unlike the peer endpoints.
- `GET /api/v1/ai/tasks/:id` (`LetterToday.vue:71`, polled every 350 ms up to a 120 s deadline). Handler `controllers.ts:1020-1028`.

## API_WRITES

- `POST /api/v1/letters/:id/regenerate` with `{style}` (`LetterToday.vue:112`). Handler `PublicController.regenerate` (`controllers.ts:1089-1132`), which sets `letter.aiJobId` / `generationStatus` and, on completion, writes **Letter** (`style`, `content`, `status`, `generationStatus`) - not a `store.service.ts` method, but the controller also calls `store.queueAI` (`store.service.ts:5066`) and `store.waitForAiJob` (`:5193`).
- `POST /api/v1/letters/:id/save-to-diary` (`LetterToday.vue:130`). Handler `controllers.ts:1168-1184`: sets **Letter**.`savedToDiary = true` and unshifts a new **Diary** row (`emotion:'委屈'`, `hasLetter:true`, `letterId`).
- `POST /api/v1/letters/:id/poster` (`LetterToday.vue:139`). Handler `controllers.ts:1148-1153` -> `store.createLetterPoster` (`store.service.ts:1788-1813`), which writes an SVG file to the uploads directory and a **MediaAsset** row.
- The implicit first-generation write happens inside `GET /letters/today`: when the letter is missing or empty, the handler queues a job via `store.queueLetterGeneration` (`controllers.ts:1042-1050` -> `store.service.ts:5013-5064`), which creates a **Letter** and an **AiJob** and appends the result on completion.

## DB_ENTITIES

- Reads: **Letter**, **Mood** (the source mood), **Diary**, **Favorite** (through `decorateLetter`, `store.service.ts:1427-1429`).
- Writes: **Letter**, **Diary** (save-to-diary), **MediaAsset** (poster), **AiJob** (generation/regeneration).
- Cross-checked against `prisma/schema.prisma:312-333` (Letter), `:335-357` (Diary), `:809-819` (Favorite).

## ADMIN_VISIBILITY

- There is **no** admin resource for private letters. `apps/admin/src/router.ts` `menuGroups` has no letters entry; the closest resource, **replies** -> `/replies/moderation` (`apps/admin/src/router.ts:40`), governs public Square replies, not `Letter` rows.
- The generation and regeneration `AiJob` rows appear under **jobs** -> `/ai/jobs` (`apps/admin/src/router.ts:50`), where the fallback status of every letter job is visible.
- The poster `MediaAsset` has no admin resource.
- So the letter content itself is invisible to operators, which is the intended privacy posture but also means the "every AI job ends in fallback" degradation is only visible through the jobs page.

## AI_USAGE

Yes - this is the AI-heaviest page in the product. Two paths create an `AiJob`:

- first read: `queueLetterGeneration` -> `queueAI({taskType:'warm_letter', style, sourceId: letter.id, content: source})` (`store.service.ts:5039-5045`), normalised to `today_letter` (`store.service.ts:5692`), content type `Letter` (`:5773`).
- style change: `regenerate` -> `queueAI({taskType:'today_letter', style: body.style ?? letter.style, sourceId: letter.id, content: source})` (`controllers.ts:1099-1108`).

Failure handling: `waitForAiJob` accepts `succeeded` **and** `fallback` as success and throws only on `failed` or timeout (`LetterToday.vue:72-78`). On `fallback` the view takes `completed.result` and `completed.structured` as if they were real AI output (`:115-119`), which means the template text from `composeDynamicText` (`store.service.ts:5506-5533`, provider `provider_safe_template`) is presented to the user as their letter, and the template `advice` array (`store.service.ts:5943-5951`) is presented as personalised 今日小建议. With DAPI at HTTP 402 every job terminates in `fallback` (`artifacts/post-recovery/failure-set.txt`), so in the live environment this page always shows template output with no indication.

The 换一种风格 control cannot actually change the voice under that condition: the style is written to the letter (`controllers.ts:1118`) and the signature text switches (`LetterToday.vue:43-48`), but the body is regenerated from the same template.

## PRIVACY

- No `PrivacySetting` flag gates this page. `GET /letters/today`, `/regenerate`, `/save-to-diary` and `/poster` call no `privacyAllows` (`controllers.ts:1030-1184`).
- The page states 仅自己可见 in its own header (`LetterToday.vue:164`), and the letters it reads are filtered by `userId` (`controllers.ts:1033`, `:1058`), so the claim holds for reads.
- The poster is the one disclosure surface: `POST /letters/:id/poster` renders the full letter content into a 1080x1440 SVG at `/uploads/poster_<id>_<ts>.svg` with **no authentication on the asset URL** (`store.service.ts:1788-1813`; `url: '/uploads/'+storageKey` at `:1800`). Anyone with the URL can read the letter text. The runtime modal also renders `shareUrl` as plain text rather than an image (`LetterToday.vue:247`).
- `save-to-diary` copies the full letter content into a **Diary** row with a hardcoded `emotion: '委屈'` (`controllers.ts:1176`), so saving a 轻松 letter records it as a 委屈 diary entry.
- The letter read uses `getDemoUserId()` and ignores the caller's user header (`controllers.ts:1032`), so on a multi-user backend every caller would read the same user's letter.

## ERROR_STATES

Two paths:

- load failure: the whole page falls to the `v-else` branch and shows `loadError` or 今日回信暂时不可用。 with a 重新读取 button (`LetterToday.vue:254-259`). This is a real error state, unlike most pages in this audit.
- regeneration failure: `statusText` is set to the error message and shown in the floating status pill (`LetterToday.vue:120-121`, `:237`); the previous letter body stays on screen.
- `saveToDiary` and `makeShareImage` have **no** try/catch (`LetterToday.vue:127-144`): a rejection leaves `busyAction` stuck at `'diary'` or `'share'` and the button label frozen at 正在保存 / 正在生成 with no error shown. `busyAction` is only cleared on the success path (`:133`, `:143`).

## EMPTY_STATES

- No letter at all: `loading` is false and `letter` is undefined, so the `v-else` card renders 今日回信暂时不可用。 with 重新读取 (`LetterToday.vue:256-259`).
- Empty `letter.content` on a fresh generation: the header and cards still render with an empty body while `busyAction === 'initial'` is true and the status pill reads 正在生成今日回信 (`LetterToday.vue:89-92`).
- No AI advice: the three chips fall back to the hardcoded 把此刻写成一句话 / 只做一个小动作 / 给身体一点缓冲 (`LetterToday.vue:51`), adjudicated NOT_FAKE (M11).

## NATIVE_RISKS

- Safe area: the advice block explicitly pads `calc(96px + env(safe-area-inset-bottom))` (`LetterToday.vue:408-410`), which is the correct pattern; the page is in `tabbarPaths` so the tab bar renders.
- Keyboard: no textarea or input on this page, so no keyboard risk.
- Back button: the share modal does **not** intercept the Android back button. It is a `v-if` overlay whose only closers are the ×, 完成 and the mask click (`LetterToday.vue:239-250`); `apps/mp/src/native/back-button.ts` only walks WebView history, so BACK with the modal open leaves the page instead of closing it. `artifacts/post-recovery/native-checks-back.json` records the same class of failure (`back: sheet state handled on the post detail route`: false).
- The generation poll can run for up to 120 s (`LetterToday.vue:69`) with 350 ms intervals - roughly 340 requests in the worst case - and continues while the WebView is backgrounded.
- The poster URL is an `/uploads/` asset on the API origin; on the Android WebView the modal shows it as text, so no image permission or download intent is triggered.
- No dial intent, no clipboard.

## ISSUES

- P1 AI: AI degradation is invisible and the template is presented as the user's letter. `waitForAiJob` treats `fallback` as success (`LetterToday.vue:72-73`) and copies `completed.result` / `completed.structured` straight into the page (`:116-117`). With DAPI at HTTP 402 every job ends in `fallback` (`artifacts/post-recovery/failure-set.txt`, ISSUE-007), so the letter the user reads and may save to their diary is always `provider_safe_template` output, and the 今日小建议 chips are the template's fixed advice list (`store.service.ts:5943-5951`) shown as if personalised.
- P1 DATA: `saveToDiary` has no error handling (`LetterToday.vue:127-134`). If the POST rejects, `busyAction` stays `'diary'`, the button is frozen on 正在保存, and the user is never told the save failed - while the UI continues to imply a diary entry exists.
- P1 DATA: `save-to-diary` hardcodes `emotion: '委屈'` for every letter (`controllers.ts:1176`), so a 轻松 or 文艺 letter becomes a 委屈 diary entry and pollutes the emotion-based filters in DiaryList (`apps/mp/src/views/DiaryList.vue:143`).
- P2 PRIVACY: the poster asset is served from an unauthenticated `/uploads/` URL containing the full letter text (`store.service.ts:1800`), despite the page's 仅自己可见 claim (`LetterToday.vue:164`). Anyone with the URL can read the letter.
- P2 PRIVACY / DATA: `GET /letters/today` and every letter write use `store.getDemoUserId()` and ignore the `x-goodnight-user-id` header (`controllers.ts:1032`, `:1136`, `:1188`, `:1198`), while the peer endpoints honour it. On a multi-user backend all users share one letter.
- P2 FUNCTIONAL: 分享图片 has no error handling either (`LetterToday.vue:136-144`); a failed poster leaves `busyAction === 'share'` and a frozen 正在生成 label.
- P2 UX: the share modal renders `shareUrl` as a `<small>` text node (`LetterToday.vue:247`) instead of an `<img>`, so the user is shown a URL string where a poster preview should be (M10, NEEDS_RUNTIME_CHECK).
- P2 NATIVE: the share modal does not close on the Android back button (`LetterToday.vue:239`).
- P3 FUNCTIONAL: `regenerate` sets `savedToDiary:false` locally (`LetterToday.vue:116`) but the server only clears it implicitly; the label can therefore disagree with the stored row until the next load.
- P3 STATE_MACHINE: 换一种风格 passes the current `style` (`LetterToday.vue:206`), so when a style tab was just used the two controls are identical; the runtime clicker recorded 换一种风格 as `no observable change`.

## FINAL_STATUS

PARTIAL - the read, the three writes, the AI poll and the failure branches are all traced to concrete lines and the populated page rendered on the Android APK with 15 controls exercised, but the fallback-vs-succeeded distinction and the two unhandled write paths could not be verified at runtime.

### Static evidence

- Controls discovered: 19
- API reads (static): `/api/v1/ai/tasks/:param`, `/api/v1/letters/today`
- API writes (static): `POST /api/v1/letters/`, `POST /api/v1/letters/:param/poster`, `POST /api/v1/letters/:param/save-to-diary`
- Candidate fake markers: 1 - adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` M11 (the hardcoded advice array is only the empty-state fallback). M10 (the share preview) is recorded as NEEDS_RUNTIME_CHECK.
- Appended: `artifacts/recovery/android-route-manifest.json` shows `/pages/letter/index` rendered with 11 buttons and 15 testids; `artifacts/post-recovery/control-coverage.json` records the 保存到日记 button already reading 已保存 before the click, i.e. the runtime account had a previously saved letter.

