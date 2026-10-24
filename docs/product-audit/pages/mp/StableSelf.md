# StableSelf

Source: `apps/mp/src/views/StableSelf.vue`

Routes: `/pages/stable-self/index`

## PURPOSE

StableSelf is the "清醒时候的我" reminder card. The user writes down, while they are well, what their own stable state looks like - a short self-description, the anchors that help when they are losing control, the people and things that matter, an optional daily outline (sleep, eating, focus, body, likes, recovery signs), and one sentence to bring themselves back to reality. It exists so that the recovery check-in can compare today against the user's own baseline instead of against an average.

## USER_JOB

"I know that when I am in a bad place I will not remember what normal feels like for me. Let me write it down now so future-me can be reminded."

## ENTRY

- Me, 清醒时候的我, `data-testid=entry-stable-self` -> `router.push('/pages/stable-self/index')` (`apps/mp/src/views/Me.vue:53`, rendered `:199-200`).

That is the only entry. A repo-wide search for `/pages/stable-self` returns the route (`apps/mp/src/router.ts:69`), the Me entry, and one `styles.scss` selector - nothing else. Note that the `Recovery` page, which consumes this card, does **not** link to it.

## EXIT

Back only: `router.back()` (`StableSelf.vue:140`). Saving stays on the page and shows a confirmation (`:123-128`). There is no forward control and the route is not in `tabbarPaths` (`apps/mp/src/App.vue:7-40`), so the tab bar is hidden and the back control is the only way out besides BACK.

## ROUTES

`/pages/stable-self/index` (`apps/mp/src/router.ts:69`). Single route, no aliases. Not a tab route; `activeTab` would classify it as 我的 (`App.vue:62-68`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading note | `loading` (starts `true`) | `StableSelf.vue:22`, `:145` |
| populated form (form replaces the loading note) | `!loading` | `StableSelf.vue:146` |
| error note | `error` | `StableSelf.vue:24`, `:264` |
| saved confirmation | `saved` | `StableSelf.vue:25`, `:265` |
| save in progress | `saving` | `StableSelf.vue:23`, `:266` |
| version stamp shown | `currentId` + `updatedAt` | `StableSelf.vue:26-27`, `:269` |
| existing profile hydrated | `result.item` from the GET | `StableSelf.vue:100-104` |
| inline add-field open for anchors | `editingKey === 'stabilityAnchors'` | `StableSelf.vue:29`, `:181` |
| inline add-field open for contacts | `editingKey === 'contactPeople'` | `StableSelf.vue:29`, `:216` |
| anchor selected / custom anchor chip | `profile.stabilityAnchors` | `StableSelf.vue:168-175` |
| contact selected / custom contact chip | `profile.contactPeople` + `contacts` | `StableSelf.vue:195-213` |
| daily-outline disclosure expanded | native `<details>` open state | `StableSelf.vue:227` |
| at least one field filled | `hasContent` | `StableSelf.vue:50-52` |

There is no explicit empty state for a first-time user: `load()` hydrates nothing when `result.item` is null (`StableSelf.vue:100-104`) and the form simply renders empty with the `anchors` preset chips available (`:46`).

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| ‹ 返回 | `router.back()` | history back |
| three anchor chips (先睡一觉 / 先联系朋友 / 先延迟10分钟) | `toggle('stabilityAnchors', item)` | adds or removes the anchor |
| × on a custom anchor chip | `toggle('stabilityAnchors', item)` | removes it |
| ＋ 补充 (anchors) | `editingKey = 'stabilityAnchors'` | reveals the input |
| 添加 (anchors) | `add('stabilityAnchors')` | trims, de-dupes, caps at 12 and 80 chars, clears `editingKey` |
| one chip per trusted contact | `toggle('contactPeople', contact.nickname)` | selects the contact's nickname |
| × on a custom contact chip | `toggle('contactPeople', item)` | removes it |
| ＋ 补充 (contacts) | `editingKey = 'contactPeople'` | reveals the input |
| 添加 (contacts) | `add('contactPeople')` | same normalisation |
| daily-outline text inputs (sleep / eating / focus / body) | `v-model` on `profile.*Pattern` / `profile.bodyState` | free text, 300 chars |
| 平时喜欢什么 / 哪些事情说明我正在恢复 | `add('usualLikes')` / `add('recoverySigns')` on Enter | adds a tag |
| saved tags (usualLikes, recoverySigns) | `toggle` | removes the tag |
| 保存这张提醒卡 (`stable-self-save`) | `save` (form submit) | `PUT /api/v1/me/stable-self` |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 13 entries; `artifacts/post-recovery/control-coverage.json` records 15 visible controls on the real APK, of which 3 changed state; the sweep's own note that 先睡一觉 produced "no observable change" matches `toggle` only mutating a chip's selected class. The save button was clicked and returned "changed".

## API_READS

Two GETs in one `Promise.all` (`StableSelf.vue:97-104`):

- `GET /api/v1/me/stable-self` -> `controllers.ts:650-653` -> `store.stableSelfProfile` (`store.service.ts:4640-4644`), gated by `privacyAllows(userId,'allowRecoveryData')`. Returns `null` when the user has never saved.
- `GET /api/v1/trusted-contacts` -> `controllers.ts:614-617` -> `store.trustedContactList` (`store.service.ts:4524-4526`), which filters by `userId` **and** `enabled`.

## API_WRITES

- `PUT /api/v1/me/stable-self` with `{ profile: {...} }` (`StableSelf.vue:123`). Handler `controllers.ts:655-661` -> `store.saveStableSelfProfile` (`store.service.ts:4646-4687`):
  - calls `privacyAllows(userId, 'allowRecoveryData')` (`:4648`) and throws `403` with 请先在隐私设置中允许保存稳定状态资料 when the flag is off;
  - normalises every field: text values trimmed and capped (500 for the two long textareas, 300 for the daily outline), lists mapped through `listValue` to 12 items of 80 chars each (`:4650-4672`);
  - rejects an all-empty payload with `400` 请至少写下一条属于你的稳定状态信息 (`:4673-4675`);
  - upserts by `userId` (`:4676-4686`).

Store method: `StoreService.saveStableSelfProfile`. Prisma model changed: **StableSelfProfile** (one row per user, `userId` is `@unique`).

## DB_ENTITIES

Reads: **StableSelfProfile**, **TrustedContact**.

Writes: **StableSelfProfile**.

Cross-checked against `prisma/schema.prisma:615-627` (TrustedContact) and `:661-670` (StableSelfProfile, `userId @unique`, `profile Json`, `@@index([updatedAt])`).

## ADMIN_VISIBILITY

**None.** `apps/admin/src/router.ts` menuGroups (`:31-89`) has no stable-self resource, and no admin handler in `apps/api/src/controllers.ts` references `stableSelfProfiles` (the only matches are the two public `me/stable-self` routes and the persistence mapper). The nearest admin surface, `/safety/support-plans` (`:78`), lists `PersonalSupportPlan`, a different model. This matches the content: the card is the user's own baseline and has no operator workflow.

## AI_USAGE

**No AiJob is created or read by this page.** `/api/v1/ai/tasks` does not appear in the file. The card is consumed by `Recovery.vue`, which renders `stableComparison` as a pure client-side string diff against the user's own `sleepPattern`, `eatingPattern` and `contactPeople` (`apps/mp/src/views/Recovery.vue:47-62`, populated at `:87-91`).

This satisfies the group-C requirement: the baseline is the user's own text only. There is **no** score, percentile, population norm, ranking or generated number anywhere in the file - a case-insensitive search for `score`, `norm`, `rank`, `population`, `平均` and `百分位` returns zero hits in `StableSelf.vue`. Nothing here is fabricated; the only stored values are the strings and chips the user typed, and `hydrate` copies them back verbatim (`StableSelf.vue:64-75`).

## PRIVACY

- Both the read and the write are gated by `allowRecoveryData` (`store.service.ts:4642`, `:4648`), which defaults to `false` (`:2350`, `prisma/schema.prisma:216`).
- The privacy failure is **not** handled specially: `load()` catches it into `error` (`StableSelf.vue:105-107`) and the template renders the red banner above a fully interactive empty form (`:264`). Unlike `Recovery.vue`, which pattern-matches the message into a gate, StableSelf shows a generic error and lets the user fill in the whole card before the save fails with the same 403. See ISSUES.
- `trustedContactList` returns only `enabled` rows (`store.service.ts:4525`), so a disabled contact never appears as a chip.

## ERROR_STATES

- Load failure: `error` = API message or 稳定状态资料读取失败 (`StableSelf.vue:106`), rendered at `:264`. The form still renders.
- Save failure: `error` = API message or 提醒卡没有保存成功 (`:126`). The user's edits are preserved because `profile` is never reset on failure.
- Client-side pre-check: `save()` refuses an all-empty payload with 请至少写下一条属于你的稳定状态信息 (`:115-118`), duplicating the server's `400` message from `store.service.ts:4674`.

## EMPTY_STATES

- First visit: the form renders empty, with the three preset anchors available and the trusted-contact chips list empty (`StableSelf.vue:46`, `:168`, `:195`). There is no "you have not written this yet" explanation and no link to what the card is for.
- No trusted contacts: the contact chip row renders only the ＋ 补充 button (`:212`).
- `hasContent` is only used to block an empty save (`:115`); it does not drive any visible empty state.

## NATIVE_RISKS

- Safe area: the file declares no bottom safe-area padding - `.stable-self-page` sets `padding: 0 22px 42px` (`StableSelf.vue:275-278`) with no `env(safe-area-inset-bottom)`. The shared `.goodnight-page` rule supplies `calc(130px + env(safe-area-inset-bottom))` (`apps/mp/src/styles.scss:4145-4147`) and the two are not merged because the scoped rule wins for `padding`, so the 130px tab-bar reservation is the effective clearance. The route has no tab bar, so there is dead space rather than a clipped control.
- Keyboard: the four daily-outline inputs and the two inline add-inputs are inside a `<details>` block in normal flow (`StableSelf.vue:227-249`); with `Keyboard.resize: 'body'` they stay reachable.
- The `@keydown.enter.prevent` handlers on the inline inputs (`:186`, `:220`, `:233`, `:245`) prevent the WebView's implicit form submission when the user presses Enter.
- Back button: no custom handling; BACK walks WebView history (`apps/mp/src/native/back-button.ts:30-36`) to Me.
- No dial intent, clipboard or external link.

## ISSUES

- P1 PRIVACY: when `allowRecoveryData` is off, the whole card is still editable and the failure only surfaces on save, as a generic red banner reading 请先在隐私设置中允许保存稳定状态资料 (`StableSelf.vue:105-107`, `:264`; message from `store.service.ts:4648`). There is no link to `/pages/settings/privacy` and no recognition that the load itself was refused - the user can type an entire reminder card and lose the effort at the last tap. `Recovery.vue` solves the same problem with an explicit gate (`Recovery.vue:94`, `:126-130`).
- P2 STATE_MACHINE: the two reads share one `Promise.all` (`StableSelf.vue:97-104`). A `trusted-contacts` failure alone sets `error` and skips the hydrate block, so an existing saved card silently fails to load and the user may overwrite it with an empty form. The `if (result.item)` hydrate is inside the same try, after the contacts assignment (`:100-104`).
- P2 DATA: `save()` sends `{ profile: { ...profile } }` (`StableSelf.vue:123`) with no merge against the server copy, and the server replaces the whole `profile` JSON blob (`store.service.ts:4667-4684`). Combined with the hydrate-skip above, a partial load followed by a save destroys the fields that failed to load.
- P2 UX: there is no visible empty state and no explanation on a first visit (`StableSelf.vue:146-270`), so the page opens as a blank form with no cue about why filling it in matters. `Recovery.vue` consumes the result but never links here (`Recovery.vue:162` renders the comparison, no push).
- P3 DATA: `anchors` is a hardcoded client array (`StableSelf.vue:46`) and the two `+ 补充` inputs are the only way to extend it, yet the server accepts up to 12 entries per list (`store.service.ts:4656-4663`) - the client silently drops anything beyond 12 without telling the user (`:79-82`, `:87-89`).
- P3 UX: `hasContent` uses `value.trim()` on every profile value (`StableSelf.vue:50-52`); because `profile` is a `reactive` object whose array fields are always arrays, the `Array.isArray` branch guards it, but the computed runs on every keystroke of every field.
- P3 DUPLICATE: the 12-item / 80-character cap is implemented three times - in the client `list()` (`:54-62`), the client `toggle`/`add` (`:77-90`), and the server `listValue` (`store.service.ts:4656-4663`) - so the client and server limits can drift.

## FINAL_STATUS

PARTIAL - every control, both endpoints, the single write, the privacy gate and the absence of any fabricated score are traced to lines, and the runtime sweep recorded 15 controls with the save button returning "changed", but this view is the one route missing from `artifacts/recovery/android-route-manifest.json`, so its rendering on the real APK is confirmed only by the control-coverage sweep.

### Static evidence

- Controls discovered: 13
- API reads (static): `/api/v1/me/stable-self`, `/api/v1/trusted-contacts`
- API writes (static): `PUT /api/v1/me/stable-self`
- Candidate fake markers: 2
- Appended: both fake-marker candidates (placeholder at lines 155 and 261) are HTML placeholder attributes on the two textareas, adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` (M25).
- Appended: group-C baseline check - `StableSelf.vue` contains no score, norm, percentile, rank or population reference, and the only consumer (`Recovery.vue:47-62`) diffs the user's own stored strings against the user's own answers.
- Appended: runtime cross-check `artifacts/post-recovery/control-coverage.json` - `/pages/stable-self/index` rendered=true, state `default`, 15 controls (13 inputs/textareas, 1 back button, 1 save button), 0 console errors. This is the only assigned route absent from `artifacts/recovery/android-route-manifest.json`.