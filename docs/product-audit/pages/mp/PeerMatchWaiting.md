# PeerMatchWaiting

Source: `apps/mp/src/views/PeerMatchWaiting.vue`

Routes: `/pages/peer/wait`

## PURPOSE

PeerMatchWaiting is the holding screen shown after the requester sends an anonymous request. It re-reads the match every 7 seconds, reports whether the other person has decided yet, and - once the owner has accepted and a conversation exists - replaces itself with the conversation screen.

## USER_JOB

"I sent my request. Tell me whether they said yes, and do not make me stare at a spinner."

## ENTRY

- `requestConversation()` in PeerExperienceDetail (`apps/mp/src/views/PeerExperienceDetail.vue:31`).
- `openExperience` in PeerNetwork when the match is `requested` or `connected` (`apps/mp/src/views/PeerNetwork.vue:37`, CTA labels 等待回应 / 查看进展 at `:74`).
- `PEER_ACCEPTED` notifications route straight to the conversation, not here (`apps/api/src/store.service.ts:4088`).
- `PeerMatchWaiting` is reachable with **no** `matchId` by typing the URL; the view then renders the empty waiting card with no title (`PeerMatchWaiting.vue:7`, `:17`).

## EXIT

- `load()` auto-forwards: when `match.status === 'connected'` and a conversation with that `matchId` already exists, it calls `router.replace('/pages/peer/conversation?matchId=<id>')` (`PeerMatchWaiting.vue:9`).
- `back()` -> `/pages/peers/index`, from both the ‹ hero button and 返回同路 (`PeerMatchWaiting.vue:10`, `:16-17`).
- 刷新状态 calls `load()` in place, no navigation (`PeerMatchWaiting.vue:17`).

## ROUTES

`/pages/peer/wait` (`apps/mp/src/router.ts:59`). One route, no aliases, not a `tabRoute`, but listed in `tabbarPaths` (`apps/mp/src/App.vue:11`) so the tab bar renders.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| waiting (default) | `match` non-null, status not `connected` | `PeerMatchWaiting.vue:17` |
| owner accepted, conversation exists | `match.status === 'connected'` | `PeerMatchWaiting.vue:9`, `:17-18` |
| no match resolved (bad/absent matchId) | `match === null` | `PeerMatchWaiting.vue:8-9`, `:17` |
| error note | `error` | `PeerMatchWaiting.vue:9`, `:19` |
| step 2/3 marked done | `match?.status === 'connected'` | `PeerMatchWaiting.vue:18` |
| polling loop running | `timer` (setInterval 7000) | `PeerMatchWaiting.vue:8`, `:11` |

There is no `loading` ref: the card renders immediately with `match === null` and fills in on the first response, so the pre-fetch frame shows 正在等待对方决定 with an empty title.

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| ‹ 返回同路 (aria-label, no testid) | `back` | `router.push('/pages/peers/index')` |
| 刷新状态 (no testid) | `load` | re-issues `GET /api/v1/peers` and `GET /api/v1/peer-conversations` |
| 返回同路 (no testid, class `back-action`) | `back` | same as ‹ |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 4 controls (the two `back` call sites are counted separately from the template); `artifacts/post-recovery/control-coverage.json` records `/pages/peer/wait` in state `default` with 返回同路 `changed`, 刷新状态 `changed`, and a second 返回同路 `not-found` (0 console errors, 0 failed requests).

## API_READS

- `GET /api/v1/peers` (`PeerMatchWaiting.vue:9`), then `.matches.find(m => m.id === matchId)`. Handler `controllers.ts:458-461` -> `store.peerNetwork` (`store.service.ts:3705-3722`).
- `GET /api/v1/peer-conversations` (`PeerMatchWaiting.vue:9`, only when the match is `connected`). Handler `controllers.ts:687-690` -> `store.conversationList` (`store.service.ts:4150-4156`).

Both are re-issued every 7 seconds by the interval at `PeerMatchWaiting.vue:11`.

## API_WRITES

None. This page only polls. All of its controls are navigation or re-reads.

## DB_ENTITIES

- Reads: **PeerMatch**, **PeerExperience** (via `peerMatchForUser` -> `peerExperienceSummary`), **PeerConversation**, **JourneyUpdate**, **OutcomeCheckin** (`store.service.ts:3727-3732`), **PrivacySetting** (the `allowPeerMatching` gate at `store.service.ts:3707`).
- Writes: none.
- Cross-checked against `prisma/schema.prisma:524-550`, `:496-522`, `:767-791`, `:207-227`.

## ADMIN_VISIBILITY

- The match being polled is under **peer-matches** -> `/experience/matches` (`apps/admin/src/router.ts:68`).
- Once accepted, the conversation is under **peer-conversations** -> `/experience/peer-conversations` (`apps/admin/src/router.ts:70`, `controllers.ts:2029-2044`, which also adds `messageCount`).
- The `PEER_ACCEPTED` notification the owner's acceptance generates is under **notifications** -> `/experience/notifications` (`apps/admin/src/router.ts:71`).

## AI_USAGE

None. No `AiJob` is created here and neither read calls `queueAI`.

## PRIVACY

- `GET /api/v1/peers` is gated by `allowPeerMatching` (`store.service.ts:3707-3708`). If the user turns matching off while this page is polling, the payload becomes `{privacyEnabled:false, matches:[]}`, so `match` resolves to `null` and the page silently degrades to the empty waiting card with no explanation - it does not say the user revoked their own consent.
- The conversation list is scoped to `[starterUserId, receiverUserId].includes(userId)` (`store.service.ts:4154`), so this page can only ever forward into a conversation the caller is a participant of.
- The request preview shows `match.requestQuestion` / `requestReason`, which were PII-checked at write time (`store.service.ts:4035`).
- The 72-hour claim in the steps card (`PeerMatchWaiting.vue:18`) matches the server: `expiresAt = startsAt + 72 * 3_600_000` (`store.service.ts:4078`).

## ERROR_STATES

One error path, driven by `error`: a failed `GET /api/v1/peers` or `GET /api/v1/peer-conversations` sets 等待状态暂时无法更新 or the API message (`PeerMatchWaiting.vue:9`), rendered at the bottom of the page (`:19`). Because `match` stays null, the card simultaneously shows 正在等待对方决定 with no title - the page cannot distinguish "the network failed" from "no such match".

The polling loop keeps running after an error and has no backoff, so a persistent failure re-issues two requests every 7 seconds indefinitely with no user-visible escalation.

## EMPTY_STATES

- `match === null`: 这段经历正在等待回应 as the title and 你留下的请求正在安静地等待对方决定。 as the body (`PeerMatchWaiting.vue:17`). This is the same rendering used for a bad `matchId` and for a revoked consent, so there is no true "not found" state.
- No `requestQuestion`: falls back to `requestReason` or the generic 你留下的请求正在安静地等待对方决定。 (`PeerMatchWaiting.vue:17`).
- No experience tags: the tag row renders empty (no guard, `:17`).

## NATIVE_RISKS

- Safe area: the page pads `142px` bottom (`PeerMatchWaiting.vue:24`); the tab bar renders because the path is in `tabbarPaths`.
- Background polling: a 7-second `setInterval` runs for the whole lifetime of the view (`PeerMatchWaiting.vue:11`) and is cleared in `onBeforeUnmount` (`:11`). On Android, if the WebView is backgrounded the timer keeps firing until the view unmounts; there is no visibility-change pause. No runtime evidence of battery or wake-lock impact was collected.
- No sheet, no textarea, no keyboard interaction, no dial intent, no clipboard.
- Back button: nothing to intercept; the page has no overlay.
- The hero and card images are CSS backgrounds (`peer-night-hero.png`, `peer-bench-scene.png`).

## ISSUES

- P2 STATE_MACHINE: `match === null` is overloaded. A wrong `matchId`, a match that no longer exists, a failed request and a revoked `allowPeerMatching` all render the identical 正在等待对方决定 card (`PeerMatchWaiting.vue:9`, `:17`), so the user can be left waiting forever for a request that will never be answered.
- P2 UX: the polling loop has no backoff, no cap and no visibility pause (`PeerMatchWaiting.vue:11`); two requests fire every 7 seconds for as long as the page is mounted, including after repeated failures.
- P2 NAVIGATION: the auto-forward requires both `status === 'connected'` **and** an existing conversation (`PeerMatchWaiting.vue:9`). A match the owner accepted but never confirmed the boundary on stays on this screen forever showing 对方愿意聊聊 while the only way forward - the consent page - is never linked from here.
- P3 UX: the `‹` and 返回同路 controls are two buttons with the same handler on one screen (`PeerMatchWaiting.vue:16-17`), and the runtime clicker found one of them `not-found`.
- P3 FUNCTIONAL: there is no `loading` ref, so the first paint always shows 正在等待对方决定 with an empty title and empty tags before the request resolves (`PeerMatchWaiting.vue:17`), which flickers on a slow connection.

## FINAL_STATUS

DONE - the poll, the two reads, the consent-gated payload and the auto-forward are all traced to concrete lines, and the route renders on the Android APK (7 visible controls, 0 console errors, 0 failed requests).

### Static evidence

- Controls discovered: 4
- API reads (static): `/api/v1/peer-conversations`, `/api/v1/peers`
- API writes (static): (none)
- Candidate fake markers: 0
- Appended: `artifacts/product-audit/discovery-agent5-fake-candidates.md` M35 adjudicates the frontend-generated-match suspicion as NOT_FAKE - matches are computed server-side (`store.service.ts:3800-3870`) and this page only reads them.

