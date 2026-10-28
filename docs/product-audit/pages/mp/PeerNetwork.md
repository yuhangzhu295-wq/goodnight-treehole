# PeerNetwork

Source: `apps/mp/src/views/PeerNetwork.vue`

Routes: `/pages/peers/index`

## PURPOSE

PeerNetwork is the 同路 tab (the second of the four bottom tabs) and the product's "other people who walked a similar road" surface. It renders the anonymous experiences the backend has already matched to the user's own situation, offers a route into each story, and - when the user has not opted in - asks for the `allowPeerMatching` consent before showing anything.

## USER_JOB

"Show me someone who has already come out the other side of what I am going through, and let me decide whether to look closer."

## ENTRY

- Bottom tab 同路, `data-testid=tab-letter`, `to="/pages/peers/index"` (`apps/mp/src/App.vue:87-96`). It is one of the four `tabRoutes` (`apps/mp/src/router.ts:48`).
- Support intents `FIND_PEOPLE` and `SEE_OUTCOMES` both target `/pages/peers/index` (`apps/api/src/store.service.ts:2827-2832`); `JourneyDetail.chooseIntent` appends `?journeyId=<id>` (`apps/mp/src/views/JourneyDetail.vue:97-101`). Neither `view=outcomes` nor `journeyId` is read by this view.
- The 推荐给你 tab inside PeerRequests (`apps/mp/src/views/PeerRequests.vue:24`).
- 回到同路 from PeerConversation (`apps/mp/src/views/PeerConversation.vue:24`), 返回同路 from PeerMatchWaiting (`apps/mp/src/views/PeerMatchWaiting.vue:10`), 先不分享 from PeerGraduation (`apps/mp/src/views/PeerGraduation.vue:23`).

## EXIT

- 我的请求 tab -> `/pages/peer/requests` (`PeerNetwork.vue:54`).
- `openExperience` -> `/pages/peer/wait?matchId=<id>` when the match status is `requested` or `connected` (`PeerNetwork.vue:37`); otherwise `/pages/peer/detail?id=<experienceId>&matchId=<id>` (`PeerNetwork.vue:39`).
- `openPublished` -> `/pages/peer/detail?id=<experienceId>` with no matchId (`PeerNetwork.vue:42`).
- `enable()` does not navigate; it PATCHes the privacy flags and re-loads (`PeerNetwork.vue:31`).
- 看看隐私边界 -> `/pages/privacy/index` (`PeerNetwork.vue:63`), which is **not a route**; the real route is `/pages/settings/privacy` (`apps/mp/src/router.ts:102`).

## ROUTES

`/pages/peers/index` (`apps/mp/src/router.ts:54`). One route, no aliases; it is one of the four `tabRoutes` (`router.ts:48`) and one of the `tabbarPaths` (`apps/mp/src/App.vue:9`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading | `loading` (ref true) | `PeerNetwork.vue:12`, `:23`, `:26`, `:56` |
| error banner | `error` | `PeerNetwork.vue:13`, `:25`, `:32`, `:55` |
| privacy gate / boundary card | `!item \|\| !item.privacyEnabled` | `PeerNetwork.vue:58` |
| enabling (button relabelled and disabled) | `enabling` | `PeerNetwork.vue:14`, `:30`, `:62` |
| populated recommendation block | `item.privacyEnabled` | `PeerNetwork.vue:66` |
| primary story card | `primaryMatch` (`matches[0]`) | `PeerNetwork.vue:15`, `:69` |
| secondary story cards | `secondaryMatches` (`matches[1..3]`) | `PeerNetwork.vue:16`, `:77` |
| no-match note | `primaryMatch` falsy | `PeerNetwork.vue:76` |
| published-experience block | `publishedExperiences.length` | `PeerNetwork.vue:17-20`, `:82` |
| limited note | `item.limited` | `PeerNetwork.vue:85` |

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| 推荐给你 tab (no testid) | none | hardcoded `class="active"`; the current tab, no handler |
| 我的请求 tab (no testid) | inline `router.push('/pages/peer/requests')` | opens the request inbox |
| 允许匿名寻找同路经历 (no testid) | `enable` | PATCHes `/api/v1/me/privacy` with `allowPeerMatching:true` **and** `allowAnonymousExperienceStats:true`, then re-loads |
| 看看隐私边界 (no testid) | inline `router.push('/pages/privacy/index')` | dead end - the route does not exist |
| 换一批 (no testid) | `load` | re-issues the same `GET /api/v1/peers`; the backend returns the same top-3 by score |
| primary card CTA 看看 TA 后来怎么样 / 等待回应 / 查看进展 (no testid) | `openExperience(primaryMatch)` | routes by `match.status` to wait or detail |
| secondary card `›` (no testid) | `openExperience(match)` | same routing for matches 2-3 |
| published row (no testid) | `openPublished(experience)` | opens the experience detail with no matchId |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 12 controls for this view; `artifacts/post-recovery/control-coverage.json` shows 7 visible controls on `/pages/peers/index` in the `possibly-empty` state (2 tab buttons, 换一批, 4 tab links), 0 console errors, 0 failed requests. 换一批 was recorded as `not-found` by the clicker and was never actually exercised.

## API_READS

- `GET /api/v1/peers` (`PeerNetwork.vue:24`). Handler `PublicController.peers` (`apps/api/src/controllers.ts:458-461`) -> `store.peerNetwork` (`apps/api/src/store.service.ts:3705-3722`), returning `{privacyEnabled, experiences (up to 3 summaries), matches (up to 3), limited}`.

## API_WRITES

- `PATCH /api/v1/me/privacy` with `{allowPeerMatching:true, allowAnonymousExperienceStats:true}` (`PeerNetwork.vue:31`). Handler `PublicController.patchMePrivacy` (`controllers.ts:1659-1662`) delegating to `updatePrivacy` (`controllers.ts:1620-1658`), which whitelists the two keys and persists **PrivacySetting**. There is no dedicated `store.service.ts` method for this write; it is performed in the controller against `store.data.privacySettings`.

## DB_ENTITIES

- Reads: **PrivacySetting**, **PeerExperience**, **PeerMatch**, **LifeJourney**, **JourneyUpdate**, **OutcomeCheckin** (`store.service.ts:3727-3732` reads journey updates and check-ins to compute `laterRecordCount`).
- Writes: **PrivacySetting**.
- Cross-checked against `prisma/schema.prisma:207-227` (PrivacySetting), `:496-522` (PeerExperience), `:524-550` (PeerMatch).

## ADMIN_VISIBILITY

- The matched experiences appear under resource **peer-experiences** -> `/experience/peers` (`apps/admin/src/router.ts:67`, `GET /api/admin/v1/peer-experiences`, `controllers.ts:1965-1975`).
- The matches themselves appear under **peer-matches** -> `/experience/matches` (`apps/admin/src/router.ts:68`, `controllers.ts:1993-2003`).
- The privacy setting written here has no admin resource; it is not exposed in `menuGroups`.
- This page creates no notifications.

## AI_USAGE

None. No `AiJob` is created by this page, and `store.peerNetwork` / `suggestPeerMatches` never call `queueAI` (`store.service.ts:3705-3722`, `:3797-3872`). The `peer_match_explain` task type exists in the enum (`store.service.ts:5357`) but nothing on this path queues it. Matching is a deterministic score breakdown computed server-side (`store.service.ts:3830-3839`), so there is no AI failure mode on this page.

## PRIVACY

- `allowPeerMatching` gates the entire payload: with the flag off, `peerNetwork` returns `{privacyEnabled:false, experiences:[], matches:[], limited:false}` before touching any experience (`store.service.ts:3707-3708`). This is the precondition for the whole peer flow.
- `allowAnonymousExperienceStats` gates the derived counters only: `laterRecordCount` includes timeline and check-in counts only when the *publisher* allowed anonymous stats (`store.service.ts:3726-3736`).
- Every published experience is filtered to `status==='published' && userId !== viewer` (`store.service.ts:3709`), so a user is never matched with their own experience.
- All outward text is passed through `redactPeerPublicText` (title, domain, subDomain, tags) (`store.service.ts:3739-3743`, redactor at `:3900-3917`).
- `enable()` flips `allowAnonymousExperienceStats` on at the same time as `allowPeerMatching`; the user is not asked about the second flag separately (`PeerNetwork.vue:31`).

## ERROR_STATES

One error path, driven by `error`:

- load failure sets 同路经历加载失败 or the API message (`PeerNetwork.vue:25`).
- privacy write failure sets 隐私设置更新失败 or the API message (`PeerNetwork.vue:32`).

There is no dedicated error state. Because `loading` is cleared in `finally` (`PeerNetwork.vue:26`) and `item` stays `null`, a failed load falls through the `v-else-if="!item || !item.privacyEnabled"` branch and renders the **privacy opt-in card** under the red error banner. The user is told their privacy is off and is invited to press 允许匿名寻找同路经历 when the real problem was a failed request.

## EMPTY_STATES

- No matches: 暂时还没有足够接近的同路经历。你正在走的路会慢慢变得清楚。 (`PeerNetwork.vue:76`).
- No published experiences: the whole 还有一些人，留下了后来 block is hidden (`v-if="publishedExperiences.length"`, `PeerNetwork.vue:82`); there is no copy for that case.
- Privacy off: the boundary card (`PeerNetwork.vue:58-64`) is the designed empty state.

## NATIVE_RISKS

- Safe area: tab route, so the fixed tab bar renders; the page pads `142px` bottom (`PeerNetwork.vue:92`) and the shared `.goodnight-page` adds `calc(130px + env(safe-area-inset-bottom))`.
- No sheet, no textarea, no keyboard interaction, no dial intent, no clipboard on this page.
- The two hero images are CSS background layers (`peer-night-hero.png`, `peer-bench-scene.png`) with mask gradients; they degrade to empty boxes if the assets fail to load, with no alt text (they are decorative `::after` content).
- Back button: nothing to intercept; the page has no overlay.

## ISSUES

- P2 NAVIGATION / FAKE_BUTTON: 看看隐私边界 pushes `/pages/privacy/index`, which does not exist in `apps/mp/src/router.ts`. On the one page whose subject is the privacy boundary, the boundary link is a dead end. (Recorded as ISSUE-005 in `docs/product-audit/ISSUE_REGISTER.md`.)
- P2 FAKE_BUTTON: 换一批 calls `load()`, which re-issues the identical `GET /api/v1/peers`; `peerNetwork` sorts by score and slices 3 with no shuffle or cursor (`store.service.ts:3710-3715`), so the control cannot change what the user sees. Runtime coverage never reached it.
- P2 STATE_MACHINE: an API failure is indistinguishable from "privacy is off". `loading` is cleared in `finally` and `item` stays null, so the opt-in card renders and the user is pushed to re-grant a permission that is already granted.
- P2 STATE_MACHINE: `declined` and `blocked` matches are still returned by `peerNetwork` (only `.filter(item => item.experience)` is applied, `store.service.ts:3715`) and rendered as story cards whose CTA falls through to `/pages/peer/detail` (`PeerNetwork.vue:37-39`). The detail page then offers 请求匿名交流, and `updatePeerMatch` rejects it because it requires `item.status === 'suggested'` (`store.service.ts:4024-4025`). The user is walked into a guaranteed 400.
- P2 NAVIGATION: the `?journeyId=` and `?view=outcomes` parameters that `FIND_PEOPLE` / `SEE_OUTCOMES` append are never read here, so both support intents land on the same generic tab. (Recorded as ISSUE-006.)
- P3 PRIVACY: `enable()` grants `allowAnonymousExperienceStats` alongside `allowPeerMatching` without a separate choice (`PeerNetwork.vue:31`); the boundary card only explains the matching consent.

## FINAL_STATUS

DONE - the privacy gate, the deterministic match read, the (dead) boundary link and the opt-in write are all traced to concrete lines, and the route renders on the Android APK (7 visible controls, 0 console errors, 0 failed requests).

### Static evidence

- Controls discovered: 12
- API reads (static): `/api/v1/peers`
- API writes (static): `PATCH /api/v1/me/privacy`
- Candidate fake markers: 0
- Appended: `artifacts/post-recovery/control-coverage.json` records the page in state `possibly-empty` with the 换一批 control `not-found` and 我的请求 as `changed`; `artifacts/recovery/android-route-manifest.json` shows `/pages/peers/index` rendered with 3 buttons / 4 links and no console errors.

