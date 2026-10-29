# TonightHome

Source: `apps/mp/src/views/TonightHome.vue`

Routes: `/pages/tonight/index`

## PURPOSE

TonightHome is the entry point and default landing screen of the product (the root path redirects here, `apps/mp/src/router.ts:52`). It asks one open question - "what happened tonight?" - collects a free-text account plus a coarse domain, and turns it into a new Journey with an AI situation analysis, or resumes the journey that is already active.

## USER_JOB

"I want to put down what is going on right now, in my own words, without deciding anything yet."

## ENTRY

- Root redirect: `{ path: '/', redirect: '/pages/tonight/index' }` (`apps/mp/src/router.ts:52`).
- Bottom tab 今晚, `data-testid=tab-square` -> `to="/pages/tonight/index"` (`apps/mp/src/App.vue:77-86`). It is the first of the four tab routes (`apps/mp/src/router.ts:48`).
- Back-navigation from a finished flow: ActionCenter's no-journey card (`@tonight`, `ActionCenter.vue:330`) and its guard when no journey id exists (`ActionCenter.vue:94`); SafetySupport's `stayHere` when it has no `journeyId` (`SafetySupport.vue:34`); Me's empty-state button `entry-start-journey` (`apps/mp/src/views/Me.vue:178`).
- Returned to by the backend route for `SupportIntent.NOTHING_NOW` (`apps/api/src/store.service.ts:2844`, reached through `JourneyDetail.chooseIntent`, `JourneyDetail.vue:100-101`).

## EXIT

`createJourney()` is the only exit that writes. On success it branches on the safety flag (`TonightHome.vue:53-55`):

- `response.safety.needsRealWorldSupport === true` -> `/pages/safety/index?journeyId=<id>`.
- otherwise -> `/pages/journey/detail?id=<id>&analysisJob=<jobId>`.

Two other exits do not write: the bell -> `/pages/notifications/index` (`TonightHome.vue:65`), and the active-journey 继续 link -> `/pages/journey/detail?id=<id>` without an analysis job (`TonightHome.vue:76`).

## ROUTES

`/pages/tonight/index` (`apps/mp/src/router.ts:53`). Single route, no aliases; it is one of the four `tabRoutes` (`router.ts:48`) and one of the `tabbarPaths` (`apps/mp/src/App.vue:8`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading | `loading` (ref true) | `TonightHome.vue:12`, `:66`, `:69` |
| error banner | `error` | `TonightHome.vue:14`, `:68` |
| populated home data | `home` (`TonightItem \| null`) | `TonightHome.vue:15`, `:27` |
| notifications / unread badge | `notices`, `unreadCount` | `TonightHome.vue:16`, `:22`, `:65` |
| active-journey block shown | `home?.journey` | `TonightHome.vue:76` |
| relation sheet open | `relationSheet` | `TonightHome.vue:17`, `:80` |
| selected relation scene | `selectedRelation` | `TonightHome.vue:18`, `:80` |
| domain selection / shortcut highlight | `form.domain` via `shortcutSelected` | `TonightHome.vue:19`, `:44-47`, `:75` |
| saving (button disabled + relabelled) | `saving` | `TonightHome.vue:13`, `:78` |
| validation error 先写下一句也可以。 | `error` | `TonightHome.vue:50` |

## CONTROLS

| control (label/testid) | handler function | what it actually does |
| --- | --- | --- |
| `notification-bell` (提醒与回访, with unread badge) | inline `router.push('/pages/notifications/index')` | opens NotificationCenter |
| `tonight-input` (textarea, maxlength 1000) | `v-model="form.content"` | the free-text account; a live `n/1000` counter is shown |
| six shortcut buttons (感情 工作 家里 睡不着 孤独 说不清) | `chooseShortcut(value)` | sets `form.domain`; 感情 opens the relation sheet instead of setting a domain |
| relation scene buttons (刚分手, 放不下, 想联系 TA, ...) | `chooseRelation(value)` | sets `selectedRelation`, forces `form.domain='关系'`, closes the sheet |
| relation sheet 说不清，也可以直接写 | `chooseRelation('其他')` | same as above with the literal 其他 |
| relation sheet × and the mask | `relationSheet = false` | closes the sheet |
| 继续 › (inside the active-journey card) | inline `router.push('/pages/journey/detail?id=<active id>')` | resumes the existing journey, no new record |
| `tonight-continue` (继续) | `createJourney` | validates, POSTs the journey, then routes to safety or to the detail flow |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 17 controls; `artifacts/post-recovery/control-coverage.json` shows 15 visible controls on `/pages/tonight/index` (bell, entry section, textarea, 6 shortcuts, 继续 ›, 继续, 4 tab links), 0 console errors, 0 failed requests.

## API_READS

- `GET /api/v1/tonight` (`TonightHome.vue:27`). Handler `PublicController.tonight` (`apps/api/src/controllers.ts:205-208`) -> `store.tonightHome` (`apps/api/src/store.service.ts:2425-2456`), returning the active `LifeJourney`, up to 3 active `ActionCommitment`, up to 3 due `OutcomeCheckin`, up to 3 due `FollowUpJob`, up to 3 non-declined `PeerMatch`, the latest letter, and counts.
- `GET /api/v1/notifications` (`TonightHome.vue:27`), fired in parallel with the above via `Promise.all`. Handler `controllers.ts:676-680` -> `store.notificationList` (`store.service.ts:4284-4289`).

## API_WRITES

- `POST /api/v1/journeys` with `{domain, relationScene, content}` (`TonightHome.vue:53`). Handler `PublicController.createJourney` (`controllers.ts:249-268`) -> `store.createJourney` (`store.service.ts:2459-2631`). That method writes **LifeJourney** (status `active`, stage `clarifying` or `safety_first`), **SituationSnapshot** (confidence `agent_draft`), **JourneyUpdate** (kind `created`), and, only when `detectRisk` returns high, a **SafetyEvent** (`store.service.ts:2529-2540`). It then queues an AI job (see AI_USAGE) whose completion appends an **AgentDecisionLog** (`store.service.ts:2609-2617`).

## DB_ENTITIES

- Reads: **LifeJourney**, **ActionCommitment**, **OutcomeCheckin**, **FollowUpJob**, **PeerMatch**, **Letter**, **UserNotification**.
- Writes: **LifeJourney**, **SituationSnapshot**, **JourneyUpdate**, **SafetyEvent** (conditional), **AgentDecisionLog** (async, after the AI job completes).
- Cross-checked against `artifacts/product-audit/db-models.json` and `prisma/schema.prisma`.

## ADMIN_VISIBILITY

- The created journey appears under resource **journeys** -> `/experience/journeys` (`apps/admin/src/router.ts:64`, `GET /api/admin/v1/journeys`, `apps/api/src/controllers.ts:1917`).
- A high-risk creation also appears under **safety-events** -> `/safety/events` (`apps/admin/src/router.ts:77`, `controllers.ts:2046`).
- The notifications read here are the same rows as resource **notifications** -> `/experience/notifications` (`apps/admin/src/router.ts:71`).
- `SituationSnapshot` and `JourneyUpdate` have no dedicated admin resource; they surface only inside the journey detail.
- `prisma/schema.prisma:370` defaults `LifeJourney.visibility` to `PRIVATE`, and `createJourney` only sets `PUBLIC` when the request asks for it (`store.service.ts:2483-2487`); this view never sends `visibility`, so every journey created here is private.

## AI_USAGE

Yes, one job per created journey. `createJourney` calls `queueAI({taskType:'situation_analysis', style:'rational', sourceId: journey.id, content})` (`store.service.ts:2541-2548`). Normalised task type `situation_analysis`, style `rational` (`defaultStyleForTask`, `store.service.ts:5750-5766`), content type `LifeJourney` (`store.service.ts:5772-5792`).

The view's failure handling is entirely delegated: it does not poll or inspect the job. It only passes `analysisJob=<jobId>` to JourneyDetail (`TonightHome.vue:55`), which polls it and shows the analysing state. On the backend, a `fallback` completion is treated as success (`store.service.ts:2553`) and folds the template `structuredResult` into the snapshot; a `failed` completion is silently ignored (`store.service.ts:2553` returns early, and the `.catch(() => undefined)` at `:2624` swallows rejections). With DAPI at HTTP 402 every job ends in `fallback` to `provider_safe_template`, so the snapshot the user is asked to confirm is template-derived.

## PRIVACY

- No `privacyAllows` call guards `createJourney`; the endpoint is not gated by any `PrivacySetting` flag.
- The only privacy-relevant write is `visibility`, which is forced to `PRIVATE` unless the caller asks for `PUBLIC` (`store.service.ts:2483-2487`); this view never asks, so the data stays private.
- The notifications read here are filtered by `userId` only (`store.service.ts:4286-4287`); `allowFutureSelfNotifications` gates whether `FUTURE_SELF` rows exist at all (`follow-up-worker.service.ts:32`), not what this page shows.

## ERROR_STATES

One error path, driven by `error`:

- load failure: the `Promise.all` catch sets 今晚的内容暂时没有加载出来 or the API message (`TonightHome.vue:29-31`). Note that `loading` is set false in the `finally`, so the `v-else` block renders the input card *and* the error banner together - the user can still type and submit.
- empty content: 先写下一句也可以。 (`TonightHome.vue:50`), a local validation message rather than a server error.
- save failure: 这段经历暂时没有保存成功 or the API message (`TonightHome.vue:56-58`).

There is no dedicated full-page error state; the error is always a banner above a still-usable form.

## EMPTY_STATES

- No active journey: the active-journey block is simply not rendered (`v-if="home?.journey"`, `TonightHome.vue:76`), so there is no "you have no journey yet" copy - the empty case is silent. This is intentional-looking but worth noting as a UX gap.
- No notifications: nothing renders; `unreadCount` is 0 and the badge is hidden (`TonightHome.vue:22`, `:65`). No empty copy anywhere.

## NATIVE_RISKS

- Safe area: this is a tab route, so the fixed tab bar renders; the page pads `142px` bottom and the shared `.goodnight-page` adds `calc(130px + env(safe-area-inset-bottom))` (`apps/mp/src/styles.scss:4147`). The relation sheet explicitly pads with `calc(24px + env(safe-area-inset-bottom))` (`TonightHome.vue` scoped style, `.relation-sheet`).
- Keyboard: the textarea is in normal flow; `Keyboard.resize: 'body'` (`apps/mp/capacitor.config.ts`) keeps it visible. The fixed bottom tab bar may sit over the keyboard on some Android versions because `resize: 'body'` shrinks the body rather than the viewport; not verified on device.
- Back button: the relation sheet does **not** intercept the Android back button. It is a plain `v-if` overlay with only a mask click and an × to close (`TonightHome.vue:80`), and `apps/mp/src/native/back-button.ts` only walks WebView history. Pressing BACK with the sheet open navigates away from the page rather than closing the sheet.
- Teleport: the sheet is teleported to `body`, outside `.phone-shell`, so on a wide viewport it is not clamped to the 430 px shell; it uses `width: min(430px, 100vw)` instead, which happens to align.
- No dial intent, no clipboard on this page.

## ISSUES

- P1 AI: a failed situation analysis is invisible. `createJourney` ignores `failed` jobs (`store.service.ts:2553`, `:2624`) and the view never inspects the job it was handed, so a user whose analysis failed sees an unchanged (empty-ish) snapshot with no explanation. With DAPI at HTTP 402 the `fallback` path is taken instead, which produces template facts and feelings (`store.service.ts:5968-5991`) that are presented as an understanding of the user's situation.
- P2 STATE_MACHINE: on a load error the page still renders the composer (`loading` is cleared in `finally`, `TonightHome.vue:31`), so the user can submit a journey while the active-journey and notification data are unknown; the resulting `POST /api/v1/journeys` can create a second journey while one is already active, because the active-journey block that would have offered 继续 was never rendered.
- P2 NAVIGATION: the 继续 › link in the active-journey card does not carry `analysisJob` and does not disable itself while `saving` is true; a fast double-tap on 继续 › and then `tonight-continue` can create a second journey.
- P2 UX: the empty case has no copy at all. With no active journey and no notifications the page shows the composer only, and the 感情 sheet is the only hint that a domain can be chosen.
- P3 NATIVE: the relation sheet does not close on the Android hardware back button (`TonightHome.vue:80`; `apps/mp/src/native/back-button.ts:26-33`).
- P3 FUNCTIONAL: the six shortcut labels map to five domains plus one sheet (`TonightHome.vue:33-37`), and `shortcutSelected` has to special-case 感情 (`TonightHome.vue:44-47`); a domain set through the sheet can only be cleared by choosing a different shortcut, so the highlight can misreport the current domain after the sheet sets 关系 and the user then presses 说不清 (both paths write 其他, but the sheet's `selectedRelation` remains set and is still submitted as `relationScene`).

## FINAL_STATUS

DONE - the load, the write, the safety branch and the AI handoff are all traced to concrete lines, and the route renders on the Android APK (15 visible controls, 0 console errors, 0 failed requests).

### Static evidence

- Controls discovered: 17
- API reads (static): `/api/v1/notifications`, `/api/v1/tonight`
- API writes (static): `POST /api/v1/journeys`
- Candidate fake markers: 1
- Appended: the single fake-marker candidate (placeholder at line 72) is the textarea's HTML placeholder attribute, adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` (M27).
- Appended: `createJourney` returns `safety.needsRealWorldSupport` from `detectRisk(content)` (`store.service.ts:2481`, `:2626-2629`); the view branches on it at line 54.

