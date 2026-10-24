# SafetySupport

Source: `apps/mp/src/views/SafetySupport.vue`

Routes: `/pages/safety/index`

## PURPOSE

SafetySupport is the crisis screen. It interrupts the normal product flow when the system or the user indicates self-harm risk, and it does one thing: move the person toward real-world help. It offers a handoff card, two telephone numbers, a "I am safe for now" acknowledgement, three concrete grounding steps, and a read-back of the support plan the user wrote in advance.

## USER_JOB

"I am not okay and I need to reach a real person, or I need permission to stay here instead of solving anything."

## ENTRY

Two live paths, both from other views:

- Creation-time risk: TonightHome's `createJourney` branches on `response.safety.needsRealWorldSupport` and pushes `/pages/safety/index?journeyId=<id>` (`apps/mp/src/views/TonightHome.vue:54`). That flag comes from `detectRisk(content)` returning `high` (`apps/api/src/store.service.ts:2481`, `:2626-2629`).
- Intent path: JourneyDetail's `chooseIntent` pushes the same route when `response.route.targetRoute === '/pages/safety/index'` (`apps/mp/src/views/JourneyDetail.vue:98`). The backend returns that route for `HIGH_DISTRESS`, and also for any intent while the journey is already `safety_first` with a high/critical `SafetyEvent` (`store.service.ts:2779-2782`, `:2815-2820`, `:2845`).

A third entry, SupportPlan's 需要即时安全支持 button (`apps/mp/src/views/SupportPlan.vue:255`), pushes the route **without** `journeyId`.

## EXIT

- 发求助卡给信任的人 -> `/pages/reality-handoff/index` with `?journeyId=` only when one is present (`SafetySupport.vue:65`).
- 我暂时安全，继续留在这里 -> `stayHere()`: with a `journeyId` it POSTs the acknowledgement and pushes `/pages/journey/detail?id=<id>&mode=stabilize` (`SafetySupport.vue:40-41`); with no `journeyId` it pushes `/pages/tonight/index` (`SafetySupport.vue:34`).
- 查看全部 in the saved-plan block -> `/pages/support-plan/index` (`SafetySupport.vue:107`).
- 联系当地紧急支持 -> `tel:12356` (dial intent, `SafetySupport.vue:70`).
- 紧急医疗求助 -> `tel:120` (dial intent, `SafetySupport.vue:72`).
- The hero back button -> `router.back()` (`SafetySupport.vue:53`).

## ROUTES

`/pages/safety/index` (`apps/mp/src/router.ts:64`). Single route, no aliases. `activeTab` maps it to the 今晚 tab (`apps/mp/src/App.vue:47-52`) but it is not in `tabbarPaths`, so no tab bar is rendered here.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| saved support plan available | `savedSupport` computed from `supportPlan` | `SafetySupport.vue:12-18`, `:105` |
| plan loaded but empty | `savedSupport.length === 0` | `SafetySupport.vue:105` (`v-if`) |
| plan request failed (silently) | `supportPlan = null` in catch | `SafetySupport.vue:27-29` |
| acknowledging (button disabled) | `busy` | `SafetySupport.vue:10`, `:74` |
| error text | `error` | `SafetySupport.vue:11`, `:112` |
| journeyId present vs absent | `journeyId` computed | `SafetySupport.vue:9`, `:33`, `:65` |

There is no loading state for the support plan; the page renders immediately and the saved-plan block appears later if the fetch resolves.

## CONTROLS

| control (label/testid) | handler function | what it actually does |
| --- | --- | --- |
| hero 返回 | inline `router.back()` | pops WebView history |
| `safety-handoff` (发求助卡给信任的人) | inline `router.push` | to RealityHandoff, carrying `journeyId` when present |
| `safety-emergency` (联系当地紧急支持, `href="tel:12356"`) | none (anchor) | fires the Android dial intent for 12356 |
| 紧急医疗求助 (`href="tel:120"`) | none (anchor) | fires the dial intent for 120 |
| `safety-stay` (我暂时安全，继续留在这里) | `stayHere` | POST acknowledge + route to stabilize, or to TonightHome when there is no journey |
| 查看全部 | inline `router.push('/pages/support-plan/index')` | opens SupportPlan |
| 查看官方说明 (`target="_blank"`) | none (anchor) | external link to the NHC notice about 12356 |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 15 controls; `artifacts/post-recovery/control-coverage.json` shows 7 visible controls on `/pages/safety/index` (section, 返回, handoff, 12356, 120, stay, source link), 0 console errors, 0 failed requests.

## API_READS

- `GET /api/v1/me/support-plan` (`SafetySupport.vue:26`). Handler `PublicController.supportPlanCurrent` (`apps/api/src/controllers.ts:637-640`) -> `store.supportPlan` (`apps/api/src/store.service.ts:4635-4638`), returning the active **PersonalSupportPlan** for the user or `null`.

## API_WRITES

- `POST /api/v1/journeys/:id/safety/acknowledge` (`SafetySupport.vue:40`). Handler `acknowledgeSafety` (`controllers.ts:373-376`) -> `store.acknowledgeSafety` (`store.service.ts:3229-3245`), which sets `journey.stage='stabilizing'`, `journey.currentIntent='JUST_LISTEN'`, and writes a **JourneyUpdate** of kind `safety_acknowledged`. Models: **LifeJourney**, **JourneyUpdate**.

## DB_ENTITIES

- Reads: **PersonalSupportPlan** (`prisma/schema.prisma:646-659`, `plan` JSON read for `safePeople` / `places` / `smallActions`).
- Writes: **LifeJourney** (`stage`, `currentIntent`, `intentUpdatedAt`, `updatedAt`), **JourneyUpdate**.
- Cross-checked against `artifacts/product-audit/db-models.json`.

## ADMIN_VISIBILITY

- The **LifeJourney** stage change is visible under resource **journeys** -> `/experience/journeys` (`apps/admin/src/router.ts:64`).
- The **PersonalSupportPlan** read here is the same row shown under resource **support-plans** -> `/safety/support-plans` (`apps/admin/src/router.ts:78`, `GET /api/admin/v1/support/plans`, `controllers.ts:2056`).
- The risk that brought the user here was recorded as a **SafetyEvent** at creation or intent time, visible under resource **safety-events** -> `/safety/events` (`apps/admin/src/router.ts:77`). `acknowledgeSafety` itself writes no SafetyEvent.

## AI_USAGE

None, and this is the point of the page. SafetySupport creates no AiJob, reads no AI state and renders no generated text. Every string on the page is static copy (`SafetySupport.vue:51-112`) or comes from the user's own saved plan (`SafetySupport.vue:13-17`). The 12356 explanation cites the National Health Commission notice with a link (`SafetySupport.vue:88-95`). The page therefore works with no AI provider, no network AI call and no DAPI balance: with DAPI returning HTTP 402 everywhere else, this screen is unaffected.

## PRIVACY

- No `privacyAllows` gate on either call. `supportPlan` (`store.service.ts:4635-4638`) has no privacy check on read, unlike `saveSupportPlan` which requires `allowRecoveryData` (`store.service.ts:4606`). `acknowledgeSafety` has no gate either.
- Consequence: a user who has saved a plan and later turns `allowRecoveryData` off can still see the plan contents on this screen. Whether that is desirable for a crisis screen is a product decision, but it is an inconsistency with `store.service.ts:4606` / `:4692` / `:4642`, which all gate on the same flag.
- The saved-plan block only shows the first entry of `safePeople`, `places` and `smallActions` (`SafetySupport.vue:13-17`), which limits incidental disclosure on a shared screen.

## ERROR_STATES

- `stayHere` failure sets `error` to 当前安全状态没有保存 or the API message and renders it as `role="alert"` (`SafetySupport.vue:42-44`, `:112`). Crucially, the route push is inside the same `try` after the await (`SafetySupport.vue:40-41`), so a failed acknowledgement **does** still leave the user on the safety screen, which is the correct fail-closed behaviour here.
- The support-plan fetch has **no** visible error state: the catch assigns `supportPlan = null` and swallows the message (`SafetySupport.vue:27-29`), so a failed plan read is indistinguishable from "no plan saved". This is a finding, though on a crisis screen suppressing a non-critical failure is defensible.

## EMPTY_STATES

- No saved plan: the whole block is hidden (`v-if="savedSupport.length"`, `SafetySupport.vue:105`). There is no "you have not written a plan yet" copy and no link to create one; the only route to SupportPlan from here is 查看全部, which is inside the block that is hidden when there is no plan. So a user with no plan has no in-page path to make one.
- No other list on the page, so no other empty state.

## NATIVE_RISKS

- Dial intent: two `<a href="tel:...">` links (`SafetySupport.vue:70`, `:72`). On Android these raise the dialer intent; in the Capacitor WebView this works through the default `shouldOverrideUrlLoading` handling. Note that `@capacitor/app-launcher` is bundled (`apps/mp/android/app/src/main/assets/capacitor.plugins.json`) but the page uses a plain anchor instead, so behaviour depends on the WebView's URL interception rather than the plugin. Not verified on device.
- External link: 查看官方说明 opens `target="_blank"` with `rel="noreferrer"` (`SafetySupport.vue:89-93`). In a Capacitor WebView a `_blank` navigation is handled by the host, which can either open the system browser or do nothing depending on configuration; the config in `apps/mp/capacitor.config.ts` does not declare a custom handler.
- Back button: the back control uses `router.back()`, and the Android hardware back walks WebView history (`apps/mp/src/native/back-button.ts:26-33`). If the page was reached by a deep link with no history, BACK exits the app rather than returning to TonightHome.
- Safe area: not a tab route, and the page pads only `48px` bottom (`SafetySupport.vue` scoped `.safety-page`), which is enough because the fixed tab bar is absent.
- No keyboard and no clipboard on this page.

## ISSUES

- P1 NAVIGATION: SupportPlan's 需要即时安全支持 pushes `/pages/safety/index` with no `journeyId` (`apps/mp/src/views/SupportPlan.vue:255`). On that path `stayHere` silently redirects to TonightHome instead of the stabilize screen (`SafetySupport.vue:33-35`), so the two entries into the same screen behave differently and the user is not told why.
- P2 PRIVACY: the support-plan read is not gated by `allowRecoveryData`, unlike the matching write and the other recovery reads (`store.service.ts:4606`, `:4692`, `:4642`). Plan contents remain visible after the user revokes the flag.
- P2 UX: when no plan exists the 查看全部 link is hidden with the block (`SafetySupport.vue:105`), so there is no route from the crisis screen to create a plan - the exact moment the user is most likely to want one.
- P2 FUNCTIONAL: the plan-read failure is indistinguishable from "no plan" (`SafetySupport.vue:27-29`), so a user who does have a plan and hits a network error sees nothing and no explanation.
- P3 UX: the 3-step block (`SafetySupport.vue:78-98`) and the source note are static and always present, but the page never records that the user saw or acted on them; there is no "I did step 1" affordance and no JourneyUpdate for it, unlike every other action in the product.
- P3 NATIVE: the `tel:` links and the `target="_blank"` source link rely on WebView URL interception rather than the bundled `@capacitor/app-launcher` plugin; behaviour on device is unverified.

## FINAL_STATUS

PARTIAL - all entries, exits, the single write, the no-AI property and the privacy gap are traced to lines and the route renders on the APK (7 controls, 0 console errors), but the two `tel:` dial intents and the `target="_blank"` source link were not exercised on a device.

### Static evidence

- Controls discovered: 15
- API reads (static): `/api/v1/me/support-plan`
- API writes (static): `POST /api/v1/journeys/:param/safety/acknowledge`
- Candidate fake markers: 0
- Appended: the page is the only screen in group A whose behaviour is fully independent of the AI provider; it creates no AiJob and renders no generated text.
- Appended: `acknowledgeSafety` also forces `currentIntent = 'JUST_LISTEN'` (`store.service.ts:3232`), which is what makes the subsequent `mode=stabilize` route consistent with `inferStep` in JourneyDetail.
