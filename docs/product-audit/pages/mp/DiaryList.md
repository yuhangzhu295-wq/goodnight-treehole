# DiaryList

Source: `apps/mp/src/views/DiaryList.vue`

Routes: `/pages/diary/index`, `/pages/diary/list`, `/pages/me/diaries`

## PURPOSE

DiaryList is the private journal index. It lists the user's own Diary entries for one month at a time, lets them filter by emotion and by whether a letter exists, and offers a single forward action (write a new diary) plus a jump to the associated letter when one exists. It is the private counterpart to Square.

## USER_JOB

"I want to look back over what I wrote, find the entries that got a reply, and write today's entry."

## ENTRY

- Me 日记与回信 entry `entry-diary` -> `/pages/diary/index` (`apps/mp/src/views/Me.vue:79`).
- MoodCreate after a private publish -> `/pages/diary/index` (`apps/mp/src/views/MoodCreate.vue:127`).
- The three route paths are aliases (`apps/mp/src/router.ts:91-93`); all three are in `tabbarPaths` (`apps/mp/src/App.vue:25-27`), so the bottom bar renders and `activeTab` resolves to `me` (`App.vue:59-66`).

## EXIT

- `openDiary(diary)` -> `/pages/diary/detail?id=<diary.id>` (`DiaryList.vue:49`).
- `openLetter(diary)` -> `/pages/letter/detail?id=<diary.letterId>` when `letterId` exists, else `/pages/letter/today` (`DiaryList.vue:52-55`).
- `btn-new-diary` -> `/pages/mood/create` (`DiaryList.vue:149`).

## ROUTES

`/pages/diary/index`, `/pages/diary/list`, `/pages/me/diaries` (`apps/mp/src/router.ts:91-93`; `mp-routes.json` aliasGroup of size 3, `legacyOrCurrent: ALIAS`). Only `/pages/diary/index` is pushed by a real control; the other two are reachable by URL only.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| populated timeline | `diaries` | `DiaryList.vue:8`, `:21`, `:100-137` |
| empty (month with no entries) | `!diaries.length` | `DiaryList.vue:140-147` |
| empty due to filter (different copy) | `emotion \|\| hasLetter` | `DiaryList.vue:143-144` |
| selected month | `month` | `DiaryList.vue:10`, `:91` |
| available month list | `availableMonths` | `DiaryList.vue:11`, `:155-158` |
| month sheet open | `monthOpen` | `DiaryList.vue:15`, `:152` |
| emotion filter | `emotion` | `DiaryList.vue:12`, `:166-169` |
| letter filter | `hasLetter` | `DiaryList.vue:13`, `:172-174` |
| filter sheet open | `filterOpen` | `DiaryList.vue:14`, `:161` |
| per-row has-letter / no-letter | `diary.hasLetter` | `DiaryList.vue:126-137` |
| page-level `is-empty` styling class | `!diaries.length` | `DiaryList.vue:76` |

There is no loading state and no error state: `load()` (`DiaryList.vue:17-23`) has no `loading` ref and no `try/catch`, and `onMounted` awaits `loadMonths()` then `load()` (`:69-72`) with no catch, so a failure leaves the timeline silently empty and `month` may be unset.

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| `front-diary-back` | `router.back()` (`DiaryList.vue:78`) | history back |
| `filter-diary-month` | `monthOpen = true` | opens the month sheet |
| `btn-diary-filter` | `filterOpen = true` | opens the filter sheet |
| diary card `diary-card-first` / `diary-card-<id>` | `openDiary(diary)` (`DiaryList.vue:107`) | pushes diary detail |
| `diary-letter-first` / `diary-letter-<id>` | `openLetter(diary)` (`DiaryList.vue:130`) | pushes letter detail, or letter/today if no id |
| `btn-new-diary` | inline push (`DiaryList.vue:149`) | `/pages/mood/create` |
| `diary-month-<value>` | `selectMonth(value)` (`DiaryList.vue:157`) | sets `month`, closes the sheet, re-fetches |
| `filter-diary-emotion-all/jiaolv/weiqu/shimian` | `emotion = ...` (`DiaryList.vue:166-169`) | sets the emotion filter (no fetch until 确认筛选) |
| `filter-diary-letter-all/true/false` | `hasLetter = ...` (`DiaryList.vue:172-174`) | sets the letter filter |
| `btn-diary-filter-reset` | `resetFilter` (`DiaryList.vue:177`) | clears both filters and re-fetches immediately |
| `btn-diary-filter-confirm` | `confirmFilter` (`DiaryList.vue:178`) | re-fetches and closes the sheet |

Cross-check: `control-manifest.json` lists 37 controls; `android-route-manifest.json` shows 13 buttons + 4 links + 4 tabs (17 visible), 17 test ids, 0 console errors.

## API_READS

- `GET /api/v1/diaries?month=&emotion=&hasLetter=` (`DiaryList.vue:21`) -> `controllers.ts:1457-1466` -> `store.diaryEntries(userId)` (`controllers.ts:1415-1444`), which merges persisted **Diary** rows with a read-only projection of private **Mood** rows that have no companion Diary, then filters by month prefix, normalized emotion, and `hasLetter`.
- `GET /api/v1/diaries/months` (`DiaryList.vue:26`) -> `controllers.ts:1468-1478`, the distinct `YYYY-MM` prefixes, newest first.

Both go through `diaryEntries`, which reads **Mood**, **Letter**, **Diary**, **MediaAsset** and `MoodAttachment`.

## API_WRITES

None. The page is read-only; the write happens in MoodCreate. (Matches `mp-routes.json`: writes "(none)".)

## DB_ENTITIES

- Reads: **Diary**, **Mood** (private-mood projection), **Letter** (for `hasLetter` and `letterId`), **MediaAsset** / **MoodAttachment** / **DiaryAttachment** (thumbnails via `decorateDiaryEntry`, `controllers.ts:1447-1455`).
- Writes: none.
- Cross-checked against `artifacts/product-audit/db-models.json`.

## ADMIN_VISIBILITY

No. There is no diary resource in `apps/admin/src/router.ts` `menuGroups`, and no admin endpoint for diaries in `artifacts/product-audit/api-endpoints.json`. Diary content is user-private by design; the only way diary-adjacent data reaches admin is through a **FeedbackTicket** the user files, or an exported file. `POST /api/v1/diaries/export` (`controllers.ts:1393-1396`) is the user-initiated path, gated by `allowDataExport` (`store.service.ts:1653`).

## AI_USAGE

No AiJob is created or read here. The `hasLetter` flag this page renders is set by the AI letter pipeline: `createMood`'s private branch queues a `today_letter` job and, on completion, flips `savedDiary.hasLetter = true` for `succeeded` and `fallback` alike (`store.service.ts:4995-5013`). The projection path (`controllers.ts:1428-1430`) treats a letter as present when `generationStatus` is absent or `succeeded`/`fallback`. So under the DAPI 402 blocker a diary shows "已有回信" pointing at a safe-template letter, with no degradation signal - ISSUE-007 (P1 AI).

## PRIVACY

- The page reads only the caller's own rows: `diaryEntries(this.store.getDemoUserId())` (`controllers.ts:1460`, `:1470`), and the private-mood projection requires `visibility === 'PRIVATE'` (`controllers.ts:1422`).
- No `PrivacySetting` flag gates the read. `defaultVisibility`/PRIVATE affects which Moods enter the projection, but the page itself is unconditional.
- The export route it can reach indirectly is gated by `allowDataExport` (`store.service.ts:1653`, `:1719`), which defaults to `false` (`prisma/schema.prisma:224`).

## ERROR_STATES

None. `load()` (`DiaryList.vue:17-23`) and `loadMonths()` (`:25-29`) have no `try/catch` and there is no error ref. A failed `GET /api/v1/diaries` rejects the `onMounted` promise and the page renders as an empty month with the "还没有日记" copy, which is indistinguishable from a genuine empty state. This is a finding.

## EMPTY_STATES

Yes, and it is well differentiated: the empty card chooses its copy from the filter state - "没有符合筛选的日记 / 可以调整筛选条件，或写下一篇新的日记。" when `emotion || hasLetter` is set, otherwise "`${month}` 还没有日记 / 写下一点今天的心情，它会在这里长成记录。" (`DiaryList.vue:143-145`). The month sheet also has an empty state ("暂时没有可选择的日记月份", `:158`).

## NATIVE_RISKS

- Safe area: the write CTA uses `bottom: calc(64px + env(safe-area-inset-bottom))` in the empty state (`DiaryList.vue:325-326`) and inherits the shared page padding otherwise.
- Keyboard: no text input on the page.
- Back button: `router.back()` is the only back action; Android BACK walks WebView history (`native/back-button.ts:26-33`). Reached from Me, so BACK returns to Me.
- No dial intent, no clipboard.

## ISSUES

- P2 FUNCTIONAL: no error state and no loading state. A failed fetch renders the empty-month copy, so a network failure is presented to the user as "you have not written anything this month" (`DiaryList.vue:17-29`, `:140-147`).
- P2 STATE_MACHINE: `onMounted` awaits `loadMonths()` before `load()` (`DiaryList.vue:69-72`). If `loadMonths()` rejects, `load()` never runs and `month` keeps the empty initial value, so the diary query is issued with no `month` at all - the page would silently show every diary rather than one month. UNCONFIRMED at runtime.
- P3 UX: the filter sheet mutates `emotion`/`hasLetter` on tap but does not fetch until 确认筛选 (`DiaryList.vue:166-174`), while 重置 fetches immediately (`:36-40`). The two buttons behave inconsistently.
- P3 UX: the emotion filter offers only 焦虑/委屈/失眠 (`DiaryList.vue:167-169`) while MoodCreate and the backend support nine (`store.service.ts:38-84`), so 恋爱/工作/难过/孤独/生气 diaries can be written but not filtered.
- P3 ORPHAN: `/pages/diary/list` and `/pages/me/diaries` are never pushed by any control (`docs/product-audit/discovery-agent1-page-graph.md` section 4); they are redundant aliases.
- P3 TEST_CONTRACT: only the first row carries stable ids (`diary-card-first`, `diary-letter-first`); later rows use per-id ids that change with the data (`DiaryList.vue:105`, `:129`).

## FINAL_STATUS

PARTIAL - both reads, the projection logic, all states and the empty-state branching are traced from source, and the route renders on the real Android APK with 0 console errors; the empty and error branches could not be exercised at runtime because the seeded data covers every month and the API is healthy.

Group recommendation: **KEEP**. DiaryList is the private journal index and has no equivalent in the newer Journey/Peer/Self system - the Journey timeline (`JourneyDetail`) records one situation's updates, not a dated personal journal, and Archive holds journey archives rather than diaries. It complements the newer system. The missing error state and the narrow emotion filter are fixes, not merge grounds.

### Static evidence

- Controls discovered: 37
- API reads (static): `/api/v1/diaries`, `/api/v1/diaries/months`
- API writes (static): (none)
- Candidate fake markers: 1
- Adjudication: NOT_FAKE - `placeholder` at `DiaryList.vue:115` is the CSS class `diary-entry-placeholder` on a decorative glyph shown when a diary has no attachment (`discovery-agent5-fake-candidates.md` M05).
- Appended: `diaryEntries` merges persisted `Diary` rows with a read-only projection of orphan private `Mood` rows (`controllers.ts:1415-1444`), so the count here can exceed the `Diary` table.

