# MoodCreate

Source: `apps/mp/src/views/MoodCreate.vue`

Routes: `/pages/mood/create`, `/pages/post/create`

## PURPOSE

MoodCreate is the single composer for a new Mood. It captures the text, the emotion, a visibility choice (private diary vs anonymous public post) and an AI reply style, attaches up to two images, and posts everything to `POST /api/v1/moods`. The visibility branch is what decides whether the record becomes a private Diary with an AI letter, or a public Post with AI replies.

## USER_JOB

"I want to get what is on my mind out of my head, choose whether it stays private, and press publish."

## ENTRY

- DiaryList 写新日记 CTA `btn-new-diary` -> `router.push('/pages/mood/create')` (`apps/mp/src/views/DiaryList.vue:149`).
- LetterList empty-state 写下心情 -> `router.push('/pages/mood/create')` (`apps/mp/src/views/LetterList.vue:109`).
- Square FAB `btn-write-mood` -> `/pages/post/create` (`apps/mp/src/views/Square.vue:211`).
- Square empty state `btn-empty-write-mood` -> `/pages/post/create` (`Square.vue:144`).
- Both paths mount the same component (`apps/mp/src/router.ts:73-74`).

## EXIT

`submit()` (`MoodCreate.vue:118-133`):
- public branch, server returns `res.post` -> `/pages/post/detail?id=<res.post.id>` (`MoodCreate.vue:126`).
- private branch (no `res.post`) -> `/pages/diary/index` (`MoodCreate.vue:127`).

`safeBack()` (`MoodCreate.vue:45-48`) goes to `router.back()` when `window.history.state?.back` exists, otherwise `/pages/square/index`.

## ROUTES

`/pages/mood/create` and `/pages/post/create` both mount `MoodCreate` (`apps/mp/src/router.ts:73-74`; `mp-routes.json` aliasGroup of size 2, `legacyOrCurrent: ALIAS`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| submitting (button text "正在发布…", disabled) | `submitting` | `MoodCreate.vue:67`, `:119`, `:208` |
| validation/API error line | `error` | `MoodCreate.vue:66`, `:207` |
| content + character counter | `form.content` / `countText` | `MoodCreate.vue:60`, `:147-148` |
| emotion selected | `form.emotion` | `MoodCreate.vue:55`, `:154` |
| visibility PRIVATE / PUBLIC | `form.visibility` | `MoodCreate.vue:56`, `:163-166` |
| reply style selected | `form.replyStyle` | `MoodCreate.vue:57`, `:179-186` |
| uploaded image list, per-asset "上传中" | `assets` / `asset.uploading` | `MoodCreate.vue:62`, `:196-199` |
| remaining add slots | `addSlots` | `MoodCreate.vue:70`, `:201` |

No loading state: the page never fetches on mount.

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| `front-mood-back` | `safeBack` (`MoodCreate.vue:45-48`) | history back, else square |
| `input-mood-content` textarea | `v-model` | free text, maxlength 1000 |
| `mood-emotion-nanguo/jiaolv/weiqu/shengqi/gudu/shimian` | `form.emotion = item.value` (`MoodCreate.vue:154`) | picks the emotion; only the first 6 of 7 are rendered (`emotions.slice(0, 6)`) |
| `mood-visibility-private` | `form.visibility = 'PRIVATE'` | private diary branch |
| `mood-visibility-public` | `form.visibility = 'PUBLIC'` | public post branch |
| `mood-style-warm/rational/light/poetic/clear` | `form.replyStyle = item.value` (`MoodCreate.vue:179-186`) | picks the AI style sent as `replyStyle`/`style`/`replyStyles` |
| `input-mood-images` (file) | `chooseImages` (`MoodCreate.vue:79-103`) | validates type/size, uploads via `uploadMedia(file,'mood')` |
| `btn-add-image` / `btn-add-image-secondary` | `openFilePicker` (`MoodCreate.vue:50-57`) | errors past 2 images, else opens the picker |
| `mood-image-preview` delete button | `removeImage(asset)` (`MoodCreate.vue:105-111`) | `deleteMedia(asset.id)` for uploaded assets, revokes the blob |
| `btn-submit-mood` | `submit` (`MoodCreate.vue:118-133`) | validates, `POST /api/v1/moods`, routes |

Cross-check: `control-manifest.json` lists 23 controls; `android-route-manifest.json` shows 17 buttons + 1 input + 1 textarea (19 visible) and 20 test ids, 0 console errors.

## API_READS

None. The view issues no `api.get`. (Matches `mp-routes.json` static evidence: reads "(none)".)

## API_WRITES

- `POST /api/v1/moods` (`MoodCreate.vue:120-131`) with `{content, emotion, visibility, replyStyle, style, replyStyles:[replyStyle], assetIds}`. Handler `PublicController.mood` (`apps/api/src/controllers.ts:887-909`) -> `store.createMood` (`apps/api/src/store.service.ts:4869-5015`).
  - Public branch writes **Mood** (`store.service.ts:4889-4901`) + **Post** (`store.service.ts:4904-4921`, `reviewStatus: 'pending_review'`) and queues `post_reply` AiJobs (`store.service.ts:4935-4946`).
  - Private branch writes **Mood** + **Diary** (`store.service.ts:4977-4988`) and queues a `today_letter` job via `queueLetterGeneration` (`store.service.ts:4989-4994`).
- `POST /api/v1/media/upload` (`apps/mp/src/api.ts:17-24`) for each chosen image; `DELETE /api/v1/media/:id` (`api.ts:26-32`) on removal. Handler `controllers.ts:1713-1727`. Models: **MediaAsset**, and on publish **MoodAttachment** / **DiaryAttachment**.

## DB_ENTITIES

- Writes: **Mood**, **Post** (public) or **Diary** (private), **MediaAsset**, and through `createMood`'s attachment linking, **MoodAttachment**/**DiaryAttachment**.
- Reads: **MediaAsset** (ownership check in `mediaByIds` at `store.service.ts:4883-4886`).
- The public branch also produces **AIJob** rows and, on completion, **Reply** rows.
- Cross-checked against `artifacts/product-audit/db-models.json`.

## ADMIN_VISIBILITY

Only the public branch is admin-visible: resource **posts** -> `/posts` (`apps/admin/src/router.ts:38`) -> `GET /api/admin/v1/posts` (`controllers.ts:2167`). A new public post lands at `reviewStatus: 'pending_review'` and must be approved there before Square shows it. The private branch writes a **Diary**, which has no admin resource (there is no diary entry in `menuGroups`); it is user-private by design. Uploaded media is admin-visible only as a **MediaAsset** attachment of a post.

## AI_USAGE

Yes, indirectly. `createMood` queues AiJobs, but this page never polls them and never reads `generationStatus`.

- Public branch: one `post_reply` job per requested style (`store.service.ts:4935-4946`), `taskType` normalizes to `post_reply` (`store.service.ts:5701`), default style `warm` (`store.service.ts:5750-5769`).
- Private branch: one `today_letter` job (`queueLetterGeneration`, `store.service.ts:5013-5064`), style from `input.style` or `warm`.

On AI failure the backend still writes a row with `status: 'fallback'` and a `provider_safe_template` result (`store.service.ts:5508-5534`), and both branches accept `succeeded` and `fallback` alike when folding results back (`store.service.ts:4955`, `:5010`). The page does not distinguish them, so with the DAPI 402 blocker every reply/letter is safe-template text presented as a normal AI result - ISSUE-007 (P1 AI).

## PRIVACY

- The page offers PRIVATE/PUBLIC but does **not** consult `PrivacySetting.defaultVisibility` (`prisma/schema.prisma:211`); `createMood` does not read it either, so the "默认公开范围" setting is decorative for this path.
- `allowAnonymousPublic` (`prisma/schema.prisma:212`) is not consulted by `createMood`, so a user who disabled anonymous public posting can still publish publicly from here.
- `createMood` does call `assertCanWrite` (`store.service.ts:4880` -> `:2394-2399`), which blocks `limited`/`banned` accounts with 403.
- Image ownership is enforced: assets must belong to the current user (`store.service.ts:4884-4886`).

## ERROR_STATES

Yes, one shared inline error line rendered by `<p v-if="error" class="error-text">` (`MoodCreate.vue:207`). Sources:
- `validate()` (`MoodCreate.vue:113-117`): empty content, >1000 chars, missing emotion, still-uploading image.
- `chooseImages` (`MoodCreate.vue:82-101`): "最多添加 2 张图片", "仅支持 JPEG、PNG 或 WebP 图片", "单张图片不能超过 5MB", upload failure.
- `removeImage` (`MoodCreate.vue:107`): delete failure.
- `submit` catch (`MoodCreate.vue:131`): server message or "发布失败，请稍后再试".

The error is a single line, so a later error overwrites an earlier one, and it is never cleared on retry of the same field.

## EMPTY_STATES

Not applicable - the page is a form. The only "empty" affordance is `addSlots` rendering the add-image buttons (`MoodCreate.vue:201`), which disappears once two images are present.

## NATIVE_RISKS

- Safe area: inherits `.goodnight-page` (`styles.scss:4147`); the submit bar is a normal in-flow element, no fixed overlap.
- Keyboard: the textarea and the image picker both open the soft keyboard. The submit bar sits after the media panel in normal flow (`MoodCreate.vue:208`), so a raised keyboard can push it off-screen; there is no `scrollIntoView` or viewport-height handling. UNCONFIRMED at runtime.
- Back button: no custom handling; Android BACK walks WebView history (`native/back-button.ts:26-33`). Because `safeBack` falls back to Square, an app opened directly on this route with no history pushes Square.
- No dial intent.

## ISSUES

- P2 PRIVACY: `defaultVisibility` and `allowAnonymousPublic` are user-facing privacy settings (`apps/mp/src/views/PrivacySettings.vue:190-222`) that this write path ignores. Turning them off has no effect on a Mood published from here.
- P2 DATA: the visibility card copy claims "审核后可获得 AI 与真人回应" (`MoodCreate.vue:166-168`), but `createMood` sets `reviewStatus: 'pending_review'` (`store.service.ts:4912`), so no AI reply exists until an admin approves, and Square will not show the post. The promise is stated before review, not after.
- P2 UX: the emotion grid renders only 6 of the 7 declared emotions (`MoodCreate.vue:154` uses `emotions.slice(0, 6)`), so 工作 (`mood-emotion-gongzuo`) is declared at `MoodCreate.vue:21` and never selectable. The 5th slot's CSS image is wired to `tool-baby-letter-cutout.png` (`MoodCreate.vue:283`), which does not correspond to 孤独.
- P3 FUNCTIONAL: the page sends `replyStyle`, `style` and `replyStyles` with the same value (`MoodCreate.vue:126-128`). The controller honours `style ?? replyStyle` and `replyStyles ?? [replyStyle]` (`controllers.ts:899-905`), so the redundancy is harmless but the comment at `MoodCreate.vue:122-124` admits it is a compatibility shim.
- P3 UX: `error` is a single string with no field association (`MoodCreate.vue:207`), so a validation message can appear far from the field it refers to.
- P3 NATIVE: no keyboard-avoidance for the bottom submit bar (see NATIVE_RISKS).

## FINAL_STATUS

PARTIAL - the full write path (both branches), the media flow and all states are traced from source, and the route renders on the real Android APK with 0 console errors; the private/public round trip could not be verified at runtime because the AI jobs it queues all end as `fallback` under the DAPI 402 blocker.

Group recommendation: **KEEP**. This is the only composer in the product and it is the sole entry to both the legacy treehole (public) and the private diary/letter path. It complements the newer Journey system (TonightHome captures a situation, not a mood) rather than duplicating it. The privacy-settings gap is a fix, not a reason to merge or deprecate.

### Static evidence

- Controls discovered: 23
- API reads (static): (none)
- API writes (static): `POST /api/v1/moods`
- Candidate fake markers: 7
- Adjudication: all 7 are NOT_FAKE. Six are the `placeholder` attribute on the textarea and the optimistic-upload object at `MoodCreate.vue:78-87` (replaced by the real `uploadMedia` response at `:83-85`, removed on failure at `:87`), and one is the textarea `placeholder` at `:147`. See `docs/product-audit/discovery-agent5-fake-candidates.md` M13.
- Appended: `mood-emotion-gongzuo` is declared at `MoodCreate.vue:21` but excluded by `emotions.slice(0, 6)` at `:154`.

