# PeerConversation

Source: `apps/mp/src/views/PeerConversation.vue`

Routes: `/pages/peer/conversation`

## PURPOSE

PeerConversation is the anonymous, time-boxed chat itself. It shows the messages between the two participants, a countdown of the 72-hour window, a composer with an "AI tidy my wording" assist, and the two safety exits (end the conversation, report or block the other person).

## USER_JOB

"I want to say something real to someone who has been there, without giving away who I am and without being stuck here if it turns bad."

## ENTRY

- `consent()` in PeerConsent (`apps/mp/src/views/PeerConsent.vue:9`).
- `load()` auto-forward in PeerMatchWaiting (`apps/mp/src/views/PeerMatchWaiting.vue:9`).
- `PEER_ACCEPTED` notification tap-through: `peerNotification` sets `targetRoute = /pages/peer/conversation?matchId=<id>` (`apps/api/src/store.service.ts:4088`), pushed by NotificationCenter (`apps/mp/src/views/NotificationCenter.vue:27`).
- `CONVERSATION_CLOSED` notifications also point here (`store.service.ts:3970`).
- Reachable with no `matchId` by typing the URL; `load()` then resolves `conversation` to `null` and the 会话还没开始 card renders (`PeerConversation.vue:8`, `:24`).

## EXIT

- `closeConversation()` -> `router.replace('/pages/peer/graduate?matchId=<id>')` (`PeerConversation.vue:14`).
- `block()` -> `router.replace('/pages/peer/graduate?matchId=<id>')` (`PeerConversation.vue:16`).
- 留下感受 in the closed card -> `/pages/peer/graduate?matchId=<id>` (`PeerConversation.vue:29`).
- 回到同路 in the empty card -> `/pages/peers/index` (`PeerConversation.vue:24`).
- ‹ 返回 -> `router.back()` (`PeerConversation.vue:22`).

## ROUTES

`/pages/peer/conversation` (`apps/mp/src/router.ts:61`). One route, no aliases, not a `tabRoute`, but listed in `tabbarPaths` (`apps/mp/src/App.vue:14`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| no conversation resolved | `!conversation` | `PeerConversation.vue:7-8`, `:24` |
| active conversation | `conversation.status === 'active'` | `PeerConversation.vue:28` |
| closed conversation | `conversation.status !== 'active'` | `PeerConversation.vue:29` |
| empty message list | `!conversation.messages.length` | `PeerConversation.vue:27` |
| remaining-time label | `remaining` computed from `expiresAt` | `PeerConversation.vue:9`, `:22` |
| sending (send disabled + relabelled) | `busy` | `PeerConversation.vue:7`, `:11`, `:22`, `:28` |
| assist running | `assistBusy` | `PeerConversation.vue:7`, `:13`, `:28` |
| assist notice | `assistNotice` | `PeerConversation.vue:7`, `:13`, `:28` |
| error / info note | `error` | `PeerConversation.vue:7`, `:8`, `:11-16`, `:23` |
| end-confirm dialog open | `closeConfirmOpen` | `PeerConversation.vue:7`, `:22`, `:31` |
| safety sheet open | `safetyOpen` | `PeerConversation.vue:7`, `:22`, `:32` |
| report reason filled | `reportReason` | `PeerConversation.vue:7`, `:32` |
| draft non-empty (send/assist enabled) | `draft` | `PeerConversation.vue:7`, `:28` |

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| ‹ 返回 (aria-label, no testid) | `router.back()` | WebView history back |
| 结束 (no testid, class `header-end`) | `closeConfirmOpen = true` | opens the end-confirm dialog; disabled unless `status === 'active'` |
| ••• 安全操作 (aria-label, no testid) | `safetyOpen = true` | opens the report/block sheet |
| 帮我整理一下 (no testid, class `assist`) | `assist` | POSTs `/assist`, polls `GET /api/v1/ai/tasks/:id`, replaces the draft with the AI draft |
| 发送 (no testid, class `send`) | `send` | POSTs the message; the only path that writes a PeerMessage |
| textarea (maxlength 1000, no testid) | `v-model="draft"` | the composer; a live `n/1000` counter is shown |
| 再想想 (no testid) | `closeConfirmOpen = false` | closes the end dialog |
| 确认结束 (no testid, class `confirm-end`) | `closeConversation` | POSTs `/close`, routes to graduation |
| 取消 (no testid) | `safetyOpen = false` | closes the safety sheet |
| 提交举报 (no testid, class `confirm-end`) | `report` | POSTs `/report {reason}`; disabled while the reason is empty |
| 举报原因 textarea (maxlength 300, no testid) | `v-model="reportReason"` | the report text |
| 停止匹配并结束 (no testid, class `block-action`) | `block` | POSTs `/block`, routes to graduation |
| 回到同路 (empty card, no testid) | inline `router.push('/pages/peers/index')` | leaves the empty state |
| 留下感受 (closed card, no testid) | inline `router.push('/pages/peer/graduate?matchId=<id>')` | goes to graduation |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 14 controls; `artifacts/post-recovery/control-coverage.json` records `/pages/peer/conversation` in state `possibly-empty` with 返回 `changed`, 结束 `skipped: not actionable` (disabled because no conversation was loaded), and 安全操作 / 回到同路 `not-found` (0 console errors, 0 failed requests).

## API_READS

- `GET /api/v1/peer-conversations` (`PeerConversation.vue:8`), then `.items.find(item => item.matchId === matchId)`. Handler `controllers.ts:687-690` -> `store.conversationList` (`store.service.ts:4150-4156`), which calls `expirePeerConversations()` first so an expired conversation is returned as `closed` (`store.service.ts:3989-3996`).
- `GET /api/v1/ai/tasks/:id` (`PeerConversation.vue:13`, up to 20 times at 400 ms intervals). Handler `controllers.ts:1020-1028`.

## API_WRITES

All five write handlers delegate to `store.service.ts` methods that first call `requirePeerConversation`, which enforces participation:

- `POST /api/v1/peer-conversations/:matchId/messages` (`PeerConversation.vue:11`) -> `store.sendPeerMessage` (`store.service.ts:4158-4176`), writes **PeerMessage**.
- `POST /api/v1/peer-conversations/:matchId/assist` (`PeerConversation.vue:13`) -> `store.requestPeerResponseAssist` (`store.service.ts:4178-4194`), creates an **AiJob**.
- `POST /api/v1/peer-conversations/:matchId/close` (`PeerConversation.vue:14`) -> `store.closePeerConversation` (`store.service.ts:4196-4201`), writes **PeerConversation** and two **UserNotification** rows.
- `POST /api/v1/peer-conversations/:matchId/report` (`PeerConversation.vue:15`) -> `store.reportPeerConversation` (`store.service.ts:4203-4214`), writes **PeerConversation** (`reportedAt`, `reporterUserId`, `reportReason`) and increments **PeerExperience**.`reportCount`.
- `POST /api/v1/peer-conversations/:matchId/block` (`PeerConversation.vue:16`) -> `store.blockPeerConversation` (`store.service.ts:4216-4225`), writes **PeerMatch** (`status:'blocked'`) and **PeerConversation** (`closedReason:'blocked'`).

## DB_ENTITIES

- Reads: **PeerConversation**, **PeerMessage**, **PrivacySetting** (not on this path).
- Writes: **PeerMessage**, **PeerConversation**, **PeerMatch**, **UserNotification**, **PeerExperience** (reportCount only), **AiJob** (assist).
- Cross-checked against `prisma/schema.prisma:767-791`, `:793-807`, `:524-550`, `:752-765`, `:496-522`.

## ADMIN_VISIBILITY

- The conversation appears under **peer-conversations** -> `/experience/peer-conversations` (`apps/admin/src/router.ts:70`, `controllers.ts:2029-2044`, which adds `messageCount`). The admin list exposes the conversation record but **not** the messages - there is no admin endpoint that returns `peerMessages`.
- The report increments the experience's `reportCount`, visible under **peer-experiences** -> `/experience/peers` (`apps/admin/src/router.ts:67`).
- The `CONVERSATION_CLOSED` notifications appear under **notifications** -> `/experience/notifications` (`apps/admin/src/router.ts:71`).
- Blocking moves the match to `blocked`, visible under **peer-matches** -> `/experience/matches` (`apps/admin/src/router.ts:68`).
- The assist `AiJob` appears under **jobs** -> `/ai/jobs` (`apps/admin/src/router.ts:50`).

## AI_USAGE

Yes, one job per 帮我整理一下 press. `requestPeerResponseAssist` calls `queueAI({taskType:'peer_response_assist', style:'warm', mood:'委屈', sourceId: conversation.id, content: draft})` (`store.service.ts:4184-4191`). Normalised task type `peer_response_assist`, style `warm`, content type resolved by `contentTypeForTask`.

The failure handling is the strongest in the product: `runAiJob` routes `peer_response_assist` exclusively to the DAPI provider with three retries and **no** template fallback - on total failure it sets `status:'failed'`, `fallbackUsed:false` and returns (`store.service.ts:5224-5232`, `:5362-5368`, `:5484-5504`). The view then throws `'DAPI 整理失败，请保留原话发送'` (`PeerConversation.vue:13`), so the user's own words are preserved and nothing is invented. The DAPI HTTP 402 blocker therefore produces a visible error here rather than a silent template.

Two gaps in that handling:

- the poll loop gives up silently after 20 attempts (~8 s) if the job is still `queued`/`running`: the `for` loop ends with no assignment, no throw and no notice, so 帮我整理一下 appears to do nothing (`PeerConversation.vue:13`).
- the draft is replaced wholesale by `task.result` (`PeerConversation.vue:13`), so the AI rewrite overwrites the user's original wording with no undo.

The invariant "AI may only draft and never send" holds: the AI result is only ever written into `draft`, and the only call that creates a **PeerMessage** is `send()` (`PeerConversation.vue:11`).

## PRIVACY

- Participation is enforced server-side on every read and write: `requirePeerConversation` finds the conversation by `matchId` **and** `[starterUserId, receiverUserId].includes(userId)`, else 404 (`store.service.ts:3998-4006`). `tests/business/peer-support-stage.spec.ts:152` asserts a third user gets 404 on the messages endpoint.
- Messages are mapped per viewer: `author` is `'self'` or `'peer'` and the raw `senderUserId` is never returned (`store.service.ts:3769-3778`).
- Every message body is passed through `redactPeerPublicText` on read as well as write (`store.service.ts:3774-3775`, with the comment that historic records must not bypass the boundary).
- Writing is blocked if the text contains a phone number, email, WeChat/QQ handle, ID number, address or a 我叫… name: `assertPeerDraftSafe` throws 400 (`store.service.ts:4162-4163`, `:3894-3898`). The composer repeats this as 请不要发送联系方式或可识别信息。 (`PeerConversation.vue:28`).
- The 72-hour window is enforced on send: `sendPeerMessage` rejects when `status !== 'active'` or `expiresAt <= now` (`store.service.ts:4160-4161`), and `expirePeerConversations` closes due conversations on every read (`:3989-3996`). The window starts at `consentAcceptedAt`, i.e. at **active**, not at accept (`store.service.ts:4077-4078`) - the invariant holds.
- Reporting is attributed: `reporterUserId` is stored, so the operator can see who reported (`store.service.ts:4207`).
- No `allowPeerMatching` re-check on any of these endpoints; a conversation already open keeps working after matching is revoked.

## ERROR_STATES

One shared error path, driven by `error`:

- load failure: 匿名会话加载失败 or the API message (`PeerConversation.vue:8`).
- send failure: 消息没有送出 or the API message (`PeerConversation.vue:11`).
- assist failure: 暂时无法整理这段话 or the API message, including the specific 请保留原话发送 text (`PeerConversation.vue:13`).
- close failure: 会话关闭失败 (`PeerConversation.vue:14`).
- block failure: 停止匹配没有完成 (`PeerConversation.vue:16`).
- empty report reason: 请简短说明需要处理的原因, set client-side (`PeerConversation.vue:15`).

`report()` writes its **success** message 已收到这条反馈，我们会按规则处理。 into the same `error` ref (`PeerConversation.vue:15`), so a successful report renders in the red `.error-note` style used for failures (`:23`, style at `:38`).

There is no dedicated error state for a missing conversation: a bad `matchId` renders the 会话还没开始 empty card, not an error.

## EMPTY_STATES

- No conversation: 会话还没开始 / 只有双方都确认匿名边界，才会创建这段限时同行。 with a 回到同路 button (`PeerConversation.vue:24`).
- No messages: 可以从一个具体、轻一点的感受开始。每一句都不必完美。 (`PeerConversation.vue:27`).
- Closed conversation: 这段匿名同行已经结束。 with 留下感受 (`PeerConversation.vue:29`); the composer is hidden entirely, so a closed chat cannot be typed into.

## NATIVE_RISKS

- Safe area: the page pads `142px` bottom (`PeerConversation.vue:38`); the tab bar renders because the path is in `tabbarPaths`. The composer is in normal flow, and `Keyboard.resize:'body'` (`apps/mp/capacitor.config.ts`) keeps it visible.
- Back button: **neither** the end-confirm dialog nor the safety sheet intercepts the Android back button. Both are plain `v-if` overlays with no mask-click handler (`PeerConversation.vue:31-32`), and `apps/mp/src/native/back-button.ts` only walks WebView history, so BACK with a dialog open navigates out of the conversation instead of dismissing the dialog. `artifacts/post-recovery/native-checks-back.json` records the same class of failure on other routes (`sheet state handled on the post detail route`: false).
- The 72-hour countdown is computed once per render from `Date.parse(expiresAt) - Date.now()` (`PeerConversation.vue:9`) and never ticks: the label only updates when something else triggers a re-render or the 7-second poll on another page fires. There is no timer here.
- Messages are fetched only on mount (`onMounted(load)`, `PeerConversation.vue:17`); there is no polling or push, so the other person's replies do not appear until the user leaves and returns. This is a NATIVE/UX risk for a chat surface.
- No dial intent, no clipboard, no file picker.

## ISSUES

- P1 FUNCTIONAL: the conversation never refreshes. `load()` runs once on mount (`PeerConversation.vue:17`) and the only other trigger is sending a message. There is no poll, no interval and no websocket, so a participant cannot see the other person's replies without leaving and re-entering the screen - the core job of the page does not work in a live two-person conversation.
- P2 STATE_MACHINE: the assist poll loop gives up silently. After 20 attempts (~8 s) with the job still `queued`/`running`, the loop exits with no `draft`, `assistNotice` or `error` change (`PeerConversation.vue:13`), so 帮我整理一下 looks like a dead button.
- P2 UX: `report()` reuses `error` for a success message (`PeerConversation.vue:15`), rendering 已收到这条反馈，我们会按规则处理。 in the red failure style, and leaving no way to tell a failed report from a successful one at a glance.
- P2 UX: the AI draft overwrites the composer contents outright (`PeerConversation.vue:13`, `draft.value = task.result`), with no undo and no side-by-side comparison, on the one screen where the user's own words are the point.
- P2 NATIVE: neither the end-confirm dialog nor the safety sheet closes on the Android back button (`PeerConversation.vue:31-32`; `apps/mp/src/native/back-button.ts`).
- P3 STATE_MACHINE: 结束 is disabled when `status !== 'active'` (`PeerConversation.vue:22`) but the header still renders the label 会话已经结束 via `remaining` (`:9`), so a closed conversation shows a disabled 结束 next to 会话已经结束.
- P3 PRIVACY: revoking `allowPeerMatching` does not stop an existing conversation; none of the five write handlers or the list read checks the flag (`store.service.ts:4150-4225`).
- P3 DATA: `reportPeerConversation` increments the reported experience's `reportCount` (`store.service.ts:4211`), which feeds the `safety` term of future match scores (`:3828`) - a single report drops an experience's safety score from 1 to 0.2 and materially changes who is recommended it.

## FINAL_STATUS

PARTIAL - every read, write, privacy gate and the AI boundary are traced to concrete lines, but the runtime walk reached the page without a conversation, so the message list, composer, assist, end dialog and safety sheet were never exercised on the device.

### Static evidence

- Controls discovered: 14
- API reads (static): `/api/v1/ai/tasks/:param`, `/api/v1/peer-conversations`
- API writes (static): `POST /api/v1/peer-conversations/:param/assist`, `POST /api/v1/peer-conversations/:param/block`, `POST /api/v1/peer-conversations/:param/close`, `POST /api/v1/peer-conversations/:param/messages`, `POST /api/v1/peer-conversations/:param/report`
- Candidate fake markers: 3 - all adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md`: M14 (the `wait` poll interval), M15 (two textarea placeholders), and the third is the same placeholder pair.
- Appended: `tests/business/peer-support-stage.spec.ts:97-104` asserts the assist creates an `AiJob` with `taskType:'peer_response_assist'`, `providerId:'provider_dapi_deepseek'`, `fallbackUsed:false`, and that the message count is unchanged afterwards - the executable form of "AI may only draft, never send".

