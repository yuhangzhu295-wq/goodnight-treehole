# LetterDetail

Source: `apps/mp/src/views/LetterDetail.vue`

Routes: `/pages/letter/detail`

## PURPOSE

LetterDetail renders one saved letter in full, with a favourite toggle and a link to today's letter. It is the read-only endpoint of the letter surface: no style tabs, no advice, no save-to-diary.

## USER_JOB

"I tapped a reply somewhere and I want to read the whole thing, then keep it or move on."

## ENTRY

- LetterList's 查看全文 › button, after the read receipt: `/pages/letter/detail?id=<id>` (`apps/mp/src/views/LetterList.vue:36`).
- Archive's 树洞回信 card and the diary 树洞回信 chip: `/pages/letter/detail?id=<id>` (`apps/mp/src/views/Archive.vue:107`, `:224`).
- DiaryList's letter action when the diary has a `letterId`: `/pages/letter/detail?id=<letterId>` (`apps/mp/src/views/DiaryList.vue:53`).
- FavoriteList's 回信 tab: `/pages/letter/detail?id=<targetId>` (`apps/mp/src/views/FavoriteList.vue:35`).
- Reachable with **no** `id` by typing the URL; `load` then falls back to the literal `letter_today` (`LetterDetail.vue:12`).

## EXIT

- ‹ 返回 `front-letter-detail-back` -> `router.back()` (`LetterDetail.vue:30`).
- 查看今日回信 `btn-letter-detail-save` -> `/pages/letter/today` (`LetterDetail.vue:42`).
- The favourite button stays on the page.

## ROUTES

`/pages/letter/detail` (`apps/mp/src/router.ts:98`). One route, no aliases. It is **not** in `tabbarPaths` (`apps/mp/src/App.vue:7-40`), so the bottom tab bar does not render - consistent with `artifacts/recovery/android-route-manifest.json`, which records `link:0, tab:0` for this route.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| letter loaded | `letter` | `LetterDetail.vue:8`, `:13`, `:28` |
| blank page (letter missing) | `letter` undefined | `LetterDetail.vue:28` (`v-if="letter"`) |
| favourite toggle label | `letter.favorite` | `LetterDetail.vue:41` |
| favourite toast | `message` | `LetterDetail.vue:9`, `:21`, `:44` |

There is **no** `loading` ref and **no** `error` ref.

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| ‹ 返回 `front-letter-detail-back` | `router.back()` | WebView history back, no fallback |
| 收藏回信 / 取消收藏 `btn-letter-detail-fav` | `favorite` | POSTs or DELETEs `/favorite`, re-reads, sets the toast |
| 查看今日回信 `btn-letter-detail-save` | inline `router.push('/pages/letter/today')` | navigates; despite the testid it saves nothing |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 7 controls; `artifacts/post-recovery/control-coverage.json` records `/pages/letter/detail` in state `default` with 3 visible controls and 3 testids, all `changed` (0 console errors, 0 failed requests).

## API_READS

- `GET /api/v1/letters/:id` (`LetterDetail.vue:13`). Handler `PublicController.letter` (`apps/api/src/controllers.ts:1065-1069`), which finds the letter by id alone and returns `decorateLetter(letter)` or `undefined`.

## API_WRITES

- `POST /api/v1/letters/:id/favorite` (`LetterDetail.vue:19`). Handler `controllers.ts:1186-1194` -> `store.addFavorite` (`store.service.ts:1431-1449`): inserts a **Favorite** row and sets **Letter**.`favorite = true`.
- `DELETE /api/v1/letters/:id/favorite` (`LetterDetail.vue:18`). Handler `controllers.ts:1196-1204` -> `store.removeFavoriteByTarget` (`store.service.ts:1450-1458`).

## DB_ENTITIES

- Reads: **Letter**, **Favorite** (via `decorateLetter`, `store.service.ts:1427-1429`).
- Writes: **Favorite** (insert / delete), **Letter** (`favorite`).
- Cross-checked against `prisma/schema.prisma:312-333`, `:809-819`.

## ADMIN_VISIBILITY

- Nothing on this page appears in admin: there is no letters resource in `apps/admin/src/router.ts` `menuGroups`, and `Favorite` has no admin resource.
- No notification and no AiJob is created here.

## AI_USAGE

None. Both calls are plain CRUD and neither queues a job.

## PRIVACY

- No `PrivacySetting` flag gates this page (`controllers.ts:1065-1204`).
- The read is **not** user-scoped: `controllers.ts:1067` finds the letter by id with no `userId` predicate, so any caller who knows or guesses a letter id can read another user's private letter. Compare the favourite handlers, which do filter by `item.userId === userId` (`:1189`, `:1199`).
- The default id is the literal `letter_today` (`LetterDetail.vue:12`), which is the id of the seeded demo letter (`store.service.ts:826`, `:842`), so an id-less visit silently reads the demo user's letter.
- The page does not mark the letter read, so it does not change the `unread` status the list filters on.
- The letter content is rendered as text (`LetterDetail.vue:37`), not as HTML, so there is no injection surface here.

## ERROR_STATES

There is **no error state**. `load` has no `try`/`catch` (`LetterDetail.vue:11-14`) and there is no `error` ref:

- a missing or unknown id makes the API return `{ item: undefined }` (`controllers.ts:1068`), so `letter` stays undefined and the `v-if="letter"` root renders **nothing at all** - a completely blank page with no header, no back control and no message.
- a network failure rejects into an unhandled promise and produces the same blank page.
- `favorite` is also unguarded (`LetterDetail.vue:16-22`): a failed write leaves the old label and no toast.

This is a finding: the page has no way to tell the user anything went wrong, and no way out except the Android back gesture (the in-page back button is inside the un-rendered block).

## EMPTY_STATES

None. There is no empty state, no "letter not found" copy and no retry. The only degraded rendering is the blank page described above.

## NATIVE_RISKS

- Safe area: the page uses the shared `.goodnight-page` / `.rest-page` classes; it is **not** in `tabbarPaths`, so there is no bottom tab bar and no extra bottom padding is needed.
- No textarea or input, so no keyboard risk.
- Back button: the in-page ‹ calls `router.back()` with no history guard (`LetterDetail.vue:30`), and on the blank-page path that control is not rendered at all - the user is left with only the OS back gesture. `LetterToday.safeBack` (`LetterToday.vue:63-66`) shows the pattern this view lacks.
- No sheet, no dialog, no dial intent, no clipboard.
- The floating toast (`LetterDetail.vue:44`) is positioned with the shared `.floating-status`; it is not anchored to the safe area, but it is transient.

## ISSUES

- P1 PRIVACY: `GET /api/v1/letters/:id` has no ownership check (`controllers.ts:1065-1069`). Unlike the favourite writes on the same page, which filter on `item.userId === userId`, the read returns any letter by id, so a private letter is readable across users by id. The page states nothing about visibility, but the letter itself is the private 今日回信.
- P1 STATE_MACHINE: a missing, unknown or unreachable letter renders a completely blank screen (`LetterDetail.vue:28`). There is no loading state, no error state, no "not found" copy and no in-page back control on that path, so the only escape is the OS back gesture.
- P2 FUNCTIONAL: `favorite` has no error handling (`LetterDetail.vue:16-22`). A failed POST/DELETE leaves the button label unchanged and no toast; because the label is derived from `letter.favorite` (`:41`) and the value is only refreshed by the reload inside the handler, the user cannot tell whether the tap registered.
- P2 DATA: the page never issues `PATCH /letters/:id/read`. Reaching a letter from Archive, DiaryList or FavoriteList leaves it `unread` forever, so the LetterList 未读 filter over-reports.
- P2 PRIVACY: with no `id` the view defaults to the literal `letter_today` (`LetterDetail.vue:12`), the seeded demo letter's id (`store.service.ts:826`), so a URL without a query silently exposes the demo user's letter instead of erroring.
- P2 UX: the page is a stripped copy of LetterToday's letter card (`LetterDetail.vue:34-39` vs `LetterToday.vue:196-203`) with no style tabs, no advice and no save-to-diary, so a user who wants any of those has to navigate away and find today's letter.
- P3 TEST_CONTRACT: the button labelled 查看今日回信 carries `data-testid="btn-letter-detail-save"` (`LetterDetail.vue:42`), which reads as "save" but only navigates; the testid misdescribes the control.
- P3 NAVIGATION: `router.back()` with no history guard (`LetterDetail.vue:30`); a deep link leaves the back button inert.

## FINAL_STATUS

PARTIAL - the read, the two favourite writes and the missing-state behaviour are traced to concrete lines and the route rendered on the Android APK with 3 controls exercised, but only the populated path was reachable at runtime and no failure path was exercised.

### Static evidence

- Controls discovered: 7
- API reads (static): `/api/v1/letters/:param`
- API writes (static): `DELETE /api/v1/letters/:param/favorite`, `POST /api/v1/letters/:param/favorite`
- Candidate fake markers: 0
- Appended: `artifacts/recovery/android-route-manifest.json` records `/pages/letter/detail` with `link:0, tab:0` (no bottom tab bar) and `firstLine: "‹ / 回信详情 / 给今晚的你"`, i.e. the runtime walk read the seeded letter through the `letter_today` default.

