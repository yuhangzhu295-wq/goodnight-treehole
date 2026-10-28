# ActionCenter

Source: `apps/mp/src/views/ActionCenter.vue`

Routes: `/pages/action/index`

## PURPOSE

ActionCenter is the action loop. It takes a confirmed situation and turns it into one concrete, small, doable thing for tonight; it tracks whether that thing happened; and when it did not happen, it asks why and produces a smaller version. It also hosts the four support shortcuts (cooldown, decision, handoff, future letter) that the intent step routes to.

## USER_JOB

"Tell me the one smallest thing I can actually do tonight, and then ask me tomorrow whether I did it."

## ENTRY

- Bottom tab 行动, `data-testid=tab-tool` -> `to="/pages/action/index"` (`apps/mp/src/App.vue:97-106`). It is one of the four tab routes (`apps/mp/src/router.ts:48`).
- JourneyDetail timeline, 看看今晚的小行动 -> `/pages/action/index?journeyId=<id>` (`apps/mp/src/views/JourneyDetail.vue:145`).
- JourneyDetail intent, `NEXT_STEP` -> `/pages/action/index?journeyId=<id>` (`apps/api/src/store.service.ts:2833` + `JourneyDetail.vue:100-101`).
- JourneyDetail intent, `STOP_IMPULSE` -> `/pages/action/index?section=vault&journeyId=<id>` (`store.service.ts:2836`).
- JourneyDetail intent, `PREPARE_CONVERSATION` -> `/pages/action/index?section=handoff&journeyId=<id>` (`store.service.ts:2841`).
- NotificationCenter, a `FOLLOW_UP` notice -> `/pages/action/index?section=follow-up` (`apps/api/src/follow-up-worker.service.ts:73`).
- The backend `adaptive.required` nextRoute for a missed action -> `/pages/action/index?section=barrier&actionId=<id>` (`store.service.ts:3445`), which nothing reads.

The three `?section=` variants all land on the same generic screen; see ISSUES.

## EXIT

| control | destination |
| --- | --- |
| `action-shortcut-handoff` | `/pages/reality-handoff/index` with `?journeyId=` when a journey is loaded (`ActionCenter.vue:244`) |
| `action-shortcut-future` | `/pages/future-self/index` with `?journeyId=` when a journey is loaded (`ActionCenter.vue:248`) |
| timeline link on the accepted card | `/pages/journey/detail?id=<id>` (`ActionCenter.vue:329`) |
| 去说说今晚发生了什么 (no-journey mode) | `/pages/tonight/index` (`ActionCenter.vue:330`) |
| `action-followup-strip` | `/pages/notifications/index` (`ActionCenter.vue:336`) |
| `requestTonightAction` with no journey id | `/pages/tonight/index` (`ActionCenter.vue:94`) |

## ROUTES

`/pages/action/index` (`apps/mp/src/router.ts:55`). Single route, no aliases; it is a tab route (`router.ts:48`) and in `tabbarPaths` (`apps/mp/src/App.vue:16`).

## STATES

The card has four modes, plus three overlay surfaces.

| state | driving variable | evidence |
| --- | --- | --- |
| mode `no-journey` | `mainMode` computed | `ActionCenter.vue:42-46`, `PrimaryActionCard.vue:29-33` |
| mode `empty` (journey but no action and no recommendation) | `mainMode` | `ActionCenter.vue:45`, `PrimaryActionCard.vue:35-41` |
| mode `recommendation` | `mainMode` + `recommendation` | `ActionCenter.vue:45`, `PrimaryActionCard.vue:43-55` |
| mode `accepted` (an active commitment exists) | `mainMode` + `activeAction` | `ActionCenter.vue:38-39`, `:44`, `PrimaryActionCard.vue:57-66` |
| planning (button disabled, relabelled) | `planning` | `ActionCenter.vue:21`, `PrimaryActionCard.vue:38-39`, `:52` |
| loading | `loading` | `ActionCenter.vue:19`, `:313` |
| error | `error` | `ActionCenter.vue:20`, `:312` |
| completion sheet open | `completionSheetOpen` | `ActionCenter.vue:23`, `:342` |
| completion reflection text | `completionReflection` | `ActionCenter.vue:24`, `:347` |
| completing (submit disabled) | `completing` | `ActionCenter.vue:25`, `:349` |
| adaptive sheet open (replaces the whole page) | `missedAction` | `ActionCenter.vue:26`, `:294` |
| barrier chosen | `selectedBarrier` | `ActionCenter.vue:27`, `AdaptiveActionSheet.vue:41` |
| adapting / generating | `adapting` | `ActionCenter.vue:29`, `AdaptiveActionSheet.vue:45` |
| adaptive result shown | `adaptiveResult` | `ActionCenter.vue:28`, `AdaptiveActionSheet.vue:47` |
| barrier already recorded for this attempt | `missedRecorded` | `ActionCenter.vue:30`, `:189-196` |
| shortcut sheet open (cooldown or decision) | `shortcutSheet` | `ActionCenter.vue:31`, `:353` |
| shortcut busy | `shortcutBusy` | `ActionCenter.vue:32`, `:361`, `:367` |
| shortcut saved notice | `shortcutNotice` | `ActionCenter.vue:35`, `:370` |
| follow-up strip visible | `mainMode` in recommendation/accepted | `ActionCenter.vue:334` |

## CONTROLS

| control (label/testid) | handler function | what it actually does |
| --- | --- | --- |
| `action-request-plan` (帮我整理一个小行动) | `requestTonightAction` | POST `/journeys/:id/action-plan`, poll the AI job, build `recommendation` |
| 换一个更小的版本 (`@smaller`) | `requestTonightAction` | **identical to the request button**; re-runs the same plan call and overwrites `recommendation` |
| `action-accept-plan` (我愿意试试) | `acceptTonightAction` | POST `/journeys/:id/actions`, then reload |
| 做到了 (`@complete`) | `openCompletionSheet` | opens the reflection sheet |
| `action-complete-submit` (保存这次回顾) | `completeAction` | POST `/actions/:id/checkin` `completed`, then reload |
| 没做到 (`@missed`) | `openAdaptive()` | opens the adaptive sheet for `activeAction` |
| 6 barrier buttons (忘了, 太难了, 情绪太强, 环境不允许, 其实我不想做, 其他) | `chooseBarrier(barrier)` | POST `/actions/:id/checkin` `missed` (once), then POST `/actions/:id/adaptive-plan` and poll |
| `adaptive-accept` (试试这个更小一步) | `confirmAdaptiveAction` | POST `/actions/:id/adapt`, close, reload |
| 我想换一个 (`@retry`) | `resetAdaptive` | clears `adaptiveResult` only |
| adaptive back (‹, `@close`) | `closeAdaptive` | refuses to close while `adapting`; otherwise resets all adaptive state |
| 查看这段旅程 (timeline link) | inline push | to JourneyDetail |
| 去说说今晚发生了什么 (`@tonight`) | inline push | to TonightHome |
| `action-followup-strip` | inline push | to NotificationCenter |
| `action-shortcut-cooldown` (先别发出去) | `openShortcut('cooldown')` | opens the cooldown sheet |
| `action-shortcut-decision` (一个重要决定) | `openShortcut('decision')` | opens the decision sheet |
| `action-shortcut-handoff` (找现实中的人) | `openShortcut('handoff')` | pushes RealityHandoff |
| `action-shortcut-future` (留给未来的我) | `openShortcut('future')` | pushes FutureSelf |
| 先放一晚 (cooldown submit) | `saveCooldown` | POST `/api/v1/cooldowns` `{title, hours:24}` |
| 先留在这里 (decision submit) | `saveDecision` | POST `/api/v1/decisions` `{journeyId, question, options:[]}` |
| sheet × (both sheets) | `closeShortcutSheet` / `completionSheetOpen=false` | closes |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 14 controls; `artifacts/post-recovery/control-coverage.json` shows 10 visible controls on `/pages/action/index` in the `empty` mode (card section, request button, four shortcuts, four tab links), 0 console errors, 0 failed requests.

## API_READS

- `GET /api/v1/tonight` (`ActionCenter.vue:65`) -> `controllers.ts:205-208` -> `store.tonightHome` (`store.service.ts:2425-2456`).
- `GET /api/v1/journeys/:journeyId` (`ActionCenter.vue:67`), only when a journey id is resolvable from `?journeyId=` or from `tonight.journey.id` -> `controllers.ts:286-289` -> `store.journeyDetail` (`store.service.ts:2850-2861`).
- `GET /api/v1/ai/tasks/:jobId` polled in `waitForJob` up to 30 times at 400 ms (`ActionCenter.vue:79-89`).

## API_WRITES

| call | site | store method | models changed |
| --- | --- | --- | --- |
| `POST /journeys/:id/action-plan` | `ActionCenter.vue:101` | `store.generateActionPlan` (`store.service.ts:3281-3298`) | **AIJob** (task `action_plan`); `AgentDecisionLog` on completion |
| `POST /journeys/:id/actions` | `:129` | `store.createActionCommitment` (`store.service.ts:3300-3371`) | **ActionCommitment** (active), **OutcomeCheckin** (pending), **FollowUpJob** (kind `action_checkin`), **JourneyUpdate** (kind `commitment_created`), **LifeJourney.stage='acting'** |
| `POST /actions/:id/checkin` `completed` | `:154` | `store.checkinAction` (`store.service.ts:3373-3448`) | **ActionCommitment.status='completed'`, **OutcomeCheckin.status='completed'`, **JourneyUpdate** (kind `checkin`), **FollowUpJob.status='completed'` |
| `POST /actions/:id/checkin` `missed` | `:190` | `store.checkinAction` | **ActionCommitment.status='paused'`, **OutcomeCheckin.status='missed'`, **JourneyUpdate** (kind `checkin` with `payload.barrier`), **FollowUpJob** closed |
| `POST /actions/:id/adaptive-plan` | `:197` | `store.requestAdaptiveAction` (`store.service.ts:3450-3472`) | **AIJob** (task `adaptive_action`) |
| `POST /actions/:id/adapt` | `:227` | `store.createAdaptiveAction` (`store.service.ts:3474-3489`) -> `createActionCommitment` | a new **ActionCommitment** with `parentActionId`, `adaptationReason`, `attemptNumber+1`, plus its checkin, follow-up and journey update |
| `POST /api/v1/cooldowns` | `:263` | `store.createCooldown` (`store.service.ts:4425-4463`) | **CooldownItem**, **FollowUpJob** (kind `DECISION_COOLDOWN`) |
| `POST /api/v1/decisions` | `:278` | `store.createDecision` (`store.service.ts:4333+`) | **DecisionRecord** |

Note `checkinAction` maps the requested status onto the commitment as follows: `completed -> completed`, `skipped -> skipped`, anything else (including `missed`) `-> paused` (`store.service.ts:3386-3389`). The check-in itself is only ever `completed` or `missed` (`:3402`).

## DB_ENTITIES

- Reads: **LifeJourney**, **ActionCommitment**, **OutcomeCheckin** (from `journeyDetail`), **FollowUpJob**, **PeerMatch**, **Letter**, **UserNotification** (from `tonightHome`).
- Writes: **AIJob**, **ActionCommitment**, **OutcomeCheckin**, **FollowUpJob**, **JourneyUpdate**, **LifeJourney**, **CooldownItem**, **DecisionRecord**, **AgentDecisionLog**.
- Cross-checked against `artifacts/product-audit/db-models.json` and `prisma/schema.prisma`.

## ADMIN_VISIBILITY

- **ActionCommitment** -> resource **actions** -> `/experience/actions` (`apps/admin/src/router.ts:65`, `GET /api/admin/v1/actions`, `controllers.ts:1935`).
- **OutcomeCheckin** -> resource **checkins** -> `/experience/checkins` (`apps/admin/src/router.ts:66`, `controllers.ts:1950`).
- **FollowUpJob** -> resource **follow-ups** -> `/experience/follow-ups` (`apps/admin/src/router.ts:69`, `controllers.ts:2005`).
- **AIJob** -> resource **jobs** -> `/ai/jobs` (`apps/admin/src/router.ts:50`).
- **DecisionRecord** and **CooldownItem** have **no** admin resource in `menuGroups`, so the decision vault and the cooldown box are invisible to operators even though the admin app has a 安全与陪伴 group.

## AI_USAGE

Two task types, both style `rational` (`store.service.ts:5750-5766`), content type `LifeJourney` (`store.service.ts:5772-5792`):

- `action_plan` from `generateActionPlan` (`store.service.ts:3281-3298`), triggered by 帮我整理一个小行动 and by 换一个更小的版本.
- `adaptive_action` from `requestAdaptiveAction` (`store.service.ts:3450-3472`), triggered by choosing a barrier.

`waitForJob` accepts `succeeded` and `fallback` and throws on `failed` (`ActionCenter.vue:83-86`). The view then reads `task.structured` and requires a non-empty `title`; otherwise it throws 没有形成可以确认的小行动 (`:104-105`, `:200-201`).

With DAPI at HTTP 402 the job lands in `fallback`, and the template branch returns a usable `title` for both task types: `action_plan` -> 先完成一个五分钟的小动作 (`store.service.ts:5992-6000`), `adaptive_action` -> 把"<topic>"缩小一点 with `difficulty:'tiny'` and `expectedDuration:'5 分钟'` (`store.service.ts:6001-6011`). So both AI steps complete with template content and the user sees a plausible, entirely template-generated action with no disclosure. The `action_plan` template sets `dueInDays: 1`, which `acceptTonightAction` converts into a due date 24 h out (`ActionCenter.vue:127-131`).

## PRIVACY

- No `privacyAllows` gate on any of the eight calls. The action loop is not covered by a `PrivacySetting` flag; the only privacy-shaped behaviour is `createActionCommitment` inheriting the journey's `PRIVATE` visibility.
- `createCooldown` and `createDecision` are ungated (`store.service.ts:4425-4463`, `:4333+`).
- The `allowRecoveryData` flag does **not** gate anything here, unlike Recovery and SupportPlan.

## ERROR_STATES

Every write has a catch that sets the shared `error` ref, rendered as `role="alert"` at the top of the page (`ActionCenter.vue:312`):

- load: 行动加载失败 (`:69`).
- action plan: 行动建议暂时不可用 or the thrown 没有形成可以确认的小行动 (`:116`).
- accept: 这一步没有保存成功 (`:137`).
- complete: 这次回顾没有保存成功 (`:162`).
- barrier / adaptive plan: 没能生成更小的一步 (`:214`), which also covers the thrown 没有形成更小的一步 (`:201`) and the `waitForJob` timeout 整理这一步花的时间有点久 (`:87`).
- adaptive accept: 新的行动保存失败 (`:236`).
- cooldown: 这句话暂时没能放进去 (`:268`).
- decision: 这个决定暂时没能保存 (`:281`).

One structural problem: the error paragraph is inside the `<section v-else>` that is itself guarded by `v-if="missedAction"` (`ActionCenter.vue:294`, `:305`, `:312`). While the adaptive sheet is open, the whole main section including the error paragraph is unmounted, so an error from `chooseBarrier` or `confirmAdaptiveAction` is **invisible** - it is stored in `error` but nothing renders it. The user sees the sheet return to its "pick a barrier" state with no explanation.

## EMPTY_STATES

- `empty` mode: the card shows 先把这一步整理小一点 with an explanation and the request button (`PrimaryActionCard.vue:35-41`). Good.
- `no-journey` mode: 先从今晚说起 with a button to TonightHome (`PrimaryActionCard.vue:29-33`). Good.
- No empty state for the adaptive sheet's result area before a barrier is chosen: `select-hint` shows 选一个最接近的原因，我们就从那里开始缩小。 (`AdaptiveActionSheet.vue:53`). Good.
- No empty state anywhere for the cooldown/decision sheets; they are pure input forms.

## NATIVE_RISKS

- Safe area: this is a tab route. The page sets `padding:0 16px calc(138px + env(safe-area-inset-bottom))`, relaxed to `calc(126px + ...)` under 390 px (`ActionCenter.vue` scoped styles). The completion and shortcut sheets pad with `calc(16px + env(safe-area-inset-bottom))` (`.sheet-backdrop`). Adequate.
- The adaptive sheet is a full-page replacement rather than an overlay (`v-if="missedAction"` at the top level, `ActionCenter.vue:293-303`), and it carries its own `calc(102px + env(safe-area-inset-bottom))` padding. Because it replaces the page rather than covering it, the fixed tab bar still renders underneath it (the route is in `tabbarPaths`) and can be tapped, navigating away mid-adaptation.
- Back button: not intercepted. The adaptive sheet, the completion sheet and the shortcut sheet all lack Android back handling (`apps/mp/src/native/back-button.ts:26-33`); BACK with any of them open leaves the page entirely. For the adaptive sheet that also discards an in-progress adaptation.
- Keyboard: the completion textarea and the two sheet inputs are inside bottom-anchored sheets with `align-items:flex-end` (`.sheet-backdrop`), and `Keyboard.resize: 'body'` shrinks the body, so the sheet can be pushed under the keyboard. Not verified on device.
- Dial intent: none. Clipboard: none (no copy control on this page).
- `window.setTimeout` is used for the poll loop (`ActionCenter.vue:75-77`), which is fine in the WebView; there is no background-timer risk because the poll is bounded at 30 attempts.

## ISSUES

- P1 FUNCTIONAL: 换一个更小的版本 does not do what it says. `@smaller="requestTonightAction"` (`ActionCenter.vue:326`) is the same handler as 帮我整理一个小行动, so it re-runs the identical `action_plan` job with the same content and typically returns the same recommendation. There is no smaller-version request, no `difficulty` adjustment and no attempt counter. The genuine "smaller" path exists only through the missed -> barrier -> `adaptive_action` flow.
- P1 STATE_MACHINE: errors raised while the adaptive sheet is open are never shown. `error` renders only inside the `v-else` main section (`ActionCenter.vue:312`), which is unmounted whenever `missedAction` is set (`:294`, `:305`). Both `chooseBarrier` (`:214`) and `confirmAdaptiveAction` (`:236`) set `error` in that state.
- P1 NAVIGATION: the three `?section=` entry points are ignored. `openShortcut` and `load` never read `route.query.section` (exhaustive search of `apps/mp/src` for `query.section` finds nothing), so a `STOP_IMPULSE` user lands on the generic action card instead of the cooldown sheet, a `PREPARE_CONVERSATION` user lands on the generic card instead of the handoff, and a `FOLLOW_UP` notification lands on the generic card instead of a follow-up prompt. The backend even computes a dedicated `nextRoute` for the missed case (`store.service.ts:3445`) that nothing consumes.
- P2 AI: both AI steps are satisfied by template output with no disclosure. With DAPI at HTTP 402, 帮我整理一个小行动 always yields 先完成一个五分钟的小动作 (`store.service.ts:5992-6000`) and the barrier flow always yields 把"<topic>"缩小一点 (`store.service.ts:6001-6011`); the view accepts `fallback` as success (`ActionCenter.vue:83`).
- P2 FUNCTIONAL: `acceptTonightAction` does not guard against a double submit. It sets `planning`, but the guard at the top is only `if (!journeyId || !recommendation.value?.title) return;` (`:124`), and `recommendation` is cleared only after the POST resolves (`:133`), so a fast double tap creates two commitments. The card's accept button is disabled while `planning` (`PrimaryActionCard.vue:52`), which mitigates but does not close it.
- P2 DATA: `missedRecorded` is per-sheet-open state (`ActionCenter.vue:30`, reset in `openAdaptive` at `:170`). Choosing a second barrier after a successful `adapt` does not re-record, which is correct, but choosing a second barrier after a **failed** `adaptive-plan` also does not re-record even though the first check-in was already written, so the commitment stays `paused` while the user may believe they are still choosing.
- P2 UX: `closeAdaptive` silently refuses to close while `adapting` (`ActionCenter.vue:175-177`), and the sheet's back button has no disabled state or busy indication, so tapping ‹ during generation appears to do nothing.
- P3 FUNCTIONAL: the barrier list in the sheet omits `something_else` even though it is part of the `ActionBarrier` union (`packages/shared-types/src/goodnight-2.ts:45-52`); the server's label table still has a string for it (`store.service.ts:3458`), so it is an unreachable value from the product UI.
- P3 STATE_MACHINE: the follow-up strip's default message 接受后，明晚我会回来问你，后来怎么样了。 (`ActionCenter.vue:335`) is shown in the `recommendation` mode before anything has been accepted, which states a promise that has not been made yet.
- P3 UX: the adaptive sheet replaces the page rather than covering it, so the fixed tab bar remains visible and tappable during adaptation (`ActionCenter.vue:293-303`; the route is in `App.vue:16`).

## FINAL_STATUS

PARTIAL - all four card modes, all eight writes, the adaptive sub-machine and the AI fallback content are traced to lines, and the route renders on the APK, but the runtime sweep only reached `empty` mode, so the recommendation, accepted and adaptive states were not exercised on a device.

### Static evidence

- Controls discovered: 14
- API reads (static): `/api/v1/ai/tasks/:param`, `/api/v1/journeys/:param`, `/api/v1/tonight`
- API writes (static): `POST /api/v1/actions/:param/adapt`, `POST /api/v1/actions/:param/adaptive-plan`, `POST /api/v1/actions/:param/checkin`, `POST /api/v1/cooldowns`, `POST /api/v1/decisions`, `POST /api/v1/journeys/:param/action-plan`, `POST /api/v1/journeys/:param/actions`
- Candidate fake markers: 4
- Appended: the four fake-marker candidates are the `setTimeout` inside `wait()` (line 76, the poll interval) and three HTML `placeholder` attributes (lines 348, 360, 366), adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` (M01, M02).
- Appended: the runtime sweep recorded `/pages/action/index` in the `empty` mode, i.e. `mainMode === 'empty'` - a journey exists but no active action and no recommendation, which is the state after `load()` and before any AI call.
- Appended: `AdaptiveActionSheet` renders 6 barrier buttons (`AdaptiveActionSheet.vue:13-20`) while the shared union has 7 values, so `something_else` is unreachable from the UI.
