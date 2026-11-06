# PostDetail

Source: `apps/mp/src/views/PostDetail.vue`

Routes: `/pages/post/detail`

## PURPOSE

PostDetail is the single-post view of the public treehole. It renders one Post, its published replies and a hug strip, and hosts the reply composer sheet (quick presets, anonymity toggle, visibility select) plus the report/block more-menu. It is the only place a user can write a human reply to someone else's public post.

## USER_JOB

"I want to read this person's post, send them a warm reply or a hug, and if it is upsetting, report or block it."

## ENTRY

- Square card `openPost` -> `/pages/post/detail?id=<id>` (`apps/mp/src/views/Square.vue:62`).
- Square reply button `replyPost` -> `/pages/post/detail?id=<id>&sheet=reply` (`Square.vue:73`).
- MoodCreate after a public publish -> `/pages/post/detail?id=<res.post.id>` (`apps/mp/src/views/MoodCreate.vue:126`).
- Archive public-post tab -> `/pages/post/detail?id=<item.id>` (`apps/mp/src/views/Archive.vue:103`).
- FavoriteList post card -> `/pages/post/detail?id=<targetId>` (`apps/mp/src/views/FavoriteList.vue:34`).
- API-supplied: `createMood` returns `next: '/pages/post/detail'` (`apps/api/src/store.service.ts:4973`).

## EXIT

- `blockPost()` -> `router.replace('/pages/square/index')` (`PostDetail.vue:124`).
- `safeBack()` -> `router.back()` when history exists, else `/pages/square/index` (`PostDetail.vue:55-58`).
- No other forward navigation; the reply sheet self-replaces the query (`PostDetail.vue:90`, `:97`).

## ROUTES

`/pages/post/detail` (`apps/mp/src/router.ts:75`; `mp-routes.json` `aliasCount: 1`, CURRENT). Single route.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| post not yet loaded (whole page hidden) | `post` undefined, `v-if="post"` | `PostDetail.vue:11`, `:178` |
| human replies allowed / closed | `allowHumanReplies` | `PostDetail.vue:30`, `:60-71`, `:201`, `:258` |
| reply sheet open | `showSheet` | `PostDetail.vue:23`, `:265` |
| more-menu open | `showMore` | `PostDetail.vue:24`, `:312` |
| reply draft | `replyContent` | `PostDetail.vue:25`, `:275` |
| anonymous reply toggle | `anonymous` | `PostDetail.vue:26`, `:297` |
| reply visibility select | `replyVisibility` | `PostDetail.vue:27`, `:301` |
| floating status (submit/menu notices) | `submittedNotice` / `posterStatus` | `PostDetail.vue:28-29`, `:262-263` |
| reply list (max 5 rendered) | `replies.slice(0, 5)` | `PostDetail.vue:14`, `:222` |
| favorited state | `post.favoritedByCurrentUser` | `PostDetail.vue:260` |

There is no loading spinner and no error state: while `load()` runs, `post` is undefined so the entire `<section v-if="post">` is absent, and if `load()` rejects the page stays blank forever.

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| `front-post-back` | `safeBack` (`PostDetail.vue:55-58`) | history back, else square |
| `btn-open-more` ("...") | `showMore = true` | opens the more-menu sheet |
| `detail-reply-count` | `openReplySheet()` (`PostDetail.vue:82-91`) | opens the reply sheet; disabled when `!allowHumanReplies` |
| `detail-style-warm/rational/light/clear/poetic` | `openReplySheet(item.label)` | opens the sheet pre-seeded with the style label as the draft |
| `btn-hug` | `hug` (`PostDetail.vue:100-102`) | `POST /api/v1/posts/:id/hug`, replaces `post` |
| `btn-open-reply` | `openReplySheet()` | same as above |
| `reply-like-first` / un-labelled like on later replies | `likeReply(reply)` (`PostDetail.vue:132-136`) | `POST /api/v1/replies/:id/like`, replaces that row |
| `quick-hug-0..4` | `openReplySheet(item)` | seeds the draft with the quick-hug text |
| `reply-entry` | `openReplySheet()` | dock composer entry |
| `btn-hug-dock` | `hug` | dock hug |
| `btn-favorite` | `favorite` (`PostDetail.vue:104-107`) | `POST /api/v1/posts/:id/favorite`, sets `posterStatus='已收藏'` |
| `input-reply-content` | `v-model` | reply draft, maxlength 1000 |
| `reply-preset-0..4` | `usePreset(index)` (`PostDetail.vue:127-130`) | copies the preset text into the draft |
| `toggle-reply-anonymous` | `v-model` | checkbox bound to `anonymous` |
| `select-reply-visibility` | `v-model` | PUBLIC / PRIVATE select |
| `btn-close-reply` | `closeReplySheet` (`PostDetail.vue:93-98`) | closes the sheet and strips `sheet` from the query |
| `btn-submit-reply` | `submitReply` (`PostDetail.vue:138-157`) | validates, `POST /api/v1/posts/:id/replies`, closes sheet, reloads |
| `detail-menu-copy` | `copyPost` (`PostDetail.vue:115-119`) | copies `post.content` |
| `detail-menu-report` | `reportPost` (`PostDetail.vue:109-113`) | `POST /api/v1/posts/:id/report` |
| `detail-menu-block` | `blockPost` (`PostDetail.vue:121-125`) | `POST /api/v1/posts/:id/hide`, then replace to square |
| `detail-menu-cancel` | `showMore = false` | closes the menu |

Cross-check: `control-manifest.json` lists 43 controls for this view; `android-route-manifest.json` shows 20 buttons visible, 19 test ids, 0 console errors.

## API_READS

- `GET /api/v1/config` (`PostDetail.vue:63`) -> `controllers.ts:197-203` -> `store.systemSettings`. Read only for `allowHumanRepliesDefault`; the catch at `PostDetail.vue:66-68` defaults to `true`.
- `GET /api/v1/posts/:id` (`PostDetail.vue:69`) -> `controllers.ts:794-797` -> `store.getPost(id, true)` (`store.service.ts:4860-4867`), which throws `NotFoundException('树洞不存在')` for a missing/inactive post and calls `decoratePost` to add `allowHumanReplies` and `favoritedByCurrentUser`.
- `GET /api/v1/posts/:id/replies` (`PostDetail.vue:71`) -> `controllers.ts:949-952` -> only `status === 'published'` replies.
- `GET /api/v1/reply-presets` (`PostDetail.vue:74`) -> `controllers.ts:954-971`, merged with the five `defaultPresets` and sliced to 5 (`PostDetail.vue:73-80`).

## API_WRITES

| endpoint | call site | controller | store method | Prisma model changed |
| --- | --- | --- | --- | --- |
| `POST /api/v1/posts/:id/hug` | `PostDetail.vue:101` | `controllers.ts:799-806` | none (inline `post.hugCount += 1`) | **Post.hugCount** |
| `POST /api/v1/posts/:id/favorite` | `PostDetail.vue:105` | `controllers.ts:822-828` | `store.addFavorite` (`store.service.ts:1431-1448`) | **Favorite** (+ Post.favoriteCount) |
| `POST /api/v1/posts/:id/report` | `PostDetail.vue:110` | `controllers.ts:838-845` | none (inline `post.reportCount += 1`) | **Post.reportCount** |
| `POST /api/v1/posts/:id/hide` | `PostDetail.vue:122` | `controllers.ts:847-850` | `store.hidePostForCurrentUser` (`store.service.ts:4841-4850`) | **HiddenPost** |
| `POST /api/v1/posts/:id/replies` | `PostDetail.vue:145-150` | `controllers.ts:973-978` | `store.createReply` (`store.service.ts:6078-6105`) | **Reply** (+ Post.replyCount) |
| `POST /api/v1/replies/:id/like` | `PostDetail.vue:133` | `controllers.ts:980-983` | `store.likeReply` (`store.service.ts:4852-4858`) | **Reply.likeCount** |

Note: `createReply` sets `status: 'pending_review'` (`store.service.ts:6100`) but immediately recomputes `post.replyCount` from `status === 'published'` (`store.service.ts:6106`), so a freshly submitted reply does not appear in the reply list or the count until an admin approves it - the UI's "已提交，等待审核" notice (`PostDetail.vue:154`) is accurate.

## DB_ENTITIES

- Reads: **Post**, **Reply**, **Favorite** (through `decoratePost` -> `isFavorite`), **SystemSetting** (via `/config`), **ReplyPreset**, **MediaAsset** (attachments).
- Writes: **Post** (`hugCount`, `reportCount`, `replyCount`), **Favorite**, **HiddenPost**, **Reply** (`likeCount`, new rows).
- `HugAction` is declared (`prisma/schema.prisma:942-952`) but never written; hugs are unbounded (same finding as Square).
- Cross-checked against `artifacts/product-audit/db-models.json`.

## ADMIN_VISIBILITY

Yes, both halves. Posts -> **posts** resource, admin route `/posts` (`apps/admin/src/router.ts:38`) -> `GET /api/admin/v1/posts` (`TablePage.vue:44`). Replies -> **replies** resource, admin route `/replies/moderation` (`apps/admin/src/router.ts:39`) -> `GET /api/admin/v1/replies` (`TablePage.vue:45`). Every human reply written here lands in the moderation queue at `pending_review`, and every report increments `Post.reportCount`, which the posts page surfaces.

## AI_USAGE

No AiJob is created by this page. It reads AI-authored replies that were produced elsewhere: the `post_reply` jobs from `createMood` (`store.service.ts:4935-4946`) and the seed coverage (`store.service.ts:2296-2330`). The reply card headline is derived client-side from the style/index (`PostDetail.vue:226`), not from any AI field.

AI failure handling: none on this page. Under the DAPI 402 blocker every `post_reply` job ends `status: 'fallback'` with `providerId: provider_safe_template` (`store.service.ts:5508-5534`), but the fallback reply rows are written with `status: 'published'` and identical shape (`store.service.ts:4950-4962`), so the user sees safe-template text with no degradation signal - ISSUE-007 (P1 AI).

## PRIVACY

- `allowHumanReplies` is the gate. It is resolved twice: first from `SystemSetting.allowHumanRepliesDefault` via `/config` (`PostDetail.vue:63-68`), then overridden by the per-post value `post.allowHumanReplies` (`PostDetail.vue:70`). The server computes that field in `decoratePost` (`store.service.ts:1863-1877`) from `post.visibility === 'PUBLIC' && reviewStatus === 'published' && ownerPrivacy.allowHumanReplies !== false && systemAllowsHumanReplies`.
- When it is false, the reply entry points are `disabled` and `openReplySheet` sets "管理员已暂时关闭真人回应" (`PostDetail.vue:83-86`); `submitReply` re-checks the same flag before posting (`PostDetail.vue:139-143`) and the server enforces it a third time in `createReply` with a 403 (`store.service.ts:6082-6089`).
- The reply composer offers PUBLIC / PRIVATE visibility, but the value is passed as `visibility` and `createReply` ignores it entirely: the stored `ReplyItem` has no visibility field (`store.service.ts:6093-6104`, `prisma/schema.prisma:291-310`). Selecting 仅作者可见 has no effect.
- No `PrivacySetting` flag gates the read of a public post; visibility is the Post's own `PUBLIC` column.

## ERROR_STATES

None. `load()` (`PostDetail.vue:60-71`) has no `try/catch` outside the config call, so a 404 from `GET /api/v1/posts/:id` (raised as `NotFoundException('树洞不存在')` at `store.service.ts:4865`) rejects and the page renders nothing - the `v-if="post"` section never mounts and there is no fallback. `hug`, `favorite`, `reportPost`, `copyPost`, `likeReply` and `submitReply` also have no `catch`, so a failed write is silent. This is a finding.

## EMPTY_STATES

Partial. There is no empty state for the replies list: when `replies` is empty the "♧ 温柔回应" heading still renders with nothing under it (`PostDetail.vue:221-239`). The hug strip always renders five static quick-hug buttons regardless of data (`PostDetail.vue:241-255`). The only genuine empty behaviour is the whole-page blank when `post` is undefined.

## NATIVE_RISKS

- Safe area: the reply dock and sheets use the shared sheet styles; the page inherits `.goodnight-page` bottom padding (`styles.scss:4147`). No `env(safe-area-inset-bottom)` on the dock itself - UNCONFIRMED whether the fixed dock clears the Android gesture bar.
- Keyboard: the reply textarea is inside a bottom sheet (`PostDetail.vue:265-311`). There is no viewport-height or scroll handling for the raised keyboard, so the sheet's action row can be covered. UNCONFIRMED at runtime.
- Back button: the reply sheet is driven by the `sheet=reply` query and `router.replace` (`PostDetail.vue:90`, `:97`), so it does not add history entries. Android BACK therefore leaves the page rather than closing the open sheet - the sheet has no back-button handler. UNCONFIRMED at runtime.
- No dial intent; clipboard write only via `copyText`.

## ISSUES

- P1 DATA: the reply visibility select is inert. `submitReply` sends `visibility: replyVisibility.value` (`PostDetail.vue:149`) but `store.createReply` ignores the field (`store.service.ts:6078-6105`) and `Reply` has no visibility column (`prisma/schema.prisma:291-310`). A user who chooses 仅作者可见 gets a public reply.
- P2 FUNCTIONAL: no error state anywhere. A missing post (`store.service.ts:4865` throws) leaves the page completely blank, and every write handler is silent on failure (`PostDetail.vue:60-71`, `:100-136`, `:138-157`).
- P2 UX: no reply empty state - the section heading renders with zero rows (`PostDetail.vue:221-239`).
- P2 STATE_MACHINE: `openReplySheet` reads `allowHumanReplies` before `load()` may have finished on a deep link. `showSheet` initialises from `route.query.sheet === 'reply'` (`PostDetail.vue:23`) and `onMounted` calls `load()` first (`:169-173`), so the direct Square reply link is consistent; but the `watch` on `route.query.sheet` (`:160-167`) will open the sheet against whatever `allowHumanReplies` currently holds, and the server can still refuse with 403 if the post is not published.
- P3 UX: the reply cards show a hard-coded author label derived from style/index - `reply.style === 'rational' ? '理性分析' : index === 2 ? '轻松一下' : '暖心陪伴'` (`PostDetail.vue:225`) - which is a display guess, not the reply's actual author or style.
- P3 DATA: the post header shows a literal "2 小时前" (`PostDetail.vue:197`), not `post.createdAt`.
- P3 FUNCTIONAL: `HugAction` is never written, so hugs are unbounded here too (same as Square).
- P3 TEST_CONTRACT: only the first reply's like button carries `reply-like-first`; later replies have no test id (`PostDetail.vue:236-237`).

## FINAL_STATUS

PARTIAL - all six writes, four reads, the reply gating and the two sheets are traced from source, and the route renders on the real Android APK with 0 console errors; the reply sheet, keyboard and error branches could not be exercised at runtime (submitting a reply requires an approved published post, and the AI reply rows all come from fallback under the DAPI 402 blocker).

Group recommendation: **KEEP**. PostDetail is the only human-reply surface in the product and is the read side of the legacy treehole. It complements the newer Peer system (consent-gated, matched conversations) rather than duplicating it; the two never touch the same models. Fix the inert visibility select and add an error state.

### Static evidence

- Controls discovered: 43
- API reads (static): `/api/v1/config`, `/api/v1/posts/:param`, `/api/v1/posts/:param/replies`, `/api/v1/reply-presets`
- API writes (static): `POST /api/v1/posts/:param/favorite`, `POST /api/v1/posts/:param/hide`, `POST /api/v1/posts/:param/hug`, `POST /api/v1/posts/:param/replies`, `POST /api/v1/posts/:param/report`, `POST /api/v1/replies/:param/like`
- Candidate fake markers: 1
- Adjudication: NOT_FAKE - `placeholder` at `PostDetail.vue:278` is the reply textarea's placeholder attribute (`discovery-agent5-fake-candidates.md` M19).
- Appended: `store.createReply` (`store.service.ts:6078-6105`) never reads `input.visibility`; `Reply` has no visibility column (`prisma/schema.prisma:291-310`).

