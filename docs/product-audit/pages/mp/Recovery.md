# Recovery

Source: `apps/mp/src/views/Recovery.vue`

Routes: `/pages/recovery/index`

## PURPOSE

Recovery is the daily life-function check-in. It does not ask how the user feels; it asks whether ordinary life has come back a little - food, daylight, human contact, sleep, one necessary task, one comforting thing - and it shows the user their own last two records so the change is visible rather than judged. It also compares the current answers against the profile the user wrote while stable.

## USER_JOB

"I want to see whether things are actually getting a bit better, in plain facts, without anyone grading me."

## ENTRY

- Me, `data-testid=entry-recovery` (生活恢复) -> `router.push('/pages/recovery/index')` (`apps/mp/src/views/Me.vue:39`, rendered at `Me.vue:180`).

That is the only entry. Exhaustive search of `apps/mp/src` for `/pages/recovery` returns the route declaration (`apps/mp/src/router.ts:67`), the tabbar set (`apps/mp/src/App.vue:39`) and the Me entry only.

## EXIT

The privacy gate's 去隐私设置 button -> `/pages/settings/privacy` (`Recovery.vue:129`). Otherwise the page has no forward navigation; saving stays in place and reloads the list. There is no back control on the page itself; BACK is the only way out, plus the bottom tab bar.

## ROUTES

`/pages/recovery/index` (`apps/mp/src/router.ts:67`). Single route, no aliases. It is in `tabbarPaths` (`apps/mp/src/App.vue:39`) and `activeTab` maps it to 我的 (`App.vue:56-60`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| privacy blocked (gate replaces the whole form) | `privacyBlocked` | `Recovery.vue:26`, `:94`, `:126` |
| error note | `error` | `Recovery.vue:25`, `:132` |
| six signal rows, each with a 3-way radio | `signals` (default all `partial`) | `Recovery.vue:20`, `:134-146` |
| summary textarea | `summary` | `Recovery.vue:22`, `:150-155` |
| saving (button disabled) | `saving` | `Recovery.vue:24`, `:155` |
| latest-change comparison | `latestChange` computed from `recent` | `Recovery.vue:35-45`, `:158` |
| stable-self comparison shown | `stableComparison` computed from `stableProfile` | `Recovery.vue:47-61`, `:162` |
| recent list | `recent` (up to 7 newest) | `Recovery.vue:29-33`, `:165-176` |
| recent list empty | `!recent.length` | `Recovery.vue:169` |

Note there is **no loading state**: `load()` never sets a loading flag, so the form renders immediately with the default `partial` answers while the fetch is in flight.

## CONTROLS

| control (label/testid) | handler function | what it actually does |
| --- | --- | --- |
| 18 radios (6 fields x 还没有 / 一部分 / 做到了) | `v-model="signals[field.key]"` | sets the per-field signal value |
| `recovery-summary` textarea (maxlength 500) | `v-model="summary"` | free text |
| `recovery-save` (保存今天的记录) | `save` | POST `/api/v1/me/recovery`, then clear the summary and reload |
| 去隐私设置 (only in the gate) | inline `router.push('/pages/settings/privacy')` | opens privacy settings |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 5 controls for the view; `artifacts/post-recovery/control-coverage.json` shows 24 visible controls on `/pages/recovery/index` (18 radios, 1 textarea, 1 save button, 4 tab links), state `possibly-empty`, 0 console errors, 0 failed requests.

## API_READS

All three fire in parallel through `Promise.all` (`Recovery.vue:84-91`):

- `GET /api/v1/me/recovery` -> `controllers.ts:663-666` -> `store.recoveryList` (`apps/api/src/store.service.ts:4690-4694`), gated by `privacyAllows(userId,'allowRecoveryData')`.
- `GET /api/v1/tonight` -> `controllers.ts:205-208` -> `store.tonightHome` (`store.service.ts:2425-2456`); only `item.journey.id` is used, to attach the new record to the active journey.
- `GET /api/v1/me/stable-self` -> `controllers.ts:650-653` -> `store.stableSelfProfile` (`store.service.ts:4640-4644`), also gated by `allowRecoveryData`.

## API_WRITES

- `POST /api/v1/me/recovery` with `{journeyId, signals, summary}` (`Recovery.vue:102-106`). Handler `controllers.ts:668-674` -> `store.saveRecoveryCheckin` (`store.service.ts:4303-4331`), which calls `privacyAllows(userId,'allowRecoveryData')` at `:4310`, normalises each signal against `{yes,partial,no}` (unknown values become `partial`, `:4314-4317`), writes a **RecoverySnapshot**, and touches `journey.updatedAt`.

## DB_ENTITIES

- Reads: **RecoverySnapshot**, **LifeJourney** (through `tonightHome`), **StableSelfProfile**.
- Writes: **RecoverySnapshot** (`prisma/schema.prisma`), plus `LifeJourney.updatedAt`.
- Cross-checked against `artifacts/product-audit/db-models.json`.

## ADMIN_VISIBILITY

**None.** `RecoverySnapshot` has no resource in `apps/admin/src/router.ts` menuGroups. The closest admin surfaces are `/experience/journeys` and `/experience/checkins` (`apps/admin/src/router.ts:64`, `:66`), but `checkins` maps to `OutcomeCheckin`, not to `RecoverySnapshot` (`apps/admin/src/views/TablePage.vue:58`, `apps/api/src/controllers.ts:1950`). The admin dashboard does count the rows (`recoveryRecords: this.store.recoverySnapshots.length`, `controllers.ts:1820`) but there is no way to read the content. Since the recovery record is gated behind `allowRecoveryData` for the user, the absence of an operator view is consistent with the privacy intent, though it means a support plan's "trend" data has no operational consumer.

## AI_USAGE

None. No AiJob is created or read. `latestChange` and `stableComparison` are pure client-side diffs of the user's own records (`Recovery.vue:35-61`), computed from `labels` maps and the `fields` array. The backend task type `recovery_summary` exists (`store.service.ts:5820`, `:6063`) and is used by the monthly report service (`apps/api/src/monthly-report.service.ts:321`, `:414`), but nothing on this page triggers it.

## PRIVACY

This is the most privacy-gated page in group A.

- Both reads are gated: `recoveryList` (`store.service.ts:4692`) and `stableSelfProfile` (`store.service.ts:4642`) call `privacyAllows(userId,'allowRecoveryData')`. The write is gated too (`:4310`).
- `allowRecoveryData` defaults to `false` (`store.service.ts:2350`, `prisma/schema.prisma:217`), so a fresh user is blocked until they opt in.
- The page recognises the block by pattern-matching the error text: `privacyBlocked.value = /隐私|允许|恢复数据/.test(error.value)` (`Recovery.vue:94`). This is fragile - it depends on the exact Chinese wording of the three server messages (请先在隐私设置中允许保存生活恢复数据 / ...查看恢复记录 / ...保存稳定状态资料, `store.service.ts:4310`, `:4692`, `:4642`) and on the API client surfacing `payload.message` (`packages/api-sdk/src/index.ts:24`). Any rewording silently turns the gate into a plain error banner.
- The stable-self read is part of the same `Promise.all`; if only that one is blocked the whole load throws and the page shows the gate even though recovery reads would have worked.

## ERROR_STATES

- load failure: `error` is set to the API message or 恢复记录加载失败, and `privacyBlocked` is computed from it (`Recovery.vue:92-94`). If `privacyBlocked` is true the gate renders; otherwise the error renders as a bare `<p class="error-note">` above the form (`Recovery.vue:132`), and the form still renders with default answers.
- save failure: `error` is set to the API message or 恢复记录保存失败 (`Recovery.vue:108-110`). The summary text is only cleared on success (`:107`), so a failed save does not lose the user's text. Good.
- Note the save error renders into the same `error-note` paragraph that is inside the `v-else` template, so it is visible.

## EMPTY_STATES

- recent list: `<p v-if="!recent.length" class="empty">还没有恢复记录。今天可以先留下第一条。</p>` (`Recovery.vue:169`). Present and appropriate.
- `latestChange` with fewer than two records returns 再记录一次后，这里会按每一项告诉你发生了什么变化。 (`Recovery.vue:36`), a sensible empty message.
- `stableComparison` returns `''` when there is no stable profile (`Recovery.vue:48`) and the whole section is hidden by `v-if="stableComparison"` (`:162`). No copy explains why the comparison is missing, so a user who has never filled in the stable-self profile sees no hint that the feature exists.

## NATIVE_RISKS

- Safe area: this is a tab route; the page pads `calc(112px + env(safe-area-inset-bottom))` and the shared `.goodnight-page` adds `calc(130px + env(safe-area-inset-bottom))` (`apps/mp/src/styles.scss:4147`). Clears the tab bar.
- Keyboard: the summary textarea is in normal flow; `Keyboard.resize: 'body'` keeps it reachable. The 18 radios are native inputs, so no custom keyboard issue.
- Back button: no custom handling; BACK walks WebView history (`apps/mp/src/native/back-button.ts:26-33`). Since the only entry is Me, BACK returns to Me.
- No dial intent, no clipboard, no external links on this page.
- The 18 radios are real `<input type="radio">` elements, so Android accessibility and the WebView's form controls behave normally.

## ISSUES

- P1 PRIVACY: the privacy gate is detected by regex on the error string (`Recovery.vue:94`). Any change to the three server messages in `store.service.ts:4310`, `:4692` or `:4642` turns the friendly gate into a generic red error and removes the only route to the privacy settings from this page. A status code (403) would be a stable signal; the code already has `ApiError.status` available from `packages/api-sdk/src/index.ts:6`.
- P2 STATE_MACHINE: the three reads share one `Promise.all` (`Recovery.vue:84-91`). Because `stableSelfProfile` is gated by the same flag as recovery, a block on either one blanks the entire page into the gate; conversely a failure of only the `/tonight` read (which is not privacy-gated) also triggers the gate path, since the catch applies to the whole batch. A user whose only problem is an unrelated journey read is told to go and change their privacy settings.
- P2 FUNCTIONAL: there is no loading state (`Recovery.vue:80-96` sets no flag), so the form renders with all six fields defaulted to `partial` before the fetch resolves. A user who taps 保存今天的记录 quickly submits six fabricated "一部分" answers plus whatever summary they typed.
- P2 DATA: the default `partial` for every field means an untouched form always writes a full six-field record (`Recovery.vue:20`). There is no way to record "I did not answer this", so the recovery history is never sparse and the `latestChange` diff can report a change that the user never made.
- P3 UX: the stable-self comparison silently disappears when no stable profile exists (`Recovery.vue:48`, `:162`) with no link to `/pages/stable-self/index`, so the feature is undiscoverable from the page that uses it.
- P3 DATA: the `signals` object is sent with whatever keys the client holds; the server normalises unknown values to `partial` but keeps unknown keys (`store.service.ts:4315-4317`), so the stored snapshot's shape is client-controlled.
- P3 DUPLICATE: the three-way label map (`no/partial/yes` -> 还没有/一部分/做到了) is declared twice in this file, once for `latestChange` (`Recovery.vue:38`) and once for `stableComparison` (`:50`), and a third time as the `options` array (`:16-20`).

## FINAL_STATUS

DONE - the three reads, the single write, all four privacy gates and both empty states are traced to lines, and the route renders on the Android APK with 24 controls and 0 console errors.

### Static evidence

- Controls discovered: 5
- API reads (static): `/api/v1/me/recovery`, `/api/v1/me/stable-self`, `/api/v1/tonight`
- API writes (static): `POST /api/v1/me/recovery`
- Candidate fake markers: 1
- Appended: the single fake-marker candidate (placeholder at line 152) is the summary textarea's HTML placeholder attribute, adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` (M22).
- Appended: the runtime sweep recorded this route as `possibly-empty`, which matches the empty `recent` list rendering the 还没有恢复记录 copy at `Recovery.vue:169`.
- Appended: `RecoverySnapshot` is written here and read by `journeyArchiveDetail` for the archive view, so the data does have a second consumer, but only through the journey archive rather than an admin resource.

