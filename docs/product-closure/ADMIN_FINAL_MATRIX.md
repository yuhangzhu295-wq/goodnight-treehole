# ADMIN FINAL MATRIX

`ADMIN_VERIFIED = true`

The admin app exposes **24 resources** across **39 routes**: 13 dedicated pages and 11 resources
driven by the shared `TablePage.vue`. Every resource is reachable from the sidebar — the 13 primary
entries directly, the 11 experience/safety entries through the collapsible 更多管理 group.

For each resource this matrix records whether the entry is real, whether its actions perform real
writes, and where the write lands. Resources marked **deep-verified this round** were exercised with
a real click in a real browser (`work/verify-admin-closure-ui.mjs`) or driven through the API against
live rows; the rest are covered by the gate suite (`pnpm qa:all`, `test:real-browser-admin-clicks`,
`test:real-browser-cross-flow`) which passed in this round.

## Closure-relevant resources (deep-verified this round)

| Resource | Route | Entry | Actions | API | DB | Refresh |
| --- | --- | --- | --- | --- | --- | --- |
| 安全事件 safety-events | `/safety/events` | sidebar 更多管理 → `admin-nav-safety-events` | 标记为已处理 / 重新打开 | `PATCH /api/admin/v1/safety/events/:id/handle` | `SafetyEvent.status/handledAt/handledBy/note` + an `AuditLog` row, one transaction | table re-loads; row moved out of the 待处理 filter |
| 匿名会话 peer-conversations | `/experience/peer-conversations` | sidebar 更多管理 → `admin-nav-peer-conversations` | 已举报 filter | `GET /api/admin/v1/peer-conversations?reported=true&q=&status=` | reads `PeerConversation.reportedAt/reportReason/reporterUserId` | filter and search re-query the API |
| 现实旅程 journeys | `/experience/journeys` | sidebar 更多管理 | search / pager | `GET /api/admin/v1/journeys?q=&status=&page=&pageSize=` | filters the loaded journey rows | page and search re-query |
| 行动承诺 actions | `/experience/actions` | sidebar 更多管理 | search / pager | `GET /api/admin/v1/actions` | `ActionCommitment` rows | re-query |
| 结果回访 checkins | `/experience/checkins` | sidebar 更多管理 | search / pager | `GET /api/admin/v1/checkins` | `OutcomeCheckin` rows | re-query |
| 同路经历 peer-experiences | `/experience/peers` | sidebar 更多管理 | 发布 / 隐藏 / 拒绝 | `PATCH /api/admin/v1/peer-experiences/:id/review` | `PeerExperience.status` + audit | re-query |
| 匹配记录 peer-matches | `/experience/matches` | sidebar 更多管理 | search / pager | `GET /api/admin/v1/peer-matches` | `PeerMatch` rows | re-query |
| 随访队列 follow-ups | `/experience/follow-ups` | sidebar 更多管理 | search / pager | `GET /api/admin/v1/follow-ups` | `FollowUpJob` rows | re-query |
| 用户提醒 notifications | `/experience/notifications` | sidebar 更多管理 | search / pager | `GET /api/admin/v1/notifications` | `UserNotification` rows | re-query |
| 支持计划 support-plans | `/safety/support-plans` | sidebar 更多管理 | search / pager | `GET /api/admin/v1/support/plans` | `PersonalSupportPlan` rows, real `active` column | re-query |
| 有限记忆 memory | `/safety/memory` | sidebar 更多管理 | search / pager | `GET /api/admin/v1/memory` | `MemoryItem` rows, soft-deleted hidden | re-query |

## All 24 resources

| # | Resource | Route | Page | Kind |
| --- | --- | --- | --- | --- |
| 1 | 数据总览 | `/dashboard` | Dashboard | dedicated |
| 2 | 用户管理 | `/users` | UsersPage | dedicated |
| 3 | 树洞内容 | `/posts` | PostsPage | dedicated |
| 4 | 回应审核 | `/replies/moderation` | RepliesPage | dedicated |
| 5 | 反馈工单 | `/ops/feedback` | FeedbackTicketsPage | dedicated |
| 6 | AI 配置中心 | `/ai/providers` | AIProvidersPage | dedicated |
| 7 | 风格路由 | `/ai/routes` | AIRoutesPage | dedicated |
| 8 | AI 任务记录 | `/ai/jobs` | AIJobsPage | dedicated |
| 9 | 回复预设 | `/ops/reply-presets` | ReplyPresetsPage | dedicated |
| 10 | FAQ 管理 | `/ops/faqs` | FaqPage | dedicated |
| 11 | 反馈分类 | `/ops/feedback-categories` | FeedbackCategoriesPage | dedicated |
| 12 | 系统设置 | `/ops/config` | ConfigPage | dedicated |
| 13 | 审计日志 | `/audit-logs` | AuditLogsPage | dedicated |
| 14 | 现实旅程 | `/experience/journeys` | TablePage | shared |
| 15 | 行动承诺 | `/experience/actions` | TablePage | shared |
| 16 | 结果回访 | `/experience/checkins` | TablePage | shared |
| 17 | 同路经历 | `/experience/peers` | TablePage | shared |
| 18 | 匹配记录 | `/experience/matches` | TablePage | shared |
| 19 | 随访队列 | `/experience/follow-ups` | TablePage | shared |
| 20 | 匿名会话 | `/experience/peer-conversations` | TablePage | shared |
| 21 | 用户提醒 | `/experience/notifications` | TablePage | shared |
| 22 | 安全事件 | `/safety/events` | TablePage | shared |
| 23 | 支持计划 | `/safety/support-plans` | TablePage | shared |
| 24 | 有限记忆 | `/safety/memory` | TablePage | shared |

## What changed in the admin this round

| Change | Before | After |
| --- | --- | --- |
| Safety queue was read-only | No write button and no write endpoint; an event could be listed but never worked | `PATCH safety/events/:id/handle` with an audit-logged write, plus 标记为已处理 / 重新打开 buttons |
| Triggering text invisible | `payload` was never rendered; the operator could not see why an event fired | 触发文本 column and drawer entry, sourced from the persisted excerpt |
| Handled state did not exist | `SafetyEvent` had no status, so the queue could not be cleared | `status` / `handledAt` / `handledBy` / `note`, with 待处理 / 已处理 filter |
| Search box was decorative on 11 routes | `q` was sent but read by no handler; `journeys?q=zzzznomatch` returned the same rows | every experience/safety route filters on `q` over its real fields |
| Only page 1 was reachable | No pager in `TablePage`; `pageSize` was pinned | pager + page-size control, wired to `page`/`pageSize` |
| Sidebar links had `data-testid="undefined"` | 11 routes were absent from `navTestIds` | all 11 have real test ids |
| Reports looked like normal conversations | `reportedAt`/`reportReason` returned but never rendered | 举报状态 / 举报原因 / 举报时间 columns, drawer entries, and a 已举报 filter |

## Verification

| Check | Result |
| --- | --- |
| `work/verify-admin-search-pagination.mjs` — all 11 experience/safety endpoints | 58/58 |
| `work/verify-safety-closure.mjs` — safety chain incl. audit + DB persistence | 19/19 |
| `work/verify-peer-report-admin.mjs` — report reaches the back office | 24/24 |
| `work/verify-admin-closure-ui.mjs` — real browser, real clicks | 18/18 |
| `work/verify-admin-error-visible.mjs` — status line visible on 4 pages | 4/4 |
| `pnpm test:real-browser-admin-clicks` (in `qa:all`) | pass |
| `pnpm test:real-browser-cross-flow` (in `qa:all`) | pass |

### Browser check, in detail

`work/verify-admin-closure-ui.mjs` logs in through the real form, reaches the safety page from the
sidebar, reads the first row's real event id, selects the row, confirms the drawer exposes the
trigger text and handled state, closes the drawer, clicks 标记为已处理, and then asserts:

- the API reports `status=handled` with a `handledAt`;
- the table refreshed and shows 已处理;
- the event left the 待处理 filter (13 open rows, the handled id absent);
- a nonsense search shows the empty state;
- the pager moves to page 2 with a disjoint slice and returns to page 1;
- the peer-conversation table shows 举报原因 / 举报时间 / 举报状态, a reported row is marked 已举报, the
  已举报 filter returns only reported rows, and the drawer exposes reason, time and reporter.

## Known admin gaps

| Gap | Status |
| --- | --- |
| ISSUE-014 — 39 admin endpoints have no reachable caller | OPEN, product decision |
| ISSUE-027 — the user note action writes only an `AuditLog` row and is lost on reload; `User` has no note field | OPEN, P2. No longer blocked by Prisma |
| ISSUE-020 — the peer report counter persists now, but there is no per-report history model | OPEN, P2 |
| 审计日志 page has no pager (requests `pageSize=100`) | pre-existing, out of scope for this round |
| UsersPage has no pager | pre-existing, out of scope for this round |
