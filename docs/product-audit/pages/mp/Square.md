# Square

Source: `apps/mp/src/views/Square.vue`

Routes: `/pages/square/index`

## PURPOSE

Square (晚安树洞) is the anonymous public feed. It lists every approved public post, lets the reader filter by the five seeded emotions, and offers three lightweight social actions (抱抱 / 回应 / 更多). It is the read side of the same Mood object that MoodCreate writes and PostDetail acts on.

## USER_JOB

"I want to read what other people are carrying tonight, comfort someone with one tap, and write my own."

## ENTRY

- PostDetail 屏蔽 action -> `router.replace('/pages/square/index')` (`apps/mp/src/views/PostDetail.vue:124`).
- No-history fallback in three views: `LetterToday.vue:65`, `MoodCreate.vue:47`, `PostDetail.vue:57` all push `/pages/square/index` when `window.history.state?.back` is absent.
- The bottom tab bar does **not** link here. The four tabs are 今晚/同路/行动/我的 (`apps/mp/src/App.vue:77-110`); the 今晚 link carries `data-testid="tab-square"` but `to="/pages/tonight/index"` (`App.vue:78-79`), which is a misleading test id, not a route.
- `/pages/square/index` is in `tabbarPaths` (`App.vue:19`), so the bar renders, and `activeTab` falls through to `tonight` for this path (`App.vue:70`).

Net: the page is reachable in practice only through PostDetail's 屏蔽 action or one of the three no-history fallbacks. This is recorded as ISSUE-016 (P3 NAVIGATION) in `docs/product-audit/ISSUE_REGISTER.md:213-219`.

## EXIT

- `openPost(post)` -> `/pages/post/detail?id=<post.id>` (`Square.vue:62`).
- `replyPost(post)` -> `/pages/post/detail?id=<post.id>&sheet=reply` (`Square.vue:73`).
- `btn-write-mood` / `btn-empty-write-mood` -> `/pages/post/create` (`Square.vue:144`, `:211`).

## ROUTES

`/pages/square/index` (`apps/mp/src/router.ts:72`; `artifacts/product-audit/mp-routes.json`, `aliasCount: 1`, `legacyOrCurrent: CURRENT`). Single route, no aliases.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading ("正在轻轻翻找树洞...") | `loading` | `Square.vue:23`, `:48`, `:141` |
| populated feed | `posts` | `Square.vue:22`, `:51`, `:146-207` |
| empty ("还没有这类心情，写下第一条吧。") | `!loading && posts.length === 0` | `Square.vue:142-145` |
| active mood filter pill | `active` | `Square.vue:21`, `:56`, `:134` |
| more-actions sheet open | `menuPost` | `Square.vue:24`, `:218-226` |
| floating status toast | `statusText` | `Square.vue:25`, `:216` |

There is no error state: `load()` has no `try/catch` (`Square.vue:47-53`), so a rejected `api.get` leaves `loading` stuck at `true` and the page shows the loading line forever.

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| filter pills `filter-weiqu/jiaolv/shimian/lianai/gongzuo/all` | `selectFilter(item.key)` (`Square.vue:56-59`) | sets `active`, `router.replace`s the query, re-fetches `/api/v1/posts?mood=...` |
| post card `post-card-first` / `post-card-<id>` | `openPost(post)` (`Square.vue:61-63`) | pushes `/pages/post/detail?id=<id>` |
| `post-more-first` ("...") | `openMore(post)` (`Square.vue:76-78`) | sets `menuPost` to open the sheet; only rendered for `index === 0` |
| `btn-square-hug-first` / un-labelled hug on later cards | `hugPost(post)` (`Square.vue:65-69`) | `POST /api/v1/posts/:id/hug`, replaces that row with `res.item` |
| `btn-square-reply-first` / un-labelled reply on later cards | `replyPost(post)` (`Square.vue:71-74`) | fires a throwaway `GET /api/v1/reply-presets`, then pushes the detail with `&sheet=reply` |
| `square-menu-copy` | `copyPost()` (`Square.vue:86-90`) | copies `menuPost.content` via `copyText`, sets `statusText` |
| `square-menu-report` | `reportPost()` (`Square.vue:80-84`) | `POST /api/v1/posts/:id/report`, sets `statusText` |
| `square-menu-hide` ("不感兴趣") | `hidePost()` (`Square.vue:92-99`) | `POST /api/v1/posts/:id/hide`, then drops the row locally |
| `square-menu-cancel` / sheet mask | `menuPost = null` | closes the sheet |
| `btn-empty-write-mood` | inline push | `/pages/post/create` |
| `btn-write-mood` (FAB) | inline push | `/pages/post/create` |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 29 controls for this view; `artifacts/recovery/android-route-manifest.json` shows 18 buttons + 4 links + 4 tabs (22 visible) with 19 test ids and no console errors.

## API_READS

- `GET /api/v1/posts?mood=<key>` (`Square.vue:50`). Handler `PublicController.posts` (`apps/api/src/controllers.ts:186-190`) -> `store.publicPosts(mood)` (`apps/api/src/store.service.ts:4820-4839`), which filters `status === 'active' && reviewStatus === 'published'`, excludes the caller's `HiddenPost` rows, and matches emotion via `normalizeStoreEmotion`.
- `GET /api/v1/reply-presets` (`Square.vue:72`), result discarded (`artifacts/product-audit/discovery-agent5-fake-candidates.md` M24, P3).

## API_WRITES

- `POST /api/v1/posts/:id/hug` (`Square.vue:66`) -> `controllers.ts:799-806` -> mutates `post.hugCount` in memory then `persist()/flush()`. Store method: none named (inline in the controller). Model: **Post** (`hugCount`).
- `POST /api/v1/posts/:id/report` (`Square.vue:82`) -> `controllers.ts:838-845` -> `post.reportCount += 1`. Model: **Post** (`reportCount`).
- `POST /api/v1/posts/:id/hide` (`Square.vue:95`) -> `controllers.ts:847-850` -> `store.hidePostForCurrentUser` (`store.service.ts:4841-4850`), an `upsert` on `hiddenPost`. Model: **HiddenPost**.

No store.service.ts method is used for hug or report; both mutate the in-memory `PostItem` directly and rely on `persist()`. `HugAction` (`prisma/schema.prisma:942-952`) is declared with a unique `(userId, postId, presetCode)` but **no code writes it** - hugging is not deduplicated, so the same user can inflate `hugCount` without limit. UNCONFIRMED as intended.

## DB_ENTITIES

- Reads: **Post** (via `publicPosts`), **HiddenPost** (exclusion set), **MediaAsset** indirectly through `decoratePost` -> `mediaByIds`.
- Writes: **Post** (`hugCount`, `reportCount`), **HiddenPost** (upsert).
- Declared but unused by this page: **HugAction**.
- Cross-checked against `artifacts/product-audit/db-models.json`.

## ADMIN_VISIBILITY

Yes. The posts this page lists are exactly the admin resource **posts** -> admin route `/posts` (`apps/admin/src/router.ts:38`, label 树洞内容) -> `GET /api/admin/v1/posts` (`apps/admin/src/views/TablePage.vue:44`, `apps/api/src/controllers.ts:2167`). Moderation, visibility and risk live at `controllers.ts:2195-2295`. `reportCount` is the operator's signal that this page produced a report. The hug and hide actions themselves are not surfaced as an admin resource.

## AI_USAGE

No AiJob is created or read by this page. The AI replies the feed counts come from `createMood`'s `post_reply` jobs (`store.service.ts:4935-4946`) and from the seed coverage (`store.service.ts:2296-2330`); Square only renders the resulting `replyCount`. Because the feed filter requires `reviewStatus === 'published'`, and a freshly published public post starts at `pending_review` (`store.service.ts:4912`), a new post never appears here until an admin approves it.

## PRIVACY

- `allowAnonymousPublic` (`prisma/schema.prisma:212`) is exposed on the PrivacySettings screen (`apps/mp/src/views/PrivacySettings.vue:216-222`) but **no backend code reads it** (exhaustive search of `apps/api/src` finds it only in the seed defaults at `store.service.ts:724`, `:730` and the mapper). So a user who turns off anonymous-public posting still gets a public post when they pick 匿名发布到广场 in MoodCreate.
- `defaultVisibility` (`prisma/schema.prisma:211`) is likewise never applied to `createMood`; MoodCreate always sends an explicit `visibility`.
- The feed itself is global: there is no per-user visibility gate on the read, only `reviewStatus === 'published'` and the caller's own hidden set.

## ERROR_STATES

None. `load()` (`Square.vue:47-53`) has no `try/catch` and no error ref. A failed `GET /api/v1/posts` rejects the promise, `loading.value = false` on line 52 never runs, and the user sees "正在轻轻翻找树洞..." indefinitely. Likewise `hugPost`, `reportPost`, `hidePost` and `copyPost` have no `catch`: a rejected hug leaves the button unresponsive with no message. This is a finding.

## EMPTY_STATES

Yes: `<article v-if="!loading && posts.length === 0">` with "还没有这类心情，写下第一条吧。" and a 写心情 button (`Square.vue:142-145`). It correctly distinguishes "the filter matched nothing" from "the request is still loading".

## NATIVE_RISKS

- Safe area: the FAB is positioned at `bottom: calc(75px + env(safe-area-inset-bottom))` (`Square.vue:268-271`), and the page inherits `.goodnight-page` padding (`apps/mp/src/styles.scss:4147`). Clears the tab bar.
- Keyboard: no text input on the page, so no keyboard risk.
- Back button: `/pages/square/index` is often the bottom of the stack (it is a fallback destination), so Android BACK exits the app from here (`apps/mp/src/native/back-button.ts:26-33` uses `window.history.length > 1`).
- WebView history: `selectFilter` uses `router.replace` (`Square.vue:57`), so filter changes do not grow the history stack - good.
- No dial intent, no clipboard write outside `copyText`.

## ISSUES

- P2 FUNCTIONAL: `load()` has no error handling (`Square.vue:47-53`); an API failure leaves the page permanently in the loading state. The four action handlers (`hugPost`/`reportPost`/`hidePost`/`copyPost`) likewise swallow nothing and show no failure message.
- P2 UX: the timestamp is hard-coded. Every card renders "· 2 小时前" (`Square.vue:169`) regardless of `post.createdAt`; the API returns a real `createdAt` (`store.service.ts:761-773`). This is a displayed value that does not reflect the data.
- P2 DATA: `POST /api/v1/posts/:id/hug` (`controllers.ts:799-806`) increments `hugCount` with no per-user record. `HugAction` exists in the schema (`prisma/schema.prisma:942-952`) with a uniqueness constraint that would prevent double-hugging, but nothing writes it. Hug counts are unbounded and un-auditable.
- P2 PRIVACY: `allowAnonymousPublic` is a real toggle on PrivacySettings (`PrivacySettings.vue:216-222`) that no write path honours, so turning it off does not stop a public post.
- P3 FUNCTIONAL: `replyPost` fires `await api.get('/api/v1/reply-presets')` and discards the result (`Square.vue:72`); the destination PostDetail re-fetches presets itself. Dead request on every reply tap (also recorded as M24 in `discovery-agent5-fake-candidates.md`).
- P3 NAVIGATION: the 今晚 tab link carries `data-testid="tab-square"` while pointing at `/pages/tonight/index` (`App.vue:78-79`), so any test that clicks `tab-square` expecting Square lands on TonightHome. The Square page has no tab-bar entry at all (ISSUE-016).
- P3 TEST_CONTRACT: only the first card carries stable test ids (`post-more-first`, `btn-square-hug-first`, `btn-square-reply-first`); every later card's hug/reply buttons have no `data-testid` (`Square.vue:182-207`). This is why `control-coverage.json` counts 137 "no observable change" controls - the later cards' buttons cannot be addressed.

## FINAL_STATUS

PARTIAL - the read path, all four writes, the state machine and the DB entities are traced from source, and the route renders on the real Android APK with 0 console errors; runtime behaviour of the error and empty branches could not be exercised because the API is healthy and the seed coverage (`store.service.ts:2222-2310`) guarantees at least five published posts.

Group recommendation: **MERGE_CANDIDATE**. Square is the legacy public treehole surface; the newer system has no equivalent public feed (TonightHome is private journey capture, PeerNetwork is consent-gated experience sharing). It complements rather than duplicates the Journey/Peer/Self system, but it is unreachable from the tab bar and its privacy toggle is inert. Fold its reachability into the Me/tab surface and honour `allowAnonymousPublic` before promoting it. Do not delete.

### Static evidence

- Controls discovered: 29
- API reads (static): `/api/v1/posts:param`, `/api/v1/reply-presets`
- API writes (static): `POST /api/v1/posts/:param/hide`, `POST /api/v1/posts/:param/hug`, `POST /api/v1/posts/:param/report`
- Candidate fake markers: 0
- Appended: `HugAction` (`prisma/schema.prisma:942-952`) has no writer in `apps/api/src`; the hug endpoint mutates `hugCount` inline instead.
- Appended: the card timestamp "· 2 小时前" is a literal at `Square.vue:169`, not derived from `post.createdAt`.

