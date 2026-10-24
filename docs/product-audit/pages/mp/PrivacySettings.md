# PrivacySettings

Source: `apps/mp/src/views/PrivacySettings.vue`

Routes: `/pages/settings/privacy`

## PURPOSE

PrivacySettings is the single control surface for the fourteen `PrivacySetting` columns. Every row is a toggle that writes the whole settings object back to the server on each tap, and the page also carries the three data operations that belong with consent: clear local device caches, export the user's diaries, and delete the user's diaries, letters and favourites. It is the page the rest of the product points at when a feature is blocked by a flag.

## USER_JOB

"I want to decide exactly what this app may keep, may share, may analyse and may use with AI - and be able to take my data out or destroy it."

## ENTRY

- Me, 隐私与数据, `data-testid=entry-privacy` -> `router.push('/pages/settings/privacy')` (`apps/mp/src/views/Me.vue:95`, rendered `:211-212`).
- MemoryCenter privacy gate, 去隐私设置 (`apps/mp/src/views/MemoryCenter.vue:150`).
- Recovery privacy gate, 去隐私设置 (`apps/mp/src/views/Recovery.vue:129`).

Cross-check: `docs/product-audit/discovery-agent1-page-graph.md` row 28 lists the same three. Note the peer surface's 看看隐私边界 button points at the non-existent `/pages/privacy/index` instead (`docs/product-audit/ISSUE_REGISTER.md` ISSUE-005) - a route that does not exist, so that path never arrives here.

## EXIT

- 查看完整说明 (`btn-data-policy-route`) -> `router.push('/pages/settings/data-policy')` (`PrivacySettings.vue:366`).
- ‹ (`front-privacy-back`) -> `router.back()` (`:166`).

Every toggle and every data action stays on the page and re-renders in place. The route **is** in `tabbarPaths` (`apps/mp/src/App.vue:34`), so the bottom tab bar is visible; `activeTab` maps it to 我的 (`App.vue:62-68`).

## ROUTES

`/pages/settings/privacy` (`apps/mp/src/router.ts:102`). Single route, no aliases. Tab route (`apps/mp/src/router.ts:48` is the four-tab list; `App.vue:34` adds this page to the visible bar).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading / load-error page (replaces everything) | `setting === null` | `PrivacySettings.vue:39`, `:162`, `:384-388` |
| load error with retry button | `loadError` | `PrivacySettings.vue:41`, `:386-387` |
| fully rendered settings page | `setting` truthy | `PrivacySettings.vue:162` |
| any toggle save in flight (all toggles disabled) | `saving` | `PrivacySettings.vue:44`, `:189` and the twelve other `:disabled="saving"` bindings |
| status line (success or failure) | `message` | `PrivacySettings.vue:40`, `:357` |
| cache clear in progress | `clearingCache` | `PrivacySettings.vue:45`, `:305` |
| export in progress | `exporting` | `PrivacySettings.vue:46`, `:312` |
| export download link shown | `exportResult` && `exportUrl` | `PrivacySettings.vue:48-49`, `:317` |
| delete confirm modal open | `deleteConfirm` | `PrivacySettings.vue:43`, `:372` |
| delete in progress | `deleting` | `PrivacySettings.vue:47`, `:379` |
| explain modal open | `explain` | `PrivacySettings.vue:42`, `:360` |
| per-toggle on/off | `setting.defaultVisibility === 'PRIVATE'` and each boolean | `PrivacySettings.vue:190`, `:203`, `:216`, `:229`, `:242`, `:255`, `:268`, `:281`, `:294`, `:339`, `:342`, `:345`, `:348`, `:351` |
| 更多细分权限 disclosure expanded | native `<details>` open state | `PrivacySettings.vue:337` |

## CONTROLS

The fourteen toggles all share one handler, `save(patch)` (`PrivacySettings.vue:60-76`), which optimistically applies the patch, sends `PUT /api/v1/settings/privacy` with the complete object, replaces the local state with the server's response on success, and rolls back to the previous object on failure.

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| 默认仅自己可见 (`toggle-privacy-private`) | `save({defaultVisibility: ...})` | flips PRIVATE ⇄ PUBLIC |
| 允许接收真人回应 (`toggle-privacy-human`) | `save({allowHumanReplies})` | flips |
| 匿名发布到广场 (`toggle-privacy-anonymous`) | `save({allowAnonymousPublic})` | flips |
| 允许同路匹配 (`toggle-privacy-peer`) | `save({allowPeerMatching})` | flips |
| 允许匿名经历统计 (`toggle-privacy-anonymous-stats`) | `save({allowAnonymousExperienceStats})` | flips |
| 允许 AI 记住长期信息 (`toggle-privacy-long-memory`) | `save({allowLongTermMemory})` | flips |
| 允许生成长期旅程分析 (`toggle-privacy-journey-analysis`) | `save({allowJourneyLongTermAnalysis})` | flips |
| 允许生成月报分享图 (`toggle-privacy-report-share`) | `save({allowMonthlyReportShare})` | flips |
| 保存生活恢复记录 (`toggle-privacy-recovery-data`) | `save({allowRecoveryData})` | flips |
| 允许 AI 使用历史记忆 (`toggle-privacy-ai-memory-use`) | `save({allowAiMemoryUse})` | flips |
| 允许匿名分享同路经历 (`toggle-privacy-experience-share`) | `save({allowAnonymousExperienceShare})` | flips |
| 允许未来信提醒 (`toggle-privacy-future-notifications`) | `save({allowFutureSelfNotifications})` | flips |
| 允许保留旅程归档 (`toggle-privacy-journey-archive`) | `save({allowJourneyArchiveRetention})` | flips |
| 允许导出我的数据 (`toggle-privacy-export`) | `save({allowDataExport})` | flips |
| 清空本地缓存 (`btn-clear-cache`) | `clearCache` | clears localStorage, sessionStorage, Cache Storage and IndexedDB; **no API call** |
| 导出我的日记 (`btn-export-diaries`) | `exportDiaries` | `POST /api/v1/diaries/export`, then renders a download link |
| 下载文件 (link, appears after export) | native `<a download>` | downloads `exportUrl` |
| 账号与数据说明 (`btn-data-explain`) | `explain = true` | opens the explain modal |
| 查看完整说明 (`btn-data-policy-route`) | `router.push('/pages/settings/data-policy')` | opens the static policy page |
| 知道了 (`btn-data-explain-close`) | `explain = false` | closes |
| 删除我的数据 (`btn-delete-my-data`) | `deleteConfirm = true` | opens the delete modal |
| 暂不删除 | `deleteConfirm = false` | closes |
| 确认删除 (`btn-delete-my-data-confirm`) | `deleteMyData` | `DELETE /api/v1/me/data` |
| 重新加载 (error state only) | `load` | retries the GET |
| ‹ 返回上一页 (`front-privacy-back`) | `router.back()` | history back |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 49 entries for this view (each control appears twice, once as the click and once as the testid); `artifacts/post-recovery/control-coverage.json` records 23 visible controls on the real APK, of which 16 were clicked and returned "changed", 5 were skipped as destructive (`toggle-privacy-report-share`, `toggle-privacy-journey-archive`, `btn-clear-cache`, `btn-delete-my-data`, plus one) and the 4 tab links were covered by the route walk.

## API_READS

- `GET /api/v1/settings/privacy` (`PrivacySettings.vue:54`) -> `controllers.ts:1604-1607` -> `{ item: this.store.privacySettings[runtimeId] }`, resolved through `resolveRuntimeUserId` (`controllers.ts:89-91`, `store.service.ts:2167-2173`).

No other read. `artifacts/product-audit/api-endpoints.json` also lists the aliases `GET /api/v1/me/privacy` and `GET /api/v1/privacy-settings` (`controllers.ts:1611-1618`); this view uses neither.

## API_WRITES

**`PUT /api/v1/settings/privacy`** (`PrivacySettings.vue:68`) is the only settings write. Handler `controllers.ts:1620-1652`:

- builds a `patch` from an explicit `allowedKeys` allowlist of all fourteen columns (`:1622-1638`);
- for `defaultVisibility` accepts only `'PRIVATE'` or `'PUBLIC'` (`:1639-1641`), for every other key accepts only booleans (`:1642-1643`) - so an unknown or wrongly-typed key is silently dropped rather than 400;
- merges into `this.store.privacySettings[runtimeId]`, then `persist()` + `flush()` (`:1648-1650`);
- returns the full updated object, which the client assigns back (`PrivacySettings.vue:68`).

Store: the controller writes the store's `privacySettings` map directly; persistence goes through `RelationalRuntimeService`, which upserts `PrivacySetting` with every column (`apps/api/src/relational-runtime.mapper.ts:178`). Prisma model changed: **PrivacySetting** (one row per user, `userId @unique`).

**`POST /api/v1/diaries/export`** (`PrivacySettings.vue:126`) -> `controllers.ts:1393-1396` -> `store.createDiaryExport` (`store.service.ts:1652-1711`). Gated by `privacyAllows(userId, 'allowDataExport', '请先在隐私设置中允许导出个人数据')` (`:1653`). Writes a real JSON file to the uploads directory, inserts a **MediaAsset** row with `usageType: 'diary-export'` and `url: /api/v1/exports/:assetId/download`, and rolls the asset and the file back if the flush fails (`:1702-1708`).

**`DELETE /api/v1/me/data`** (`PrivacySettings.vue:147`) -> `controllers.ts:1354-1362` (`clearData`). Deletes **Favorite** rows via `store.clearFavoritesForUser` (`store.service.ts:1468-1474`), then filters **Diary** and **Letter** by `userId`, then `persistAndFlush()`. It is the same endpoint Me.vue calls.

## DB_ENTITIES

Reads: **PrivacySetting**.

Writes: **PrivacySetting** (PUT); **MediaAsset** (export); **Favorite**, **Diary**, **Letter** (delete).

Cross-checked against `prisma/schema.prisma:207-227` (PrivacySetting, all fourteen columns and their defaults), `:847-864` (MediaAsset), `:335-357` (Diary), `:312-333` (Letter), `:809-819` (Favorite).

## ADMIN_VISIBILITY

**Yes, indirectly.** There is no admin resource named "privacy", but:

- `GET /api/admin/v1/users/:id` returns `{ item, privacy }` (`controllers.ts:2102-2105`), so an operator reading a user's detail sees the whole privacy row. The `/users` table (`apps/admin/src/router.ts:41`) is the entry.
- `PATCH /api/admin/v1/config` with a `defaultVisibility` key **bulk-overwrites every user's `defaultVisibility`** (`controllers.ts:2947-2951`). This is an operator action that silently changes a user-facing setting the user chose here. See ISSUES.
- The admin `TablePage` resource list has no privacy entry (`apps/admin/src/views/TablePage.vue:7-29`).

## AI_USAGE

No AiJob is created or read by this page; `/api/v1/ai/tasks` does not appear in the file. Three of the toggles are nonetheless the master switches for AI behaviour elsewhere:

- `allowLongTermMemory` gates memory **creation** (`store.service.ts:4714`);
- `allowAiMemoryUse` gates memory **injection** into every prompt (`store.service.ts:4796`);
- `allowJourneyLongTermAnalysis` gates the monthly-report summary and advice jobs (`apps/api/src/monthly-report.service.ts:312`).

When an AI provider fails, the store still completes the job as `status: 'fallback'` with the safe template and preserves the error string (`store.service.ts:5513-5530`) - the known DAPI 402 condition. Nothing on this page surfaces job status, so a user cannot see from here that their AI features are running on fallbacks.

## PRIVACY

This is the page that defines the privacy model, so the substantive question is which toggles actually round-trip into behaviour. The write path is uniform (every toggle hits the same PUT, `PrivacySettings.vue:68`, and the same `PrivacySetting` upsert, `relational-runtime.mapper.ts:178`), so the round-trip to the database is verified for all fourteen. The round-trip into **behaviour** is not uniform:

| flag | read by backend at | effect |
| --- | --- | --- |
| `defaultVisibility` | written `controllers.ts:1624`; **read by no mp write path** | none - `MoodCreate` hardcodes PRIVATE (`apps/mp/src/views/MoodCreate.vue:35`) |
| `allowAnonymousPublic` | **never read** (only the seed at `store.service.ts:724`, `:730` and the allowlist) | none |
| `allowHumanReplies` | `store.service.ts:1867-1872`, `:6081-6086` | real - blocks replies and the reply affordance |
| `allowMonthlyReportShare` | `monthly-report.service.ts:439` | real - poster generation throws `403` |
| `allowPeerMatching` | `store.service.ts:3007`, `:3707`, `:3799` | real |
| `allowAnonymousExperienceStats` | `store.service.ts:3726` | real - zeroes the derived counts |
| `allowRecoveryData` | `store.service.ts:3501`, `:4310`, `:4606`, `:4642`, `:4648`, `:4692` | real |
| `allowJourneyLongTermAnalysis` | `monthly-report.service.ts:312` | real - disables summary and advice |
| `allowLongTermMemory` | `store.service.ts:4714` | real - blocks memory creation |
| `allowAiMemoryUse` | `store.service.ts:4796` | real - blocks memory injection |
| `allowAnonymousExperienceShare` | `store.service.ts:3541`, `:3648`, `:4244` | real |
| `allowJourneyArchiveRetention` | `store.service.ts:4813` | real - blocks archiving a Journey |
| `allowFutureSelfNotifications` | `follow-up-worker.service.ts:32` | real - suppresses the notification only |
| `allowDataExport` | `store.service.ts:1653`, `:1719` | real - blocks both exports |

Twelve of fourteen have a real consumer. `allowAnonymousPublic` is inert, and `defaultVisibility` is stored and bulk-writable but not read by the client that would have to honour it.

Other privacy observations:

- The optimistic write is the right shape for a settings screen: `save` rolls back on failure and says 保存失败，已恢复原来的设置 (`PrivacySettings.vue:72-74`), so a failed toggle never leaves the UI lying about the server state.
- `clearCache` (`:87-112`) is a genuine device-side action: it clears `localStorage`, `sessionStorage`, Cache Storage and every IndexedDB database, and reports the counts it removed. It makes no API call and is not a fake. Its `deleteIndexedDatabase` helper resolves on `onerror` and `onblocked` (`:78-85`), so a blocked delete is reported as success in the count.
- `exportDiaries` reads `asset.url` **and** `asset.status === 'ready'` before offering the link (`:114-117`), and when the server returns no asset it tells the truth instead of faking a download: 已请求导出 N 条日记；当前服务尚未返回可下载文件 (`:131-133`). That is the honest-degradation pattern.

## ERROR_STATES

- Load failure: `loadError` = API message or 隐私设置加载失败，请稍后重试 (`PrivacySettings.vue:55-57`). The whole page is replaced by a minimal `privacy-loading` section showing the message plus a 重新加载 button (`:384-388`). This is the best error state in the group: it names the problem and offers the retry.
- Toggle failure: the optimistic value is reverted and `message` carries 保存失败，已恢复原来的设置 or the API text (`:72-74`).
- Clear-cache failure: `message` = error message or 部分本地缓存未能清理，请稍后重试 (`:108-110`).
- Export failure: `message` = error message or 导出请求失败，请稍后重试 (`:136-138`). With `allowDataExport` off this is the server's 请先在隐私设置中允许导出个人数据, which the user can act on from the very toggle below.
- Delete failure: `message` = error message or 删除数据失败，请稍后重试 (`:151-153`); the modal stays open so the user can retry.
- All of these render into the single `.privacy-status` line (`:357`), which carries `role="status" aria-live="polite"` but **no error styling**, so a failure is visually identical to 隐私设置已安全保存.

## EMPTY_STATES

Not applicable in the collection sense: the settings object always has all fourteen columns because `PrivacySettings` defaults every column (`prisma/schema.prisma:207-227`) and the store backfills missing keys on boot (`store.service.ts:2345-2364`). The `更多细分权限` disclosure is the only conditionally revealed content and it has no empty variant (`PrivacySettings.vue:337`).

## NATIVE_RISKS

- Safe area: `.privacy-page` pads `calc(132px + env(safe-area-inset-bottom))` (`PrivacySettings.vue:395`) and the route is a tab route (`App.vue:34`), so the tab bar clears. The modal and sheet rules below it repeat the inset (`:752`, `:1037`, `:1055`, `:1072`).
- Keyboard: no text input on the page, so no keyboard interaction. The two modals are `position: fixed` overlays (`:360`, `:372`) with `aria-modal="true"` but **no focus trap** and no `Escape` handler, so Android BACK or a tap outside is the only way out.
- Back button: no custom handling; BACK walks WebView history (`apps/mp/src/native/back-button.ts:30-36`).
- `clearCache` calls `indexedDB.deleteDatabase` and `caches.delete` (`PrivacySettings.vue:78-106`); on Android WebView these touch the app's own storage, not the system cache, and the `onblocked` path resolves silently.
- The export download uses a synthetic `<a download>` click (`:317-320`), which in the Capacitor WebView hands off to the system download manager; there is no in-app progress or completion feedback beyond the 已开始下载 label.
- No dial intent or clipboard use.

## ISSUES

- P1 PRIVACY: `allowAnonymousPublic` (匿名发布到广场) is a live toggle that writes a real column (`PrivacySettings.vue:216-222`, `relational-runtime.mapper.ts:178`) but **no backend code reads it** - the only occurrences in `apps/api/src` are the two seed rows (`store.service.ts:724`, `:730`) and the PUT allowlist (`controllers.ts:1625`). A user who turns it off to stop being publicly identifiable still gets a public post when they pick 匿名发布 from MoodCreate. Independently recorded in `docs/product-audit/pages/mp/Square.md` and `MoodCreate.md`.
- P1 PRIVACY: `defaultVisibility` is presented as 写下的情绪默认只对自己可见 (`PrivacySettings.vue:191`) and is written here, but the compose screen hardcodes `visibility: 'PRIVATE'` (`apps/mp/src/views/MoodCreate.vue:35`) and never reads the setting, so flipping it to PUBLIC changes nothing. The same column is also bulk-overwritten for every user by an operator config change (`controllers.ts:2947-2951`), so a choice made here can be silently reverted from the console.
- P2 UX: every outcome - success, validation failure, export refusal, delete failure - renders into the same `.privacy-status` line with `role="status"` and no error styling (`PrivacySettings.vue:357`). A destructive-action failure is indistinguishable from 隐私设置已安全保存 at a glance, on the page whose subject is trust.
- P2 SECURITY: `DELETE /api/v1/me/data` is irreversible and requires no confirmation token, no re-authentication and no privacy gate (`controllers.ts:1354-1362`), unlike the archive delete which demands `confirmation: 'DELETE_ARCHIVE'` (`:239-246`). The only guard is the client modal (`PrivacySettings.vue:372-380`).
- P2 STATE_MACHINE: a `403` on the export is presented as a generic failure message (`PrivacySettings.vue:136-138`) rather than being linked to the 允许导出我的数据 toggle that causes it, so the user has to work out that the fix is two rows below.
- P2 DATA: `allowFutureSelfNotifications` only suppresses the notification, not the delivery (`apps/api/src/follow-up-worker.service.ts:32-34`, `:58`). The label 到期时通过站内提醒告诉你 is accurate, but a user who reads it as "don't deliver" is wrong, and nothing on this page says the message still arrives.
- P3 DATA: the `clearCache` counter reports a database as cleared even when `onerror` or `onblocked` fired, because `deleteIndexedDatabase` resolves in all three branches (`PrivacySettings.vue:78-85`). The success message can overstate what happened.
- P3 UX: the two modals have `aria-modal="true"` but no focus trap and no `Escape` handler (`PrivacySettings.vue:360`, `:372`), so keyboard and TalkBack users are not contained by them.
- P3 TEST_CONTRACT: the four `更多细分权限` toggles render an empty accessible name in the runtime sweep (`artifacts/post-recovery/control-coverage.json` records `name: ""` for `toggle-privacy-ai-memory-use`, `toggle-privacy-experience-share`, `toggle-privacy-future-notifications`, `toggle-privacy-journey-archive` and `toggle-privacy-export`) because those buttons carry no `aria-label` and their text sits in child spans.
- P3 DUPLICATE: `artifacts/product-audit/api-endpoints.json` shows three read aliases for the same handler - `/api/v1/settings/privacy`, `/api/v1/me/privacy`, `/api/v1/privacy-settings` (`controllers.ts:1604`, `:1611`, `:1616`) - plus a `PATCH` twin for each (`:1654`, `:1660`, `:1665`).

## FINAL_STATUS

PARTIAL - all fourteen toggles, the single PUT, the export and the delete are traced to lines, the per-flag round-trip into behaviour is established by grepping every consumer in `apps/api/src`, and the runtime sweep clicked 16 controls with 12 of the 14 toggles reporting "changed", but the two inert flags were not proven inert at runtime and the export download was not completed on the device in this pass.

### Static evidence

- Controls discovered: 49
- API reads (static): `/api/v1/settings/privacy`
- API writes (static): `DELETE /api/v1/me/data`, `POST /api/v1/diaries/export`, `PUT /api/v1/settings/privacy`
- Candidate fake markers: 2
- Appended: both fake-marker candidates (`localStorage.` at lines 92 and 93) are inside `clearCache()`, a genuine device-side cache purge that makes no server call, adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` (M20).
- Appended: runtime cross-check `artifacts/recovery/android-route-manifest.json` - `/pages/settings/privacy` rendered=true, textLength 392, hasTestIds=23, 23 visible controls, 0 console errors, 0 failed requests. `artifacts/post-recovery/control-coverage.json` records 23 controls, state `default`, 16 clicked with result "changed", 5 skipped as destructive.
- Appended: group-C round-trip requirement - the toggle-to-behaviour table above was built by searching each of the fourteen flag names across `apps/api/src` and excluding the seed defaults, the mapper and the PUT allowlist; twelve flags have at least one live consumer and two (`allowAnonymousPublic`, `defaultVisibility`) have none.