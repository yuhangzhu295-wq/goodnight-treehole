# MeProfile

Source: `apps/mp/src/views/MeProfile.vue`

Routes: `/pages/me/profile`

## PURPOSE

MeProfile renders the signed-in account's identity card: avatar glyph, nickname, anonymous code and account status. It is a read-only display of the `User` row and nothing else - there is no edit control, no logout, no avatar upload.

## USER_JOB

"I want to check which anonymous identity I am posting under, and whether my account is in good standing."

## ENTRY

**DIRECT_ONLY.** No control anywhere in `apps/mp/src` navigates to `/pages/me/profile`. A repo-wide search returns only the route declaration (`apps/mp/src/router.ts:90`), the API path `GET /api/v1/me/profile` (`apps/api/src/controllers.ts:1328`), and the page's own back button. `Me.vue` - the hub that already fetches the profile record - has no nickname or avatar control; its hero header is static markup with no button (`Me.vue:150-155`). `docs/product-audit/discovery-agent1-page-graph.md` section 3 classifies this view as a strict orphan for the same reason.

## EXIT

Back only: `router.back()` (`MeProfile.vue:19`). There is no forward control, so the successor is whatever the user was on before, and with no inbound link that is usually nothing - the page is a terminal node reached by typing the URL or by a deep link.

## ROUTES

`/pages/me/profile` (`apps/mp/src/router.ts:90`). Single route, no aliases. It is **not** in `tabbarPaths` (`apps/mp/src/App.vue:7-40`), so the tab bar is hidden; `activeTab` would still classify it as 我的 (`App.vue:62-68`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loaded profile card | `profile` truthy | `MeProfile.vue:7`, `:17` |
| nickname fallback | `profile.nickname || '晚安旅人'` | `MeProfile.vue:25` |
| account status normal | `profile.status === 'normal'` | `MeProfile.vue:27` |
| account status other (`limited` / `banned`) | `profile.status` | `MeProfile.vue:27` |
| not yet loaded / failed - **blank page** | `!profile` | `MeProfile.vue:17` |

There is no loading indicator and no error branch: `v-if="profile"` hides the whole `<section>` until the fetch resolves, and if the fetch rejects, `load()` has no `try/catch` (`MeProfile.vue:9-11`) so the promise rejection is unhandled and the page stays permanently blank.

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| ‹ (`front-profile-back`) | `router.back()` | history back |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 2 entries for this view (the click and its testid, both at line 19); `artifacts/post-recovery/control-coverage.json` records exactly 1 visible control on the real APK, clicked, result "changed".

## API_READS

- `GET /api/v1/me/profile` (`MeProfile.vue:10`) -> `controllers.ts:1328-1330` -> `{ item: this.store.users[0] }`.

Two notes on that handler. First, it ignores the `x-goodnight-user-id` header that every other `me/*` route honours (`controllers.ts:89-91`), returning index 0 of the in-memory user array instead of the runtime user - the seed order puts `user_demo` first (`store.service.ts:690-700`), so it happens to be right today, but the binding is by array position, not by identity. Second, it returns the raw store object including `openid` (`store.service.ts:692`), which the view does not render but which crosses the wire. See ISSUES.

## API_WRITES

None.

## DB_ENTITIES

Reads: **User** only.

Writes: none.

Cross-checked against `prisma/schema.prisma:136-182` (fields `nickname`, `anonymousCode`, `status`, `openid`) and `artifacts/product-audit/db-models.json`.

## ADMIN_VISIBILITY

Not on an admin resource of its own - the same `User` row is what `/users` lists (`apps/admin/src/router.ts:41` -> `GET /api/admin/v1/users`, `controllers.ts:2085-2101`), and the detail endpoint `GET /api/admin/v1/users/:id` returns `{ item, privacy }` (`controllers.ts:2102-2105`). The nickname and anonymous code shown here are therefore operator-visible, which is intended for a moderation console.

## AI_USAGE

None. No AiJob is created or read, and the page makes no AI claim.

## PRIVACY

- The page renders no privacy-gated field: nickname, anonymous code and status are non-sensitive identity metadata, and the `User` model has no privacy gate on them.
- The endpoint is nevertheless the one `me/*` route that bypasses `resolveRuntimeUserId` (see API_READS), so it is not scoped to the caller's own identity by construction.
- `openid` is included in the response body even though no view renders it (`MeProfile.vue` references only `nickname`, `anonymousCode` and `status`).

## ERROR_STATES

**None, and that is the finding.** `load()` is a bare `await` with no `try/catch` and no error ref (`MeProfile.vue:9-11`); the template's only guard is `v-if="profile"` (`:17`). On any API failure the user sees a completely blank screen with no message, no retry and no back control - the back button lives inside the `v-if` block (`:19`), so it is hidden too. See ISSUES.

## EMPTY_STATES

The nickname fallback 晚安旅人 (`MeProfile.vue:25`) covers a missing nickname. There is no empty state for a missing profile record: `{ item: this.store.users[0] }` always returns an object as long as the store has users, so the page cannot distinguish "no profile" from "loaded".

## NATIVE_RISKS

- Safe area: the file has no styles, so it uses the shared `.goodnight-page` padding (`apps/mp/src/styles.scss:4145-4147`). The route is not a tab route, so the 130px reserved for the tab bar is dead space.
- Back button: the Android BACK gesture still works even in the blank state, because `window.history.length > 1` is checked in the native shell rather than by the page (`apps/mp/src/native/back-button.ts:30-36`). The in-page ‹ control does not, since it is inside the hidden `v-if`.
- No keyboard, dial intent, clipboard or external link.

## ISSUES

- P2 FUNCTIONAL / ORPHAN: the route mounts but nothing in the app links to it (`apps/mp/src/router.ts:90`; `docs/product-audit/discovery-agent1-page-graph.md` section 3). The identity card the user would most want is unreachable, and `Me.vue` fetches the same record and discards it.
- P2 STATE_MACHINE: an API failure produces a permanently blank screen with no message, no retry and no visible back control (`MeProfile.vue:9-11`, `:17-19`). Every sibling detail page in the product renders an error or at least keeps its top bar.
- P2 SECURITY / DATA: `GET /api/v1/me/profile` returns `this.store.users[0]` (`controllers.ts:1328-1330`) instead of resolving `x-goodnight-user-id` like its neighbours (`:637-666`). With more than one user in the store the endpoint would serve the wrong person's `nickname`, `anonymousCode` and `openid`; the seed order (`store.service.ts:690-700`) is the only thing preventing that today.
- P3 DATA: the response includes `openid` (`store.service.ts:692`) and the view does not render it, so an internal identifier is shipped to the client with no consumer.
- P3 UX: the avatar is a hardcoded 芽 glyph in `.avatar-bubble large` (`MeProfile.vue:24`) rather than `profile.avatarUrl`, which the API does return (`store.service.ts:693`), so the field is fetched and ignored.

## FINAL_STATUS

PARTIAL - the route, the single read, the four rendered fields and the missing error path are all traced to lines and the APK manifest shows the route rendering with 1 control and 0 console errors, but the blank-on-failure behaviour was not reproduced at runtime in this pass.

### Static evidence

- Controls discovered: 2
- API reads (static): `/api/v1/me/profile`
- API writes (static): (none)
- Candidate fake markers: 0
- Appended: runtime cross-check `artifacts/recovery/android-route-manifest.json` - `/pages/me/profile` rendered=true, isTab=false, textLength 31, first line "‹ / 个人资料 / 芽", 1 visible control, 0 console errors, 0 failed requests. `artifacts/post-recovery/control-coverage.json` records 1 control, state `default`.