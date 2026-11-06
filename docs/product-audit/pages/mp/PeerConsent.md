# PeerConsent

Source: `apps/mp/src/views/PeerConsent.vue`

Routes: `/pages/peer/consent`

## PURPOSE

PeerConsent is the second, explicit confirmation that the experience owner must give before any messaging exists. It restates the four anonymous-boundary rules (no identity, 72-hour limit, no contact exchange, can leave any time) and creates the `PeerConversation` on confirm. It is the gate that makes "accepted != active" true.

## USER_JOB

"I already said yes. Before I am put into a chat with a stranger, show me the rules one more time and let me confirm - or back out."

## ENTRY

- `respond(item,'connected')` in PeerRequests (`apps/mp/src/views/PeerRequests.vue:16`).
- `openConsent(item)` from the accepted card in PeerRequests (`apps/mp/src/views/PeerRequests.vue:17`, `:29`).
- Reachable with no `matchId` by typing the URL; `load()` then resolves `match` to `null` and the confirm button is permanently disabled (`PeerConsent.vue:6`, `:9`, `:17`).

## EXIT

- `consent()` POSTs the consent and then `router.replace('/pages/peer/conversation?matchId=<id>')` using the `matchId` returned by the server (`PeerConsent.vue:9`).
- 我想再想想 -> `/pages/peer/requests` (`PeerConsent.vue:17`).
- ‹ 返回请求 -> `router.back()` (`PeerConsent.vue:15`).

## ROUTES

`/pages/peer/consent` (`apps/mp/src/router.ts:60`). One route, no aliases, not a `tabRoute`, but listed in `tabbarPaths` (`apps/mp/src/App.vue:12`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading | `loading` (ref true) | `PeerConsent.vue:7`, `:8`, `:16` |
| boundary card (default, after load) | `!loading` | `PeerConsent.vue:17` |
| match resolved | `match` | `PeerConsent.vue:7-8` |
| confirm disabled (no match) | `busy \|\| !match` | `PeerConsent.vue:17` |
| busy (confirm relabelled 正在开启…) | `busy` | `PeerConsent.vue:7`, `:9`, `:17` |
| error note | `error` | `PeerConsent.vue:8-9`, `:17` |

The checkbox 我理解并愿意遵守这些匿名边界。 is `<input type="checkbox" checked disabled>` (`PeerConsent.vue:17`): it is decorative and cannot be unchecked, and `consent()` never reads it.

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| ‹ 返回请求 (aria-label, no testid) | `router.back()` | WebView history back |
| 我理解并愿意遵守这些匿名边界。 checkbox | none | `checked disabled`; visual only, not read by `consent()` |
| 同意并开始同行 (no testid) | `consent` | POSTs `/peer-matches/:id/consent`, then `router.replace` to the conversation |
| 我想再想想 (no testid, class `later`) | inline `router.push('/pages/peer/requests')` | abandons the consent step |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 4 controls; `artifacts/post-recovery/control-coverage.json` records `/pages/peer/consent` with 返回请求 `changed` and 同意并开始同行 / the checkbox both `skipped: not actionable` - i.e. the confirm was **disabled** at runtime because no `matchId` was supplied (0 console errors, 0 failed requests). 我想再想想 was `not-found`.

## API_READS

- `GET /api/v1/peer-requests` (`PeerConsent.vue:8`), then `.items.find(item => item.id === matchId)`. Handler `controllers.ts:518-521` -> `store.peerRequestList` (`store.service.ts:4094-4106`). Note this is the **owner inbox** endpoint, not a by-id lookup.

## API_WRITES

- `POST /api/v1/peer-matches/:id/consent` with an empty body (`PeerConsent.vue:9`). Handler `PublicController.peerMatchConsent` (`controllers.ts:513-516`) -> `store.startPeerConversation` (`store.service.ts:4060-4092`), which creates **PeerConversation** (`status:'active'`, `startsAt`, `consentAcceptedAt`, `expiresAt = startsAt + 72h`) and a `PEER_ACCEPTED` **UserNotification** to the requester (`store.service.ts:4082-4089`).

## DB_ENTITIES

- Reads: **PeerMatch**, **PeerExperience** (ownership), **PeerConversation** (the `awaitsConsent` filter), **PrivacySetting** (via `peerNetwork` if reached indirectly - not on this page).
- Writes: **PeerConversation**, **UserNotification**.
- Cross-checked against `prisma/schema.prisma:767-791` (PeerConversation), `:752-765` (UserNotification), `:524-550` (PeerMatch).

## ADMIN_VISIBILITY

- The conversation created here appears under **peer-conversations** -> `/experience/peer-conversations` (`apps/admin/src/router.ts:70`, `controllers.ts:2029-2044`, with `messageCount`).
- The `PEER_ACCEPTED` notification appears under **notifications** -> `/experience/notifications` (`apps/admin/src/router.ts:71`).
- The match moves to `connected` and stays visible under **peer-matches** -> `/experience/matches` (`apps/admin/src/router.ts:68`).

## AI_USAGE

None. `startPeerConversation` does not call `queueAI` (`store.service.ts:4060-4092`).

## PRIVACY

- The write is authorised by identity, not by a flag: `startPeerConversation` requires `experience.userId === currentUserId` **and** `item.status === 'connected'`, otherwise 403 (`store.service.ts:4065-4066`). The requester cannot self-consent.
- The page's own read is scoped by `peerRequestList`, which returns only matches where the caller owns the experience (`store.service.ts:4097-4104`), so the 403 case cannot normally be reached through the UI.
- `allowPeerMatching` is **not** checked on either call. A user who revokes matching still sees the boundary card and can still start a conversation.
- No `allowAnonymousExperienceShare` or `allowAnonymousExperienceStats` flag is involved at this step.
- The four boundary rules shown (`PeerConsent.vue:17`) match the server: anonymity is structural (messages carry only `senderUserId` and are mapped to `'self' | 'peer'`, `store.service.ts:3769-3778`), the 72-hour cap is `expiresAt` (`:4078`), contact exchange is blocked by `assertPeerDraftSafe` (`:4163`), and leaving is `close`/`block` (`:4196-4225`).

## ERROR_STATES

One error path, driven by `error`:

- load failure: 会话前信息没有加载成功 or the API message (`PeerConsent.vue:8`).
- consent failure: 暂时无法开启会话 or the API message (`PeerConsent.vue:9`).

The error is rendered below the card (`PeerConsent.vue:17`, `.error-note`) while the card itself is still shown. Because `loading` is cleared in `finally` (`:8`), a failed load leaves `match === null` and the 同意并开始同行 button permanently disabled - the user sees the rules, an error, and a button that will never enable, with no retry.

## EMPTY_STATES

There is no empty state. The card always renders its full rule list; the only degraded shape is the disabled button produced by `!match`. No "you have no pending consent" copy exists, and the page does not redirect when the match is absent.

## NATIVE_RISKS

- Safe area: the page pads `142px` bottom (`PeerConsent.vue:23`) and is in `tabbarPaths`, so the tab bar renders.
- No sheet, no textarea, no keyboard interaction, no dial intent, no clipboard.
- Back button: nothing to intercept; the page has no overlay.
- The two person avatars and the bench scene are CSS-drawn / background layers (`PeerConsent.vue:23`); they carry `aria-hidden` where they are decorative.

## ISSUES

- P1 STATE_MACHINE: the page is a dead end on any load failure. `load()` resolves `match` from the owner inbox; if the request is not in that list - a failed fetch, a stale link, or a requester who is not the owner - `match` is `null`, the confirm button is disabled by `!match` (`PeerConsent.vue:17`), and there is no retry and no navigation away other than 我想再想想 / back. The runtime walk hit exactly this state (`同意并开始同行` recorded as `skipped: not actionable`).
- P2 PRIVACY: `POST /peer-matches/:id/consent` does not re-check `allowPeerMatching` (`store.service.ts:4060-4092`), so a user who revoked the peer network can still be walked into a 72-hour conversation from this page.
- P2 FAKE_BUTTON: the 我理解并愿意遵守这些匿名边界。 checkbox is `checked disabled` and is never read by `consent()` (`PeerConsent.vue:17`). The page presents an explicit consent gesture that is purely decorative; the only real consent is the button press.
- P2 UX: the error for a failed load and the error for a failed consent share one `error` ref and one style (`PeerConsent.vue:8-9`, `:17`), so 暂时无法开启会话 can appear above a card whose button is disabled for an unrelated reason.
- P3 NAVIGATION: `consent()` uses the server-returned `response.conversation.matchId` (`PeerConsent.vue:9`) while every other navigation on the page uses the local `matchId`; the two are normally identical but the inconsistency means a server-side remap would silently change the destination.
- P3 FUNCTIONAL: the rule 你可以随时结束 / 也可以举报或停止匹配 (`PeerConsent.vue:17`) is accurate, but the page never tells the user that ending the conversation is irreversible and that the chat history stays in their records - that is only said later, in the conversation's end-confirm dialog (`PeerConversation.vue:31`).

## FINAL_STATUS

PARTIAL - the consent write, the ownership gate and the 72-hour creation are traced to concrete lines, but the runtime walk reached the page without a `matchId`, so the confirm button was disabled and the successful consent path was never exercised on the device.

### Static evidence

- Controls discovered: 4
- API reads (static): `/api/v1/peer-requests`
- API writes (static): `POST /api/v1/peer-matches/:param/consent`
- Candidate fake markers: 0
- Appended: `tests/business/peer-support-stage.spec.ts:77-85` is the executable contract for this page - the requester gets 403 on `/consent`, and the owner's `/consent` returns a conversation with a truthy `consentAcceptedAt`.

