# DiaryDetail

Source: `apps/mp/src/views/DiaryDetail.vue`

Routes: `/pages/diary/detail`

## PURPOSE

DiaryDetail is the read-only view of one private Diary entry: its emotion tag, its text, any image attachments and its timestamp. It has no write controls at all - it is a leaf of the diary branch.

## USER_JOB

"I want to re-read one entry I wrote, including any picture I attached."

## ENTRY

- DiaryList row `openDiary` -> `/pages/diary/detail?id=<id>` (`apps/mp/src/views/DiaryList.vue:49`).
- Archive diary tab -> `/pages/diary/detail?id=<item.id>` (`apps/mp/src/views/Archive.vue:99`).
- FavoriteList diary card -> `/pages/diary/detail?id=<targetId>` (`apps/mp/src/views/FavoriteList.vue:36`).
- There is no tab-bar entry; the route is not in `tabbarPaths` (`apps/mp/src/App.vue:14-39`).

## EXIT

None forward. The only control is `front-diary-detail-back` -> `router.back()` (`DiaryDetail.vue:21`). The page is a terminal node: its "job" ends by going back to whichever of DiaryList / Archive / FavoriteList opened it.

## ROUTES

`/pages/diary/detail` (`apps/mp/src/router.ts:94`; `mp-routes.json` `aliasCount: 1`, CURRENT). Single route.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| populated | `diary` truthy | `DiaryDetail.vue:8`, `:25` |
| not-found / empty (also shown while loading and on error) | `diary` falsy | `DiaryDetail.vue:42-45` |
| attachment gallery present | `diary.attachments?.length` | `DiaryDetail.vue:28` |

There is no loading state and no error state. `diary` starts `undefined` (`DiaryDetail.vue:8`), so the "没有找到这篇日记" card (`:42-45`) renders on the first frame of every visit and is replaced only once the fetch resolves. The Android route manifest captures exactly that frame: `artifacts/recovery/android-route-manifest.json` records `/pages/diary/detail` with `state: "possibly-empty"`, `firstLine: "‹ / 日记详情 / 没有找到这篇日记"`, and only 1 visible control - the back button.

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| `front-diary-detail-back` | `router.back()` (`DiaryDetail.vue:21`) | history back |
| attachment link (no test id) | native `<a href target="_blank">` (`DiaryDetail.vue:29-38`) | opens the resolved media URL in a new WebView tab |

Cross-check: `control-manifest.json` lists 2 controls for this view (the back click and its test id); `android-route-manifest.json` confirms 1 button and 1 test id, 0 console errors.

## API_READS

- `GET /api/v1/diaries/:id` (`DiaryDetail.vue:12`) -> `controllers.ts:1509-1514` -> `store.diaryEntries(getDemoUserId())` (`controllers.ts:1415-1444`) filtered by id. Returns `{item: null}` (not a 404) when the id is missing or not owned by the caller, so the "not found" copy is a real product state, not an exception.
- Because it reuses `diaryEntries`, the same read covers the private-mood projection and decoration with `emotionLabel` and `attachments` (`controllers.ts:1447-1455`).

## API_WRITES

None. (Matches `mp-routes.json`: writes "(none)".) `DELETE /api/v1/diaries/:id` exists (`controllers.ts:1516-1519`) but no control on this page calls it - deletion is only reachable through the Me data-cleanup flow (`apps/mp/src/views/Me.vue:107-120`).

## DB_ENTITIES

- Reads: **Diary**, **Mood** (private projection), **Letter** (for `letterId`/`hasLetter`), **MediaAsset** + **DiaryAttachment**/**MoodAttachment** (attachments).
- Writes: none.
- Cross-checked against `artifacts/product-audit/db-models.json`.

## ADMIN_VISIBILITY

No. There is no diary resource in `apps/admin/src/router.ts` `menuGroups` and no diary endpoint in `artifacts/product-audit/api-endpoints.json`. Diary content is user-private; it reaches an operator only via a **FeedbackTicket** the user files or an export the user requests (`allowDataExport`-gated, `store.service.ts:1653`).

## AI_USAGE

No AiJob is created or read. The `hasLetter`/`letterId` fields the underlying projection computes come from the `today_letter` pipeline, but this page does not render them and does not poll `generationStatus`. AI failure is therefore invisible here; there is nothing to fall back to.

## PRIVACY

- The read is scoped to the caller: `diaryEntries(this.store.getDemoUserId())` (`controllers.ts:1511`), and the private-mood projection additionally requires `visibility === 'PRIVATE'` (`controllers.ts:1422`). A diary id belonging to another user resolves to `null`, which renders the not-found card rather than leaking content.
- No `PrivacySetting` flag gates this page.
- Attachment URLs are served through `resolveApiUrl` (`apps/mp/src/api.ts:34-38`); the `<a>` opens them in a new tab with `rel="noopener"` (`DiaryDetail.vue:34-35`).

## ERROR_STATES

None. `load()` (`DiaryDetail.vue:10-13`) has no `try/catch` and there is no error ref. A network failure or a 500 leaves `diary` undefined, so the user is told "没有找到这篇日记 / 它可能已经被清空或删除。" - the same copy as a genuinely deleted entry. The page cannot distinguish "gone" from "could not load". This is a finding.

## EMPTY_STATES

Yes: `<article v-else class="empty-card">` with "没有找到这篇日记" (`DiaryDetail.vue:42-45`). It is correct for a deleted/missing entry but, as noted, it is also the loading and error state.

## NATIVE_RISKS

- Safe area: inherits `.goodnight-page` padding (`styles.scss:4147`); the page is short so no fixed element competes with the gesture bar.
- Keyboard: no text input.
- Back button: no custom handling; Android BACK walks WebView history (`native/back-button.ts:26-33`). Reached from a list, so BACK returns there.
- WebView history: the attachment `<a target="_blank">` opens a second WebView context on Android. There is no in-app way back from that tab other than the system back gesture, and the `back-button.ts` listener is registered once for the app, so behaviour of BACK inside the new tab is UNCONFIRMED.
- No dial intent, no clipboard.

## ISSUES

- P2 STATE_MACHINE: the not-found card is also the initial and the error state, because `diary` starts `undefined` and there is no loading flag (`DiaryDetail.vue:8`, `:10-13`, `:42`). Every visit flashes "没有找到这篇日记" before the real content arrives; the Android manifest captured that frame (`android-route-manifest.json`, `state: "possibly-empty"`).
- P2 FUNCTIONAL: no error handling. A failed `GET /api/v1/diaries/:id` is presented as a deleted diary (`DiaryDetail.vue:10-13`).
- P3 UX: the page renders no `hasLetter`/letter link even though the API supplies `letterId` and `hasLetter` (`controllers.ts:1435-1442`), so the diary's letter is unreachable from here; the user must go back to DiaryList.
- P3 UX: no delete affordance, though `DELETE /api/v1/diaries/:id` exists (`controllers.ts:1516`).
- P3 DUPLICATE: the attachment markup is a plain `<a target="_blank">` with no test id (`DiaryDetail.vue:29-38`), so it is invisible to the control manifest and to the click harness.

## FINAL_STATUS

PARTIAL - the single read, the not-found contract, all states and the DB entities are traced from source, and the route renders on the real Android APK (as the captured "possibly-empty" frame, 0 console errors); the populated branch could not be verified at runtime because the harness navigated to the route without an `id`.

Group recommendation: **KEEP**. DiaryDetail is the read leaf of the private diary branch, which the newer Journey/Peer/Self system does not replicate (JourneyDetail is a state machine over a situation, Archive holds journey archives). It complements the newer system. Add a loading flag and a real error state before promoting it.

### Static evidence

- Controls discovered: 2
- API reads (static): `/api/v1/diaries/:param`
- API writes (static): (none)
- Candidate fake markers: 0
- Appended: `controllers.ts:1509-1514` returns `{item: null}` for a missing or foreign id rather than a 404, which is why the empty card is a first-class state.
- Appended: the Android manifest recorded this route in the `possibly-empty` state with the not-found copy visible (`artifacts/recovery/android-route-manifest.json`).

