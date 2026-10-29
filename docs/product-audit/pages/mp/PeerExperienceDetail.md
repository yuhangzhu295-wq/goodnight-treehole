# PeerExperienceDetail

Source: `apps/mp/src/views/PeerExperienceDetail.vue`

Routes: `/pages/peer/detail`

## PURPOSE

PeerExperienceDetail renders one published anonymous PeerExperience - the story, the 后来 (what the author did next), the timeline snippets and the helpful / not-helpful actions - and, only when the page was opened from a match (`matchId` present), offers the 请求匿名交流 sheet that converts a suggestion into a consent request.

## USER_JOB

"I want to read what this person actually did after the same kind of situation, and - if it helped - ask them one real question without revealing who I am."

## ENTRY

- `openExperience` in PeerNetwork, primary card CTA (`apps/mp/src/views/PeerNetwork.vue:74` -> `:39`): `/pages/peer/detail?id=<experienceId>&matchId=<id>`.
- `openExperience` in PeerNetwork, secondary card `›` (`PeerNetwork.vue:79` -> `:39`).
- `openPublished` in PeerNetwork, published-experience row (`PeerNetwork.vue:84` -> `:42`): `/pages/peer/detail?id=<experienceId>` with **no matchId**.
- No other file in `apps/mp/src` pushes this route; the `?view=outcomes` intent from JourneyDetail never reaches it.
- With no `id` query the view is still reachable by typing the URL, and then shows 没有找到要查看的经历 (`PeerExperienceDetail.vue:19`).

## EXIT

- `requestConversation()` PATCHes the match to `requested` and then `router.push('/pages/peer/wait?matchId=<id>')` (`PeerExperienceDetail.vue:30-31`).
- `router.back()` from the ‹ button (`PeerExperienceDetail.vue:40`).
- The sheet closes without navigating (`requestOpen = false`, `PeerExperienceDetail.vue:48`).
- When `matchId` is empty (the `openPublished` path), the request callout is not rendered at all (`v-if="matchId"`, `:47`), so there is no write path and no forward exit - the user must press back.

## ROUTES

`/pages/peer/detail` (`apps/mp/src/router.ts:57`). One route, no aliases, not a tab route. It is listed in `tabbarPaths` (`apps/mp/src/App.vue:13`) even though it is not a tab, so the bottom tab bar renders on it.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading | `loading` (ref true) | `PeerExperienceDetail.vue:9`, `:20`, `:41` |
| missing-id error | `error` set before any fetch | `PeerExperienceDetail.vue:19` |
| load error | `error` | `PeerExperienceDetail.vue:22`, `:41` |
| populated detail | `detail` | `PeerExperienceDetail.vue:8`, `:42` |
| request callout shown | `matchId` non-empty | `PeerExperienceDetail.vue:16`, `:47` |
| request sheet open | `requestOpen` | `PeerExperienceDetail.vue:13`, `:48` |
| requesting (button disabled + relabelled) | `requesting` | `PeerExperienceDetail.vue:10`, `:28`, `:48` |
| send disabled on empty reason | `!requestReason.trim()` | `PeerExperienceDetail.vue:11`, `:48` |
| timeline block shown | `detail.timeline.length` | `PeerExperienceDetail.vue:45` |
| later fallback copy | `detail.later.summary || detail.later.message` | `PeerExperienceDetail.vue:44` |
| empty helpful / not-helpful lists | `detail.helpfulActions.length` | `PeerExperienceDetail.vue:46` |

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| ‹ 返回同路经历 (aria-label, no testid) | `router.back()` | WebView history back; with no history this does nothing |
| 请求匿名交流 (no testid) | `requestOpen = true` | opens the bottom sheet; does not call the API |
| sheet × 关闭请求面板 (aria-label, no testid) | `requestOpen = false` | closes the sheet |
| sheet textarea 我为什么想聊 (maxlength 280) | `v-model="requestReason"` | seeded with 我想听听你后来是怎么把这段日子走过去的。 |
| sheet input 我最想问的一句 (maxlength 160) | `v-model="requestQuestion"` | seeded with 如果只留一句给当时的自己，你会说什么？ |
| 递出匿名请求 (no testid) | `requestConversation` | PATCHes the match to `requested` with reason+question, then routes to wait |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 5 controls; `artifacts/post-recovery/control-coverage.json` records `/pages/peer/detail` rendering with the `‹` control `changed` and 4 tab links skipped. The runtime walk opened the route **without** a query, so the recorded first line is 没有找到要查看的经历 and the callout, sheet and submit were never exercised (0 console errors, 0 failed requests).

## API_READS

- `GET /api/v1/peer-experiences/:id` (`PeerExperienceDetail.vue:21`). Handler `PublicController.peerExperience` (`apps/api/src/controllers.ts:540-543`) -> `store.peerExperienceDetail` (`apps/api/src/store.service.ts:4108-4148`), returning `{experience, journey, timeline, actions, later, helpfulActions, notHelpfulActions, retrospective}`.

Note: the endpoint takes **no user header** (`controllers.ts:541`) and `peerExperienceDetail` performs no ownership or privacy check (`store.service.ts:4108-4110`); any `published` experience is readable by anyone who knows its id.

## API_WRITES

- `PATCH /api/v1/peer-matches/:id` with `{status:'requested', requestReason, requestQuestion}` (`PeerExperienceDetail.vue:30`). Handler `PublicController.peerMatch` (`controllers.ts:490-502`) -> `store.updatePeerMatch` (`store.service.ts:4008-4058`), which writes **PeerMatch** (`status`, `requestReason`, `requestQuestion`, `updatedAt`) and, for the owner, a **UserNotification** of type `PEER_REQUEST` (`store.service.ts:4041-4050`).

## DB_ENTITIES

- Reads: **PeerExperience**, **LifeJourney**, **JourneyUpdate**, **ActionCommitment** (`store.service.ts:4111-4130`).
- Writes: **PeerMatch**, **UserNotification** (to the experience owner).
- Cross-checked against `prisma/schema.prisma:496-522` (PeerExperience), `:524-550` (PeerMatch), `:752-765` (UserNotification).

## ADMIN_VISIBILITY

- The experience is listed under **peer-experiences** -> `/experience/peers` (`apps/admin/src/router.ts:67`).
- The match it creates is listed under **peer-matches** -> `/experience/matches` (`apps/admin/src/router.ts:68`).
- The `PEER_REQUEST` notification is listed under **notifications** -> `/experience/notifications` (`apps/admin/src/router.ts:71`).
- The `laterSummary`, `helpfulActions` and `retrospective` fields shown here are editable only through `PATCH /api/v1/peer-experiences/:id` (`controllers.ts:523-538`), which has no mp caller; there is no admin editor for them either.

## AI_USAGE

None on this page. No `AiJob` is created by either call. `peerExperienceDetail` is a pure read and `updatePeerMatch` only calls `queueAI` for nothing - it never does (`store.service.ts:4008-4058`).

## PRIVACY

- The read is gated only by `status === 'published'` (`store.service.ts:4109`). There is **no** `allowPeerMatching` check and no viewer identity check on this endpoint, so the experience is public-by-id once it is published.
- Every returned text field is passed through `redactPeerPublicText` / `redactPeerPublicValue` before it leaves the store: `experience.content` (`:4133`), the summary fields (`:4132`), timeline entries (`:4120`), action titles (`:4129`), `laterSummary` (`:4136`), `helpfulActions` / `notHelpfulActions` (`:4144-4145`) and `retrospective` (`:4146`). The redactor strips phone numbers, emails, WeChat/QQ handles, ID numbers, addresses and 我叫… names (`:3900-3917`).
- `detail.later` falls back to `{available:false, message:'TA目前还没有留下这一阶段的后续记录。'}` when the author left no later record (`:4135-4137`); note the view renders `later.summary || later.message` (`PeerExperienceDetail.vue:44`) so the fallback message is shown.
- The request write is validated by `assertPeerDraftSafe` on reason+question and rejects PII with a 400 (`store.service.ts:4035`, `:3894-3898`). The reason is defaulted and truncated to 280 chars, the question to 160 (`:4031-4033`).
- There is no consent gate before this read and no `allowPeerMatching` check, which is a privacy gap for the `openPublished` path (a user with matching switched off can still be shown - and can still be sent to - a published experience).

## ERROR_STATES

One error path, driven by `error`:

- no `id` query: 没有找到要查看的经历, set before the fetch and with `loading=false` (`PeerExperienceDetail.vue:19`).
- load failure: 经历加载失败 or the API message (`PeerExperienceDetail.vue:22`).
- request failure: 请求发送失败 or the API message (`PeerExperienceDetail.vue:32`).

The error is rendered as a bare `.error-note` paragraph (`PeerExperienceDetail.vue:41`); it replaces the whole detail body and there is no retry control. A 404 from the API (the store throws `NotFoundException('这段同路经历不存在')`, `store.service.ts:4110`) is therefore a terminal dead end with no way forward except the back button.

## EMPTY_STATES

- No `helpfulActions`: TA还没有留下具体方法。 (`PeerExperienceDetail.vue:46`).
- No `notHelpfulActions`: 每个人的节奏都不一样。 (`PeerExperienceDetail.vue:46`).
- No `later.summary`/`later.message`: 这段后来还在慢慢展开。 (`PeerExperienceDetail.vue:44`).
- No `timeline`: the whole 走过的片段 card is hidden (`v-if="detail.timeline.length"`, `:45`).
- No `matchId`: the 想问问 TA 吗？ callout is absent, so a published-only reader has no action at all.
- No tags: the tag row renders empty (no guard, `PeerExperienceDetail.vue:43`).

## NATIVE_RISKS

- Safe area: the page pads `142px` bottom (`PeerExperienceDetail.vue:54`); the bottom tab bar renders because `/pages/peer/detail` is in `tabbarPaths` (`apps/mp/src/App.vue:13`).
- Keyboard: the sheet contains a textarea and an input. `Keyboard.resize:'body'` (`apps/mp/capacitor.config.ts`) keeps them in view, but the sheet is `position:fixed; inset:0; align-items:end` (`PeerExperienceDetail.vue:54`, `.request-sheet`) with no `env(safe-area-inset-bottom)` padding, so on a device with a gesture bar the submit button can sit under the system bar.
- Back button: the sheet does **not** intercept the Android back button. It is a plain `v-if` overlay with only the × and no mask click handler (`PeerExperienceDetail.vue:48`), and `apps/mp/src/native/back-button.ts` only walks WebView history, so BACK with the sheet open navigates away from the page instead of closing the sheet.
- The sheet is not teleported, so it is clamped to the `.phone-shell`; that is the one thing it does correctly here.
- No dial intent, no clipboard, no file picker on this page.

## ISSUES

- P1 PRIVACY: `GET /api/v1/peer-experiences/:id` has no `allowPeerMatching` gate and no viewer check (`controllers.ts:540-543`, `store.service.ts:4108-4110`). A published experience is readable by anyone who knows or guesses the id, including a user who never consented to the peer network, and the PeerNetwork "换一批"/published-row path hands out those ids directly.
- P2 STATE_MACHINE: the 请求匿名交流 path assumes the match is still `suggested`. `updatePeerMatch` requires exactly that for `status==='requested'` (`store.service.ts:4024-4025`), so a match that is `declined` or `blocked` (both of which PeerNetwork still renders) produces a 400 shown as a bare error note with no explanation and no way to recover.
- P2 FAKE_BUTTON: the sheet's confirm checkbox is `<input type="checkbox" checked disabled>` (`PeerExperienceDetail.vue:48` in the sibling consent view; here the sheet has no checkbox) - on this page the sheet presents no explicit consent step at all: pressing 递出匿名请求 sends the request immediately with no confirmation and no mention that the other person may decline.
- P2 NAVIGATION: the `‹` control calls `router.back()` (`PeerExperienceDetail.vue:40`) with no history guard. Deep-linked from a notification or a cold start, the button has no destination and appears to do nothing. `LetterToday.safeBack` (`LetterToday.vue:63-66`) shows the pattern this view lacks.
- P2 UX: on a load error or a missing id the page shows only the error paragraph with no retry (`PeerExperienceDetail.vue:41`), unlike LetterToday which offers 重新读取 (`LetterToday.vue:258`).
- P3 NATIVE: the request sheet ignores the Android back button and has no safe-area padding (`PeerExperienceDetail.vue:48`, `:54`).
- P3 STATE_MACHINE: `requestConversation` returns silently when `matchId` is empty (`PeerExperienceDetail.vue:27`); the guard is redundant because the button is only rendered when `matchId` is set, but it means a programmatic call would fail with no user feedback.

## FINAL_STATUS

PARTIAL - the read, the redaction boundary, the request write and the sheet are traced to concrete lines, but the runtime walk opened `/pages/peer/detail` without a query, so the populated state, the callout, the sheet and the submit were never exercised on the device (0 console errors, 0 failed requests only for the empty state).

### Static evidence

- Controls discovered: 5
- API reads (static): `/api/v1/peer-experiences/:param`
- API writes (static): `PATCH /api/v1/peer-matches/:param`
- Candidate fake markers: 0
- Appended: `artifacts/post-recovery/control-coverage.json` records `/pages/peer/detail` in state `default` with only the `‹` control clickable; `artifacts/recovery/android-route-manifest.json` records `firstLine: "‹ / 匿名经历详情 / 没有找到要查看的经历"`, confirming the runtime walk hit the missing-id branch.

