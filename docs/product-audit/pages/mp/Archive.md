# Archive

Source: `apps/mp/src/views/Archive.vue`

Routes: `/pages/archive/index`

## PURPOSE

Archive is the content store. It has four tabs - private diaries, public tree-holes, received letters and journey archives - plus a three-way time filter (all / this week / this month). Diaries, posts and letters open their detail pages; a journey archive opens a bottom sheet with the full timeline, action stats and peer/recovery/decision counts, and from there can be exported as a JSON file, restored to an active journey, or deleted after a second confirmation.

## USER_JOB

"I want to go back and find something I wrote or received, and for a finished journey I want to keep a copy, bring it back, or get rid of it."

## ENTRY

- Me, 旅程归档, `data-testid=entry-journey-archive` -> `router.push('/pages/archive/index')` (`apps/mp/src/views/Me.vue:88`, rendered `:211-212`).
- JourneyDetail, after archiving a journey: `await router.push('/pages/archive/index')` (`apps/mp/src/views/JourneyDetail.vue:123`).

A repo-wide search for `/pages/archive/index` returns the route (`apps/mp/src/router.ts:99`), the `tabbarPaths` entry (`App.vue:31`), the Me entry and the JourneyDetail push.

## EXIT

- diary card -> `/pages/diary/detail?id=<id>` (`Archive.vue:99`)
- post card -> `/pages/post/detail?id=<id>` (`:103`)
- letter card / diary's 树洞回信 chip -> `/pages/letter/detail?id=<id>` (`:107`)
- restore -> `/pages/journey/detail?id=<id>` after a successful restore (`:135`)
- everything else (export, delete) stays on the page.

There is no back control on the page and the route is **not** in `tabbarPaths` (`App.vue:7-40`), so BACK is the only way out besides a card push.

## ROUTES

`/pages/archive/index` (`apps/mp/src/router.ts:99`). Single route, no aliases. Not a tab route; `activeTab` would classify it as 我的 (`App.vue:62-68`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading note | `loading` | `Archive.vue:19`, `:216` |
| error line | `error` | `Archive.vue:21`, `:215` |
| active tab: diary / post / letter / journey | `activeTab` (default `'diary'`) | `Archive.vue:10`, `:218`, `:230`, `:241`, `:251` |
| time scope: all / week / month | `scope` (default `'all'`) | `Archive.vue:11`, `:264` |
| diary list | `filteredDiaries` | `Archive.vue:41`, `:219` |
| post list | `filteredPosts` | `Archive.vue:42`, `:231` |
| letter list | `filteredLetters` | `Archive.vue:43`, `:242` |
| journey list | `filteredJourneys` | `Archive.vue:44`, `:253` |
| per-tab empty state (four distinct copies) | `!filtered*.length` | `Archive.vue:227`, `:238`, `:249`, `:260` |
| diary has a letter chip | `item.hasLetter` | `Archive.vue:224` |
| journey count badge | `journeys.length` | `Archive.vue:211` |
| detail sheet open | `selectedJourney` | `Archive.vue:16`, `:269` |
| actions sheet open | `actionJourney` | `Archive.vue:17`, `:280` |
| delete confirmation open | `confirmDelete` | `Archive.vue:18`, `:292` |
| busy (all action buttons disabled) | `busy` | `Archive.vue:20`, `:285-287`, `:296` |
| restore button hidden for a completed journey | `actionJourney.journey.status === 'archived'` | `Archive.vue:285` |

Note there is **no loading flag on the initial mount before the first paint of a tab**: `loading` starts `false` (`:19`) and the tab content is guarded by `&& !loading` (`:218` etc.), so on a cold open the list renders empty for one frame and the per-tab empty copy can flash before the fetch resolves.

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| 私密日记 (`archive-tab-diary`) | `selectTab('diary')` | switches the tab |
| 公开树洞 (`archive-tab-post`) | `selectTab('post')` | switches the tab |
| 树洞回信 (`archive-tab-letter`) | `selectTab('letter')` | switches the tab |
| ⌁ 旅程归档 N 段 (`archive-tab-journey`) | `selectTab('journey')` | switches; re-fetches only when `journeys` is empty (`:93-96`) |
| diary card (`archive-diary-first` / `archive-diary-<id>`) | `openDiary(item)` | `/pages/diary/detail?id=<id>` |
| 树洞回信 chip (`archive-diary-letter-first`, first card only) | `openLetter(item)` | `/pages/letter/detail?id=<id>` |
| post card (`archive-post-first` / `archive-post-<id>`) | `openPost(item)` | `/pages/post/detail?id=<id>` |
| letter card (`archive-letter-first` / `archive-letter-<id>`) | `openLetter(item)` | `/pages/letter/detail?id=<id>` |
| journey card (`archive-journey-first` / `archive-journey-<id>`) | `openJourney(item)` | `GET /api/v1/archive/journeys/:id`, opens the detail sheet |
| ··· on a journey card (`archive-journey-actions-first`, first card only) | `openActions(item)` | opens the actions sheet |
| 全部 / 本周 / 本月 (`archive-scope-all` / `-week` / `-month`) | `scope = item[0]` | client-side date filter |
| ▽ (`archive-filter-reset`) | `scope = 'all'` | resets the filter |
| × (`archive-detail-close`) | `selectedJourney = undefined` | closes the detail sheet |
| 管理这段归档 (`archive-detail-actions`) | `openActions(selectedJourney)` | opens the actions sheet |
| 恢复到当前旅程 (`archive-restore`, archived only) | `restoreJourney` | `POST /api/v1/archive/journeys/:id/restore`, then pushes to the journey |
| 导出这段归档 (`archive-export`) | `exportJourney` | `POST /api/v1/archive/journeys/:id/export`, then a synthetic download |
| 删除这段归档 (`archive-delete-start`) | `confirmDelete = true` | opens the confirmation |
| 取消 (actions sheet) | `actionJourney = undefined` | closes |
| 再想想 (`archive-delete-cancel`) | `confirmDelete = false` | dismisses |
| 确认删除 (`archive-delete-confirm`) | `deleteJourney` | `DELETE /api/v1/archive/journeys/:id` with `{confirmation:'DELETE_ARCHIVE'}` |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 43 entries; `artifacts/post-recovery/control-coverage.json` records **34** visible controls on the real APK. The sweep marked 22 as destructive and skipped them - including the tab buttons, the scope filter and every diary card - so the tab switching, the time filter and the diary→letter chip were never exercised at runtime. Seven 树洞回信 chips had no testid because the view only testids the first card (`:224`).

## API_READS

Four GETs in one `Promise.all` (`Archive.vue:76-86`):

- `GET /api/v1/diaries` -> `controllers.ts:1457-1466` -> the private `diaryEntries` projection (`controllers.ts:1413-1452`), which merges persisted `Diary` rows with unlinked PRIVATE `Mood` rows so an interrupted migration cannot silently empty the list.
- `GET /api/v1/posts` -> `controllers.ts:186-190` -> `store.publicPosts` (`store.service.ts:4820-4839`), which excludes hidden posts, non-active posts and anything not `reviewStatus: 'published'`.
- `GET /api/v1/letters` -> `controllers.ts:1055-1063` -> the user's `Letter` rows, decorated.
- `GET /api/v1/archive/journeys` -> `controllers.ts:219-222` -> `store.archiveJourneys` (`store.service.ts:2863-2868`), which keeps only `archived` and `completed` journeys and maps each through `journeyArchiveDetail`.

Plus one lazy GET:

- `GET /api/v1/archive/journeys/:id` (`Archive.vue:113`) -> `controllers.ts:224-227` -> `store.journeyArchiveDetail` (`store.service.ts:2870-2923`), which throws `400` 这段旅程仍在进行中，暂时不能作为归档查看 for a non-archived journey.

## API_WRITES

- `POST /api/v1/archive/journeys/:id/restore` (`Archive.vue:131`) -> `controllers.ts:234-237` -> `store.restoreArchivedJourney` (`store.service.ts:2925-2939`). Store method: `StoreService.restoreArchivedJourney`. Prisma model: **LifeJourney** (`status` set back to `active`). It refuses unless the status is exactly `archived` (`:2927-2929`) and unless no other journey is active (`:2930-2933`).
- `POST /api/v1/archive/journeys/:id/export` (`Archive.vue:148-151`) -> `controllers.ts:229-232` -> `store.createJourneyArchiveExport` (`store.service.ts:1718-1786`). Gated by `privacyAllows(userId, 'allowDataExport', ...)` (`:1719`). Writes a real `journey-archive-export-<journeyId>-<ts>.json` file and inserts a **MediaAsset** with `usageType: 'journey-archive-export'` and `url: /api/v1/exports/:assetId/download`; rolls back both on a flush failure (`:1773-1780`).
- `DELETE /api/v1/archive/journeys/:id` with body `{confirmation:'DELETE_ARCHIVE'}` (`Archive.vue:171-173`) -> `controllers.ts:239-246`, which rejects anything else with 请完成第二次确认后再删除归档, then calls `store.deleteJourneyArchive` (`store.service.ts:2940-2999`).

Store methods: `restoreArchivedJourney`, `createJourneyArchiveExport`, `deleteJourneyArchive`.

**What the delete actually removes** (`store.service.ts:2958-2996`): the **LifeJourney** row, its **SituationSnapshot**, **JourneyUpdate**, **ActionCommitment** and **OutcomeCheckin** rows, its **AIJob** rows keyed by the journey or by its action ids, **UserNotification** rows whose `targetRoute` points at the journey, and the export **MediaAsset** rows plus their files. It deliberately **detaches rather than deletes** Diaries, Moods, Posts, PeerExperiences, PeerMatches, DecisionRecords, RealityHandoffs, MessageToFutureSelf, PersonalSupportPlan, MemoryItems, RecoverySnapshots, SafetyEvents, AgentDecisionLogs and FollowUpJobs by clearing `journeyId` (`:2967-2981`). The confirmation copy states exactly this: 旅程时间线、行动与回访会被删除。独立保存的日记、回信和未来信件仍会保留 (`Archive.vue:294`).

## DB_ENTITIES

Reads: **Diary**, **Mood**, **Post**, **Letter**, **LifeJourney**, **SituationSnapshot**, **JourneyUpdate**, **ActionCommitment**, **OutcomeCheckin**, **PeerMatch**, **PeerConversation**, **RecoverySnapshot**, **DecisionRecord**.

Writes: **LifeJourney** (restore); **MediaAsset** (export); on delete: **LifeJourney**, **SituationSnapshot**, **JourneyUpdate**, **ActionCommitment**, **OutcomeCheckin**, **AIJob**, **UserNotification**, **MediaAsset**, plus the `journeyId` detach on fourteen other models.

Cross-checked against `prisma/schema.prisma` (Diary `:335`, Post `:262`, Letter `:312`, LifeJourney `:359`, SituationSnapshot `:400`, JourneyUpdate `:428`, ActionCommitment `:452`, OutcomeCheckin `:475`, PeerConversation `:767`, DecisionRecord `:562`, MediaAsset `:847`).

## ADMIN_VISIBILITY

**Journeys: yes.** `/experience/journeys` (`apps/admin/src/router.ts:64`) lists LifeJourney with update and action counts (`controllers.ts:1917-1934`), and `/experience/actions` (`:65`), `/experience/checkins` (`:66`) and `/experience/peer-conversations` (`:70`) cover the rows the archive sheet summarises. The deletion this page performs is therefore visible to an operator as missing rows.

**Diaries, posts and letters: yes, through the content surfaces.** `/posts` (`:39`) and `/users` (`:41`) cover posts and users; there is no admin resource for `Diary` or `Letter` specifically, so the private diary and the received letter text are not exposed in the console - consistent with the privacy intent.

**No admin resource exists for the archive itself**, so the export files and the restore action are not audited anywhere the operator can see.

## AI_USAGE

No AiJob is created or read by this page; `/api/v1/ai/tasks` does not appear in the file. Two indirect AI relationships:

- The archive cards display diary content that was itself produced by AI tools - the runtime sweep shows titles like 诗意疗愈 / 负面改写 / 工作支撑 (`artifacts/post-recovery/control-coverage.json`), which are `Diary.source: 'tool-*'` rows (`controllers.ts:1319`).
- `deleteJourneyArchive` deletes the journey's **AIJob** rows as part of the cascade (`store.service.ts:2964`), so an archive delete does remove AI history - but only the jobs keyed to that journey or its actions; jobs for diaries, letters or peer drafts that were detached survive.

There is no AI failure path to describe here: nothing on the page queues a job, and the store's `fallback` status (`store.service.ts:5513-5530`, the DAPI 402 condition) is irrelevant to this view.

## PRIVACY

- **The export is gated by `allowDataExport`** (`store.service.ts:1719`). With the flag off the server answers `403` 请先在隐私设置中允许导出个人数据 and the page shows it in `error` (`Archive.vue:161`). The export button is **not** pre-disabled, so the user only discovers the block by tapping.
- **The restore is gated by `allowJourneyArchiveRetention`**, indirectly: `updateJourneyStatus` refuses to archive a journey when the flag is off (`store.service.ts:4810-4816`), so a journey can only be in the archive state this page restores from if the flag was on when it was archived. The restore itself has no privacy check.
- **The delete has no privacy gate**, but it does require the `DELETE_ARCHIVE` confirmation token (`controllers.ts:243-244`).
- **The public tree-hole tab shows posts through `publicPosts`**, which applies the same visibility rules as the square: hidden posts excluded, `status === 'active'` required, `reviewStatus === 'published'` required (`store.service.ts:4832-4838`). `allowAnonymousPublic` is not consulted, but that flag is inert everywhere (`docs/product-audit/pages/mp/Square.md`).
- The page itself reads no privacy settings object, so it cannot tell the user which of its three actions are currently allowed.

## ERROR_STATES

- Load failure: `error` = API message or 内容档案暂时没有打开 (`Archive.vue:87-90`), rendered at `:215` above the list. Because the four reads share one `Promise.all`, a failure of any one tab's source blanks **all four** tabs, and the `loading` flag is still cleared in the `finally` (`:91`) so the per-tab empty copies render underneath the error.
- Journey detail failure: `error` = API message or 归档详情暂时没有打开 (`:115-117`); the sheet does not open.
- Restore failure: `error` = API message or 恢复这段旅程没有成功 (`:132-134`). The server's two refusal messages (只有手动归档的旅程可以恢复…, 请先结束或暂停当前旅程…) both land in this same line.
- Export failure: `error` = API message or 归档导出没有成功 (`:159-161`).
- Delete failure: `error` = API message or 归档删除没有成功 (`:176-178`); `confirmDelete` stays true so the user can retry, but `actionJourney` is only cleared on success (`:172`).

## EMPTY_STATES

Four distinct, well-written per-tab copies:

- 这个时间范围里还没有私密日记 / 写下的内容会在这里按真实时间出现。 (`Archive.vue:227`)
- 这个时间范围里没有公开树洞 / 这里只显示真实发布并可查看的内容。 (`:238`)
- 这个时间范围里还没有回信 / 当你收到真实回信，它会在这里保存。 (`:249`)
- 这个时间范围里没有旅程归档 / 完成或手动归档后的 Journey 会在这里完整回看。 (`:260`)

The runtime sweep confirms the journey copy is live: the `archive-tab-journey` control rendered as ⌁ 旅程归档 **0 段** on the APK.

## NATIVE_RISKS

- Safe area: `.archive-page` pads `calc(112px + env(safe-area-inset-bottom))` (`Archive.vue:303`) and the detail/action sheets add `calc(24px + env(safe-area-inset-bottom))` (`:329`). The route has no tab bar, so the 112px is dead space.
- The two sheets are `.sheet-mask` overlays anchored to the bottom with `max-height: min(82vh, 690px)` and their own scroll (`:329`), so a long journey timeline scrolls inside the sheet rather than the page. No `Escape` handler and no focus trap.
- The export uses a synthetic `<a download>` click (`:152-157`) which hands off to the Android download manager; there is no completion feedback.
- Back button: no custom handling; BACK walks WebView history (`apps/mp/src/native/back-button.ts:30-36`). Because there is no in-page back control, a user who deep-links here has only BACK.
- No keyboard input, dial intent or clipboard use.

## ISSUES

- P1 NAVIGATION: the diary's 树洞回信 chip navigates with the wrong id. `openLetter(item)` is shared by the diary card and the letter card and always builds `/pages/letter/detail?id=<item.id>` (`Archive.vue:106-108`), but on the diary card `item` is a **Diary**, so the id sent is the diary id, not `item.letterId`. `DiaryList.vue` gets this right by using `diary.letterId` with a fallback to `/pages/letter/today` (`apps/mp/src/views/DiaryList.vue:52-55`). `LetterDetail` has no error branch - `v-if="letter"` with an undefined item renders a blank page (`apps/mp/src/views/LetterDetail.vue:8-11`, `:31`). The seven chips visible in the runtime sweep all lacked testids and were never clicked.
- P2 DATA: the delete cascade removes the journey's **AIJob** rows (`store.service.ts:2964`) but only those keyed by the journey id or its action ids, while detaching everything else. A user who deletes an archive expecting the record of their journey's AI history to go too will keep every job that belonged to a detached diary, letter or peer draft. The confirmation copy does not mention AI history at all (`Archive.vue:294`).
- P2 STATE_MACHINE: the four reads share one `Promise.all` (`Archive.vue:76-86`) and `loading` is cleared unconditionally (`:91`), so a failure of the letters endpoint shows 这个时间范围里还没有回信 on the letter tab **and** blanks the diaries, posts and journeys tabs, with the single error line above. Each tab has an independent source and could fail independently.
- P2 UX: there is no in-page back control and the route is not a tab route (`Archive.vue` has no `router.back()` and `App.vue:7-40` omits `/pages/archive/index`), so a user who arrives from the JourneyDetail post-archive push (`JourneyDetail.vue:123`) has only the hardware BACK to leave.
- P2 STATE_MACHINE: the export button is not disabled when `allowDataExport` is off, so the `403` is only discovered after the tap and lands in the same generic `error` line as a network failure (`Archive.vue:159-161`). `ReportMonth` at least disables its poster button on the equivalent condition.
- P2 DATA: the time filter is applied client-side to the already-fetched lists (`Archive.vue:33-44`), so 本周 / 本月 do not reduce the payload; every diary, post, letter and archived journey is fetched in full on mount regardless of the selected scope.
- P3 TEST_CONTRACT: only the **first** card in each tab carries a testid (`Archive.vue:220`, `:224`, `:232`, `:243`, `:254`, `:258`), which is why the runtime sweep had to address the other six 树洞回信 chips by `button:nth-of-type(n)`.
- P3 UX: the loading note (`:216`) is the only progress feedback and `loading` starts `false` (`:19`), so on a cold open the empty-state copies can render for a frame before the fetch resolves.
- P3 DATA: `dateLabel` compares `date.toDateString() === now.toDateString()` (`:46-53`) to decide 今天; the `now` snapshot is taken per call, so a card rendered across midnight can label the previous day as 今天.
- P3 DUPLICATE: `openDiary` / `openPost` / `openLetter` (`:98-108`) and the four `*Preview` helpers (`:55-70`) each re-implement the same 76-character truncation and the same route template.

## FINAL_STATUS

PARTIAL - the route, all five reads, the three writes and the full delete cascade are traced to lines and the route renders on the real APK with 34 controls and 0 console errors, but 22 of those controls were skipped as destructive and none of the list/detail/export/restore/delete actions was executed at runtime, so the restore and delete paths are verified statically only.

### Static evidence

- Controls discovered: 43
- API reads (static): `/api/v1/archive/journeys`, `/api/v1/archive/journeys/:param`, `/api/v1/diaries`, `/api/v1/letters`, `/api/v1/posts`
- API writes (static): `DELETE /api/v1/archive/journeys/:param`, `POST /api/v1/archive/journeys/:param/export`, `POST /api/v1/archive/journeys/:param/restore`
- Candidate fake markers: 0
- Appended: group-C coverage check - list (four tabs), detail (`GET /archive/journeys/:id` into the detail sheet), export (`POST …/export` writing a real JSON asset), restore (`POST …/restore` with the two server-side refusals) and delete (`DELETE with the `DELETE_ARCHIVE` token) are all present and traced.
- Appended: the export claim was adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` (M03, M34) - `createJourneyArchiveExport` writes a real file served by `GET /api/v1/exports/:assetId/download`.
- Appended: runtime cross-check `artifacts/recovery/android-route-manifest.json` - `/pages/archive/index` rendered=true, textLength 544, 21 visible controls, 0 console errors, 0 failed requests. `artifacts/post-recovery/control-coverage.json` records 34 controls, state `default`, 22 skipped as destructive, 7 without a testid.