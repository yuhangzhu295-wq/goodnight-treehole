# NotificationCenter

Source: `apps/mp/src/views/NotificationCenter.vue`

Routes: `/pages/notifications/index`

## PURPOSE

NotificationCenter is the single inbox for the follow-up system. It lists the reminders the backend scheduled on the user's behalf (later check-ins, released cooldowns, future-self messages, peer requests and peer conversation closures), lets the user mark them read, and forwards to the screen that the server says is relevant.

## USER_JOB

"I want to see what the app is asking me to come back to, and jump straight to the right place."

## ENTRY

- TonightHome bell, `data-testid=notification-bell` -> `router.push('/pages/notifications/index')` (`apps/mp/src/views/TonightHome.vue:65`).
- ActionCenter follow-up strip, `data-testid=action-followup-strip` -> `@open="router.push('/pages/notifications/index')"` (`apps/mp/src/views/ActionCenter.vue:336`).
- The page is in `tabbarPaths` (`apps/mp/src/App.vue:37`), so the bottom tab bar is rendered while it is open, but no tab links to it. `activeTab` resolves to `me` (`App.vue:54`).

Exhaustive search of `apps/mp/src` for `/pages/notifications` returns only these two pushes plus the route and the tabbar set.

## EXIT

`open(item)` pushes `item.targetRoute` verbatim when the server supplied one (`NotificationCenter.vue:27`). There is no fallback: a notification with no `targetRoute` marks itself read and stays on the page. The exact next routes are whatever the producers wrote:

| notification type | targetRoute | producer |
| --- | --- | --- |
| `FOLLOW_UP` | `/pages/action/index?section=follow-up` | `apps/api/src/follow-up-worker.service.ts:73` |
| `COOLDOWN_RELEASED` | `/pages/decision/index?id=<decisionId>` | `follow-up-worker.service.ts:71` |
| `FUTURE_SELF` | `/pages/future-self/index` | `follow-up-worker.service.ts:68` |
| `PEER_REQUEST` | `/pages/peer/requests?matchId=<id>` | `apps/api/src/store.service.ts:4042-4049` |
| `PEER_ACCEPTED` | `/pages/peer/conversation?matchId=<id>` | `store.service.ts:4082-4089` |
| `CONVERSATION_CLOSED` | `/pages/peer/conversation?matchId=<id>` | `store.service.ts:3971-3986` |
| `JOURNEY_CHECKIN` | (declared, no producer) | `packages/shared-types/src/goodnight-2.ts:83-90` |

## ROUTES

`/pages/notifications/index` (`apps/mp/src/router.ts:65`). Single route, no aliases.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading | `loading` (ref true) | `NotificationCenter.vue:13`, `:36` |
| error banner (takes precedence over the list) | `error` | `NotificationCenter.vue:14`, `:36` |
| tab: all / unread | `tab` | `NotificationCenter.vue:15`, `:17`, `:35` |
| unread badge count | `notices.filter(status==='unread')` inline | `NotificationCenter.vue:35` |
| populated list | `notices` | `NotificationCenter.vue:16`, `:37` |
| per-item unread styling + dot | `item.status === 'unread'` | `NotificationCenter.vue:37` |
| empty | `!visibleNotices.length` | `NotificationCenter.vue:37` |
| `dismissed` status | declared in the `Notice` type but never produced or filtered | `NotificationCenter.vue:11` |

## CONTROLS

| control (label/testid) | handler function | what it actually does |
| --- | --- | --- |
| 全部 tab (role=tab) | `tab = 'all'` | shows every notice regardless of status |
| 未读 tab (role=tab, with count badge) | `tab = 'unread'` | filters to `status === 'unread'` |
| notice card `notification-<id>` | `open(item)` | if unread, PATCH read; optimistically flips local status to read; then pushes `item.targetRoute` |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 7 controls for this view; `artifacts/post-recovery/control-coverage.json` shows 10 visible controls on `/pages/notifications/index` (2 tabs, 4 notice cards, 4 tab links), no console errors, no failed requests.

## API_READS

- `GET /api/v1/notifications` (`NotificationCenter.vue:24`). Handler `PublicController.notifications` (`apps/api/src/controllers.ts:676-680`) -> `store.notificationList` (`apps/api/src/store.service.ts:4284-4289`), which filters by user and sorts by `createdAt` descending. The response also carries `unreadCount`, which this view ignores and recomputes locally.

## API_WRITES

- `PATCH /api/v1/notifications/:id/read` (`NotificationCenter.vue:27`). Handler `readNotification` (`controllers.ts:682-685`) -> `store.readNotification` (`store.service.ts:4291-4301`), which sets `status='read'` and `readAt`, then persists. Model: **UserNotification** (`prisma/schema.prisma:752-765`).

## DB_ENTITIES

- Reads: **UserNotification**.
- Writes: **UserNotification** (`status`, `readAt`).
- Indirect producers of the rows this page reads: **FollowUpJob** (written by `createActionCommitment` `store.service.ts:3344-3353`, `createCooldown` `:4449-4459`, `saveFutureMessage` `:4578-4589`), **CooldownItem**, **DecisionRecord**, **MessageToFutureSelf**, **PeerMatch**.
- Cross-checked against `artifacts/product-audit/db-models.json`.

## ADMIN_VISIBILITY

Yes, read-only. Resource **notifications** -> admin route `/experience/notifications` (`apps/admin/src/router.ts:71`, label 用户提醒) -> `GET /api/admin/v1/notifications` (`apps/admin/src/views/TablePage.vue:63`, `apps/api/src/controllers.ts:2017`). The related **follow-ups** queue is on `/experience/follow-ups` (`apps/admin/src/router.ts:69`). The page itself writes nothing an admin needs to see.

## AI_USAGE

None. No AiJob is created or read here; the notification body text is either a static template (`follow-up-worker.service.ts:67-73`) or a static peer string (`store.service.ts:4042-4089`). There is no `generationStatus` on this page.

## PRIVACY

- `allowFutureSelfNotifications` (default `false`, `prisma/schema.prisma:223`) gates `FUTURE_SELF` notifications only: the worker skips creating the row entirely when it is not `true` (`follow-up-worker.service.ts:32-34`). Every other notification type is created unconditionally, so this page shows cooldown, follow-up, peer and conversation-close notices regardless of privacy settings.
- No visibility rule or `privacyAllows` call guards the read or the read-marking.

## ERROR_STATES

One shared error path. `error` is set by `load()` (`NotificationCenter.vue:24`) and by `open()` (`NotificationCenter.vue:27`), and rendered as `<p v-if="error" role="alert">` which replaces the whole list (`NotificationCenter.vue:36`).

Two concrete problems with it:

1. A failed read-marking aborts navigation. The PATCH, the local status flip and the `router.push` all sit in one `try` block (`NotificationCenter.vue:27`); if the PATCH throws, the push on the same line never executes and the user is left on the list with an error.
2. Because `v-if="error"` precedes the list, a transient error from a single tap hides the entire inbox until a reload.

## EMPTY_STATES

Yes: `<p v-if="!visibleNotices.length">这里暂时没有需要你回应的提醒。</p>` (`NotificationCenter.vue:37`). Note it is scoped to `visibleNotices`, so it also covers "you have notifications but none are unread while the 未读 tab is selected", which reads slightly oddly for that case but is not wrong.

## NATIVE_RISKS

- Safe area: the page is in `tabbarPaths` so the fixed tab bar renders; the page's own bottom padding is `132px` plus the shared `.goodnight-page` `calc(130px + env(safe-area-inset-bottom))` (`apps/mp/src/styles.scss:4147`). Clears the bar.
- Back button: no custom handling; Android BACK walks WebView history (`apps/mp/src/native/back-button.ts:26-33`). Because notifications are reached from TonightHome or ActionCenter, BACK returns there.
- No keyboard, no dial intent, no clipboard. The illustrations are local PNG imports so there is no network image dependency.

## ISSUES

- P1 NAVIGATION: the producers' `targetRoute` query parameters are ignored by every destination. `FOLLOW_UP` lands on `/pages/action/index?section=follow-up` but no mp file reads `route.query.section` (exhaustive search of `apps/mp/src` for `section`/`query.section` finds only HTML `<section>` tags), so the follow-up notification opens the generic ActionCenter with no follow-up context. The same applies to `?section=vault`, `?section=handoff`, `?section=barrier&actionId=` from `store.service.ts:2836-2846` and `3443-3446`, to `?id=` on `/pages/decision/index` (`DecisionVault.vue` has no `useRoute` import), and to `?journeyId=` on `/pages/future-self/index` (`FutureSelf.vue` has no `useRoute` import). Each notification type does reach the right *page*, but never the right *state* on that page.
- P1 STATE_MACHINE: a failed read-marking PATCH blocks navigation because the push shares the same `try` (`NotificationCenter.vue:27`).
- P2 FUNCTIONAL: `JOURNEY_CHECKIN` is a declared notification type with no producer in `apps/api`; if such a row ever existed, `illustration()` and `noticeIcon()` fall back to the follow-up art and a generic bell (`NotificationCenter.vue:18-19`), which is acceptable, but the type is dead.
- P2 UX: `CONVERSATION_CLOSED` has no illustration or icon mapping either (`NotificationCenter.vue:18-19`) and silently reuses the follow-up artwork.
- P3 FUNCTIONAL: `status: 'dismissed'` is in the `Notice` type and in the shared `NotificationStatus` union (`packages/shared-types/src/goodnight-2.ts:92`) but there is no dismiss control and the 全部 tab does not filter it, so a dismissed row would keep appearing as a normal card.
- P3 UX: the local unread recomputation (`NotificationCenter.vue:35`) duplicates the server's `unreadCount` (`controllers.ts:679`) and they can disagree after a partial failure.

## FINAL_STATUS

DONE - the read path, the single write, all six live notification producers and their target routes are traced, and the route renders on the Android APK with 4 real notification cards and 0 console errors.

### Static evidence

- Controls discovered: 7
- API reads (static): `/api/v1/notifications`
- API writes (static): `PATCH /api/v1/notifications/:param/read`
- Candidate fake markers: 0
- Appended: the four runtime cards in `artifacts/post-recovery/control-coverage.json` are one `FOLLOW_UP` and three `FUTURE_SELF` notices, all with ids of the form `notification_<followUpJobId>` (`follow-up-worker.service.ts:29`), which is why the ids read `follow_up_*` even for future-self rows.
- Appended: the `section` query parameter is written by the backend in three places (`store.service.ts:2836`, `:2841`, `:3445`) and read by none.

