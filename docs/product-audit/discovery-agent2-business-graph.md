# Agent-2 BUSINESS GRAPH - discovery notes

Repo `C:\Users\zyu33\Projects\goodnight-treehole`, branch `codex/post-recovery-validation`,
HEAD `158c298`. Read-only discovery: no file under `apps/`, `packages/`, `prisma/` or `tests/` was
modified. Machine-readable output: `artifacts/product-audit/business-graph-core.json`
(113 nodes, 166 edges; flow A 82 nodes / 120 edges, flow B 24 / 39, shared admin 7 / 7).

Everything below is traced through real code: Vue view -> `apps/mp/src/api.ts` client call ->
`apps/api/src/controllers.ts` handler -> `apps/api/src/store.service.ts` -> `prisma/schema.prisma`.
Only endpoints present in `artifacts/product-audit/api-endpoints.json` and only models present in
`artifacts/product-audit/db-models.json` are used as API / DBEntity nodes. Anything the code
declares but no live caller reaches is marked UNCONFIRMED.

## 1. SupportIntent - every value the code actually supports

The union is declared once in `packages/shared-types/src/goodnight-2.ts:1-9` and is a real Prisma
enum in `prisma/schema.prisma:125-134` (SupportIntent), stored on `LifeJourney.currentIntent`
(`prisma/schema.prisma:367`). Eight values, all accepted:

1. `JUST_LISTEN` - `store.service.ts:2822-2826`, route `/pages/journey/detail`; the view turns this into `?mode=stabilize` (`JourneyDetail.vue:99`).
2. `FIND_PEOPLE` - `store.service.ts:2827`, route `/pages/peers/index`.
3. `SEE_OUTCOMES` - `store.service.ts:2828-2832`, route `/pages/peers/index?view=outcomes`.
4. `NEXT_STEP` - `store.service.ts:2833`, route `/pages/action/index`.
5. `STOP_IMPULSE` - `store.service.ts:2834-2838`, route `/pages/action/index?section=vault`.
6. `PREPARE_CONVERSATION` - `store.service.ts:2839-2843`, route `/pages/action/index?section=handoff`.
7. `NOTHING_NOW` - `store.service.ts:2844`, route `/pages/tonight/index`.
8. `HIGH_DISTRESS` - `store.service.ts:2845`, route `/pages/safety/index`.

The allow-list is enforced twice: `setJourneyIntent` rejects anything else with
`BadRequestException` (`store.service.ts:2768-2778`), and `ensurePhaseTwoCoverage` deletes any
persisted `currentIntent` outside the same eight values (`store.service.ts:1382-1398`). The mp
picker renders exactly these eight (`apps/mp/src/components/journey/SupportIntentScreen.vue:14-16`),
so no supported value is hidden from the UI and no UI value is unsupported by the API.

Stage side-effects of the non-safety branch (`store.service.ts:2800-2807`):
`NEXT_STEP -> planning`, `FIND_PEOPLE` / `SEE_OUTCOMES -> matching`, `STOP_IMPULSE -> cooldown`,
everything else `-> clarifying`.

## 2. ActionCommitment status

Enum `ActionCommitmentStatus` = `active | completed | skipped | paused`
(`packages/shared-types/src/index.ts:13`, `prisma/schema.prisma:105-110`), default `active`
(`prisma/schema.prisma:460`).

- `active` - written by `createActionCommitment` (`store.service.ts:3326`) and by `createAdaptiveAction` through it (`store.service.ts:3474-3489`).
- `completed` - written by `checkinAction` when the request status is completed (`store.service.ts:3389`).
- `skipped` - written by `checkinAction` when the request status is skipped (`store.service.ts:3386-3389`).
- `paused` - written by `checkinAction` for missed, and for any other non-completed / non-skipped value (`store.service.ts:3389`).

The mp surface only sends completed (`ActionCenter.vue:154-157`) or missed (`ActionCenter.vue:190-194`),
so `skipped` is reachable only by calling the API directly and `paused` only through the missed path.
`ActionCenter` filters on `status === active` (`ActionCenter.vue:38`), so a paused commitment
disappears from the action card until the adaptive child replaces it.

## 3. CheckinStatus

Enum `CheckinStatus` = `pending | completed | missed` (`packages/shared-types/src/index.ts:14`,
`prisma/schema.prisma:112-116`), default `pending`.

- `pending` - created with every action (`store.service.ts:3340`), read back by `tonightHome` as dueCheckins (`store.service.ts:2430-2435`) and by `journeyDetail` (`store.service.ts:2857`).
- `completed` - `store.service.ts:3402` when the request status is completed.
- `missed` - `store.service.ts:3402` for skipped and missed alike; the check-in is marked missed even when the commitment is marked skipped.

`checkinAction` reuses the newest pending check-in for the commitment, otherwise creates one
(`store.service.ts:3391-3408`), and closes the matching pending follow-up job
(`store.service.ts:3409-3415`).

## 4. Flow A - core support flow

### 4.1 TonightHome -> create / continue Journey

`TonightHome` loads `GET /api/v1/tonight` and `GET /api/v1/notifications` in parallel
(`TonightHome.vue:35-43`). The primary button `data-testid=tonight-continue` (`TonightHome.vue:78`)
calls `createJourney()` (`TonightHome.vue:49-58`) which posts `POST /api/v1/journeys` with
`{domain, relationScene, content}` (`TonightHome.vue:53`).

`PublicController.createJourney` (`controllers.ts:249-268`) delegates to `store.createJourney`
(`store.service.ts:2459-2631`), which writes `LifeJourney` with `status: active`
(`store.service.ts:2489`), one `SituationSnapshot` with `confidence: agent_draft`
(`store.service.ts:2516`) and a `JourneyUpdate` of kind `created` (`store.service.ts:2522-2529`),
then queues an AI job (4.2) and returns `{journey, snapshot, job, safety}` (`store.service.ts:2622-2630`).

Continue path: when `tonightHome()` already returns an active journey (`store.service.ts:2426`), the
active-journey block routes to `/pages/journey/detail?id=...` without creating anything
(`TonightHome.vue:76-78`). Exists.

### 4.2 Situation understanding (AI) and fingerprint confirm

`createJourney` calls `queueAI({taskType: situation_analysis})` (`store.service.ts:2541-2548`) and
asynchronously folds the structured result back into the snapshot through `waitForAiJob`
(`store.service.ts:2549-2620`). The write-back is skipped when the snapshot is already
`user_confirmed` (`store.service.ts:2558`), so a confirmed fingerprint can never be downgraded to
an agent draft. Each completion also appends an `AgentDecisionLog` (`store.service.ts:2609-2617`).
The job itself is an `AIJob` row (`prisma/schema.prisma:1013`, `queueAiJob`
`store.service.ts:5103-5177`).

The view polls `GET /api/v1/ai/tasks/:id` up to 36 times at 500 ms (`JourneyDetail.vue:66-78`) and
the shell shows the analysing state through `data-testid=fingerprint-loading`
(`SituationConfirmationScreen.vue:28`).

Confirm: `data-testid=fingerprint-accurate` emits confirm (`SituationConfirmationScreen.vue:40`) ->
`confirmSituation()` (`JourneyDetail.vue:71-79`) -> `PATCH /api/v1/journeys/:id/situation`
(`controllers.ts:316-340`) -> `store.confirmSituation` (`store.service.ts:3014-3134`), which sets
`confidence = user_confirmed` (`store.service.ts:3113`), mirrors intensity onto the journey
(`store.service.ts:3115-3118`) and writes an `intensity` journey update when the value changed
(`store.service.ts:3119-3130`). Exists.

Re-analyse: `data-testid=fingerprint-reanalyze` -> `reanalyze()` (`JourneyDetail.vue:81-89`) ->
`POST /api/v1/journeys/:id/situation/reanalyze` (`controllers.ts:368-371`) ->
`store.reanalyzeSituation` (`store.service.ts:3136-3227`), which resets confidence to agent_draft
(`store.service.ts:3144`) and re-queues `situation_analysis`. Exists.

### 4.3 Emotion / intensity

`EmotionTemperatureScreen` `data-testid=temperature-continue` emits save
(`EmotionTemperatureScreen.vue:29`) -> `saveTemperature()` (`JourneyDetail.vue:83-91`), which
encodes symptoms and the loudest thought into behaviorSignals (身体感觉 / 脑子里最吵的一句) and
PATCHes the same situation endpoint (`JourneyDetail.vue:88`), then sets `flowStep = intent`
(`JourneyDetail.vue:89`). The skip button emits skip and jumps straight to intent
(`EmotionTemperatureScreen.vue:29`, `JourneyDetail.vue:141`). Both branches exist.

### 4.4 Support intent

`SupportIntentScreen` renders the eight intents and emits choose (`SupportIntentScreen.vue:14-16`,
`:20`) -> `chooseIntent()` (`JourneyDetail.vue:93-103`) -> `PATCH /api/v1/journeys/:id/intent`
(`controllers.ts:296-300`) -> `store.setJourneyIntent` (`store.service.ts:2766-2812`). The response
carries `route.targetRoute`, and the view branches on it: `/pages/safety/index` -> SafetySupport
(`JourneyDetail.vue:98`), `JUST_LISTEN` -> `?mode=stabilize` (`JourneyDetail.vue:99`), otherwise
the target route with journeyId appended (`JourneyDetail.vue:100-101`). Exists.

### 4.5 Stabilize branch (JUST_LISTEN)

`JourneyDetail.stabilize` renders `StabilizeScreen` (`JourneyDetail.vue:143`). Three exits exist:
breathing completion posts a `stabilize_breath` update (`StabilizeScreen.vue:20`), saving a note
posts `stabilize_note` (`StabilizeScreen.vue:24`), and `pauseImpulse` posts
`POST /api/v1/cooldowns` with `hours: 24` (`StabilizeScreen.vue:23`). The handoff button routes to
RealityHandoff and change-support returns to `mode=intent` (`StabilizeScreen.vue:38`). Updates land
in `JourneyUpdate` via `store.addJourneyUpdate` (`store.service.ts:3247-3279`). Exists.

### 4.6 HIGH_DISTRESS safety branch from intent

`chooseIntent(HIGH_DISTRESS)` -> `setJourneyIntent` -> `requiresSafetyFirst` is true when the intent
is `HIGH_DISTRESS` or the journey is already `safety_first` with a high/critical `SafetyEvent`
(`store.service.ts:2779-2782`). That branch forces `stage = safety_first` and
`currentIntent = HIGH_DISTRESS` (`store.service.ts:2784-2785`) and unshifts a `SafetyEvent` with
`source: support_intent`, `action: real_world_support_prompt`, `level: high`
(`store.service.ts:2787-2796`). `intentRoute` then returns `/pages/safety/index`
(`store.service.ts:2815-2820`). Exists. See section 5.

### 4.7 RealityHandoff and Action

RealityHandoff loads trusted contacts (`RealityHandoff.vue:37`), composes a help card from the
recipient and need presets (`RealityHandoff.vue:12-13`, `:25-33`) and saves it with
`POST /api/v1/handoffs` (`RealityHandoff.vue:44` -> `controllers.ts:594-597` ->
`store.createRealityHandoff`, `store.service.ts:4472-4489`, status `ready`). Contacts are saved
through `POST /api/v1/trusted-contacts` (`RealityHandoff.vue:52` -> `controllers.ts:609-612` ->
`store.saveTrustedContact`, `store.service.ts:4508-4522`). Copy-to-clipboard only
(`RealityHandoff.vue:46-48`); nothing is sent automatically. Exists.

Action: `ActionCenter` loads `GET /api/v1/tonight` and `GET /api/v1/journeys/:id`
(`ActionCenter.vue:61-73`). `data-testid=action-request-plan` -> `requestTonightAction()`
(`ActionCenter.vue:91-120`) -> `POST /api/v1/journeys/:id/action-plan` (`controllers.ts:386-389` ->
`store.generateActionPlan`, `store.service.ts:3281-3298`, task `action_plan`) -> polls
`GET /api/v1/ai/tasks/:id` (`ActionCenter.vue:79-89`). `data-testid=action-accept-plan` ->
`acceptTonightAction()` (`ActionCenter.vue:122-141`) -> `POST /api/v1/journeys/:id/actions`
(`controllers.ts:391-397` -> `store.createActionCommitment`, `store.service.ts:3300-3371`), which
creates the `ActionCommitment` (active), a pending `OutcomeCheckin`, a `FollowUpJob` of kind
`action_checkin` (`store.service.ts:3344-3353`), a `commitment_created` journey update and sets
`journey.stage = acting` (`store.service.ts:3366`). Exists.

### 4.8 complete / missed -> adaptive action

Complete: `data-testid=action-complete-submit` -> `completeAction()` (`ActionCenter.vue:149-165`) ->
`POST /api/v1/actions/:id/checkin` with status completed and a reflection (`controllers.ts:426-440`
-> `store.checkinAction`, `store.service.ts:3373-3448`). Exists.

Missed: the missed button -> `openAdaptive()` (`ActionCenter.vue:167-173`) opens
`AdaptiveActionSheet` (`data-testid=adaptive-action-sheet`). Choosing a barrier
(`ActionCenter.vue:182-216`) first posts status missed with the barrier, then
`POST /api/v1/actions/:id/adaptive-plan` (`controllers.ts:545-548` -> `store.requestAdaptiveAction`,
`store.service.ts:3450-3472`, task `adaptive_action`, barrier labels `store.service.ts:3453-3461`),
then polls the AI task. `data-testid=adaptive-accept` -> `confirmAdaptiveAction()`
(`ActionCenter.vue:222-239`) -> `POST /api/v1/actions/:id/adapt` (`controllers.ts:550-556` ->
`store.createAdaptiveAction`, `store.service.ts:3474-3489`), which creates a child
`ActionCommitment` with parentActionId, adaptationReason and attemptNumber + 1. Exists.
`checkinAction` returns `adaptive.required = true` with
`nextRoute = /pages/action/index?section=barrier&actionId=...` for a missed action
(`store.service.ts:3443-3446`).

### 4.9 Follow-up notification

The `action_checkin` `FollowUpJob` is scheduled onto BullMQ by `scheduleFollowUp`
(`store.service.ts:3369` -> `follow-up-queue.ts:20-31`, queue `goodnight-follow-ups`, attempts 3).
`FollowUpWorkerService.deliver` (`follow-up-worker.service.ts:26-65`) re-reads the job from Prisma,
creates a `UserNotification` with id `notification_<jobId>` (`follow-up-worker.service.ts:30`,
`:37-49`) and flips the job to delivered (`:51`). `notificationCopy` maps the kind to `FOLLOW_UP`
with `targetRoute = /pages/action/index?section=follow-up` (`:67-75`), `COOLDOWN_RELEASED` for
`DECISION_COOLDOWN`, and `FUTURE_SELF` for future messages guarded by allowFutureSelfNotifications
(`:31-34`). It also releases the cooldown / decision rows (`:53-61`) and calls
`store.reloadRuntimeState()` (`:62`). Exists.

`NotificationCenter` reads `GET /api/v1/notifications` (`NotificationCenter.vue:24`) and `open()`
(`NotificationCenter.vue:26-28`) marks read via `PATCH /api/v1/notifications/:id/read` then routes
to `targetRoute`. Exists.

### 4.10 Journey timeline

`JourneyDetail.timeline` renders `JourneyTimelineScreen` (`JourneyTimelineScreen.vue:31-35`) from
`journeyDetail().updates` (`store.service.ts:2855`). The later-writing control -> `saveLater()`
(`JourneyDetail.vue:105-110`) -> `POST /api/v1/journeys/:id/updates` with kind `later`. The action
button routes to ActionCenter and change-support returns to intent (`JourneyTimelineScreen.vue:35`).
Exists.

### 4.11 Recovery

Recovery is not part of the JourneyDetail step machine; it is reached from `Me`
(`Me.vue:33-40`, route `/pages/recovery/index`). `Recovery` loads `GET /api/v1/me/recovery`,
`GET /api/v1/tonight` and `GET /api/v1/me/stable-self` in parallel (`Recovery.vue:84-91`) and
`data-testid=recovery-save` posts `POST /api/v1/me/recovery` (`Recovery.vue:98-114` ->
`controllers.ts:668-674` -> `store.saveRecoveryCheckin`, `store.service.ts:4303-4331`), writing a
`RecoverySnapshot`. Both endpoints are gated by `privacyAllows(userId, allowRecoveryData, ...)`
(`store.service.ts:4310`, `:4692`), and the view shows a privacy gate when the message matches
隐私 / 允许 / 恢复数据 (`Recovery.vue:94`, `:126-130`). Exists.

### 4.12 Every branch of the core flow, and whether the code path exists

| Branch | Code path | Evidence |
| --- | --- | --- |
| TonightHome -> create journey | EXISTS | `TonightHome.vue:49-58`, `controllers.ts:249`, `store.service.ts:2459` |
| TonightHome -> continue existing journey | EXISTS | `TonightHome.vue:76-78`, `store.service.ts:2426` |
| create -> high risk at creation -> safety | EXISTS | `store.service.ts:2481`, `:2490`, `:2530-2540`, `:2626-2629`, `TonightHome.vue:54` |
| create -> normal -> fingerprint confirm screen | EXISTS | `TonightHome.vue:55`, `JourneyDetail.vue:44-52` |
| AI situation_analysis auto-fill | EXISTS | `store.service.ts:2541-2620` |
| AI job failed -> user edits manually | EXISTS | `JourneyDetail.vue:72` keeps the confirm screen and shows an error |
| fingerprint confirm (user_confirmed) | EXISTS | `store.service.ts:3113` |
| fingerprint re-analyse | EXISTS | `store.service.ts:3144` |
| confirmed fingerprint cannot be overwritten by AI | EXISTS | `store.service.ts:2558`, `:3166` |
| temperature save | EXISTS | `JourneyDetail.vue:83-91` |
| temperature skip | EXISTS | `EmotionTemperatureScreen.vue:29` |
| intent JUST_LISTEN -> stabilize | EXISTS | `store.service.ts:2822-2826`, `JourneyDetail.vue:99` |
| intent NEXT_STEP -> Action | EXISTS | `store.service.ts:2833` |
| intent STOP_IMPULSE -> cooldown sheet | EXISTS | `store.service.ts:2834-2838` |
| intent PREPARE_CONVERSATION -> handoff sheet | EXISTS | `store.service.ts:2839-2843` |
| intent NOTHING_NOW -> TonightHome | EXISTS | `store.service.ts:2844` |
| intent FIND_PEOPLE / SEE_OUTCOMES -> peers | EXISTS | `store.service.ts:2827-2832` |
| intent HIGH_DISTRESS -> safety | EXISTS | `store.service.ts:2779-2796`, `:2815-2820` |
| safety-first forced even without HIGH_DISTRESS | EXISTS | `store.service.ts:2781-2782` |
| stabilize breathing update | EXISTS | `StabilizeScreen.vue:20` |
| stabilize note update | EXISTS | `StabilizeScreen.vue:24` |
| stabilize -> cooldown (24h) | EXISTS | `StabilizeScreen.vue:23`, `store.service.ts:4425` |
| stabilize -> handoff | EXISTS | `StabilizeScreen.vue:38` |
| stabilize -> change support | EXISTS | `StabilizeScreen.vue:38` |
| action plan (AI) -> accept | EXISTS | `ActionCenter.vue:91-141` |
| action complete | EXISTS | `ActionCenter.vue:149-165` |
| action missed -> barrier -> adaptive plan | EXISTS | `ActionCenter.vue:182-216` |
| adaptive accept -> child action | EXISTS | `ActionCenter.vue:222-239`, `store.service.ts:3474-3489` |
| follow-up job -> delivered notification | EXISTS | `store.service.ts:3344-3353`, `follow-up-worker.service.ts:26-65` |
| notification read -> route to action | EXISTS | `NotificationCenter.vue:26-28` |
| timeline later update | EXISTS | `JourneyDetail.vue:105-110` |
| archive journey (PATCH status) | EXISTS | `JourneyDetail.vue:111-127`, `store.service.ts:4810-4818` |
| recovery check-in | EXISTS | `Recovery.vue:98-114`, `store.service.ts:4303-4331` |
| journey graduation (POST /journeys/:id/graduate) | API EXISTS, no mp caller | `controllers.ts:414`, `store.service.ts:3491-3512` |
| graduation consent / peer share draft | API EXISTS, no mp caller | `controllers.ts:419`, `store.service.ts:3537-3584` |
| JourneyStatus.completed | DB value, unreachable from UI | `prisma/schema.prisma:85`; only `graduateJourney` writes it |
| POST /journeys/:id/snapshots | API EXISTS (alias of PATCH situation), no mp caller | `controllers.ts:342-366` |
| GET /journeys/:id/fingerprint | API EXISTS, no mp caller | `controllers.ts:291-294` |
| GET /journeys/:id/actions | API EXISTS, no mp caller | `controllers.ts:399-402` |
| GET /journeys/:id/timeline | API EXISTS, no mp caller | `controllers.ts:404-407` |
| NotificationType.JOURNEY_CHECKIN | declared, no producer | `goodnight-2.ts`; producers are FOLLOW_UP, COOLDOWN_RELEASED, FUTURE_SELF, PEER_REQUEST, PEER_ACCEPTED, CONVERSATION_CLOSED |

## 5. Flow B - safety flow

1. Entry from intent: `JourneyDetail.chooseIntent(HIGH_DISTRESS)` (`JourneyDetail.vue:93-101`) ->
   `PATCH /api/v1/journeys/:id/intent` (`controllers.ts:296`) -> `store.setJourneyIntent`
   (`store.service.ts:2766-2812`).
2. `requiresSafetyFirst` (`store.service.ts:2779-2782`) sets `stage = safety_first`,
   `currentIntent = HIGH_DISTRESS` and writes a `SafetyEvent` with level high, source
   support_intent, action real_world_support_prompt (`store.service.ts:2783-2796`).
3. `intentRoute(intent, true)` returns `/pages/safety/index` (`store.service.ts:2815-2820`);
   `JourneyDetail.vue:98` pushes SafetySupport with journeyId.
4. Second entry path, creation-time risk: `detectRisk` matches 自杀 / 自伤 / 伤害别人 / 杀 / 暴力
   (`store.service.ts:5008-5011`), `createJourney` sets `stage = safety_first`
   (`store.service.ts:2490`) and writes the `journey_create` SafetyEvent (`store.service.ts:2530-2540`);
   `TonightHome.vue:54` routes to `/pages/safety/index`.
5. SafetySupport (`SafetySupport.vue`): handoff card `data-testid=safety-handoff` -> RealityHandoff
   (`SafetySupport.vue:64-65`); `data-testid=safety-emergency` is `href=tel:12356`
   (`SafetySupport.vue:70-71`); `href=tel:120` for emergency medical help (`SafetySupport.vue:72-73`);
   stay `data-testid=safety-stay` -> `stayHere()` (`SafetySupport.vue:32-45`) ->
   `POST /api/v1/journeys/:id/safety/acknowledge` (`SafetySupport.vue:40`, `controllers.ts:373-376`) ->
   `store.acknowledgeSafety` (`store.service.ts:3229-3245`), which sets `stage = stabilizing`,
   `currentIntent = JUST_LISTEN` and writes a `safety_acknowledged` update, then routes to
   `?mode=stabilize` (`SafetySupport.vue:41`).
6. SupportPlan readback: SafetySupport `onMounted` calls `GET /api/v1/me/support-plan`
   (`SafetySupport.vue:23-30`) and renders `data-testid=safety-saved-support-plan` from the plan
   safePeople / places / smallActions (`SafetySupport.vue:12-18`, `:105-110`). `store.supportPlan`
   returns the active `PersonalSupportPlan` (`store.service.ts:4635-4638`). Editing lives in
   `SupportPlan.vue` and saves with `PUT /api/v1/me/support-plan` (`SupportPlan.vue:136` ->
   `controllers.ts:642-648` -> `store.saveSupportPlan`, `store.service.ts:4601-4633`), gated by
   allowRecoveryData (`store.service.ts:4606`).
7. Back to a real-world action: SafetySupport -> RealityHandoff -> saved card
   (`RealityHandoff.vue:41-45`, `store.service.ts:4472-4489`) and/or StabilizeScreen -> ActionCenter
   -> `POST /api/v1/journeys/:id/actions` -> `ActionCommitment` (`ActionCenter.vue:122-141`,
   `store.service.ts:3300-3371`). `ActionCenter` also exposes the handoff shortcut
   (`SupportShortcutGrid.vue:5-10`, `ActionCenter.vue:241-252`).

All Flow B branches above EXIST. Two endpoints on this chain exist but have no mp caller:
`POST /api/v1/handoffs/:id/share` (`controllers.ts:599-602` -> `store.shareRealityHandoff`,
`store.service.ts:4491-4501`) and `GET /api/v1/handoffs` (`controllers.ts:604-607`); the mp card is
saved and copied to the clipboard, never shared through the API. Marked UNCONFIRMED as a live
product branch.

`HandoffStatus` (`prisma/schema.prisma:118-123`) is `draft | ready | shared | completed`; the code
only ever writes ready (`store.service.ts:4482`) and shared (`store.service.ts:4496`). draft and
completed are never written - UNCONFIRMED.

## 6. Admin and control surface reached from these flows

All seven are real admin routes (`artifacts/product-audit/admin-routes.json`) backed by
`AdminController` endpoints that exist in `api-endpoints.json`:

| Admin resource | Route | Endpoint |
| --- | --- | --- |
| journeys | `/experience/journeys` | `GET /api/admin/v1/journeys` (`controllers.ts:1917`) |
| actions | `/experience/actions` | `GET /api/admin/v1/actions` (`controllers.ts:1935`) |
| checkins | `/experience/checkins` | `GET /api/admin/v1/checkins` (`controllers.ts:1950`) |
| follow-ups | `/experience/follow-ups` | `GET /api/admin/v1/follow-ups` (`controllers.ts:2005`) |
| notifications | `/experience/notifications` | `GET /api/admin/v1/notifications` (`controllers.ts:2017`) |
| safety-events | `/safety/events` | `GET /api/admin/v1/safety/events` (`controllers.ts:2046`) |
| support-plans | `/safety/support-plans` | `GET /api/admin/v1/support/plans` (`controllers.ts:2056`) |

The admin table page maps these resources to those URLs in `apps/admin/src/views/TablePage.vue:56-65`.

## 7. UNCONFIRMED items (summary)

1. `POST /api/v1/journeys/:id/graduate` and `POST /api/v1/journeys/:id/graduation-consent` exist in
   the API and would create a `PeerExperience` draft (`store.service.ts:3491-3584`) but no mp view
   calls them, so `JourneyStatus.completed` is unreachable from the product UI.
2. `POST /api/v1/journeys/:id/snapshots`, `GET /api/v1/journeys/:id/fingerprint`,
   `GET /api/v1/journeys/:id/actions`, `GET /api/v1/journeys/:id/timeline`: endpoints exist, no mp
   caller (the view derives all of this from `GET /api/v1/journeys/:id`).
3. `POST /api/v1/handoffs/:id/share` and `GET /api/v1/handoffs`: no mp caller.
4. `POST /api/v1/support-plans`: exists as a POST alias of `PUT /api/v1/me/support-plan`
   (`controllers.ts:629`), no mp caller.
5. `NotificationType.JOURNEY_CHECKIN` is declared in shared types but has no producer in apps/api;
   the only producers are the follow-up worker and `peerNotification` (`store.service.ts:3929-3957`,
   call sites `3971`, `3979`, `4042`, `4082`).
6. `ActionCommitmentStatus.skipped` / `paused` are writable (`store.service.ts:3386-3389`) but no mp
   surface reads or displays them.
7. `HandoffStatus.draft` / `completed` are never written.

## 8. Graph shape

Node types used: PageState, UserAction, API, DBEntity, QueueJob, AiJob, Notification, AdminResource,
SystemIntent. The JSON keeps the flat `{nodes, edges}` shape required by the task and additionally
groups the same nodes / edges into `flows.A_core_support`, `flows.B_safety` and
`flows.shared_admin`. Every edge `via` string records the concrete trigger (test id, function,
route) or the store function that performs the write, so each edge can be re-checked against the
cited file and line.
