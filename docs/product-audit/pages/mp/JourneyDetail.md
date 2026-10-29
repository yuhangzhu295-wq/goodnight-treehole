# JourneyDetail

Source: `apps/mp/src/views/JourneyDetail.vue`

Routes: `/pages/journey/detail`

## PURPOSE

JourneyDetail is the five-step support state machine that sits behind a written situation. It confirms what the AI understood, records how bad it feels right now, asks what kind of support the user wants, then either stabilises the person or opens the ongoing timeline. It is the page that decides which of the product's other support surfaces the user is sent to.

## USER_JOB

"Something happened and I wrote it down. Tell me if you understood it, help me see how bad it is, and then take me to the thing I actually need."

## ENTRY

- TonightHome after a new journey: `/pages/journey/detail?id=<id>&analysisJob=<jobId>` (`apps/mp/src/views/TonightHome.vue:55`).
- TonightHome active-journey 继续 ›: `/pages/journey/detail?id=<id>`, no analysis job (`TonightHome.vue:76`).
- Me, `data-testid=entry-current-journey` -> `/pages/journey/detail?id=<id>` (`apps/mp/src/views/Me.vue:169`).
- ActionCenter, `@timeline` on the accepted card -> `/pages/journey/detail?id=<id>` (`apps/mp/src/views/ActionCenter.vue:329`).
- Archive, opening an archived journey -> `/pages/journey/detail?id=<id>` (`apps/mp/src/views/Archive.vue:135`).
- SafetySupport `stayHere` -> `/pages/journey/detail?id=<id>&mode=stabilize` (`apps/mp/src/views/SafetySupport.vue:41`).
- StabilizeScreen 换一种支持 -> `/pages/journey/detail?id=<id>&mode=intent` (`apps/mp/src/components/journey/StabilizeScreen.vue:38`).
- Self, from the intent step: `chooseIntent('JUST_LISTEN')` -> `/pages/journey/detail?id=<id>&mode=stabilize` (`JourneyDetail.vue:99`); this is also the route the backend returns for `JUST_LISTEN` (`apps/api/src/store.service.ts:2822-2826`).

## EXIT

The exits depend on the step and on what the backend returns.

| from | control | destination |
| --- | --- | --- |
| intent | `chooseIntent('HIGH_DISTRESS')` or a safety-first journey | `/pages/safety/index?journeyId=<id>` (`JourneyDetail.vue:98`) |
| intent | `chooseIntent('JUST_LISTEN')` | `/pages/journey/detail?id=<id>&mode=stabilize` (`:99`) |
| intent | `NEXT_STEP` | `/pages/action/index?journeyId=<id>` (`store.service.ts:2833` + `:101`) |
| intent | `FIND_PEOPLE` | `/pages/peers/index?journeyId=<id>` (`store.service.ts:2827` + `:101`) |
| intent | `SEE_OUTCOMES` | `/pages/peers/index?view=outcomes&journeyId=<id>` (`store.service.ts:2828-2832` + `:101`) |
| intent | `STOP_IMPULSE` | `/pages/action/index?section=vault&journeyId=<id>` (`store.service.ts:2834-2838` + `:101`) |
| intent | `PREPARE_CONVERSATION` | `/pages/action/index?section=handoff&journeyId=<id>` (`store.service.ts:2839-2843` + `:101`) |
| intent | `NOTHING_NOW` | `/pages/tonight/index?journeyId=<id>` (`store.service.ts:2844` + `:101`) |
| timeline | 看看今晚的小行动 | `/pages/action/index?journeyId=<id>` (`JourneyDetail.vue:145`) |
| timeline | 换一种支持 | back to the intent step, no navigation (`JourneyDetail.vue:145`) |
| timeline | 归档这段旅程 -> 确认归档 | `/pages/archive/index` (`JourneyDetail.vue:123`) |
| any | hero 返回 | `router.back()` (`JourneyFlowShell.vue:14`) |
| stabilize | handoff button | `/pages/reality-handoff/index?journeyId=<id>` (`StabilizeScreen.vue:38`) |

## ROUTES

`/pages/journey/detail` (`apps/mp/src/router.ts:56`). Single route, no aliases. `activeTab` maps it to the 今晚 tab (`apps/mp/src/App.vue:47-52`); it is in `tabbarPaths` (`App.vue:38`), so the tab bar renders here.

## STATES

The five flow steps plus the archive dialog:

| state | driving variable | evidence |
| --- | --- | --- |
| step: confirm the situation | `flowStep === 'confirm'` | `JourneyDetail.vue:25`, `:140` |
| step: emotion temperature | `flowStep === 'temperature'` | `:141` |
| step: support intent | `flowStep === 'intent'` | `:142` |
| step: stabilize | `flowStep === 'stabilize'` | `:143` |
| step: timeline | `flowStep === 'timeline'` (the `v-else`) | `:144` |
| analysis running (spinner replaces the confirm screen) | `analysisBusy` -> `SituationConfirmationScreen` `analyzing` prop | `JourneyDetail.vue:23`, `:60`, `:140` |
| editing the snapshot | `SituationConfirmationScreen.editing` (local) | `SituationConfirmationScreen.vue:11`, `:40` |
| loading | `loading` | `JourneyDetail.vue:21`, `:138` |
| busy (all step buttons disabled) | `busy` | `JourneyDetail.vue:22`, `SituationConfirmationScreen` `busy` prop, `EmotionTemperatureScreen` has none |
| error | `error` | `JourneyDetail.vue:24`, `:136` |
| later-note editor open | `JourneyTimelineScreen.writingLater` (local) | `JourneyTimelineScreen.vue:8`, `:35` |
| archive confirmation open | `archiveConfirmationOpen` | `JourneyDetail.vue:27`, `:149` |
| archive trigger visible | `journey.status === 'active' \| 'paused'` | `:146` |
| stabilise breathing countdown | `StabilizeScreen.seconds` (local) | `StabilizeScreen.vue:9`, `:14-20` |
| stabilise status line | `StabilizeScreen.status` (local) | `StabilizeScreen.vue:11`, `:34` |
| missing journey id | `journeyId` empty -> error 缺少这段经历的编号 | `JourneyDetail.vue:54` |

Step selection is `inferStep()` (`JourneyDetail.vue:44-52`): `mode=stabilize` forces stabilize; `mode=intent` forces intent; otherwise no snapshot or `confidence !== 'user_confirmed'` -> confirm; no `currentIntent` -> temperature; `currentIntent === 'JUST_LISTEN'` -> stabilize; otherwise timeline.

## CONTROLS

| control (label/testid) | handler function | what it actually does |
| --- | --- | --- |
| hero 返回 | `@back` -> `router.back()` | `JourneyFlowShell.vue:14`, wired at `JourneyDetail.vue:134` |
| `fingerprint-accurate` (准确) | `confirmSituation` | PATCH `/journeys/:id/situation` with the split snapshot, then advance to temperature |
| `fingerprint-edit` (改一处 / 先不改了) | local `editing = !editing` | toggles the textareas |
| 保存这一处 (editing mode) | `confirmSituation` | same PATCH |
| `fingerprint-reanalyze` (重新整理) | `reanalyze` | POST `/journeys/:id/situation/reanalyze`, then poll the returned job |
| `temperature-continue` (继续) | `saveTemperature` | PATCH `/journeys/:id/situation` with intensity + behaviour signals, then advance to intent |
| 今天先只记录 (skip) | `flowStep = 'intent'` | advances without saving |
| `intent-<value>` (8 cards) | `chooseIntent(intent)` | PATCH `/journeys/:id/intent`, then route on the returned `targetRoute` |
| `stabilize-breath` | `beginBreathing` | 30 s interval; on completion POST `/journeys/:id/updates` kind `stabilize_breath` |
| `stabilize-pause` | `pauseImpulse` | POST `/api/v1/cooldowns` with `hours:24` |
| 留下 (stabilize note) | `saveNote` | POST `/journeys/:id/updates` kind `stabilize_note` |
| 帮我告诉现实中的一个人 | inline push | to RealityHandoff |
| 换一种支持 (stabilize) | inline push | back to `mode=intent` |
| 写下后来呢 | local `writingLater = true` | opens the later editor |
| 保存 (later) | `saveLater` | POST `/journeys/:id/updates` kind `later` |
| 看看今晚的小行动 | inline push | to ActionCenter |
| 换一种支持 (timeline) | `flowStep = 'intent'` | returns to the intent step in place |
| `journey-archive-start` (归档这段旅程) | `requestArchive` | opens the confirmation dialog |
| 继续陪伴 | `archiveConfirmationOpen = false` | closes the dialog |
| `journey-archive-confirm-action` (确认归档) | `archiveJourney` | PATCH `/journeys/:id/status` `archived`, then go to Archive |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 11 controls for the view itself (the step components hold the rest); `artifacts/post-recovery/control-coverage.json` shows 5 visible controls on `/pages/journey/detail` - the back button plus the four tab links - because the sweep loaded the route with no `id`, so the page rendered its missing-id error state and no step content.

## API_READS

- `GET /api/v1/journeys/:id` (`JourneyDetail.vue:56`). Handler `controllers.ts:286-289` -> `store.journeyDetail` (`store.service.ts:2850-2861`), returning the journey plus snapshot, updates, commitments, checkins, recovery snapshots and peer matches.
- `GET /api/v1/ai/tasks/:jobId` polled up to 36 times at 500 ms (`JourneyDetail.vue:60-69`).

## API_WRITES

| call | site | store method | models changed |
| --- | --- | --- | --- |
| `PATCH /api/v1/journeys/:id/situation` (confirm) | `JourneyDetail.vue:74` | `store.confirmSituation` (`store.service.ts:3014-3134`) | **SituationSnapshot** (facts/feelings/needs/constraints/risks, confidence `user_confirmed`), **LifeJourney** (`intensity`, `initialIntensity`), **JourneyUpdate** (kind `intensity`, only when the value changed) |
| `POST /api/v1/journeys/:id/situation/reanalyze` | `:80` | `store.reanalyzeSituation` (`store.service.ts:3136-3227`) | **SituationSnapshot** (confidence back to `agent_draft`), **JourneyUpdate** (kind `fingerprint_reanalysis_requested`), **AIJob** (new `situation_analysis`), **AgentDecisionLog** (async) |
| `PATCH /api/v1/journeys/:id/situation` (temperature) | `:88` | `store.confirmSituation` | **SituationSnapshot** (intensity, behaviourSignals), **JourneyUpdate** (kind `intensity`) |
| `PATCH /api/v1/journeys/:id/intent` | `:97` | `store.setJourneyIntent` (`store.service.ts:2766-2812`) | **LifeJourney** (`currentIntent`, `stage`, `intentUpdatedAt`), **SafetyEvent** (only for the safety-first branch) |
| `POST /api/v1/journeys/:id/updates` kind `later` | `:108` | `store.addJourneyUpdate` (`store.service.ts:3247-3279`) | **JourneyUpdate** |
| `POST /api/v1/journeys/:id/updates` kinds `stabilize_breath` / `stabilize_note` | `StabilizeScreen.vue:20`, `:24` | `store.addJourneyUpdate` | **JourneyUpdate** |
| `POST /api/v1/cooldowns` | `StabilizeScreen.vue:23` | `store.createCooldown` (`store.service.ts:4425-4463`) | **CooldownItem**, **FollowUpJob** (kind `DECISION_COOLDOWN`) |
| `PATCH /api/v1/journeys/:id/status` `archived` | `JourneyDetail.vue:121` | `store.updateJourneyStatus` (`store.service.ts:4810-4818`) | **LifeJourney** (`status`), plus notification cleanup in the archive path (`store.service.ts:2965`) |

## DB_ENTITIES

- Reads: **LifeJourney**, **SituationSnapshot**, **JourneyUpdate**, **ActionCommitment**, **OutcomeCheckin**, **RecoverySnapshot**, **PeerMatch** (all from `journeyDetail`).
- Writes: **SituationSnapshot**, **LifeJourney**, **JourneyUpdate**, **SafetyEvent** (intent safety branch), **CooldownItem**, **FollowUpJob**, **AIJob**, **AgentDecisionLog**.
- Cross-checked against `artifacts/product-audit/db-models.json` and `prisma/schema.prisma`.

## ADMIN_VISIBILITY

- The journey itself: resource **journeys** -> `/experience/journeys` (`apps/admin/src/router.ts:64`).
- The intent safety branch's **SafetyEvent**: resource **safety-events** -> `/safety/events` (`apps/admin/src/router.ts:77`).
- The cooldown's **FollowUpJob**: resource **follow-ups** -> `/experience/follow-ups` (`apps/admin/src/router.ts:69`).
- **SituationSnapshot**, **JourneyUpdate**, **CooldownItem** and **AgentDecisionLog** have no admin resource in `menuGroups`, so the confirmed facts, the timeline and the cooldown item itself are never visible to an operator. Only the aggregate journey row and the follow-up queue are.

## AI_USAGE

Two AI touchpoints, both `situation_analysis`, style `rational` (`store.service.ts:2541-2548`, `:3154-3161`; `defaultStyleForTask` `store.service.ts:5750-5766`), content type `LifeJourney` (`store.service.ts:5772-5792`).

- The job created by TonightHome is polled here through `analysisJob` (`JourneyDetail.vue:132`, `:60-69`). While it runs, `analysisBusy` makes `SituationConfirmationScreen` render `data-testid=fingerprint-loading` instead of the facts.
- `reanalyze` creates a new job and polls it the same way (`:80`).

Failure handling: `waitForAnalysis` accepts `succeeded` and `fallback`; only `failed` sets an error, and the copy is 这次整理暂时没有完成，你可以根据原话自己改一处。 (`JourneyDetail.vue:66-67`). After the loop it always calls `load()` again (`:69`), so the screen refreshes either way.

With DAPI returning HTTP 402 the job lands in `fallback` and the backend folds the template `structuredResult` into the snapshot (`store.service.ts:2553-2608`), producing facts/feelings/needs from `fallbackStructuredTask` (`store.service.ts:5968-5991`) - for example `title: '<domain>里正在整理的一件事'` and `facts: [input.content]`. The view treats that as a normal completion and asks the user to confirm template-derived content as an accurate reading of their situation. There is no disclosure that the analysis degraded.

## PRIVACY

- `PATCH /journeys/:id/status` with `archived` is gated by `privacyAllows(userId, 'allowJourneyArchiveRetention', ...)` (`store.service.ts:4812-4813`), which is `false` by default (`store.service.ts:2355`). The failure surfaces as the generic 这段旅程暂时没有归档 banner; the view does not offer a link to the privacy settings, unlike Recovery which shows a dedicated gate.
- The read `journeyDetail` and all the other writes on this page are not gated by any `PrivacySetting` flag.
- `createCooldown` from StabilizeScreen is not gated either.
- `LifeJourney.visibility` defaults to `PRIVATE` and this page never changes it.

## ERROR_STATES

- missing id: 缺少这段经历的编号 (`JourneyDetail.vue:54`) - this is what the Android sweep hit on the bare route.
- load failure: 这段经历暂时没有打开 or the API message (`:56`).
- confirm failure: 这次确认没有保存 (`:74`).
- reanalyze failure: 重新整理没有启动 (`:80`).
- temperature failure: 情绪记录没有保存 (`:90`).
- intent failure: 这项需要没有保存 (`:102`).
- later-note failure: 后来记录没有保存 (`:108`).
- archive failure: 这段旅程暂时没有归档 (`:125`).
- analysis failed: 这次整理暂时没有完成... (`:67`).

All render into `<p v-if="error" class="journey-error" role="alert">` at the top of the flow main (`:136`). The step content still renders underneath, so the user can retry. StabilizeScreen has its own inline `status` line for its three writes (`StabilizeScreen.vue:34`) which reports both success and failure, including 记录会在网络恢复后再试 for a failed breathing update.

## EMPTY_STATES

- Timeline with no updates: `<p v-if="!updates.length" class="empty">第一条真实记录会在这里留下来。</p>` (`JourneyTimelineScreen.vue:35`). In practice `createJourney` always writes a `created` update, so this is only reachable for a journey whose updates were cleared.
- Snapshot sections with no items: each section renders a muted fallback string (还没有足够的信息 / 还在慢慢看清此刻的感受 / 这部分也可以之后再补充, `SituationConfirmationScreen.vue:22-26`).
- **No empty state for a null snapshot.** The confirm screen is rendered only when `detail.snapshot` is truthy (`JourneyDetail.vue:140`); if `flowStep` is `confirm` and the snapshot is missing, nothing renders in the main slot and the page is blank apart from the hero and the tab bar. This is reachable: `inferStep` selects `confirm` precisely when there is no snapshot (`:48`).

## NATIVE_RISKS

- Safe area: this is a tab route; `JourneyFlowShell` pads `calc(118px + env(safe-area-inset-bottom))`, raised to `136px` in the second rule block, and the timeline variant drops to `36px` (`JourneyFlowShell.vue` scoped styles). The timeline variant's 36 px is less than the tab bar height, so the last timeline action buttons can sit under the fixed tab bar.
- Keyboard: the later-note textarea, the snapshot edit textareas, the temperature thought field and the stabilize note input are all in normal flow; `Keyboard.resize: 'body'` (`apps/mp/capacitor.config.ts`) keeps them reachable.
- Back button: not intercepted. The archive confirmation dialog (`JourneyDetail.vue:149-156`) has no `@click.self` on its mask and no back-button handling, so the Android BACK button navigates away from the whole page instead of dismissing the dialog.
- Dial intent: none on this page.
- WebView history: every `chooseIntent` branch pushes a new entry, and the `JUST_LISTEN` branch pushes the same route with `mode=stabilize`, so a user who picks intents repeatedly builds a deep history stack that BACK must walk through one entry at a time.

## ISSUES

- P1 STATE_MACHINE: the confirm step renders nothing when the snapshot is missing. `v-if="flowStep === 'confirm' && detail.snapshot"` (`JourneyDetail.vue:140`) combined with `inferStep` choosing `confirm` when there is no snapshot (`:48`) means a journey without a snapshot produces a blank page with no error and no way forward except BACK.
- P1 NAVIGATION: the intent routes for `STOP_IMPULSE` and `PREPARE_CONVERSATION` carry `?section=vault` / `?section=handoff` (`store.service.ts:2836`, `:2841`) and `FIND_PEOPLE`/`SEE_OUTCOMES` carry `?view=outcomes` (`store.service.ts:2830`), but no mp file reads `route.query.section` or `route.query.view` (exhaustive search of `apps/mp/src`). Every one of those intents therefore lands on the same generic ActionCenter or PeerNetwork as the others; the distinction the user just made is discarded.
- P1 AI: a `fallback` situation analysis is presented as a real reading of the user's situation. The view accepts `fallback` as success (`JourneyDetail.vue:66`) and the backend writes template facts into the snapshot (`store.service.ts:2553-2608`, `:5968-5991`). With DAPI at HTTP 402 this is the normal path, and the confirm screen asks the user to validate template text as an understanding of their own experience.
- P2 FUNCTIONAL: `saveTemperature` returns silently when there is no snapshot (`JourneyDetail.vue:84`, `if (!detail.value?.snapshot) return;`). The user taps 继续, nothing is saved, no error appears, and the flow advances anyway because `flowStep = 'intent'` is only reached inside the `try` - so in that case the flow does not even advance, leaving a dead button.
- P2 FUNCTIONAL: the archive failure for a user without `allowJourneyArchiveRetention` is a bare banner (`JourneyDetail.vue:125`) with no link to `/pages/settings/privacy`, unlike Recovery's dedicated privacy gate (`Recovery.vue:126-130`).
- P2 STATE_MACHINE: `EmotionTemperatureScreen` receives no `busy` prop (`JourneyDetail.vue:141`) even though `saveTemperature` sets `busy`; the 继续 button is never disabled, so a double tap issues two PATCHes.
- P3 FUNCTIONAL: the dead guard in `reanalyzeSituation`. It sets `snapshot.confidence = 'agent_draft'` at `store.service.ts:3144` and then returns early if `current.confidence === 'user_confirmed'` at `:3166`, a condition that can never be true after line 3144. The intent (never overwrite a confirmed snapshot) is defeated by the line above it.
- P3 UX: the archive confirmation mask has no `@click.self` (`JourneyDetail.vue:149`) while every other sheet in the product does (e.g. `TonightHome.vue:80`, `RealityHandoff.vue:63`), so tapping outside the dialog does nothing.
- P3 NATIVE: the timeline variant of the shell pads only 36 px at the bottom (`JourneyFlowShell.vue`) while the tab bar is rendered on this route, so the timeline action buttons can be partially covered.
- P3 DUPLICATE: the temperature save path and the confirm save path both PATCH the same `/situation` endpoint with different field subsets (`JourneyDetail.vue:74` vs `:88`), and the server's `confirmSituation` cannot tell them apart, so each call re-writes `fingerprintJson` and re-marks `user_confirmed` (`store.service.ts:3102-3113`).

## FINAL_STATUS

PARTIAL - the step machine, all eight writes, the intent routing table and the AI fallback path are fully traced to lines, but the runtime sweep only rendered the missing-id error state (5 controls), so no step of the flow was exercised on a device.

### Static evidence

- Controls discovered: 11
- API reads (static): `/api/v1/ai/tasks/:param`, `/api/v1/journeys/:param`
- API writes (static): `PATCH /api/v1/journeys/:param/intent`, `PATCH /api/v1/journeys/:param/situation`, `PATCH /api/v1/journeys/:param/status`, `POST /api/v1/journeys/:param/situation/reanalyze`, `POST /api/v1/journeys/:param/updates`
- Candidate fake markers: 1
- Appended: the single fake-marker candidate (setTimeout at line 59) is the `sleep()` poll interval inside `waitForAnalysis`, adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` (M08).
- Appended: two further writes reach the same endpoints from `StabilizeScreen.vue` (`POST /journeys/:id/updates` and `POST /api/v1/cooldowns`), so the endpoint list above is the view's own calls only.
- Appended: `inferStep` is the single place the step is decided, and it is called only from `load()` when `infer` is true (`JourneyDetail.vue:44-56`); the two in-flow transitions to `intent` and `stabilize` after the initial load bypass it.
