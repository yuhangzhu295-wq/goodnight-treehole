# REPORT HISTORY VERIFICATION

ISSUE-020, the report half. The hug half was closed earlier (`260030b`).

## The defect

A report overwrote the conversation's single set of report columns
(`reportedAt` / `reporterUserId` / `reportReason`) and bumped
`PeerExperience.reportCount` with a bare `+= 1`. Two consequences:

- A second report destroyed the first one's reason and reporter. There was no history at all.
- The counter could drift from the reports it was supposed to summarise, and it fed peer matching,
  which drops an experience's safety score once it has any report
  (`store.service.ts`, `experience.reportCount === 0 ? 1 : 0.2`).

## The model

`PeerReport` — one row per report:

| Field | Purpose |
| --- | --- |
| `id` | |
| `conversationId` | the target; FK, cascade on delete |
| `experienceId` | the experience behind the conversation, so the counter and the admin list can be derived from history; FK, set null |
| `matchId` | the id the report route is keyed by |
| `reporterUserId` | who reported; FK to User |
| `reason` | what they said |
| `status` | `open` / `handled` |
| `handledAt`, `handledBy`, `note` | the operator's handling |
| `createdAt` | |

Indexes on `(conversationId, createdAt)`, `(experienceId, status)`, `(status, createdAt)`,
`(reporterUserId, createdAt)`.

The three conversation columns are kept, but only as a **pointer to the most recent report** so the
conversation list can show current state without a join. The schema comment says so explicitly, and
`PeerReport` is the record of what was reported.

## The rules, and why

| Rule | Behaviour | Reason |
| --- | --- | --- |
| Same reporter, same conversation, report still open | updates that report, does not add a row | re-submitting while a report is open is the same signal, not a new one |
| Same reporter, same conversation, previous report handled | creates a new row | a fresh report after the earlier one was dealt with is a genuinely new signal |
| Different reporters, same conversation | independent rows, always | one user's report must never overwrite another's |
| Counter | recomputed from history, never incremented | a bare `+= 1` is what let it drift |

`syncPeerReportCounts()` sets each experience's `reportCount` to the number of report rows for it.
Every report counts whatever its status, which is the semantic the increment had — so matching
behaviour is unchanged while the value can no longer diverge from the rows.

**Not a DB-level unique constraint, deliberately.** The invariant "one open report per
(conversation, reporter)" would need a *partial* unique index, which Prisma cannot express. Adding
one anyway would recreate the schema/database drift this round just eliminated. The invariant is
enforced in the store instead, where the check and the mutation happen synchronously within one
request, so it is atomic under Node's single-threaded execution.

## Operator surface

- `GET /api/admin/v1/peer-reports` — `q`, `status`, `page`, `pageSize`; each row carries the reporter,
  reason, status, times, the conversation and the experience title.
- `PATCH /api/admin/v1/peer-reports/:id/handle` — `{status, note}`, audited as `PEER_REPORT_HANDLE`,
  with the audit row and the state change committed in one flush.
- Admin page 举报处理 at `/experience/peer-reports`, reachable from the sidebar, with a 待处理 / 已处理
  filter and 标记为已处理 / 重新打开 actions.

## Privacy

The reporter identity and the reason are exposed **only** on the admin route, behind
`AdminAuthGuard`. The user-facing conversation projection is unchanged and carries neither
`reportReason` nor `reporterUserId`. This is asserted in both directions.

## Verification

`work/verify-peer-report-history.mjs` — **24/24**, driven through the real two-user flow (privacy
consent → published experiences → match → request → connect → consent → conversation → report):

| Check | Result |
| --- | --- |
| user A can file a report | 201 |
| the user-facing response leaks neither reporter nor reason | keys are `id, matchId, status, startsAt, consentAcceptedAt, expiresAt, createdAt, messages` |
| the other participant can report the same conversation | 201 |
| two independent report rows exist (no overwrite) | rows=2 |
| each row keeps its own reporter | `user_demo,user_guest` |
| each row keeps its own reason | both reasons present and distinct |
| both rows start open | `open,open` |
| the experience counter is derived from the history | `reportCount=2 historyRows=2` |
| admin sees both reports as separate rows | rows=2 |
| admin rows carry reporter, reason, time and status | yes, plus the experience title |
| admin can close one report | 200 |
| the closed report is handled and the other is untouched | `A=handled B=open rows=2` |
| closing a report writes an audit row | `PEER_REPORT_HANDLE` present |
| a new report after the previous one was closed creates a new row | rows=3, A has 2 |
| reporting again while a report is still open does not duplicate it | rows stays 3 |
| the derived counter follows the history | matches |
| the conversation keeps a pointer to the latest report | latest reporter is A |
| the report list requires admin auth | 401 |
| handling a report requires admin auth | 401 |
| an invalid status is rejected | 400 |
| an unknown report is rejected | 404 |
| the report is not exposed through the user conversation API | no leak |

**Restart persistence.** The API was restarted and the history compared against the database: all 6
report rows came back with their individual statuses (`handled→handled`, `open→open`), 2 handled and
4 open, and the admin API served all 6. The store reloads the history from PostgreSQL, so a restart
does not lose it.

**In the browser** (`work/verify-admin-rc-ui.mjs`, 16/16): the queue is reachable from the sidebar,
the table renders reporter/reason/state, the drawer shows reason/time/reporter, 标记为已处理 writes
through the API, the row leaves the 待处理 list and appears under 已处理.

**On the native Android app** (`work/verify-android-rc.mjs`, 12/12): the safety sheet opens from the
real conversation page, submitting creates a `PeerReport` row
(`id=peer_report_4a2e54de62 status=open reporter=user_demo`), and the report is added to the
conversation's history rather than replacing it.

## Residual

There is no per-report *audit* beyond `createdAt`/`handledAt`/`handledBy` — a report is not an
append-only log of edits, and a retracted report is not a state the model has. If operators later need
"who changed this report and when", that is a separate change.
