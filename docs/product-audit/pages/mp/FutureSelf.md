# FutureSelf

Source: `apps/mp/src/views/FutureSelf.vue`

Routes: `/pages/future-self/index`

## PURPOSE

FutureSelf lets the user write one short message to their future self, choose when it should arrive (tomorrow evening, a week, a month, or a custom moment), optionally attach one existing record as context, and see the letters already written with whether they have been delivered. The delivery is real: the write enqueues a scheduled follow-up job rather than a local reminder.

## USER_JOB

"Next time I am in a bad place I will not be able to think clearly - I want to leave myself one sentence now that arrives then."

## ENTRY

- Me, 写给未来的我, `data-testid=entry-future-self` -> `router.push('/pages/future-self/index')` (`apps/mp/src/views/Me.vue:67`, rendered `:199-200`).
- ActionCenter shortcut "future", `router.push('/pages/future-self/index?journeyId=<id>')` (`apps/mp/src/views/ActionCenter.vue:248`).
- Notification deep link: the follow-up worker sets `targetRoute: '/pages/future-self/index'` for a delivered `FUTURE_SELF` job (`apps/api/src/follow-up-worker.service.ts:68`), opened by NotificationCenter's `router.push(item.targetRoute)`.

Exhaustive search for `/pages/future-self` in `apps/mp/src` returns the route (`apps/mp/src/router.ts:66`), the `tabbarPaths` entry (`App.vue:18`), the Me entry and the ActionCenter shortcut.

## EXIT

Back only: `router.back()` (`FutureSelf.vue:156`). Saving stays on the page and re-renders the list (`:132-135`); there is no forward control. The page **is** in `tabbarPaths` (`App.vue:18`), so the four bottom tabs are visible and BACK competes with a real tab bar.

## ROUTES

`/pages/future-self/index` (`apps/mp/src/router.ts:66`). Single route, no aliases. Tab bar shown (`App.vue:18`); `activeTab` maps it to 我的 (`App.vue:62-68`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading note | `loading` (starts `true`) | `FutureSelf.vue:28`, `:219` |
| saved-letter list | `items` | `FutureSelf.vue:19`, `:224` |
| empty list | `!items.length` | `FutureSelf.vue:222` |
| error note | `error` | `FutureSelf.vue:30`, `:212` |
| success notice | `notice` | `FutureSelf.vue:31`, `:211` |
| save disabled | `!canSave` or `saving` | `FutureSelf.vue:45-47`, `:213` |
| custom datetime input | `timePreset === 'custom'` | `FutureSelf.vue:26`, `:187` |
| preset delivery note | `timePreset !== 'custom'` | `FutureSelf.vue:189` |
| context picker open | `contextType !== 'none'` | `FutureSelf.vue:24`, `:202` |
| context options available | `contextOptions.length` | `FutureSelf.vue:33-43`, `:203` |
| letter already delivered | `item.deliveredAt` | `FutureSelf.vue:81-85`, `:224` |

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| ‹ 返回 | `router.back()` | history back |
| textarea (maxlength 1200) | `v-model="content"` | the letter body |
| 明天晚上 | `changePreset('tomorrow')` | sets `deliverAt` to tomorrow 20:30 |
| 一周后 | `changePreset('week')` | sets `deliverAt` to +7 days, current time |
| 一个月后 | `changePreset('month')` | sets `deliverAt` to +1 month |
| 自定义 | `changePreset('custom')` | reveals the `datetime-local` input without changing `deliverAt` |
| four context radios (不关联 / 一段旅程 / 一个决定 / 一次恢复) | `v-model="contextType"` + `watch` | switches the picker source and clears `contextRefId` (`:147-149`) |
| context `<select>` | `v-model="contextRefId"`, `:disabled="!contextOptions.length"` | picks the record to attach |
| 把这封话留给未来 (`future-self-save`) | `save` (form submit) | `POST /api/v1/future-messages`, then reset the form and reload |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 7 entries; `artifacts/post-recovery/control-coverage.json` records 15 visible controls on the real APK, of which 3 changed state. The runtime sweep marked 一个月后 and 自定义 as "not-found" and the save button as "not actionable" because `canSave` was false with an empty textarea (`:45-47`) - consistent with the disabled-button evidence in `android-route-manifest.json` (input 4, textarea 1, button 6).

## API_READS

Four GETs in one `Promise.all` (`FutureSelf.vue:95-103`):

- `GET /api/v1/future-messages` -> `controllers.ts:624-627` -> `store.futureMessageList` (`store.service.ts:4595-4600`).
- `GET /api/v1/journeys` -> `controllers.ts:210-216` -> `store.journeyDetail` (`store.service.ts:2850-2861`).
- `GET /api/v1/decisions` -> `controllers.ts:563-566` -> `store.decisionList` (`store.service.ts:4410-4422`).
- `GET /api/v1/me/recovery` -> `controllers.ts:663-666` -> `store.recoveryList` (`store.service.ts:4690-4694`), gated by `allowRecoveryData`.

## API_WRITES

- `POST /api/v1/future-messages` with `{content, deliverAt, contextType?, contextRefId?}` (`FutureSelf.vue:120-130`). Handler `controllers.ts:619-622` -> `store.saveFutureMessage` (`store.service.ts:4528-4592`):
  - validates `contextType` against `{journey, decision, recovery}` and resolves the referenced row, building `contextLabel` (`:4545-4565`);
  - rejects a `deliverAt` that is not in the future (`:4566-4567`);
  - writes a **MessageToFutureSelf** row (`:4568-4579`);
  - writes a **FollowUpJob** with `kind: 'FUTURE_SELF'` and `dueAt: deliverAt` (`:4580-4589`);
  - enqueues it with `scheduleFollowUp` (BullMQ, `delay = dueAt - now`, 3 attempts, exponential backoff, `apps/api/src/follow-up-queue.ts:20-31`).

Store method: `StoreService.saveFutureMessage`. Prisma models changed: **MessageToFutureSelf**, **FollowUpJob**.

Delivery: `FollowUpWorkerService.deliver` stamps `deliveredAt` and creates a **UserNotification** when `allowFutureSelfNotifications` is true (`apps/api/src/follow-up-worker.service.ts:30-65`).

## DB_ENTITIES

Reads: **MessageToFutureSelf**, **LifeJourney**, **SituationSnapshot**, **JourneyUpdate**, **ActionCommitment**, **OutcomeCheckin**, **PeerMatch** (via `journeyDetail`), **DecisionRecord**, **RecoverySnapshot**.

Writes: **MessageToFutureSelf**, **FollowUpJob** (and later **UserNotification** from the worker).

Cross-checked against `prisma/schema.prisma:629-644` (MessageToFutureSelf), `:736-750` (FollowUpJob), `:752-765` (UserNotification).

## ADMIN_VISIBILITY

**MessageToFutureSelf has no admin resource.** `apps/admin/src/router.ts` menuGroups (`:31-89`) contains no future-message entry; the nearest surfaces are `/experience/follow-ups` (`:69` -> `GET /api/admin/v1/follow-ups`, `controllers.ts:2005-2015`), which exposes the job but not the letter text, and `/experience/notifications` (`:71`). An operator can see that a delivery is scheduled and that a notification was written, but cannot read the message the user left for themselves - which is the right privacy posture for this content.

## AI_USAGE

None. No AiJob is created or read, `/api/v1/ai/tasks` never appears in the file, and nothing on the page calls the model. The delivery copy 这封话已交给未来…真实随访队列会把它送回给你 (`FutureSelf.vue:132`) is accurate: it is a scheduled BullMQ job, not a client timer.

## PRIVACY

- The page states 默认只对你自己可见，不会自动公开 (`FutureSelf.vue:215`). No visibility field is sent or stored: `MessageToFutureSelf` (`prisma/schema.prisma:629-644`) has no visibility column, and there is no public read route for it, so the claim is structurally true.
- `allowFutureSelfNotifications` (default `false`, `prisma/schema.prisma:224`, `store.service.ts:2356`) gates only the **notification**, not the delivery: the worker still stamps `deliveredAt` when the flag is off (`follow-up-worker.service.ts:32-34`, `:58`). A user who has notifications off therefore gets no nudge and must open this page to notice the letter arrived.
- The recovery read is gated by `allowRecoveryData` (`store.service.ts:4692`); because it is inside the shared `Promise.all`, its 403 takes down the whole page. See ISSUES.

## ERROR_STATES

- Load failure: `error` is set to the API message or 未来信暂时没有打开 and rendered as a red `error-note` (`FutureSelf.vue:104-107`, `:212`). Because all four reads share one `Promise.all`, a privacy block on `me/recovery` alone produces this generic failure even though the future-message list itself is fine - and the form still renders, so the user can still write, but the existing list is replaced by the error and the loading note.
- Save failure: `error` is set to the API message or 这封未来信没有保存成功 (`:136-138`); `content` is **not** cleared on failure (only on success, `:130-132`), so no text is lost.
- Client-side validation failures write into the same `error` ref: 请先选择要关联的记录 and 请写下内容并选择送达时间 (`:113-116`).

## EMPTY_STATES

- 还没有留给未来的话。你可以从一句简单的话开始。 (`FutureSelf.vue:222`).
- Context picker with nothing to attach: 还没有可以关联的记录 and the select is disabled (`:203-205`).
- While `loading` is true the list section is replaced entirely by 正在读取写下的未来信… (`:219`), so there is no list skeleton.

## NATIVE_RISKS

- Safe area: `.future-page` pads `calc(130px + env(safe-area-inset-bottom))` (`FutureSelf.vue:236`) and the route is in `tabbarPaths`, so the tab bar clears.
- Keyboard: the 1200-character textarea sits in normal flow under `Keyboard.resize: 'body'` (`apps/mp/capacitor.config.ts`), and the save button is below it, so the button can be pushed off-screen while typing on a short viewport. There is no sticky footer.
- `datetime-local` is a native WebView control; its picker renders in the system locale and its value format is the browser default, which is why `asLocalInput` compensates for the timezone offset (`FutureSelf.vue:49-52`).
- Back button: no custom handling; BACK walks WebView history (`apps/mp/src/native/back-button.ts:30-36`), returning to Me or ActionCenter.
- No dial intent, clipboard or external link.

## ISSUES

- P2 NAVIGATION: ActionCenter pushes `/pages/future-self/index?journeyId=<id>` (`apps/mp/src/views/ActionCenter.vue:248`) but FutureSelf never calls `useRoute` - the file imports only `useRouter` (`FutureSelf.vue:2`) and `save()` sends no `journeyId` (`:120-130`). The journey the user was working on is silently dropped, so the letter arrives unlinked.
- P2 STATE_MACHINE: the four reads share one `Promise.all` (`FutureSelf.vue:95-103`). A `403` from the privacy-gated `me/recovery` read blanks the saved-letter list and shows 未来信暂时没有打开, even though `future-messages` returned normally. The recovery read is only used to populate one optional picker (`:33-43`).
- P2 STATE_MACHINE: with `timePreset === 'custom'` the `changePreset` branch deliberately leaves `deliverAt` untouched (`FutureSelf.vue:76-79`), so the field keeps whatever the previous preset wrote. If the user picks 自定义 and submits without touching the input, they get the old preset time with no visual cue that it was never edited.
- P3 DATA: `presetDate('week')` adds 7 days but keeps the current clock time, while `presetDate('tomorrow')` snaps to 20:30 (`FutureSelf.vue:54-65`). 一周后 and 一个月后 therefore inherit whatever second the page was opened at, and `presetDate` clears seconds only for the tomorrow branch (`:56`).
- P3 UX: the custom `datetime-local` input has no `min` (`FutureSelf.vue:187`), so the user can pick a past time and only learns it is invalid from the server's 送达时间必须晚于现在 (`store.service.ts:4567`) after submitting.
- P3 DUPLICATE: `deliveryState` and `scheduledDeliveryText` both format the same moments through `formatMoment` with slightly different sentence templates (`FutureSelf.vue:66-89`).
- P3 DATA: `contextOptions` for journeys reads `item.journey?.id ?? item.id` and `item.journey?.title ?? item.title` (`FutureSelf.vue:35-38`) because `/api/v1/journeys` returns `journeyDetail` envelopes, while the decision and recovery branches expect flat rows (`:39-40`). Three shapes in one computed.

## FINAL_STATUS

PARTIAL - the route, all four reads, the single write, the BullMQ delivery chain and every UI state are traced to lines and the route renders on the APK with 15 controls and 0 console errors, but no future message was actually written end-to-end in this pass, so the scheduled delivery could not be observed.

### Static evidence

- Controls discovered: 7
- API reads (static): `/api/v1/decisions`, `/api/v1/future-messages`, `/api/v1/journeys`, `/api/v1/me/recovery`
- API writes (static): `POST /api/v1/future-messages`
- Candidate fake markers: 1
- Appended: the single fake-marker candidate (placeholder at line 175) is the textarea's HTML placeholder attribute, adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` (M07, M33).
- Appended: runtime cross-check `artifacts/recovery/android-route-manifest.json` - `/pages/future-self/index` rendered=true, textLength 388, 15 visible controls, 0 console errors, 0 failed requests. `artifacts/post-recovery/control-coverage.json` records 15 controls, state `default`, save button disabled with an empty textarea.