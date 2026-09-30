# admin: audit (审计日志)

Route: `/audit-logs`
Component: `apps/admin/src/views/AuditLogsPage.vue`
Group: 系统

## PURPOSE

The read-only audit trail. It lists the `AuditLog` rows the API writes for every admin mutation — actor, action code, target, a derived summary and the result — and opens a drawer showing the full before/after JSON of the change. Dedicated view, not `TablePage.vue` (`apps/admin/src/router.ts:113`).

## USER_JOB

"Prove who changed what, and show me the before and after of a specific change."

## ENTRY

- Sidebar `data-testid=admin-nav-audit` (`apps/admin/src/views/Layout.vue:78`). It is *not* in `primaryPaths` (`Layout.vue:26-36`), so it lives behind the 更多管理 disclosure (`Layout.vue:130-151`) and the disclosure auto-opens when the route is active (`Layout.vue:130`).
- No other route pushes to `/audit-logs`.

## EXIT

None. The page has no outbound navigation; the operator leaves via the sidebar. Opening a row is not a route change — the detail is an in-page drawer (`AuditLogsPage.vue:49`).

## ROUTES

`/audit-logs` — `artifacts/product-audit/admin-routes.json` entry `{ path: "/audit-logs", component: "AuditLogsPage.vue", title: "审计日志", resource: "audit", viaTablePage: false, group: "系统" }`; declared `apps/admin/src/router.ts:113`. No aliases, no query parameters, no pagination in the URL.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| status line | `status` (ref 正在读取审计日志…) | `AuditLogsPage.vue:9`, `:40` |
| populated table | `items` | `AuditLogsPage.vue:8`, `:44` |
| detail drawer | `detailOpen` + `selected` | `AuditLogsPage.vue:11`, `:49` |

There is **no busy state**: `load()` has no `busy` ref and the table carries no `aria-busy` (`AuditLogsPage.vue:24-32`, `:42`). There is no filter, no search, no pagination control and no sorting — the endpoint's `page`/`pageSize` are hard-coded to 1/100 (`:26`).

## CONTROLS

| control | handler | real effect |
| --- | --- | --- |
| 刷新日志 `data-testid=admin-audit-refresh` | `load` (`AuditLogsPage.vue:39`) | re-issues `GET /api/admin/v1/audit-logs?page=1&pageSize=100` (`:26`) |
| row click | `open(item)` (`AuditLogsPage.vue:44`) | sets `selectedId` and opens the drawer (`:23`) |
| drawer × | `detailOpen = false` (`:49`) | closes |
| mask click | `detailOpen = false` (`:49`) | closes |

That is the whole surface: `artifacts/product-audit/control-manifest.json` lists 5 entries for `AuditLogsPage.vue` (2 row/mask closes plus the refresh click, the refresh testid, and the row click), matching the 5 clicks found in the template.

Two read-only derivations are rendered but are not controls: `summary(item)` builds a change summary from the first three non-id keys of `afterJson` (`AuditLogsPage.vue:16-21`) and `result(item)` labels anything whose action contains `DELETE` as 已删除 and everything else as 成功 (`:15`).

## API_READS

| endpoint | call site | handler |
| --- | --- | --- |
| `GET /api/admin/v1/audit-logs?page=1&pageSize=100` | `AuditLogsPage.vue:26` | `AdminController.auditLogs` — `apps/api/src/controllers.ts:2981-2984`, which is a bare `this.list(this.store.auditLogs, page, pageSize)` |

`this.list` clamps `pageSize` to 100 and returns `{items,page,pageSize,total,totalPages}` (`controllers.ts:1765-1772`). The view reads only `result.items` (`AuditLogsPage.vue:27`) and discards `total`, so with more than 100 audit rows the page silently shows the newest 100 with no indication that older entries exist.

## API_WRITES

None from this page. It is the only admin view that performs no mutation at all — the 5 controls are one read and four open/close toggles. This is a pure consumer of the `AuditLog` rows other handlers produce.

## DB_ENTITIES

- Read: **AuditLog**.
- Written: none (indirectly, `AdminUser` is touched only if a guard ran, and this handler has no guard).

Schema: `AuditLog` `prisma/schema.prisma:1057-1072` — `adminUserId`, `action`, `resourceType`, `resourceId`, `beforeJson Json?`, `afterJson Json?`, `ip`, `userAgent`, `createdAt`, with indexes on `[adminUserId, createdAt]` and `[resourceType, resourceId]`. Matches the agent-4 table (AuditLog only).

Rows are written by `StoreService.audit` (`apps/api/src/store.service.ts:2199-2220`), which deep-clones `beforeJson`/`afterJson` and hard-codes `ip: '127.0.0.1'` and `userAgent: 'local-dev'` (`:2216-2217`). Every admin mutation traced in this audit set writes through it: `USER_STATUS`/`USER_NOTE` (`controllers.ts:2116`, `:2133`), `POST_<ACTION>` (`store.service.ts:6121`), `REPLY_<ACTION>` (`:6135`), `FEEDBACK_REPLY`/`FEEDBACK_STATUS` (`:1589`, `:1617`), `SYSTEM_SETTINGS_UPDATE` (`controllers.ts:2959`), plus `LOGIN` (`store.service.ts:2182`).

## ADMIN_VISIBILITY

This is the admin audit surface, and it is the least protected thing in the admin app: `GET /api/admin/v1/audit-logs` (`controllers.ts:2981`) is **unguarded** and the `ISSUE-001` live proof confirms `GET /api/admin/v1/audit-logs` returns `200` with admin audit records and no `authorization` header. Because the audit rows embed full `beforeJson`/`afterJson` snapshots of users, settings and content, an unauthenticated caller can read the change history of the whole product.

## AI_USAGE

None directly. The page never creates or reads an `AIJob`; it only displays whatever audit actions exist. `POST_APPROVE` and `REPLY_BLOCK` rows can be AI-reply moderation, but the row does not say whether the reply was AI- or human-authored, so the audit trail cannot distinguish an operator editing an AI reply from one editing a user's.

## PRIVACY

- `beforeJson`/`afterJson` are rendered in full with `JSON.stringify(value, null, 2)` (`AuditLogsPage.vue:22`, `:49`), so a `USER_NOTE` row exposes the internal operations note verbatim, a `USER_STATUS` row exposes the user's whole record, and a `SYSTEM_SETTINGS_UPDATE` row exposes the previous and new configuration including `notifyEmail`.
- The audit rows do not record real request provenance: `ip` and `userAgent` are constants (`store.service.ts:2216-2217`), so the trail cannot answer "from where". The table does not render them at all; only the `TablePage` variant of the audit columns does.
- Combined with the missing guard, the most sensitive aggregated view in the admin app is publicly readable.

## ERROR_STATES

Present and visible — the one admin view in this set whose error path actually renders. `load()` catches and writes `error?.message ?? '审计日志加载失败'` into `status` (`AuditLogsPage.vue:29-31`), rendered as `<p class="panel muted" role="status">` above the table (`:40`). Weaknesses: the element uses the `muted` class rather than `danger`, so a failure looks like ordinary body text; and because `items` is not cleared on failure, a failed reload leaves the previous rows on screen underneath the error line.

## EMPTY_STATES

Yes: `<tr v-if="!items.length"><td colspan="6" class="empty-cell">暂无审计日志</td></tr>` (`AuditLogsPage.vue:45`). Correctly scoped and the only empty-state text on the page.

## NATIVE_RISKS

None. Desktop console: no safe-area insets, no Android back-button handling, no keyboard/dial/clipboard/camera. No images or external assets.

## ISSUES

- **P1 SECURITY (ISSUE-001)** — `GET /api/admin/v1/audit-logs` has no token guard (`controllers.ts:2981`) and was proven live to return `200` with admin audit records. The unauthenticated reader gets the full before/after snapshots of every admin mutation.
- **P2 PRIVACY** — the drawer renders `beforeJson`/`afterJson` verbatim (`AuditLogsPage.vue:49`), so internal user notes (`USER_NOTE`, `controllers.ts:2132-2133`) and the previous configuration (`SYSTEM_SETTINGS_UPDATE`, `controllers.ts:2959`) are displayed in full with no redaction.
- **P2 DATA** — the audit trail cannot support an investigation: `ip` and `userAgent` are hard-coded to `127.0.0.1` / `local-dev` (`store.service.ts:2216-2217`) and neither is rendered here.
- **P2 UX** — no pagination despite `pageSize` being clamped at 100 (`controllers.ts:1767`); the view discards `total` (`AuditLogsPage.vue:27`), so entries beyond the newest 100 are unreachable and invisible. There is also no filter or search, which is the primary job of an audit screen.
- **P2 UX** — `result(item)` (`AuditLogsPage.vue:15`) labels every row 成功 or 已删除 by string-matching the action name, so it reports a fabricated success outcome for an action that may have thrown after writing the log; and it never shows a failure result.
- **P3 UX** — `summary(item)` (`AuditLogsPage.vue:16-21`) shows at most the first three non-id keys of `afterJson`, so distinct changes can display identically.
- **P3 UX** — no busy state and no `aria-busy` (`AuditLogsPage.vue:24-32`, `:42`), so the refresh button gives no feedback.

## FINAL_STATUS

PARTIAL — the read is real, the empty and error states exist, and the rows are genuinely produced by `store.audit()`; but the endpoint is unguarded, the rendered result/summary are derived rather than recorded, and the absence of pagination or filtering makes it unusable as an audit tool beyond 100 rows.

### Static evidence

- Controls discovered in component: 5
- API reads (static): `GET /api/admin/v1/audit-logs`
- API writes (static): none
- Candidate fake markers in `artifacts/product-audit/fake-markers.json` for `AuditLogsPage.vue`: 0.
- Appended: the page's own column set (管理员 / 操作类型 / 操作对象 / 操作摘要 / 结果 / 操作时间, `AuditLogsPage.vue:43`) differs from the `TablePage` audit columns (`apps/admin/src/views/TablePage.vue:309-315`), and `/audit-logs` is excluded from `TablePage` entirely by the router filter (`apps/admin/src/router.ts:114`), so the two never render the same audit view.
