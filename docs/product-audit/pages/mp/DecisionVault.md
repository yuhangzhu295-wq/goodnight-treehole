# DecisionVault

Source: `apps/mp/src/views/DecisionVault.vue`

Routes: `/pages/decision/index`

## PURPOSE

DecisionVault is the cool-down box. The user writes down something they want to do right now, why they want to do it, how intense the feeling is, and how long to lock it away; the product then refuses to let them act on it until the timer expires, at which point it comes back and asks one question - "do you still want this?" - and the user types their own decision. Nothing here recommends, scores or decides anything for the user.

## USER_JOB

"I am about to do something I will regret. Let me park it for a day and come back when I can think."

## ENTRY

- Me, 决定保险箱, `data-testid=entry-decision` -> `router.push('/pages/decision/index')` (`apps/mp/src/views/Me.vue:74`, rendered `:199-200`).
- Notification deep link: the follow-up worker sets `targetRoute: '/pages/decision/index?id=<decisionId>'` when a cool-down releases (`apps/api/src/follow-up-worker.service.ts:71`), opened by NotificationCenter's `router.push(item.targetRoute)`.

A repo-wide search for `/pages/decision` returns the route (`apps/mp/src/router.ts:71`), the Me entry, and the worker's `targetRoute`.

## EXIT

Back only: `router.back()` (`DecisionVault.vue:176`). Every other control mutates in place and reloads. There is no forward navigation and the route is not in `tabbarPaths` (`apps/mp/src/App.vue:7-40`), so the tab bar is hidden.

## ROUTES

`/pages/decision/index` (`apps/mp/src/router.ts:71`). Single route, no aliases. Not a tab route; `activeTab` would classify it as 我的 (`App.vue:62-68`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading note | `loading` (starts `true`) | `DecisionVault.vue:23`, `:228` |
| error note | `error` | `DecisionVault.vue:25`, `:227` |
| success notice | `notice` | `DecisionVault.vue:26`, `:226` |
| active (non-archived) list rendered | `activeItems.length` | `DecisionVault.vue:32`, `:230` |
| archived disclosure rendered | `archivedItems.length` | `DecisionVault.vue:33`, `:258` |
| row status `cooling` | `item.status` | `DecisionVault.vue:239` |
| row status `draft` (cool-down never set) | `item.status` | `DecisionVault.vue:240`, `:253` |
| row status `ready` (timer elapsed) | `item.status` | `DecisionVault.vue:241-250` |
| row status `decided` | `item.status` | `DecisionVault.vue:251-257` |
| live countdown text | `nowTick` (30 s interval) + `cooldownUntil` | `DecisionVault.vue:27`, `:43-52`, `:179-183` |
| create in progress | `busyId === 'create'` | `DecisionVault.vue:24`, `:217` |
| row action in progress | `busyId === item.id` | `DecisionVault.vue:24`, `:245` |
| draft fields | `draft.question`, `draft.reason`, `draft.intensity`, `draft.hours` | `DecisionVault.vue:28`, `:181-215` |
| per-row answer drafts | `answers` | `DecisionVault.vue:29`, `:59-63` |

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| ‹ 返回 | `router.back()` | history back |
| textarea 例如：我想立刻联系 TA… (maxlength 400) | `v-model="draft.question"` | the impulse |
| input 为什么现在想做 | `v-model="draft.reason"` | the reason |
| range input 此刻情绪强度 (1-10) | `v-model.number="draft.intensity"` | intensity slider, default 8 |
| four duration radios (1 / 12 / 24 / 72 小时) | `v-model.number="draft.hours"` | cool-down length, default 24 |
| 先放这里 (submit) | `saveForLater` | `POST /api/v1/decisions` then `POST /api/v1/cooldowns` |
| 改成更小一步 | inline template append | appends 我能先做的更小一步是： to the textarea |
| 由我确认这个决定 (ready rows) | `decide(item)` | `PATCH /api/v1/decisions/:id` with `{decision, outcome, status:'decided'}` |
| 保存结果并归档 (decided rows) | `archive(item)` | PATCH outcome if changed, then PATCH `status:'archived'` |
| 开始 24 小时冷静期 (draft rows) | `resumeDraft(item)` | `POST /api/v1/cooldowns` with `hours = 24` |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 6 entries; `artifacts/post-recovery/control-coverage.json` records 10 visible controls on the real APK (3 buttons, 6 inputs, 1 textarea), none of which changed state - the sweep reported the two composer buttons as "not-found" and the rest as text fields or non-actionable inputs, consistent with an empty list. **`android-route-manifest.json` records `hasTestIds: 0` for this route: the view contains no `data-testid` at all.**

## API_READS

One GET:

- `GET /api/v1/decisions` (`DecisionVault.vue:69`) -> `controllers.ts:563-566` -> `store.decisionList` (`store.service.ts:4410-4422`). That method has a side effect: it scans the user's rows and promotes any `cooling` record whose `cooldownUntil` has passed to `ready`, stamping `reviewedAt`, then persists (`:4413-4420`). The client therefore learns about an expired cool-down by re-reading the list, not by polling a job.

Note the read has **no user parameter and no privacy gate** - `decisionList()` takes none (`store.service.ts:4410`) and `controllers.ts:563-566` passes none.

## API_WRITES

- `POST /api/v1/decisions` (`DecisionVault.vue:88-92`) -> `controllers.ts:558-561` -> `store.createDecision` (`store.service.ts:4333-4358`). Store method: `StoreService.createDecision`. Prisma model: **DecisionRecord** (created with `status: 'draft'`, `options: []`, `criteria: [reason, "情绪强度:N/10"]`).
- `POST /api/v1/cooldowns` (`DecisionVault.vue:93-98` and `:114`) -> `controllers.ts:584-587` -> `store.createCooldown` (`store.service.ts:4425-4471`). Store method: `StoreService.createCooldown`. Prisma models: **CooldownItem** (created, `releaseAt = now + hours`) and **DecisionRecord** (status set to `cooling` and `cooldownUntil` stamped, `:4462-4466`), plus a **FollowUpJob** with `kind: 'DECISION_COOLDOWN'` (`:4467-4475`) enqueued through `scheduleFollowUp`. Hours are clamped to 1..168 (`:4432`).
- `PATCH /api/v1/decisions/:id` (`DecisionVault.vue:133-137`, `:153-154`) -> `controllers.ts:568-582` -> `store.updateDecision` (`store.service.ts:4360-4408`). Store method: `StoreService.updateDecision`. Prisma model: **DecisionRecord**. The state machine is enforced server-side (`:4384-4402`): `ready` only from `cooling` and only after `cooldownUntil` has passed, `decided` only from `ready` and only with a non-empty `decision`, `archived` only from `decided`; anything else throws `400` 不能从 X 变更为 Y. Question/options/criteria are only editable while the row is `draft`, `cooling` or `ready` (`:4381-4387`).

## DB_ENTITIES

Reads: **DecisionRecord**.

Writes: **DecisionRecord**, **CooldownItem**, **FollowUpJob** (and later **UserNotification** from the worker, `apps/api/src/follow-up-worker.service.ts:30-65`).

Cross-checked against `prisma/schema.prisma:562-581` (DecisionRecord: `status String @default("draft")`, `cooldownUntil`, `outcome`, `reviewedAt`, `cooldowns CooldownItem[]`) and `:583-596` (CooldownItem).

## ADMIN_VISIBILITY

**None.** `apps/admin/src/router.ts` menuGroups (`:31-89`) has no decision or cool-down resource, and no admin handler in `apps/api/src/controllers.ts` references `decisionRecords` or `cooldownItems` (the only matches are the three public routes above). The nearest operator surface is `/experience/follow-ups` (`:69`), which lists the `DECISION_COOLDOWN` job but not the question, the reason or the decision text. Given that the content is a person's unedited impulse, the absence of an operator view is the correct posture, but it does mean a stuck cool-down has no support path.

## AI_USAGE

**None on this page.** No AiJob is created or read; `/api/v1/ai/tasks` does not appear in the file. The task type `decision_clarify` exists in the backend (`store.service.ts:5365` in the structured-result list) and is routed through `runAiJob`, but nothing here calls it - the 改成更小一步 control is a pure string append (`DecisionVault.vue:220`) with no model call.

When an AI task does fail, the store marks the job `status: 'fallback'` and substitutes the safe template while preserving the error string (`store.service.ts:5513-5530`), which is the known DAPI 402 condition. That path is not reachable from this page.

## PRIVACY

- **No privacy flag gates this page.** `decisionList`, `createDecision`, `createCooldown` and `updateDecision` contain no `privacyAllows` call (`store.service.ts:4333-4422`). The decision box is available to every user regardless of settings.
- The only related flag is `allowJourneyArchiveRetention`, which gates archiving a **Journey** (`store.service.ts:4810-4816`), not archiving a decision - `updateDecision`'s `archived` transition is ungated (`:4396-4398`).
- Nothing on the page is published or shared: `DecisionRecord` has no visibility column and no public read route. The in-page boundary note states the limit of the feature: 这里帮助你留出时间、整理信息，不替代法律、医疗或财务专业建议，也不会替你作决定 (`DecisionVault.vue:267`).

## ERROR_STATES

- Load failure: `error` = API message or 决定保险箱暂时没有打开 (`DecisionVault.vue:72-74`), rendered at `:227`.
- Create validation: 请先写下决定和此刻想做它的原因 when either field is blank (`:80-83`).
- Create failure: `error` = API message or 这件事暂时没有保存成功 (`:100-103`), **and the catch calls `await load()`** (`:102`) so the half-created `draft` row appears in the list - which is the correct recovery, but the message still says nothing was saved.
- Decide validation: 最终决定必须由你自己写下 when the decision box is empty (`:125-128`).
- Decide failure: 决定暂时没有保存成功 (`:141-143`).
- Archive failure: 归档没有完成 (`:158-160`).
- Resume failure: 冷静时间没有设置成功 (`:117-119`).

## EMPTY_STATES

**There is none, and that is a finding.** `activeItems.length` hides the whole 冷静箱 section when empty (`DecisionVault.vue:230`) and `archivedItems.length` hides the disclosure (`:258`). A first-time user sees only the composer and the boundary note - no explanation of what the box does with their entry, no example of a returned decision, and no hint that a notification will arrive. The composer's own return-note (N 小时后，我们回来只问：你现在还这样想吗？, `:213`) is the only explanation on the page.

## NATIVE_RISKS

- Safe area: `.decision-page` sets `padding-bottom: 34px` (`DecisionVault.vue:273`) with no `env(safe-area-inset-bottom)`. Because the page uses `min-height: 100vh` and `overflow-x: hidden` rather than the shared `.goodnight-page` class, the `130px` tab-bar reservation from `apps/mp/src/styles.scss:4145-4147` does not apply here either. On a gesture-nav device the boundary note can sit under the system bar, though the route has no tab bar.
- The page is capped at 430px and centred on wide viewports (`DecisionVault.vue:273`, `@media(min-width:431px)`).
- The 30-second `setInterval` (`:176-181`) is cleared in `onBeforeUnmount` (`:182`), so it does not leak across navigation.
- Keyboard: the composer textarea and the per-row answer textareas are in normal flow with `Keyboard.resize: 'body'`, so they stay reachable, but a 46px-high textarea (`:325` `.saved-copy textarea`) is small for the outcome field.
- Back button: no custom handling; BACK walks WebView history (`apps/mp/src/native/back-button.ts:30-36`).

## ISSUES

- P1 STATE_MACHINE: the client never reads the deep link it is sent. The worker builds `/pages/decision/index?id=<decisionId>` (`apps/api/src/follow-up-worker.service.ts:71`) but the view imports only `useRouter` (`DecisionVault.vue:3`) and never calls `useRoute`, so the notification opens the box at the top with every row treated identically. The one decision the user was just told about is not identified, scrolled to or highlighted.
- P1 STATE_MACHINE: `resumeDraft` always posts `hours = 24` (`DecisionVault.vue:110`, `:114`, button label 开始 24 小时冷静期 at `:253`) even though the composer offers 1, 12, 24 and 72 hours (`:206-212`). A row that reaches `draft` (which happens when the cooldown POST fails after the decision POST succeeded, `:100-103`) can only ever be locked for a day.
- P2 DATA: the reason and the intensity are smuggled into the `criteria` array as positional strings - `criteria: [reason, "情绪强度:N/10"]` (`DecisionVault.vue:90`) - and read back by prefix matching (`:35-41`). `criteria` is documented in the schema as the decision criteria (`prisma/schema.prisma:569`) and the server caps it at 10 entries of trimmed text (`store.service.ts:4338-4345`), so the field is overloaded and a user reason that happens to start with 情绪强度: would be mistaken for the intensity.
- P2 UX: a failed `saveForLater` tells the user 这件事暂时没有保存成功 (`DecisionVault.vue:102`) even though `POST /decisions` succeeded and the row is now visible in the list. The message contradicts the screen.
- P2 STATE_MACHINE: the cool-down expiry is only detected by `decisionList()`'s lazy promotion on the next GET (`store.service.ts:4413-4420`). While the page is open the 30-second `nowTick` keeps the countdown text honest (`DecisionVault.vue:179-183`) but the row's own `status` stays `cooling`, so the ready branch, its two textareas and the 由我确认这个决定 button do not appear until the user reloads. The countdown says 冷静时间已结束，可以重新看一眼 (`:47`) next to a row that still cannot be decided.
- P2 NAVIGATION: `archive(item)` issues two sequential PATCHes (`DecisionVault.vue:153-154`). If the first succeeds and the second fails, the outcome is stored but the row stays `decided`, and the error text 归档没有完成 gives no indication that half the write landed.
- P3 TEST_CONTRACT: the view contains no `data-testid` anywhere, so `android-route-manifest.json` records `hasTestIds: 0` and `artifacts/post-recovery/control-coverage.json` had to address every control by `button:nth-of-type(n)`. Every sibling view in this group carries testids.
- P3 UX: there is no empty state (`DecisionVault.vue:230`, `:258`), so a first-time user gets no explanation of the box beyond one line of composer copy.
- P3 DATA: `prepareAnswers` only fills missing keys (`DecisionVault.vue:59-63`), which is right for preserving typing, but the template dereferences `answers[item.id].decision` unguarded (`:246`); any row that reaches the list outside a `load()` cycle would render a blank page rather than a control.
- P3 DUPLICATE: the cool-down durations 1/12/24/72 are declared in the template (`DecisionVault.vue:207`) while the server clamps to 1..168 (`store.service.ts:4432`) and `resumeDraft` hardcodes 24 (`:110`) - three sources for one value.

## FINAL_STATUS

PARTIAL - the single read, the four writes, the server-side state machine and every client state are traced to lines and the route renders on the real APK with 10 controls and 0 console errors, but no decision was created, cooled and decided end-to-end in this pass, so the `cooling → ready` promotion and the notification deep link are verified statically only.

### Static evidence

- Controls discovered: 6
- API reads (static): `/api/v1/decisions`
- API writes (static): `PATCH /api/v1/decisions/:param`, `POST /api/v1/cooldowns`, `POST /api/v1/decisions`
- Candidate fake markers: 5
- Appended: all five fake-marker candidates (placeholder at lines 191, 196, 243, 244 and 250) are HTML placeholder attributes on the composer and per-row textareas, adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` (M04).
- Appended: the cooldown list endpoint is `GET /api/v1/cooldown` (singular, `controllers.ts:589-592`) and the view never calls it; the status pill is driven by `item.cooldownUntil` from the decision list instead.
- Appended: runtime cross-check `artifacts/recovery/android-route-manifest.json` - `/pages/decision/index` rendered=true, textLength 184, hasTestIds=0, 10 visible controls, 0 console errors, 0 failed requests. `artifacts/post-recovery/control-coverage.json` records 10 controls, state `default`, none changed state.