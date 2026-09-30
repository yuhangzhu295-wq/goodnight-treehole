# admin: settings (系统设置)

Route: `/ops/config`
Component: `apps/admin/src/views/ConfigPage.vue`
Group: 系统

## PURPOSE

The runtime configuration form. It groups 19 named settings into five cards (基础设置 / 内容审核设置 / AI 调用策略 / 隐私与数据 / 通知与告警), reads their current values from the server, submits only the changed fields, and re-reads the result. Dedicated view, not `TablePage.vue` (`apps/admin/src/router.ts:112`).

## USER_JOB

"Change how the product behaves — review strictness, AI fallback, retention — and trust that the change is actually in effect."

## ENTRY

- Sidebar `data-testid=admin-nav-config` (`apps/admin/src/views/Layout.vue:77`), in `primaryPaths` (`Layout.vue:26-36`).
- No other route pushes to `/ops/config`.

## EXIT

No exit control; the operator leaves via the sidebar. There is no navigation after save — `save()` reloads the same page (`ConfigPage.vue:160-162`).

## ROUTES

`/ops/config` — `artifacts/product-audit/admin-routes.json` entry `{ path: "/ops/config", component: "ConfigPage.vue", title: "系统设置", resource: "settings", viaTablePage: false, group: "系统" }`; declared `apps/admin/src/router.ts:112`. No aliases, no query parameters.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| busy (disables every field) | `busy` | `ConfigPage.vue:16`, `:220`, `:263-264` |
| status line (**visually hidden**) | `status` (ref 正在读取系统设置…) | `ConfigPage.vue:15`, `:188`, `:281-292` |
| loaded form | `form` | `ConfigPage.vue:13`, `:142` |
| pristine baseline | `original` | `ConfigPage.vue:14`, `:143` |
| dirty detection | `changedValues` / `hasChanges` | `ConfigPage.vue:113-116` |
| save-bar copy | `hasChanges` | `ConfigPage.vue:259` |

There is no per-field validation state and no error state — see ERROR_STATES.

## CONTROLS

| control | handler | real effect |
| --- | --- | --- |
| 19 field inputs `data-testid=admin-config-field-<key>` | `v-model="form[key]"` (`ConfigPage.vue:214-251`) | local state only; the widget type is chosen per key (checkbox for `booleanKeys` `:93-103`, number for `numberKeys` `:105-111`, a `PRIVATE/PUBLIC` select for `defaultVisibility` `:223-232`, `time`/`email`/`text` otherwise `:250`) |
| 恢复已读取值 `data-testid=admin-config-reset` | `reset` (`ConfigPage.vue:263`) | copies `original` back into `form` and sets the status string (`:170-173`); **purely local**, no request |
| 保存设置 `data-testid=admin-config-save` | `save` (`ConfigPage.vue:264`) | `PUT /api/admin/v1/system/settings` with only `changedValues`, then `load()` (`:152-168`); short-circuits with 没有需要保存的改动 when nothing changed (`:153-156`) |

Field list, in the order the five groups declare them (`ConfigPage.vue:18-49`): 基础设置 `appName, appShortName, defaultVisibility, defaultPageSize`; 内容审核设置 `highRiskBlockEnabled, allowHumanRepliesDefault, manualReviewThreshold`; AI 调用策略 `cloudModelBackup, aiTimeoutSeconds, aiFailoverEnabled, aiRetryCount`; 隐私与数据 `sensitiveContentEncrypted, allowMonthlyReportShare, scheduledCacheCleanup, logRetentionDays`; 通知与告警 `abnormalNotifyEnabled, notifyEmail, dailyDigestEnabled, dailyDigestTime`.

`artifacts/product-audit/control-manifest.json` lists 8 entries for `ConfigPage.vue`: 2 clicks plus 6 `data-testid` markers (four of which are the shared field-expression marker).

## API_READS

| endpoint | call site | handler |
| --- | --- | --- |
| `GET /api/admin/v1/system/settings` | `ConfigPage.vue:141` | `AdminController.settings` — `apps/api/src/controllers.ts:2912-2922`, returning `{items:[{key,value,description,updatedAt}]}` built from `configObject()` |

`configObject()` (`controllers.ts:2905-2910`) merges `CONFIG_DEFAULTS` (`controllers.ts:99-120`, 20 keys including `localModelFirst`) with the persisted `SystemSetting` rows. The page maps the array into `{key: value}` (`ConfigPage.vue:142`).

## API_WRITES

| endpoint | call site | handler |
| --- | --- | --- |
| `PUT /api/admin/v1/system/settings` with the changed subset | `ConfigPage.vue:160` | `AdminController.updateSettings` — `apps/api/src/controllers.ts:2934-2963` |

`updateSettings` is a real, guarded write: it rejects `localModelFirst: true` with `BadRequestException('本地模型已被 DAPI-only 运行策略永久禁用。')` (`controllers.ts:2938-2940`), upserts each key into `store.systemSettings` with `updatedBy`/`updatedAt` (`:2941-2947`), propagates `defaultVisibility` to **every** user's `privacySettings` (`:2948-2952`), calls `enforceRemoteAiProviderPolicy()` (`:2957`), writes an `AuditLog` `SYSTEM_SETTINGS_UPDATE` with full before/after snapshots (`:2959`), and persists. The value really lands in PostgreSQL.

Note the UI's error handling on the reject path: `save()` catches and writes the message to `status`, which is visually hidden (`ConfigPage.vue:281-292`), so the operator is told nothing when the server refuses.

## DB_ENTITIES

- Read: **SystemSetting**.
- Written: **SystemSetting** (one row per changed key), **PrivacySetting** (every user's `defaultVisibility` when that key changes), **AuditLog** (`SYSTEM_SETTINGS_UPDATE`), **AdminUser** (guard).

Schema: `SystemSetting` `prisma/schema.prisma:229-236` (`key @unique`, `value Json`, `description`, `updatedBy`, `updatedAt`), `PrivacySetting.defaultVisibility` `:211`, `AuditLog` `:1057-1072`. Matches the agent-4 table (AdminUser, AuditLog, PrivacySetting, SystemSetting).

## ADMIN_VISIBILITY

This page is the admin surface for configuration. `GET /api/admin/v1/system/settings` (`controllers.ts:2912`) is **unguarded** (`artifacts/product-audit/admin-unguarded.json`), so the current configuration — including `notifyEmail` and the AI routing flags — is readable without a token. The write `PUT /system/settings` ``(:2934) is guarded and, together with `PATCH /users/:id/status`, is one of the two endpoints the `ISSUE-001` live proof confirmed answers `401`. The alias routes `GET/PATCH /settings` (`:2924`, `:2965`), `GET/PATCH /config` (`:2929`, `:2970`) and `POST /config/reset` (`:2976`) are unguarded or duplicate.

## AI_USAGE

The AI 调用策略 card claims to control AI behaviour and does not. Its own description reads 保存后由真实路由读取，用于 DAPI、远程备用与失败处理 (`ConfigPage.vue:34`), and the hints say `aiTimeoutSeconds` is 单次模型调用最长等待时间, `aiFailoverEnabled` is 调用失败时切换下一个可用模型 and `aiRetryCount` is 失败后的额外尝试次数 (`ConfigPage.vue:79-82`). In the backend, model calls take their timeout from the **provider row**, not from the setting: `timeoutMs: Math.max(provider.timeoutSeconds, 30) * 1000` (`apps/api/src/store.service.ts:2130`, `:5422`, with `AIProvider.timeoutSeconds` defaulting to 30 at `apps/api/src/remote-ai-provider.service.ts:67`, `:90`). No reader of `aiTimeoutSeconds`, `aiFailoverEnabled`, `aiRetryCount` or `cloudModelBackup` exists anywhere in `apps/api/src`. This is the AI half of `ISSUE-003`.

## PRIVACY

- `defaultVisibility` is the one privacy-relevant key that genuinely propagates: `updateSettings` rewrites every user's `PrivacySetting.defaultVisibility` (`controllers.ts:2948-2952`). That is a system-wide privacy change applied from a single form with no confirmation and no count of affected users.
- `allowMonthlyReportShare` exists both as this system key and as a per-user `PrivacySetting` field (`prisma/schema.prisma:214`); only the **per-user** field is read, by `monthly-report.service.ts:439`. The system-level toggle therefore has no effect — a genuine privacy-shaped control that does nothing.
- `logRetentionDays`, `sensitiveContentEncrypted` and `scheduledCacheCleanup` are never read (see ISSUES), so the page's 隐私与数据 card overstates the product's data handling.
- `notifyEmail` is stored in plain text in `SystemSetting.value` and is readable through the unguarded GET.

## ERROR_STATES

No usable error state. `load()` catches and writes `error?.message ?? '设置加载失败'` (`ConfigPage.vue:145-146`); `save()` writes `error?.message ?? '保存失败'` (`:163-164`). The only render site is `<p class="config-status muted" role="status" aria-live="polite">` (`:188`), and `.config-status` is clipped to a 1×1 box at **every** width (`ConfigPage.vue:281-292`). A failed load leaves the previous form on screen; a rejected save (for example the `localModelFirst` `BadRequestException`) leaves the form dirty with no explanation. This is a finding.

There is also no client-side validation despite the widgets declaring bounds: `manualReviewThreshold` gets `min=0 max=1 step=0.01` and the number fields get `min=0` (`ConfigPage.vue:239-242`, `:130-136`), but nothing blocks a save that violates them and the server performs no range check on any key (`controllers.ts:2941-2947`).

## EMPTY_STATES

Not applicable in the table sense, but the equivalent case is unhandled: if `GET /system/settings` returns an empty `items` array, `form` becomes `{}` (`ConfigPage.vue:142`) and all 19 inputs render blank with no indication that the defaults were not loaded. The save bar would then report 当前设置已与服务端一致 (`:259`) while showing empty values.

## NATIVE_RISKS

None. Desktop console: no safe-area insets, no Android back-button handling, no keyboard/dial/clipboard, no camera.

## ISSUES

- **P1 FAKE_FUNCTION (ISSUE-003)** — 15 of the 19 controls are write-only. Verified by searching every consumer in `apps/api/src`: `appShortName`, `defaultPageSize`, `highRiskBlockEnabled`, `manualReviewThreshold`, `cloudModelBackup`, `aiTimeoutSeconds`, `aiFailoverEnabled`, `aiRetryCount`, `logRetentionDays`, `sensitiveContentEncrypted`, `scheduledCacheCleanup`, `abnormalNotifyEnabled`, `notifyEmail`, `dailyDigestEnabled`, `dailyDigestTime` appear only in `CONFIG_DEFAULTS` (`controllers.ts:99-120`), the seed (`store.service.ts:894-916`) and the admin views — never in a branch. Only `allowHumanRepliesDefault` (`store.service.ts:1867`, `:6081`), `defaultVisibility` (`controllers.ts:2948-2952`) and the per-user `allowMonthlyReportShare` (`monthly-report.service.ts:439`) change behaviour. The card copy 保存后由真实路由读取 (`ConfigPage.vue:34`) and the hints at `ConfigPage.vue:76-90` assert effects that do not exist.
- **P1 SECURITY (ISSUE-001)** — `GET /api/admin/v1/system/settings` is unguarded (`controllers.ts:2912`), exposing the current configuration including `notifyEmail`. `PUT /system/settings` is guarded and correctly answers `401`.
- **P2 SECURITY** — `defaultVisibility` writes to every user's `PrivacySetting` from one unconfirmed control (`controllers.ts:2948-2952`) and the form gives no warning or affected-user count.
- **P2 UX** — no visible error state at any width; both failure paths write to a 1×1 clipped element (`ConfigPage.vue:281-292`).
- **P2 UX** — the widgets advertise `min`/`max`/`step` (`ConfigPage.vue:130-136`, `:239-242`) but neither the client nor `updateSettings` enforces a range, so out-of-range values persist silently.
- **P3 UX** — 恢复已读取值 is local-only and is disabled unless `hasChanges` (`ConfigPage.vue:263`), so it cannot be used to re-pull the server state after a partial failure.
- **P3 DUPLICATE** — `GET /settings` (`controllers.ts:2924`), `PATCH /settings` (`:2965`), `GET /config` (`:2929`), `PATCH /config` (`:2970`) and `POST /config/reset` (`:2976`) are alias routes; the last three have no caller and `POST /config/reset` in particular would reset every key to `CONFIG_DEFAULTS` with no UI affordance (`ISSUE-014`).

## FINAL_STATUS

PARTIAL — the read, the guarded write and the audit trail are real and the values really persist to `SystemSetting`, but the majority of the form is a fake capability (`ISSUE-003`), the read endpoint is unguarded, and the page has no working error feedback.

### Static evidence

- Controls discovered in component: 8
- API reads (static): `GET /api/admin/v1/system/settings`
- API writes (static): `PUT /api/admin/v1/system/settings`
- Candidate fake markers in `artifacts/product-audit/fake-markers.json` for `ConfigPage.vue`: 0; the P1 finding is recorded separately as row A25 in `docs/product-audit/discovery-agent5-fake-candidates.md` ("15 of them are never read by any backend logic"), which is the same count reached here by an independent grep of `apps/api/src`.
- Appended: `artifacts/product-audit/admin-unguarded.json` lists `GET system/settings` (L2912), `GET settings` (L2924), `GET config` (L2929), `PATCH settings` (L2965), `PATCH config` (L2970) and `POST config/reset` (L2976) as unguarded; the `PUT system/settings` guard is the one the `ISSUE-001` live proof verified returns 401 without a token.
