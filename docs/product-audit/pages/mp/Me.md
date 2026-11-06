# Me

Source: `apps/mp/src/views/Me.vue`

Routes: `/pages/me/index`

## PURPOSE

Me is the personal-journey hub behind the 我的 tab. It shows the one active Journey with its subjective-intensity change, three counts derived from that journey (active actions, completed check-ins, archived journeys), a support-plan status strip, and thirteen labelled doors into the self-system (recovery, support plan, stable self, memory, future self, decision vault, diary, letters, favourites, monthly report, archive, privacy, feedback). It is the only place in the product that aggregates the user's own history in one screen.

## USER_JOB

"I want one place that tells me where I am right now and lets me get to anything I have written, decided or planned."

## ENTRY

- Bottom tab 我的, `data-testid=tab-me` -> `to="/pages/me/index"` (`apps/mp/src/App.vue:107`). This is the only inbound control; a repo-wide search for `/pages/me/index` in `apps/mp/src` returns the route (`apps/mp/src/router.ts:89`), the `tabbarPaths` entry (`App.vue:24`) and this link.

No API-supplied `targetRoute` points here: `follow-up-worker.service.ts` sends notifications to tonight, decision, action, future-self and peers only.

## EXIT

Fifteen pushes, all in-template:

- `entry-current-journey` -> `/pages/journey/detail?id=<id>` (`Me.vue:169`)
- `entry-start-journey` -> `/pages/tonight/index` (`Me.vue:178`)
- `me-support-status` -> `/pages/support-plan/index` (`Me.vue:191`)
- `primaryEntries` (`Me.vue:199-200`): recovery, support-plan, stable-self, memory, future-self, decision
- `archiveEntries` (`Me.vue:211-212`): diary, letter/list, favorite, me/month-report, archive, settings/privacy, help/feedback

There is no terminal "done" step - the page is a hub, so every exit is a navigation.

## ROUTES

`/pages/me/index` (`apps/mp/src/router.ts:89`). Single route, no aliases. It is a tab route (`apps/mp/src/router.ts:48`, `App.vue:7-40`) and `activeTab` maps it to 我的 (`App.vue:62-68`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| load error banner | `loadError` | `Me.vue:12`, `:141`, `:155` |
| active journey card | `currentJourney` (computed from `journeys`) | `Me.vue:17`, `:156` |
| no active journey (empty variant) | `!currentJourney` | `Me.vue:174` |
| intensity change shown | `intensityChange` (needs both `initialIntensity` and `intensity`) | `Me.vue:27-32`, `:163` |
| active-action count | `activeActions` | `Me.vue:21-23`, `:182` |
| completed-checkin count | `completedActions` | `Me.vue:24-26`, `:185` |
| archived-journey count | `archivedCount` | `Me.vue:18-20`, `:188` |
| support plan present | `supportPlan` | `Me.vue:10`, `:195` |
| support plan absent | `!supportPlan` | `Me.vue:195` |
| recovery note count | `recovery.length` | `Me.vue:9`, `:36` |
| future-message count | `futureMessages.length` | `Me.vue:11`, `:64` |
| clear-data confirm panel open | `clearConfirmOpen` | `Me.vue:13`, `:221` |
| clearing in progress | `clearing` | `Me.vue:14`, `:227-228` |
| clear result / failure message | `clearMessage` | `Me.vue:15`, `:219` |

There is **no loading state**: `load()` never sets a loading flag (`Me.vue:122-143`), so the hero, the metrics (rendering 0) and all thirteen entries paint immediately while the five requests are in flight.

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| 继续看看 (`entry-current-journey`) | `router.push('/pages/journey/detail?id=...')` | opens the active Journey |
| 回到今晚 (`entry-start-journey`) | `router.push('/pages/tonight/index')` | sends the user to write something on Tonight |
| 我的现实支持 (`me-support-status`) | `router.push('/pages/support-plan/index')` | opens the support plan |
| six 长期恢复入口 buttons (`entry-recovery`, `entry-support-plan`, `entry-stable-self`, `entry-memory`, `entry-future-self`, `entry-decision`) | `router.push(entry.route)` | one push each, routes from `primaryEntries` |
| seven 过去的记录 buttons (`entry-diary`, `entry-letter-list`, `entry-favorite`, `entry-report`, `entry-journey-archive`, `entry-privacy`, `entry-feedback`) | `router.push(entry.route)` | one push each, routes from `archiveEntries` |
| 清理我的记录 (`btn-clear-data`) | `clearConfirmOpen = true` | opens the alertdialog |
| 暂不清理 (`btn-clear-cancel`) | `clearConfirmOpen = false` | dismisses |
| 确认清理 (`btn-clear-confirm`) | `clearMyData` | `DELETE /api/v1/me/data`, then reload |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 24 entries for this view; `artifacts/post-recovery/control-coverage.json` records 21 visible controls on the real APK (16 buttons, 4 tab links, 1 article), of which 17 were clicked; `entry-stable-self`, `entry-memory`, `entry-future-self` and `entry-decision` all report result "changed".

## API_READS

Five GETs, four in one `Promise.all` (`Me.vue:125-130`) and one nested (`:135-139`):

- `GET /api/v1/me/profile` -> `controllers.ts:1328-1330` -> `{ item: this.store.users[0] }`. **The result is stored in `profile` and never referenced by the template** (`Me.vue:7`, `:131`; no `profile.` in the markup).
- `GET /api/v1/journeys` -> `controllers.ts:210-216` -> `store.journeyDetail` per journey (`store.service.ts:2850-2861`).
- `GET /api/v1/me/support-plan` -> `controllers.ts:637-640` -> `store.supportPlan` (`store.service.ts:4634-4639`). **Not privacy-gated.**
- `GET /api/v1/future-messages` -> `controllers.ts:624-627` -> `store.futureMessageList` (`store.service.ts:4595-4600`).
- `GET /api/v1/me/recovery` -> `controllers.ts:663-666` -> `store.recoveryList` (`store.service.ts:4690-4694`), gated by `privacyAllows(userId,'allowRecoveryData')`. Its failure is swallowed and becomes `[]`.

## API_WRITES

- `DELETE /api/v1/me/data` (`Me.vue:111`) -> `controllers.ts:1354-1362` (`clearData`), which calls `store.clearFavoritesForUser(userId)` (`store.service.ts:1468-1474`), filters `diaries` and `letters` by `userId`, then `persistAndFlush()`.

Store method: `PublicController.clearData` (there is no `store.service.ts` method of the same name; the controller performs the deletion inline). Prisma models changed: **Favorite** (deleted, with the owning posts/letters favourite counts rolled back via `applyFavoriteRemoval`), **Diary** (deleted), **Letter** (deleted). Moods, posts, memories, journeys, future messages, stable-self and recovery rows are untouched.

## DB_ENTITIES

Reads: **User** (via `me/profile`), **LifeJourney**, **SituationSnapshot**, **JourneyUpdate**, **ActionCommitment**, **OutcomeCheckin**, **RecoverySnapshot**, **PeerMatch** (all via `journeyDetail`), **PersonalSupportPlan**, **MessageToFutureSelf**.

Writes: **Favorite**, **Diary**, **Letter** (delete only).

Cross-checked against `prisma/schema.prisma` (models at `:136`, `:359`, `:452`, `:475`, `:629`, `:646`, `:694`, `:809`) and `artifacts/product-audit/db-models.json`.

## ADMIN_VISIBILITY

Partly, and inconsistently with what this page shows.

- `/experience/journeys` (`apps/admin/src/router.ts:64`) lists LifeJourney; `/experience/actions` (`:65`) lists ActionCommitment; `/experience/checkins` (`:66`) lists OutcomeCheckin; `/safety/support-plans` (`:78`) lists PersonalSupportPlan; `/experience/follow-ups` (`:69`) lists FollowUpJob.
- `/users` (`:41`) is the only place an operator sees the profile card, and it includes the privacy row (`controllers.ts:2102-2105`).
- **RecoverySnapshot has no admin resource.** The dashboard counts the rows (`controllers.ts:1820`) but no table exposes them, so the 生活恢复 count on this page is the only consumer.
- **MessageToFutureSelf has no admin resource either.** Only the FollowUpJob that delivers it is listed (`controllers.ts:2005-2015`).

## AI_USAGE

None on this page. No AiJob is created or read; `/api/v1/ai/tasks` does not appear in the file. The two counts that could look AI-derived (行动结果, 走过的路) are plain client-side reductions over `journeys` (`Me.vue:21-26`).

## PRIVACY

- `me/recovery` is gated by `allowRecoveryData` (`store.service.ts:4692`, default `false` at `:2350` and `prisma/schema.prisma:216`). The page degrades gracefully: the throw is caught locally and the note falls back to 看看生活有没有回来一点 (`Me.vue:36`, `:135-139`).
- `me/support-plan` GET is **not** gated, while `PUT /api/v1/me/support-plan` **is** (`store.service.ts:4606`). A user with `allowRecoveryData` off therefore sees 低谷预案已经准备好 on the status strip but cannot open and save it. See ISSUES.
- `DELETE /api/v1/me/data` is not gated by any privacy flag; it is unconditional for the runtime user.
- The page never renders `nickname` or `anonymousCode`, so the profile read has no privacy surface of its own.

## ERROR_STATES

- Any failure among the four `Promise.all` reads sets `loadError` to the API message or 个人旅程读取失败，请稍后重试 and renders a red banner above the journey card (`Me.vue:140-142`, `:155`). The rest of the page still renders with zeroed metrics and default notes.
- The failure is **all-or-nothing**: because `me/profile` is inside the same batch and its result is unused, a failure of that one endpoint blanks the metrics and both notes even though every other read succeeded. See ISSUES.
- The clear-data failure sets `clearMessage` to the API message or 清理失败，请稍后重试 (`Me.vue:115-117`) and renders it in a green `cleanup-message` bubble (`:219`, styles `:518-525`) - the same styling used for success, so a failure looks like a success at a glance. See ISSUES.

## EMPTY_STATES

- No active journey: the `journey-empty` card with 这里还没有正在走的 Journey / 需要的时候，从"今晚"写下正在发生的事 and a 回到今晚 button (`Me.vue:174-179`).
- No recovery records: the note becomes 看看生活有没有回来一点 (`Me.vue:36`).
- No support plan: 低谷预案还没有准备，之后可以慢慢补上 (`Me.vue:195`).
- No future messages: 给下一次难受的自己留一句话 (`Me.vue:64`).
- The three metric tiles always render, showing 0 rather than an empty state (`Me.vue:180-190`).

## NATIVE_RISKS

- Safe area: this is a tab route, so `.self-page` pads `calc(108px + env(safe-area-inset-bottom))` (`Me.vue:240`) against the tab bar, on top of the shared `.goodnight-page` `calc(130px + env(safe-area-inset-bottom))` (`apps/mp/src/styles.scss:4147`).
- The clear-data confirm is `position: fixed; bottom: calc(84px + env(safe-area-inset-bottom))` (`Me.vue:501`), which sits above the tab bar on gesture-nav devices - correct, but it is an `aria-modal` alertdialog rendered inside the page flow with no focus trap (`:221`).
- Back button: Me is the WebView history root for the 我的 tab; `window.history.length > 1` decides whether BACK navigates or exits the app (`apps/mp/src/native/back-button.ts:30-36`), and this page has no custom handling.
- No keyboard-sensitive input, no dial intent, no clipboard and no external link on this page.

## ISSUES

- P1 DATA: `GET /api/v1/me/profile` is fetched (`Me.vue:126`) and stored (`:131`) but never rendered - no `profile.` appears anywhere in the template. It is dead I/O that also creates a single point of failure for the whole hub, because it sits inside the same `Promise.all` as the journey and support reads.
- P2 STATE_MACHINE: the four reads are all-or-nothing (`Me.vue:125-130`). A failure of the unused profile call, or of `me/support-plan`, blanks the reality metrics and both status notes even though `journeys` and `future-messages` may have returned fine. The recovery read is handled separately and degrades cleanly (`:135-139`), which shows the correct pattern was already available.
- P2 PRIVACY: `GET /api/v1/me/support-plan` is not gated by `allowRecoveryData` while the matching PUT is (`store.service.ts:4634-4639` vs `:4606`). With the flag off the hub advertises 低谷预案已经准备好 and the SupportPlan screen refuses to save.
- P2 UX: a failed 清理我的记录 renders into `.cleanup-message`, whose background is success-green (`Me.vue:518-525`). The failure text is only distinguishable by reading it.
- P2 SECURITY: `DELETE /api/v1/me/data` destroys diaries, letters and favourites with no server-side confirmation token and no privacy gate (`controllers.ts:1354-1362`), whereas the comparable archive delete requires `confirmation: 'DELETE_ARCHIVE'` (`:239-246`). The only guard is the client dialog, which any direct call skips.
- P2 NAVIGATION / ORPHAN: `MeProfile` (`/pages/me/profile`) is unreachable from anywhere in the app (`docs/product-audit/discovery-agent1-page-graph.md` section 3), and Me - the page that fetches the profile record - shows no nickname or avatar control to reach it. The profile data has no consumer.
- P3 DUPLICATE: 情绪月报 is pushed to `/pages/me/month-report` (`Me.vue:82`) while `ToolIndex` pushes the same view at `/pages/report/month` (`apps/mp/src/views/ToolIndex.vue:19`). Two entry points, two aliases, one view.
- P3 DATA: 走过的路 counts journeys with status `archived` **or** `completed` (`Me.vue:18-20`) under the label 已归档, and 行动结果 counts `outcomeCheckins` with status `completed` (`:24-26`) under the label 已经回看 - two different entity types rendered as sibling tiles with no unit.
- P3 UX: there is no loading state (`Me.vue:122-143`), so all three metrics flash 0 before the fetch resolves.

## FINAL_STATUS

PARTIAL - every control, read, write, state and privacy gate is traced to a line and the route renders on the real APK with 21 controls and 0 console errors, but the all-or-nothing load and the unreachable MeProfile page could not be exercised end-to-end in this pass, so the runtime behaviour of the failure path is unverified.

### Static evidence

- Controls discovered: 24
- API reads (static): `/api/v1/future-messages`, `/api/v1/journeys`, `/api/v1/me/profile`, `/api/v1/me/recovery`, `/api/v1/me/support-plan`
- API writes (static): `DELETE /api/v1/me/data`
- Candidate fake markers: 0
- Appended: runtime cross-check `artifacts/recovery/android-route-manifest.json` - `/pages/me/index` rendered=true, isTab=true, textLength 466, 20 visible controls, 0 console errors, 0 failed requests. `artifacts/post-recovery/control-coverage.json` records 21 controls, state `default`.
- Appended: `/pages/stable-self/index` is the only route present in `artifacts/post-recovery/control-coverage.json` (15 controls, state `default`) but missing from `artifacts/recovery/android-route-manifest.json`; every other assigned route appears in both.