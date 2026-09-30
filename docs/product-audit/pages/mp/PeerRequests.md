# PeerRequests

Source: `apps/mp/src/views/PeerRequests.vue`

Routes: `/pages/peer/requests`

## PURPOSE

PeerRequests is the inbox for the peer flow. It lists the matches where the user is the **experience owner** and either someone has asked to talk (`requested`) or the user has already agreed but the anonymous conversation has not started yet (`connected`). From here the owner accepts, declines or blocks a request, and confirms the boundary that opens the 72-hour conversation.

## USER_JOB

"Someone read my story and wants to ask me something. Let me decide, without pressure, whether to talk to them - and on what terms."

## ENTRY

- 我的请求 tab in PeerNetwork (`apps/mp/src/views/PeerNetwork.vue:54`).
- `PEER_REQUEST` notification tap-through: `peerNotification` sets `targetRoute = /pages/peer/requests?matchId=<id>` (`apps/api/src/store.service.ts:4048`), and NotificationCenter pushes the server-provided `targetRoute` (`apps/mp/src/views/NotificationCenter.vue:27`). The `matchId` parameter is **not read** by this view.
- The 我想再想想 button on PeerConsent (`apps/mp/src/views/PeerConsent.vue:17`).
- The 推荐给你 tab here returns to PeerNetwork (`PeerRequests.vue:24`).

## EXIT

- `respond(item,'connected')` -> `/pages/peer/consent?matchId=<id>` (`PeerRequests.vue:16`).
- `respond(item,'declined')` / `respond(item,'blocked')` -> no navigation; `load()` re-reads the list (`PeerRequests.vue:16`).
- `openConsent(item)` from the accepted card -> `/pages/peer/consent?matchId=<id>` (`PeerRequests.vue:17`, `:29`).
- 推荐给你 tab -> `/pages/peers/index` (`PeerRequests.vue:24`).

## ROUTES

`/pages/peer/requests` (`apps/mp/src/router.ts:58`). One route, no aliases, not a `tabRoute`, but it is listed in `tabbarPaths` (`apps/mp/src/App.vue:10`) so the bottom tab bar renders on it.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading | `loading` (ref true) | `PeerRequests.vue:9`, `:15`, `:25` |
| error banner | `error` | `PeerRequests.vue:11`, `:15-16`, `:25` |
| pending list populated | `pending` (`status==='requested'`) | `PeerRequests.vue:12`, `:27` |
| empty card | `pending.length === 0` | `PeerRequests.vue:28` |
| accepted-but-not-started card | `accepted` (`status==='connected'`) | `PeerRequests.vue:13`, `:29` |
| per-row busy (buttons disabled) | `busyId` | `PeerRequests.vue:10`, `:16`, `:27` |
| tab count badge | `pending.length` | `PeerRequests.vue:24` |

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| 收到的请求 `<n>` tab (no testid) | none | hardcoded `class="active"`; the current tab |
| 推荐给你 tab (no testid) | inline `router.push('/pages/peers/index')` | returns to the network tab |
| 我愿意聊聊 (no testid, class `accept`) | `respond(item,'connected')` | POSTs `/respond {status:'connected'}`, then routes to consent |
| 这次先不了 (no testid) | `respond(item,'declined')` | POSTs `/respond {status:'declined'}`, re-reads the list |
| 暂时不想 (no testid, class `text-only`) | `respond(item,'blocked')` | POSTs `/respond {status:'blocked'}`, re-reads the list |
| 确认这段同行 `›` (in the accepted card, no testid) | `openConsent(item)` | routes to the consent page |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 8 controls; `artifacts/post-recovery/control-coverage.json` records `/pages/peer/requests` in state `possibly-empty` with 收到的请求 0 as `no observable change`, 推荐给你 as `changed`, and 4 tab links skipped (0 console errors, 0 failed requests). The request cards, all three respond buttons and the accepted card were never exercised on the device.

## API_READS

- `GET /api/v1/peer-requests` (`PeerRequests.vue:15`). Handler `PublicController.peerRequests` (`apps/api/src/controllers.ts:518-521`) -> `store.peerRequestList` (`apps/api/src/store.service.ts:4094-4106`). That method filters to matches where the experience owner is the caller and either `status==='requested'` or (`status==='connected'` and no `PeerConversation` exists yet), then maps through `peerMatchForUser`.

## API_WRITES

- `POST /api/v1/peer-matches/:id/respond` with `{status}` where status is `connected` | `declined` | `blocked` (`PeerRequests.vue:16`). Handler `PublicController.peerMatchRespond` (`controllers.ts:504-511`) -> `store.updatePeerMatch` (`store.service.ts:4008-4058`), writing **PeerMatch** (`status`, `acceptedAt` when connected, `updatedAt`).

## DB_ENTITIES

- Reads: **PeerMatch**, **PeerExperience** (to resolve ownership and the title), **PeerConversation** (the `awaitsConsent` check at `store.service.ts:4100-4102`).
- Writes: **PeerMatch**.
- Cross-checked against `prisma/schema.prisma:524-550` (PeerMatch), `:496-522` (PeerExperience), `:767-791` (PeerConversation).

## ADMIN_VISIBILITY

- The responded matches appear under **peer-matches** -> `/experience/matches` (`apps/admin/src/router.ts:68`, `GET /api/admin/v1/peer-matches`, `controllers.ts:1993-2003`).
- The experiences behind them are under **peer-experiences** -> `/experience/peers` (`apps/admin/src/router.ts:67`).
- No notification is created by `respond`; the `PEER_REQUEST` notification that brought the user here is listed under **notifications** -> `/experience/notifications` (`apps/admin/src/router.ts:71`).

## AI_USAGE

None. `peerRequestList` and `updatePeerMatch` never call `queueAI` (`store.service.ts:4094-4106`, `:4008-4058`), so there is no AI job and no fallback path on this page.

## PRIVACY

- The list is scoped by ownership: only matches whose `peerExperience.userId === caller` are returned (`store.service.ts:4097-4104`). A requester never sees their own outgoing request in this inbox.
- Accepting (`connected`) does **not** open messaging. It only sets `acceptedAt` (`store.service.ts:4051`) and surfaces the accepted card with 确认这段同行; the actual conversation is created only by `POST /peer-matches/:id/consent` (`controllers.ts:513-516` -> `startPeerConversation`, `store.service.ts:4060-4092`). This is the "accepted != active" invariant, and it holds here.
- `allowPeerMatching` is **not** re-checked on this path; `peerRequestList` does not call `privacyAllows`. A user who revokes matching after receiving a request still sees and can still accept that request.
- The request reason and question shown on the cards were redacted at write time by `assertPeerDraftSafe` (`store.service.ts:4035`), which rejects PII with a 400 rather than redacting it.
- Blocking here sets the match to `blocked` and, per the test contract, prevents either side from messaging (`tests/business/peer-support-stage.spec.ts:208`, `:224-227`).

## ERROR_STATES

One error path, driven by `error`:

- load failure: 请求加载失败 or the error message (`PeerRequests.vue:15`).
- respond failure: 请求处理失败 or the error message (`PeerRequests.vue:16`).

The banner renders above the list (`PeerRequests.vue:25`) and the list is still shown, so the user can retry a failed respond. There is no retry control for a failed load and no distinction between "the request is gone" and "the network failed".

## EMPTY_STATES

- No pending requests: the empty card 还没有新的请求 / 有人看见你的后来时，会先把请求放在这里，等你自己决定。 (`PeerRequests.vue:28`).
- No accepted-but-unstarted matches: the accepted card is hidden (`v-if="accepted.length"`, `:29`); there is no copy for that case.
- No error-specific empty state.

## NATIVE_RISKS

- Safe area: not a `tabRoute` but in `tabbarPaths`, so the bottom tab bar renders; the page pads `142px` bottom (`PeerRequests.vue:35`) and the shared `.goodnight-page` adds the inset.
- No sheet, no textarea, no keyboard interaction, no dial intent, no clipboard.
- Back button: nothing to intercept; there is no overlay on this page.
- All three respond buttons disable themselves while `busyId === item.id` (`PeerRequests.vue:27`), which is the right guard for a destructive single-tap.

## ISSUES

- P1 PRIVACY: revoking `allowPeerMatching` does not remove a user from this inbox. `peerRequestList` never calls `privacyAllows` (`store.service.ts:4094-4106`), so a request that arrived while matching was on remains actionable after the user has switched the network off. The privacy invariant "matching off means no peer surface" is enforced on PeerNetwork but not here.
- P2 STATE_MACHINE: `respond` with `declined` or `blocked` calls `load()` (`PeerRequests.vue:16`), and `load()` sets `loading=true` then clears it in `finally` (`:15`). Because `error` is cleared at the start of `respond` and `load` never clears it, a successful decline followed by a failed re-read leaves the stale error banner over an unchanged list.
- P2 NAVIGATION: the `PEER_REQUEST` notification deep-links to `/pages/peer/requests?matchId=<id>` (`store.service.ts:4048`) but this view never reads `matchId`, so the notification cannot focus the specific request. With several pending requests the user lands on an undifferentiated list.
- P2 UX: `respond` clears `error` before the call (`PeerRequests.vue:16`), so a load error that the user has not yet read is silently wiped by the next tap. The error is also shared by all three actions, so a message like 请求处理失败 does not say which request failed.
- P3 DUPLICATE: the two `respond(item,'connected')` and `openConsent(item)` paths both end at `/pages/peer/consent?matchId=<id>` (`PeerRequests.vue:16-17`); the accepted card is effectively a second entry to the same destination, which is intentional but means a `connected` match is shown in two different shapes on one screen.
- P3 FUNCTIONAL: 暂时不想 (`blocked`) and 这次先不了 (`declined`) look like near-synonyms in the UI but have different consequences - `blocked` sets the match status to `blocked` and closes any conversation, while `declined` only ends this request (`store.service.ts:4026-4029`). Nothing on the card explains the difference.

## FINAL_STATUS

PARTIAL - the ownership filter, the accepted-vs-active split and the respond write are traced to concrete lines, but the runtime walk only reached the empty state, so the request cards and all three respond buttons were never exercised on the device.

### Static evidence

- Controls discovered: 8
- API reads (static): `/api/v1/peer-requests`
- API writes (static): `POST /api/v1/peer-matches/:param/respond`
- Candidate fake markers: 0
- Appended: `artifacts/post-recovery/control-coverage.json` records `/pages/peer/requests` in state `possibly-empty` with the tab badge reading 收到的请求 0; `tests/business/peer-support-stage.spec.ts:208` asserts a declined match cannot be messaged and `:224-227` asserts the same for a blocked one.

