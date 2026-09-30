# LetterList

Source: `apps/mp/src/views/LetterList.vue`

Routes: `/pages/letter/list`

## PURPOSE

LetterList is the archive of every 今日回信 the user has received. It lists them as cards with a style tag, a source label, an unread dot, and three per-card actions (like, favourite, open the full text), and it offers three filters - all, unread, favourited.

## USER_JOB

"Let me find a reply I got before - by recency, by whether I have read it, or by whether I saved it."

## ENTRY

- Me page archive entry 我的回信, `data-testid=entry-letter-list` -> `/pages/letter/list` (`apps/mp/src/views/Me.vue:80`). This is the only in-app control that reaches the route.
- No tab bar item and no `RouterLink` points here; the page is also reachable by typing the URL.

## EXIT

- `readFull(letter)` -> `/pages/letter/detail?id=<id>` (`LetterList.vue:36`), after a `PATCH /read`.
- ‹ 返回 `front-letter-list-back` -> `router.back()` (`LetterList.vue:56`).
- The empty-state button 写下心情 -> `/pages/mood/create` (`LetterList.vue:109`).
- The filter buttons and the like / favourite buttons stay on the page.

## ROUTES

`/pages/letter/list` (`apps/mp/src/router.ts:97`). One route, no aliases. It is listed in `tabbarPaths` (`apps/mp/src/App.vue:30`), so the bottom tab bar renders even though it is not a tab route.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| populated list | `letters` | `LetterList.vue:7`, `:31`, `:67` |
| active filter chip | `filter` (`'all' \| 'unread' \| 'favorited'`) | `LetterList.vue:8`, `:30`, `:61-63` |
| unread tag + dot | `letter.status === 'unread'` | `LetterList.vue:75`, `:77` |
| favourited label | `letter.favorite` | `LetterList.vue:93` |
| like count | `letter.likeCount` | `LetterList.vue:87` |
| empty card | `!letters.length` | `LetterList.vue:106` |

There is **no** `loading` ref and **no** `error` ref in this component.

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| ‹ 返回 `front-letter-list-back` | `router.back()` | WebView history back, no fallback |
| 全部 `filter-letter-all` | `load('all')` | `GET /api/v1/letters` with no query |
| 未读 `filter-letter-unread` | `load('unread')` | `GET /api/v1/letters?status=unread` |
| 已收藏 `filter-letter-fav` | `load('favorited')` | `GET /api/v1/letters?status=favorited` |
| card body `letter-card-first` / `letter-card-<id>` | none | a non-interactive article; the card is not clickable |
| ♡ n `btn-letter-like-first` / `btn-letter-like-<id>` | `likeLetter(letter)` | POSTs `/like`, then `Object.assign(letter, res.item)` in place |
| ☆ 收藏 / 已收藏 `btn-letter-list-fav` / `btn-letter-list-fav-<id>` | `favoriteLetter(letter)` | POSTs or DELETEs `/favorite`, then re-reads the whole list |
| 查看全文 › `btn-letter-read-full-first` / `btn-letter-read-full-<id>` | `readFull(letter)` | PATCHes `/read` then routes to the detail page |
| 写下心情 (empty card, no testid) | inline `router.push('/pages/mood/create')` | opens the mood composer |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 18 controls; `artifacts/post-recovery/control-coverage.json` records `/pages/letter/list` in state `default` with 11 visible controls and 12 testids: 返回 `changed`, the three filter chips `no observable change`, the first card `no observable change`, ♡ `no observable change`, ☆ 已收藏 `changed`, 查看全文 › `changed` (0 console errors, 0 failed requests).

## API_READS

- `GET /api/v1/letters` (`LetterList.vue:31`), with `?status=unread` or `?status=favorited` for the two filters. Handler `PublicController.letters` (`apps/api/src/controllers.ts:1055-1063`), which filters by `userId` (from `getDemoUserId()`), then by `status === 'unread'` or by `isFavorite(userId,'letter',id)`, and decorates each row with `favorite`.

## API_WRITES

- `PATCH /api/v1/letters/:id/read` with `{}` (`LetterList.vue:35`). Handler `controllers.ts:1071-1078`: sets **Letter**.`status = 'read'` and persists.
- `POST /api/v1/letters/:id/like` (`LetterList.vue:46`). Handler `controllers.ts:1080-1087`: increments **Letter**.`likeCount` by 1 and persists.
- `POST /api/v1/letters/:id/favorite` (`LetterList.vue:41`). Handler `controllers.ts:1186-1194` -> `store.addFavorite` (`store.service.ts:1431-1449`), which inserts a **Favorite** row and sets **Letter**.`favorite = true`.
- `DELETE /api/v1/letters/:id/favorite` (`LetterList.vue:40`). Handler `controllers.ts:1196-1204` -> `store.removeFavoriteByTarget` (`store.service.ts:1450-1458`).

## DB_ENTITIES

- Reads: **Letter**, **Favorite**.
- Writes: **Letter** (`status`, `likeCount`, `favorite`), **Favorite** (insert / delete).
- Cross-checked against `prisma/schema.prisma:312-333` (Letter), `:809-819` (Favorite).

## ADMIN_VISIBILITY

- Nothing on this page appears in admin. `apps/admin/src/router.ts` `menuGroups` has no letters resource; **replies** -> `/replies/moderation` (`apps/admin/src/router.ts:40`) governs public Square replies, not `Letter` rows.
- `Favorite` rows have no admin resource either.
- No notification, no AiJob, so nothing appears under **notifications** or **jobs**.

## AI_USAGE

None on this page - all four calls are plain CRUD. The letters being listed were generated elsewhere (LetterToday, MoodCreate), and their `AiJob` rows live under **jobs** -> `/ai/jobs` (`apps/admin/src/router.ts:50`).

## PRIVACY

- No `PrivacySetting` flag gates this page; none of the four endpoints calls `privacyAllows` (`controllers.ts:1055-1204`).
- Reads are scoped by `userId` (`controllers.ts:1058`), and the favourite writes are scoped by `item.userId === userId` (`:1189`, `:1199`), so one user cannot favourite another's letter.
- The `PATCH /read` and `POST /like` handlers are **not** user-scoped: they find the letter by id alone (`controllers.ts:1073`, `:1082`).
- Like the rest of the letter surface, the user is resolved through `getDemoUserId()` and the `x-goodnight-user-id` header is ignored (`controllers.ts:1057`, `:1188`, `:1198`).
- `sourceLabel` states 来自一则真实心情记录 when `sourceMoodId` is set and 来自晚安树洞 otherwise (`LetterList.vue:24-26`); it does not check whether the source mood is private.

## ERROR_STATES

There is **no error state at all**. `load`, `readFull`, `favoriteLetter` and `likeLetter` have no `try`/`catch` (`LetterList.vue:28-48`), and there is no `error` ref. A failed `GET /api/v1/letters` rejects into an unhandled promise, `letters` stays `[]`, and the page renders the 还没有符合条件的回信 empty card - so a network failure is presented to the user as "you have no letters". A failed `readFull` rejects before the `router.push`, so the 查看全文 button appears to do nothing. A failed favourite or like leaves the card showing its old state with no feedback.

This is a finding: the page has no way to distinguish failure from emptiness.

## EMPTY_STATES

- No letters matching the filter: 还没有符合条件的回信 / 写下一次心情后，新的回信会出现在这里。 with a 写下心情 button (`LetterList.vue:106-110`). The copy is shared by all three filters, so the 已收藏 filter says 写下一次心情 rather than suggesting the user save something.
- A failed request renders the same card (see ERROR_STATES).

## NATIVE_RISKS

- Safe area: the page pads via the shared `.goodnight-page` class and is in `tabbarPaths`, so the tab bar renders.
- No textarea or input, so no keyboard risk.
- Back button: the ‹ control calls `router.back()` with no history guard (`LetterList.vue:56`). Deep-linked from a notification or a cold start it has no destination and appears inert; `LetterToday.safeBack` (`LetterToday.vue:63-66`) shows the fallback pattern this view lacks.
- No sheet, no dialog, no dial intent, no clipboard.
- The card portrait and illustration are decorative `aria-hidden` spans (`LetterList.vue:72`, `:103`).

## ISSUES

- P1 DATA: the 未读 filter can only be cleared from this page. `PATCH /letters/:id/read` is issued only by `readFull` here (`LetterList.vue:35`). Opening the same letter from LetterDetail (`apps/mp/src/views/LetterDetail.vue:13`), Archive (`Archive.vue:107`) or FavoriteList (`FavoriteList.vue:35`) never marks it read, so a letter opened from any other surface stays 未读 forever and the filter becomes a list of letters the user has already read.
- P1 STATE_MACHINE: no error state. Every handler is unguarded (`LetterList.vue:28-48`) and a failed load is indistinguishable from an empty list, so a backend outage tells the user they have no letters.
- P2 FUNCTIONAL: `likeLetter` has no per-user dedup. `POST /letters/:id/like` unconditionally increments `likeCount` (`controllers.ts:1084`), and the button is not disabled after a press (`LetterList.vue:83-88`), so repeated taps inflate the count without bound.
- P2 DATA: `readFull` marks the letter read **before** navigating (`LetterList.vue:35-36`). Backing out of the detail page leaves the letter marked read, and a failed PATCH blocks the navigation entirely - the side effect and the navigation are not decoupled.
- P2 FUNCTIONAL: `likeLetter` assigns the raw response over the card (`LetterList.vue:47`, `Object.assign(letter, res.item)`), and `POST /like` returns the **undecorated** record (`controllers.ts:1086`, `{ item: letter }`), whereas every other read path returns `decorateLetter`. The `favorite` field on the card can therefore be overwritten with the stale column value.
- P2 UX: the empty card is filter-agnostic (`LetterList.vue:107-108`). Selecting 已收藏 on a user who has never favourited anything shows 写下一次心情后，新的回信会出现在这里。, which does not explain why the list is empty.
- P3 NAVIGATION: the card body is not clickable (`LetterList.vue:66-104`); only the small 查看全文 › button navigates. The runtime clicker recorded the whole card as `no observable change`.
- P3 DUPLICATE: three surfaces list the same letters - this page, Archive's 树洞回信 tab (`Archive.vue:241-250`) and FavoriteList's 回信 tab (`FavoriteList.vue:55`) - with three different card layouts and three different empty-state copies.
- P3 TEST_CONTRACT: the filter chips produce `no observable change` in the runtime walk because the seeded account has one letter, so the filters were recorded as verified without actually being proven to change the list.

## FINAL_STATUS

PARTIAL - the reads, the four writes and the two missing states are traced to concrete lines and the route rendered on the Android APK with 11 controls exercised, but the filters could not be shown to change the list and no failure path was exercised.

### Static evidence

- Controls discovered: 18
- API reads (static): `/api/v1/letters:param`
- API writes (static): `DELETE /api/v1/letters/:param/favorite`, `PATCH /api/v1/letters/:param/read`, `POST /api/v1/letters/:param/favorite`, `POST /api/v1/letters/:param/like`
- Candidate fake markers: 0
- Appended: `artifacts/recovery/android-route-manifest.json` shows `/pages/letter/list` rendered with 7 buttons / 12 testids and no console errors; the first card's text in `artifacts/post-recovery/control-coverage.json` is 轻松一点 09/29 05:25 来自一则真实心情记录 给今晚的你, i.e. the seeded letter.

