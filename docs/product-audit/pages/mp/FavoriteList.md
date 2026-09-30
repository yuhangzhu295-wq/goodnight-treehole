# FavoriteList

Source: `apps/mp/src/views/FavoriteList.vue`

Routes: `/pages/favorite/index`, `/pages/favorite/list`

## PURPOSE

FavoriteList is the read-back surface for saved content. It shows the user's Favorite rows grouped by target type (letter / post / diary), lets them jump to the original, and lets them un-save. It is the only place favourites can be reviewed or removed in bulk.

## USER_JOB

"I want to find the things I saved to read again, open one, or clean up something I no longer want."

## ENTRY

- Me 我的收藏 entry `entry-favorite` -> `/pages/favorite/index` (`apps/mp/src/views/Me.vue:81`).
- Both route paths are in `tabbarPaths` (`apps/mp/src/App.vue:32-33`), so the bottom bar renders and `activeTab` resolves to `me` (`App.vue:59-66`).

No other control pushes this route; `/pages/favorite/list` is URL-only.

## EXIT

- `openItem(item)` (`FavoriteList.vue:33-37`): `post` -> `/pages/post/detail?id=<targetId>`; `letter` -> `/pages/letter/detail?id=<targetId>`; `diary` -> `/pages/diary/detail?id=<targetId>`.
- `front-favorite-back` -> `router.back()` (`FavoriteList.vue:50`).
- Removing an item re-fetches in place (`FavoriteList.vue:39-42`); it does not navigate.

## ROUTES

`/pages/favorite/index` and `/pages/favorite/list` both mount `FavoriteList` (`apps/mp/src/router.ts:100-101`; `mp-routes.json` aliasGroup of size 2, `legacyOrCurrent: ALIAS`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| active tab letter / post / diary | `filter` | `FavoriteList.vue:8`, `:55-57` |
| loading (only disables the remove buttons) | `loading` | `FavoriteList.vue:9`, `:24`, `:29`, `:78` |
| populated list | `items` | `FavoriteList.vue:7`, `:27`, `:60-83` |
| empty | `!items.length` | `FavoriteList.vue:85-88` |
| per-card source label | `sourceLabel(item)` on `targetType` | `FavoriteList.vue:11-15`, `:69` |
| per-card date (or "刚刚收藏" fallback) | `dateLabel(item.createdAt)` | `FavoriteList.vue:17-21`, `:72` |

There is no error state, and `loading` has no visual affordance: the page renders the empty card while loading because `items` starts as `[]` (`FavoriteList.vue:7`, `:85`).

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| `front-favorite-back` | `router.back()` (`FavoriteList.vue:50`) | history back |
| `filter-fav-letter` | `load('letter')` (`FavoriteList.vue:55`) | sets `filter`, re-fetches `?type=letter` |
| `filter-fav-post` | `load('post')` (`FavoriteList.vue:56`) | re-fetches `?type=post` |
| `filter-fav-diary` | `load('diary')` (`FavoriteList.vue:57`) | re-fetches `?type=diary` |
| `favorite-card-first` / `favorite-card-<id>` | `openItem(item)` (`FavoriteList.vue:66`) | routes by `targetType` |
| `btn-favorite-remove` / `btn-favorite-remove-<id>` | `removeFavorite(item)` (`FavoriteList.vue:79`) | `DELETE /api/v1/favorites/:id`, then reloads the tab |

Cross-check: `control-manifest.json` lists 15 controls; `android-route-manifest.json` shows 6 buttons + 4 links + 4 tabs (10 visible), 10 test ids, 0 console errors.

## API_READS

- `GET /api/v1/favorites?type=<letter|post|diary>` (`FavoriteList.vue:27`) -> `controllers.ts:1522-1550` -> reads `store.favorites` filtered by user and `targetType`, and for each row joins the target to synthesise `title`, `preview` and `emotion`:
  - `post` -> title "收藏的树洞", preview `post.content` (`controllers.ts:1536-1541`)
  - `letter` -> title `letter.title`, preview `letter.content` (`controllers.ts:1537-1538`)
  - `diary` -> title "收藏的日记", preview `diary.content` (`controllers.ts:1540-1541`)

## API_WRITES

- `DELETE /api/v1/favorites/:id` (`FavoriteList.vue:40`) -> `controllers.ts:1562-1567` -> `store.removeFavoriteById` (`apps/api/src/store.service.ts:1460-1466`), which removes the row and calls `applyFavoriteRemoval` to decrement the target's `favoriteCount` (or clear `Letter.favorite`). Model changed: **Favorite** (delete), plus **Post.favoriteCount** or **Letter.favorite** as a side effect.

## DB_ENTITIES

- Reads: **Favorite**, and the joined target - **Post**, **Letter**, **Diary**.
- Writes: **Favorite** (delete), **Post.favoriteCount**, **Letter.favorite**.
- Cross-checked against `artifacts/product-audit/db-models.json`.

## ADMIN_VISIBILITY

No. There is no favorites resource in `apps/admin/src/router.ts` `menuGroups` and no admin favorites endpoint in `artifacts/product-audit/api-endpoints.json`. A favourite is a private bookmark; the only admin-visible side effect is the `favoriteCount` it maintains on a **Post**, which the posts page shows.

## AI_USAGE

None. No AiJob is created or read; the page renders titles and previews that were authored elsewhere (including AI-written letters), but it does not poll `generationStatus` and has no fallback logic.

## PRIVACY

- The read and delete are both scoped to the caller: `controllers.ts:1523-1525` filters `item.userId === userId` and `removeFavoriteById(userId, favoriteId)` requires a matching user (`store.service.ts:1461`). A favourite id from another user deletes nothing and returns `{ok:true}`.
- No `PrivacySetting` flag gates this page. Note that a favourite of a **diary** exposes that diary's `content` as the card preview (`controllers.ts:1541`), which is consistent with the user's own private data but means the preview is rendered from the private diary body.

## ERROR_STATES

None. `load()` uses `try/finally` with no `catch` (`FavoriteList.vue:26-30`), and `removeFavorite` (`:39-42`) has no `catch` either. A failed list request leaves `items` empty and shows the "这里暂时空空的" empty card, and a failed delete leaves the card in place with no message and the button re-enabled. Neither is distinguishable from success. This is a finding.

## EMPTY_STATES

Yes: `<article v-if="!items.length">` with "这里暂时空空的 / 你收藏的回信、树洞和日记会按类型出现在这里。" (`FavoriteList.vue:85-88`). The copy is generic - it does not vary by the active tab, so an empty 日记 tab reads the same as an empty 回信 tab. The empty card also has no `data-testid`, so it is not addressable by the control harness.

## NATIVE_RISKS

- Safe area: inherits `.goodnight-page` padding (`styles.scss:4147`); no fixed elements compete with the gesture bar.
- Keyboard: no text input.
- Back button: `router.back()` only; Android BACK walks WebView history (`native/back-button.ts:26-33`). Reached from Me, so BACK returns to Me.
- No dial intent, no clipboard.

## ISSUES

- P2 FUNCTIONAL: no error state. A failed list fetch renders as an empty collection, and a failed un-favourite is silently ignored (`FavoriteList.vue:26-30`, `:39-42`).
- P2 STATE_MACHINE: `loading` is only wired to the remove buttons' `disabled` (`FavoriteList.vue:78`) and never renders a spinner; because `items` starts `[]` the empty card shows on the first frame of every visit, the same defect class as DiaryDetail.
- P3 DATA: the server-side `title` for a post favourite is the literal "收藏的树洞" and for a diary "收藏的日记" (`controllers.ts:1536-1541`), so every post card in the list has the identical heading; only the preview differs.
- P3 UX: the remove control is labelled "☆ 已收藏" (`FavoriteList.vue:81`), which describes the current state rather than the action. Tapping an "already saved" button removes the item, which is the opposite of what the label implies.
- P3 TEST_CONTRACT: the empty card carries no `data-testid` (`FavoriteList.vue:85`), so the empty state cannot be asserted by the harness.
- P3 ORPHAN: `/pages/favorite/list` is never pushed by any control (`discovery-agent1-page-graph.md` section 4); it is a redundant alias.

## FINAL_STATUS

PARTIAL - both the read and the single write, the three-way target join and all states are traced from source, and the route renders on the real Android APK with 0 console errors; the populated branch could not be exercised at runtime because no favourite rows were seeded for the demo user.

Group recommendation: **KEEP**. FavoriteList is the only cross-type saved-content surface; the newer Journey/Peer/Self system has no equivalent (Archive holds journey archives, MemoryCenter holds AI memory). It complements the newer system. Add an error state and fix the misleading remove label.

### Static evidence

- Controls discovered: 15
- API reads (static): `/api/v1/favorites`
- API writes (static): `DELETE /api/v1/favorites/:param`
- Candidate fake markers: 0
- Appended: the delete handler (`controllers.ts:1562-1567`) returns `{ok:true}` even when the id belongs to another user or does not exist, because `removeFavoriteById` returns `undefined` for a non-match (`store.service.ts:1461-1462`).
- Appended: the list synthesises `title`/`preview`/`emotion` on the server (`controllers.ts:1536-1544`); the view only renders them.

