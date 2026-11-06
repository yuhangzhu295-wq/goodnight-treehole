# Agent-4 discovery: API / DB / Admin

Read-only DISCOVERY phase output for the `COMPLETE PRODUCT GRAPH AUDIT` run.
Repository `C:\Users\zyu33\Projects\goodnight-treehole`, branch `codex/post-recovery-validation`, HEAD `158c298`.
No file under `apps/`, `packages/`, `prisma/` or `tests/` was modified.

Sources of truth: `artifacts/product-audit/admin-routes.json`, `artifacts/product-audit/api-endpoints.json`,
`artifacts/product-audit/db-models.json`, `apps/api/src/controllers.ts`, `apps/api/src/store.service.ts`,
`apps/api/src/relational-runtime.mapper.ts`, `apps/api/src/monthly-report.service.ts`, `apps/api/src/follow-up-worker.service.ts`,
`apps/admin/src/views/*.vue`, `apps/admin/src/router.ts`.

## Answers up front

| Question | Answer |
| --- | --- |
| Admin resources with no backing endpoint | **0** of 24 |
| Orphan admin endpoints (no admin UI caller) | **39** of 100 (7 are duplicate routes whose handler is reached through a sibling URL; 32 have no reachable caller at all) |
| Admin endpoints that do not enforce an admin token | **36** of 100, excluding the 3 public login/logout routes |
| Front-facing write endpoints (`/api/v1`, POST/PATCH/PUT/DELETE) | **104** |
| Prisma models in the schema | 51 models, 18 enums |

Contents: section 1 admin resource -> endpoint -> models; section 2 missing/orphan endpoints; section 3 every endpoint
with controller and token requirement; section 4 the front write table; sections 5-7 DB model coverage and side-writers;
section 8 confirmation status.

## How an admin screen reaches the API

`apps/admin/src/router.ts:31-91` builds the 24-item sidebar menu (`menuGroups` / `menu`). 13 menu entries are bound
to dedicated view components (`apps/admin/src/router.ts:98-110`); the remaining 11 are generated from `menu` by the
`.filter(...)` at `apps/admin/src/router.ts:112` and all render the shared `apps/admin/src/views/TablePage.vue`
(`apps/admin/src/router.ts:113-118`).

`TablePage.vue` maps a `resource` key to one list endpoint in the `endpoints` record at `apps/admin/src/views/TablePage.vue:43-67`,
then calls `GET <endpoint>?page&pageSize&q&status` at `apps/admin/src/views/TablePage.vue:415-429`. Row actions call the
hard-coded `/api/admin/v1/...` write endpoints at `apps/admin/src/views/TablePage.vue:464-562`.

The `Resource` union type at `apps/admin/src/views/TablePage.vue:6-29` and the `endpoints` record at
`apps/admin/src/views/TablePage.vue:43-67` both define exactly 23 keys (no `dashboard`):

`users`, `posts`, `replies`, `providers`, `routes`, `jobs`, `tickets`, `faqs`, `presets`, `categories`, `settings`,
`audit`, `journeys`, `actions`, `checkins`, `peer-experiences`, `peer-matches`, `follow-ups`, `peer-conversations`,
`notifications`, `safety-events`, `support-plans`, `memory`.

`dashboard` is the 24th menu resource and is served by `apps/admin/src/views/Dashboard.vue:83` instead of `TablePage.vue`.

## 1. Admin resource -> backing endpoints -> DB models

24 resources from `admin-routes.json` `menu`. Endpoint line numbers are in `apps/api/src/controllers.ts`.
All admin endpoints are declared in the single class `AdminController` (`@Controller('api/admin/v1')`, `apps/api/src/controllers.ts:1757-1758`).
The model column is computed the same way as section 5 (`AdminUser`/`AuditLog` included).

| # | Group | Menu label | Route | Resource key | #eps | Admin endpoints (line) | Prisma models read/written |
| ---: | --- | --- | --- | --- | ---: | --- | --- |
| 1 | 总览 | 数据总览 | `/dashboard` | `dashboard` | 1 | `GET /dashboard/overview` (L1884) | AIJob, AIProvider, ActionCommitment, FollowUpJob, LifeJourney, OutcomeCheckin, PeerConversation, PeerExperience, PeerMatch, PersonalSupportPlan, Post, RecoverySnapshot, Reply, SafetyEvent, User, UserNotification |
| 2 | 内容运营 | 树洞内容 | `/posts` | `posts` | 3 | `GET /posts` (L2167)<br>`PATCH /posts/:id/review` (L2206)<br>`POST /posts/:id/regenerate-replies` (L2262) | AIJob, AIProvider, AdminUser, AuditLog, Post, Reply |
| 3 | 内容运营 | 回应审核 | `/replies/moderation` | `replies` | 3 | `GET /replies` (L2304)<br>`PATCH /replies/:id/review` (L2340)<br>`PATCH /replies/:id/content` (L2353) | AdminUser, AuditLog, Post, Reply |
| 4 | 内容运营 | 用户管理 | `/users` | `users` | 4 | `GET /users` (L2085)<br>`PATCH /users/:id/status` (L2106)<br>`POST /users/:id/note` (L2122)<br>`GET /users/export` (L2138) | AdminUser, AuditLog, User |
| 5 | 内容运营 | 反馈工单 | `/ops/feedback` | `tickets` | 4 | `GET /feedback` (L2644)<br>`GET /feedback/summary` (L2603)<br>`POST /feedback/:id/reply` (L2679)<br>`PATCH /feedback/:id/status` (L2699) | AdminUser, AuditLog, FeedbackTicket, SystemSetting |
| 6 | AI 管理 | AI 配置中心 | `/ai/providers` | `providers` | 5 | `GET /ai/providers` (L2377)<br>`POST /ai/providers` (L2389)<br>`PUT /ai/providers/:id` (L2417)<br>`PATCH /ai/providers/:id` (L2435)<br>`POST /ai/providers/:id/test` (L2443) | AIProvider, AdminUser, AuditLog |
| 7 | AI 管理 | 风格路由 | `/ai/routes` | `routes` | 3 | `GET /ai/routes` (L2480)<br>`PATCH /ai/routes/:style` (L2514)<br>`POST /ai/routes/:style/test` (L2523) | AIJob, AIProvider, AIStyleRoute, AdminUser, AuditLog |
| 8 | AI 管理 | AI 任务记录 | `/ai/jobs` | `jobs` | 3 | `GET /ai/jobs` (L2547)<br>`GET /ai/jobs/:id` (L2551)<br>`POST /ai/jobs/:id/retry` (L2555) | AIJob, AIProvider, AdminUser, AuditLog |
| 9 | AI 管理 | 回复预设 | `/ops/reply-presets` | `presets` | 5 | `GET /reply-presets` (L2778)<br>`POST /reply-presets` (L2782)<br>`PUT /reply-presets/:id` (L2801)<br>`PATCH /reply-presets/:id` (L2821)<br>`DELETE /reply-presets/:id` (L2829) | AdminUser, AuditLog, ReplyPreset |
| 10 | 知识与分类 | FAQ 管理 | `/ops/faqs` | `faqs` | 5 | `GET /faqs` (L2713)<br>`POST /faqs` (L2717)<br>`PUT /faqs/:id` (L2737)<br>`PATCH /faqs/:id` (L2759)<br>`DELETE /faqs/:id` (L2767) | AdminUser, AuditLog, FaqItem |
| 11 | 知识与分类 | 反馈分类 | `/ops/feedback-categories` | `categories` | 5 | `GET /feedback-categories` (L2840)<br>`POST /feedback-categories` (L2848)<br>`PUT /feedback-categories/:id` (L2860)<br>`PATCH /feedback-categories/:id` (L2880)<br>`DELETE /feedback-categories/:id` (L2888) | AdminUser, AuditLog, FeedbackCategory, FeedbackTicket |
| 12 | 体验网络 | 现实旅程 | `/experience/journeys` | `journeys` | 1 | `GET /journeys` (L1917) | ActionCommitment, AdminUser, JourneyUpdate, LifeJourney |
| 13 | 体验网络 | 行动承诺 | `/experience/actions` | `actions` | 1 | `GET /actions` (L1935) | ActionCommitment, AdminUser |
| 14 | 体验网络 | 结果回访 | `/experience/checkins` | `checkins` | 1 | `GET /checkins` (L1950) | AdminUser, OutcomeCheckin |
| 15 | 体验网络 | 同路经历 | `/experience/peers` | `peer-experiences` | 2 | `GET /peer-experiences` (L1965)<br>`PATCH /peer-experiences/:id/review` (L1977) | AdminUser, AuditLog, PeerExperience |
| 16 | 体验网络 | 匹配记录 | `/experience/matches` | `peer-matches` | 1 | `GET /peer-matches` (L1993) | AdminUser, PeerMatch |
| 17 | 体验网络 | 随访队列 | `/experience/follow-ups` | `follow-ups` | 1 | `GET /follow-ups` (L2005) | AdminUser, FollowUpJob |
| 18 | 体验网络 | 匿名会话 | `/experience/peer-conversations` | `peer-conversations` | 1 | `GET /peer-conversations` (L2029) | AdminUser, PeerConversation, PeerMessage |
| 19 | 体验网络 | 用户提醒 | `/experience/notifications` | `notifications` | 1 | `GET /notifications` (L2017) | AdminUser, UserNotification |
| 20 | 安全与陪伴 | 安全事件 | `/safety/events` | `safety-events` | 1 | `GET /safety/events` (L2046) | AdminUser, SafetyEvent |
| 21 | 安全与陪伴 | 支持计划 | `/safety/support-plans` | `support-plans` | 1 | `GET /support/plans` (L2056) | AdminUser, PersonalSupportPlan |
| 22 | 安全与陪伴 | 有限记忆 | `/safety/memory` | `memory` | 1 | `GET /memory` (L2066) | AdminUser, MemoryItem |
| 23 | 系统 | 系统设置 | `/ops/config` | `settings` | 2 | `GET /system/settings` (L2912)<br>`PUT /system/settings` (L2934) | AdminUser, AuditLog, PrivacySetting, SystemSetting |
| 24 | 系统 | 审计日志 | `/audit-logs` | `audit` | 1 | `GET /audit-logs` (L2981) | AuditLog |

### 1b. Menu resources not in TablePage.vue

13 menu resources render dedicated views and therefore do NOT use the `endpoints` map:
`dashboard` -> `Dashboard.vue`, `posts` -> `PostsPage.vue`, `replies` -> `RepliesPage.vue`, `users` -> `UsersPage.vue`,
`tickets` -> `FeedbackTicketsPage.vue`, `providers` -> `AIProvidersPage.vue`, `routes` -> `AIRoutesPage.vue`,
`jobs` -> `AIJobsPage.vue`, `presets` -> `ReplyPresetsPage.vue`, `faqs` -> `FaqPage.vue`,
`categories` -> `FeedbackCategoriesPage.vue`, `settings` -> `ConfigPage.vue`, `audit` -> `AuditLogsPage.vue`.

The 11 `viaTablePage: true` resources (`admin-routes.json`) are exactly the 11 TablePage-only keys: `journeys`, `actions`,
`checkins`, `peer-experiences`, `peer-matches`, `follow-ups`, `peer-conversations`, `notifications`, `safety-events`,
`support-plans`, `memory`.

10 of them are read-only list views: `TablePage.vue` renders no action button for those resources (the `v-if` action
templates at `TablePage.vue:843-914` cover `users`, `posts`, `replies`, `providers`, `routes`, `jobs`, `tickets`, `settings`,
`faqs`, `presets`, `categories` and `peer-experiences` only). `peer-experiences` is the one exception and carries a review
action: `PATCH /api/admin/v1/peer-experiences/:id/review` (`TablePage.vue:562` -> `controllers.ts:1977`).

## 2. Missing endpoints and orphan endpoints

### 2a. Admin resources with no backing endpoint: 0

All 24 menu resources have at least one `GET` list endpoint in `AdminController`; each was matched by path and by the
`TablePage.vue` / dedicated-view call sites.

### 2b. Orphan admin endpoints

Definition used: an endpoint under `/api/admin/v1` with no call site in `apps/admin/src` (checked across all `.vue`/`.ts`,
including the `endpoints` map and all `adminApi.get/post/patch/put/delete` literals).

Result: **39 orphan endpoints out of 100** (61 are called by the admin UI).
They split into two classes.

Class A - alias/duplicate route whose handler IS reached through a sibling URL (7 endpoints). These are redundant routes,
not dead code:

| Method | Path | Line | Handler | Reached through |
| --- | --- | ---: | --- | --- |
| PATCH | `/posts/:id/moderation` | 2195 | `postModeration` | `PATCH /api/admin/v1/posts/:id/review` (L2206) delegates to `postModeration` |
| PATCH | `/replies/:id/moderation` | 2329 | `replyModeration` | `PATCH /api/admin/v1/replies/:id/review` (L2340) delegates to `replyModeration` |
| PATCH | `/replies/:id/edit` | 2372 | `replyEdit` | `PATCH /api/admin/v1/replies/:id/content` (L2353) delegates to `replyEdit` |
| PUT | `/ai/routes/:style` | 2484 | `updateRoute` | `PATCH /api/admin/v1/ai/routes/:style` (L2514) delegates to `updateRoute` |
| GET | `/feedback/tickets` | 2579 | `tickets` | `GET /api/admin/v1/feedback` (L2644) delegates to `tickets` |
| POST | `/feedback/tickets/:id/reply` | 2663 | `ticketReply` | `POST /api/admin/v1/feedback/:id/reply` (L2679) delegates to `ticketReply` |
| PATCH | `/feedback/tickets/:id/status` | 2688 | `ticketStatus` | `PATCH /api/admin/v1/feedback/:id/status` (L2699) delegates to `ticketStatus` |

Class B - endpoint with no admin UI caller and no other route reaching its handler (32 endpoints):

| Method | Path | Line | Handler | Note |
| --- | --- | ---: | --- | --- |
| POST | `/login` | 1863 | `loginAlias` | duplicate of `POST /api/admin/v1/auth/login` (L1856); used only by `scripts/dapi-live-audit.ts:29` |
| POST | `/auth/logout` | 1868 | `logout` | no-op handler, returns `{ ok: true }`; no UI logout call exists |
| GET | `/auth/me` | 1873 | `authMe` | identity probe; used only by `scripts/admin-sync-full-report.ts:136` |
| GET | `/me` | 1878 | `me` | duplicate of `auth/me` |
| GET | `/dashboard` | 1889 | `dashboardAlias` | alias of `dashboard/overview` (L1884) |
| GET | `/dashboard/summary` | 1894 | `dashboardSummary` | dashboard sub-metric; Dashboard.vue consumes the combined `overview` only |
| GET | `/dashboard/activity` | 1907 | `dashboardActivity` | dashboard sub-metric; unused |
| GET | `/dashboard/emotion-distribution` | 1912 | `dashboardEmotionDistribution` | dashboard sub-metric; unused |
| GET | `/dashboard/ai-summary` | 2080 | `dashboardAiSummary` | dashboard sub-metric; unused |
| GET | `/users/:id` | 2102 | `user` | single-user detail; `UsersPage.vue` renders details from the list payload (L160-164) |
| PATCH | `/users/:id/tags` | 2148 | `userTags` | stub: returns the posted tags without persisting anything |
| POST | `/users/:id/tags` | 2153 | `userTagsPost` | stub: delegates to the PATCH stub above |
| DELETE | `/users/:id/data` | 2158 | `deleteUserData` | erasure endpoint with no UI control; mutates `diaries`/`letters` in place |
| GET | `/posts/:id` | 2191 | `adminPost` | single-post detail; unused |
| PATCH | `/posts/:id/approve` | 2224 | `postApprove` | alias of `posts/:id/review` with `action=approve` |
| PATCH | `/posts/:id/reject` | 2229 | `postReject` | alias of `posts/:id/review` with `action=reject` |
| PATCH | `/posts/:id/block` | 2234 | `postBlock` | alias of `postModeration(..., 'hide')` |
| PATCH | `/posts/:id/visibility` | 2238 | `postVisibility` | visibility/reviewStatus write; unused |
| PATCH | `/posts/:id/risk` | 2257 | `postRisk` | alias of `posts/:id/review` with `action=risk` |
| DELETE | `/posts/:id` | 2296 | `adminDeletePost` | soft delete (`status='deleted'`); unused |
| GET | `/replies/:id` | 2325 | `adminReply` | single-reply detail; unused |
| PATCH | `/replies/:id/approve` | 2358 | `replyApprove` | alias of `replies/:id/review` |
| PATCH | `/replies/:id/block` | 2367 | `replyBlock` | alias of `replies/:id/review` with `action=block` |
| GET | `/ai/ollama/status` | 2457 | `ollamaStatus` | local-model status; Ollama is disabled at runtime, no UI caller |
| POST | `/ai/ollama/sync-models` | 2462 | `syncOllamaModels` | local-model sync; no UI caller |
| DELETE | `/ai/providers/:id` | 2468 | `deleteProvider` | provider delete; no UI control |
| GET | `/feedback/tickets/:id` | 2653 | `ticket` | single-ticket detail; unused |
| GET | `/feedback/:id` | 2658 | `feedbackItemAlias` | duplicate of `feedback/tickets/:id` |
| PATCH | `/feedback/:id/reply` | 2670 | `feedbackReplyAlias` | delegates to `ticketReply`; UI uses the POST variant |
| PATCH | `/feedback/:id/resolve` | 2708 | `feedbackResolveAlias` | delegates to `ticketStatus(status=resolved)`; UI uses the generic status route |
| GET | `/settings` | 2924 | `settingsAlias` | duplicate of `system/settings` |
| PATCH | `/settings` | 2965 | `patchSettingsAlias` | duplicate of `PUT system/settings` |

UI keys with no matching endpoint: none. Every distinct `/api/admin/v1/...` URL literal in `apps/admin/src` resolves to a
declared route (`work/agent4-admin-ui-pairs.json`).


## 3. Every endpoint: controller and admin-token requirement

Source: `artifacts/product-audit/api-endpoints.json` (264 endpoints). Controller classes are declared in
`apps/api/src/controllers.ts`: `HealthController` (L164-165, base `api`), `PublicController` (L179-180, base `api/v1`),
`AdminController` (L1757-1758, base `api/admin/v1`). All three are registered in `apps/api/src/app.module.ts:11`.

| Controller | Base path | Endpoints |
| --- | --- | ---: |
| `HealthController` | `/api` | 1 |
| `PublicController` | `/api/v1` | 163 |
| `AdminController` | `/api/admin/v1` | 100 |
| **Total** | | **264** |

### 3a. How the admin token is enforced

There is no Nest guard, interceptor or `@UseGuards` anywhere in `apps/api/src` (the only match for `verifyToken` is
`apps/api/src/controllers.ts:1762`). Enforcement is explicit inside each handler:

- `AdminController.admin(auth)` (`apps/api/src/controllers.ts:1761-1763`) calls `this.store.verifyToken(tokenFrom(auth))`.
- `tokenFrom` (`apps/api/src/controllers.ts:42-44`) strips a leading `Bearer `.
- `StoreService.verifyToken` (`apps/api/src/store.service.ts:2190-2197`) decodes the base64url token
  `<adminId>:<role>:goodnight` and throws `UnauthorizedException` when the token is missing or the admin id is unknown.
- The token is minted by `StoreService.login` (`apps/api/src/store.service.ts:2175-2188`), which compares `passwordHash`
  against the plaintext form `plain:<password>`.

A handler counts as requiring an admin token when it either calls `this.admin(auth)` directly, or carries
`@Headers('authorization')` and delegates to another `AdminController` handler that calls `this.admin(...)` (transitive
closure over `AdminController` methods, computed in `work/agent4-auth.mjs`).

**Result: 61 of 100 admin endpoints enforce the token; 39 do not.**

| Class | Count | Meaning |
| --- | ---: | --- |
| Enforced - direct `this.admin(auth)` | 39 | handler validates the bearer token itself |
| Enforced - only via delegation | 22 | e.g. `postReview` -> `postModeration` -> `this.admin(auth)` |
| **Enforced total** | **61** | |
| Not enforced - login/logout by design | 3 | `auth/login`, `login`, `auth/logout` |
| Not enforced - other | 36 | **finding**, see 3b |

### 3b. Finding: admin endpoints reachable without a token

36 `/api/admin/v1` endpoints do not enforce an admin token. 35 of them do not even declare the `authorization` header; the
36th, `POST /ai/jobs/:id/fallback` (L2574), declares `@Headers('authorization')` as `_auth` but never uses it and always
throws `BadRequestException`.

The 35 unguarded handlers expose the same business data as the guarded ones (users, posts, replies, AI provider config,
system settings, audit log) to any caller that can reach the API. Three perform real mutations: `POST /posts/:id/regenerate-replies`
(L2262) queues AI jobs, `DELETE /posts/:id` (L2296) sets `post.status = 'deleted'`, and `DELETE /users/:id/data` (L2158)
removes the user's favorites, diaries and letters. The `users/:id/tags` pair is marked write below but is inert: it returns the
request body without persisting.

| Method | Path | Line | Handler | Kind |
| --- | --- | ---: | --- | --- |
| GET | `/dashboard/overview` | 1884 | `overview` | read |
| GET | `/dashboard` | 1889 | `dashboardAlias` | read |
| GET | `/dashboard/summary` | 1894 | `dashboardSummary` | read |
| GET | `/dashboard/activity` | 1907 | `dashboardActivity` | read |
| GET | `/dashboard/emotion-distribution` | 1912 | `dashboardEmotionDistribution` | read |
| GET | `/dashboard/ai-summary` | 2080 | `dashboardAiSummary` | read |
| GET | `/users` | 2085 | `users` | read |
| GET | `/users/:id` | 2102 | `user` | read |
| GET | `/users/export` | 2138 | `exportUsers` | read |
| PATCH | `/users/:id/tags` | 2148 | `userTags` | write (stub, not persisted) |
| POST | `/users/:id/tags` | 2153 | `userTagsPost` | write (stub, not persisted) |
| DELETE | `/users/:id/data` | 2158 | `deleteUserData` | **write** |
| GET | `/posts` | 2167 | `adminPosts` | read |
| GET | `/posts/:id` | 2191 | `adminPost` | read |
| POST | `/posts/:id/regenerate-replies` | 2262 | `regenerateReplies` | **write** |
| DELETE | `/posts/:id` | 2296 | `adminDeletePost` | **write** |
| GET | `/replies` | 2304 | `adminReplies` | read |
| GET | `/replies/:id` | 2325 | `adminReply` | read |
| GET | `/ai/providers` | 2377 | `providers` | read |
| GET | `/ai/ollama/status` | 2457 | `ollamaStatus` | read |
| GET | `/ai/routes` | 2480 | `routes` | read |
| GET | `/ai/jobs` | 2547 | `jobs` | read |
| GET | `/ai/jobs/:id` | 2551 | `job` | read |
| POST | `/ai/jobs/:id/fallback` | 2574 | `fallbackJob` | write (disabled stub, always throws) |
| GET | `/feedback/tickets` | 2579 | `tickets` | read |
| GET | `/feedback/summary` | 2603 | `feedbackSummary` | read |
| GET | `/feedback` | 2644 | `feedbackAlias` | read |
| GET | `/feedback/tickets/:id` | 2653 | `ticket` | read |
| GET | `/feedback/:id` | 2658 | `feedbackItemAlias` | read |
| GET | `/faqs` | 2713 | `adminFaqs` | read |
| GET | `/reply-presets` | 2778 | `adminPresets` | read |
| GET | `/feedback-categories` | 2840 | `adminCategories` | read |
| GET | `/system/settings` | 2912 | `settings` | read |
| GET | `/settings` | 2924 | `settingsAlias` | read |
| GET | `/config` | 2929 | `config` | read |
| GET | `/audit-logs` | 2981 | `auditLogs` | read |

The 11 `viaTablePage` list views (`journeys`, `actions`, `checkins`, `peer-experiences`, `peer-matches`, `follow-ups`,
`peer-conversations`, `notifications`, `safety/events`, `support/plans`, `memory`) are NOT in this list - they all call
`this.admin(auth)` (L1917-2078), so their bearer token is required and the admin UI supplies it via
`apps/admin/src/api.ts` (`createApiClient({ getToken: () => localStorage.getItem(tokenKey) })`).

### 3c. Full endpoint inventory

`Admin token` = `yes` (enforced, directly or by delegation), `login-only` (public by design), `NO` (finding 3b), `n/a` (not
an admin route).

| # | Controller | Method | Path | Line | Admin token |
| ---: | --- | --- | --- | ---: | --- |
| 1 | `HealthController` | GET | `/api/health` | 166 | n/a |
| 2 | `PublicController` | GET | `/api/v1/posts` | 186 | n/a |
| 3 | `PublicController` | GET | `/api/v1/debug/fingerprint` | 192 | n/a |
| 4 | `PublicController` | GET | `/api/v1/config` | 197 | n/a |
| 5 | `PublicController` | GET | `/api/v1/tonight` | 205 | n/a |
| 6 | `PublicController` | GET | `/api/v1/journeys` | 210 | n/a |
| 7 | `PublicController` | GET | `/api/v1/archive/journeys` | 219 | n/a |
| 8 | `PublicController` | GET | `/api/v1/archive/journeys/:id` | 224 | n/a |
| 9 | `PublicController` | POST | `/api/v1/archive/journeys/:id/export` | 229 | n/a |
| 10 | `PublicController` | POST | `/api/v1/archive/journeys/:id/restore` | 234 | n/a |
| 11 | `PublicController` | DELETE | `/api/v1/archive/journeys/:id` | 239 | n/a |
| 12 | `PublicController` | POST | `/api/v1/journeys` | 249 | n/a |
| 13 | `PublicController` | POST | `/api/v1/testing/cleanup-browser-fixtures` | 270 | n/a |
| 14 | `PublicController` | GET | `/api/v1/journeys/:id` | 286 | n/a |
| 15 | `PublicController` | GET | `/api/v1/journeys/:id/fingerprint` | 291 | n/a |
| 16 | `PublicController` | PATCH | `/api/v1/journeys/:id/intent` | 296 | n/a |
| 17 | `PublicController` | PATCH | `/api/v1/journeys/:id` | 302 | n/a |
| 18 | `PublicController` | PATCH | `/api/v1/journeys/:id/situation` | 316 | n/a |
| 19 | `PublicController` | POST | `/api/v1/journeys/:id/snapshots` | 342 | n/a |
| 20 | `PublicController` | POST | `/api/v1/journeys/:id/situation/reanalyze` | 368 | n/a |
| 21 | `PublicController` | POST | `/api/v1/journeys/:id/safety/acknowledge` | 373 | n/a |
| 22 | `PublicController` | POST | `/api/v1/journeys/:id/updates` | 378 | n/a |
| 23 | `PublicController` | POST | `/api/v1/journeys/:id/action-plan` | 386 | n/a |
| 24 | `PublicController` | POST | `/api/v1/journeys/:id/actions` | 391 | n/a |
| 25 | `PublicController` | GET | `/api/v1/journeys/:id/actions` | 399 | n/a |
| 26 | `PublicController` | GET | `/api/v1/journeys/:id/timeline` | 404 | n/a |
| 27 | `PublicController` | PATCH | `/api/v1/journeys/:id/status` | 409 | n/a |
| 28 | `PublicController` | POST | `/api/v1/journeys/:id/graduate` | 414 | n/a |
| 29 | `PublicController` | POST | `/api/v1/journeys/:id/graduation-consent` | 419 | n/a |
| 30 | `PublicController` | POST | `/api/v1/actions/:id/checkin` | 426 | n/a |
| 31 | `PublicController` | POST | `/api/v1/actions/:id/checkins` | 442 | n/a |
| 32 | `PublicController` | GET | `/api/v1/peers` | 458 | n/a |
| 33 | `PublicController` | POST | `/api/v1/peer-experiences` | 463 | n/a |
| 34 | `PublicController` | POST | `/api/v1/journeys/:id/peer-matches` | 480 | n/a |
| 35 | `PublicController` | GET | `/api/v1/journeys/:id/peers` | 485 | n/a |
| 36 | `PublicController` | PATCH | `/api/v1/peer-matches/:id` | 490 | n/a |
| 37 | `PublicController` | POST | `/api/v1/peer-matches/:id/respond` | 504 | n/a |
| 38 | `PublicController` | POST | `/api/v1/peer-matches/:id/consent` | 513 | n/a |
| 39 | `PublicController` | GET | `/api/v1/peer-requests` | 518 | n/a |
| 40 | `PublicController` | PATCH | `/api/v1/peer-experiences/:id` | 523 | n/a |
| 41 | `PublicController` | GET | `/api/v1/peer-experiences/:id` | 540 | n/a |
| 42 | `PublicController` | POST | `/api/v1/actions/:id/adaptive-plan` | 545 | n/a |
| 43 | `PublicController` | POST | `/api/v1/actions/:id/adapt` | 550 | n/a |
| 44 | `PublicController` | POST | `/api/v1/decisions` | 558 | n/a |
| 45 | `PublicController` | GET | `/api/v1/decisions` | 563 | n/a |
| 46 | `PublicController` | PATCH | `/api/v1/decisions/:id` | 568 | n/a |
| 47 | `PublicController` | POST | `/api/v1/cooldowns` | 584 | n/a |
| 48 | `PublicController` | GET | `/api/v1/cooldown` | 589 | n/a |
| 49 | `PublicController` | POST | `/api/v1/handoffs` | 594 | n/a |
| 50 | `PublicController` | POST | `/api/v1/handoffs/:id/share` | 599 | n/a |
| 51 | `PublicController` | GET | `/api/v1/handoffs` | 604 | n/a |
| 52 | `PublicController` | POST | `/api/v1/trusted-contacts` | 609 | n/a |
| 53 | `PublicController` | GET | `/api/v1/trusted-contacts` | 614 | n/a |
| 54 | `PublicController` | POST | `/api/v1/future-messages` | 619 | n/a |
| 55 | `PublicController` | GET | `/api/v1/future-messages` | 624 | n/a |
| 56 | `PublicController` | POST | `/api/v1/support-plans` | 629 | n/a |
| 57 | `PublicController` | GET | `/api/v1/me/support-plan` | 637 | n/a |
| 58 | `PublicController` | PUT | `/api/v1/me/support-plan` | 642 | n/a |
| 59 | `PublicController` | GET | `/api/v1/me/stable-self` | 650 | n/a |
| 60 | `PublicController` | PUT | `/api/v1/me/stable-self` | 655 | n/a |
| 61 | `PublicController` | GET | `/api/v1/me/recovery` | 663 | n/a |
| 62 | `PublicController` | POST | `/api/v1/me/recovery` | 668 | n/a |
| 63 | `PublicController` | GET | `/api/v1/notifications` | 676 | n/a |
| 64 | `PublicController` | PATCH | `/api/v1/notifications/:id/read` | 682 | n/a |
| 65 | `PublicController` | GET | `/api/v1/peer-conversations` | 687 | n/a |
| 66 | `PublicController` | POST | `/api/v1/peer-conversations/:matchId/messages` | 692 | n/a |
| 67 | `PublicController` | POST | `/api/v1/peer-conversations/:matchId/assist` | 701 | n/a |
| 68 | `PublicController` | POST | `/api/v1/peer-conversations/:matchId/close` | 710 | n/a |
| 69 | `PublicController` | POST | `/api/v1/peer-conversations/:matchId/report` | 715 | n/a |
| 70 | `PublicController` | POST | `/api/v1/peer-conversations/:matchId/block` | 724 | n/a |
| 71 | `PublicController` | POST | `/api/v1/peer-conversations/:matchId/feedback` | 729 | n/a |
| 72 | `PublicController` | GET | `/api/v1/memory` | 738 | n/a |
| 73 | `PublicController` | GET | `/api/v1/me/memories` | 743 | n/a |
| 74 | `PublicController` | POST | `/api/v1/memory` | 759 | n/a |
| 75 | `PublicController` | PATCH | `/api/v1/me/memories/:id` | 775 | n/a |
| 76 | `PublicController` | DELETE | `/api/v1/memory/:id` | 784 | n/a |
| 77 | `PublicController` | DELETE | `/api/v1/me/memories/:id` | 789 | n/a |
| 78 | `PublicController` | GET | `/api/v1/posts/:id` | 794 | n/a |
| 79 | `PublicController` | POST | `/api/v1/posts/:id/hug` | 799 | n/a |
| 80 | `PublicController` | DELETE | `/api/v1/posts/:id/hug` | 808 | n/a |
| 81 | `PublicController` | POST | `/api/v1/posts/:id/hugs` | 817 | n/a |
| 82 | `PublicController` | POST | `/api/v1/posts/:id/favorite` | 822 | n/a |
| 83 | `PublicController` | DELETE | `/api/v1/posts/:id/favorite` | 830 | n/a |
| 84 | `PublicController` | POST | `/api/v1/posts/:id/report` | 838 | n/a |
| 85 | `PublicController` | POST | `/api/v1/posts/:id/hide` | 847 | n/a |
| 86 | `PublicController` | DELETE | `/api/v1/posts/:id` | 853 | n/a |
| 87 | `PublicController` | POST | `/api/v1/posts` | 862 | n/a |
| 88 | `PublicController` | POST | `/api/v1/moods` | 887 | n/a |
| 89 | `PublicController` | POST | `/api/v1/moods/:id/queue-ai-replies` | 911 | n/a |
| 90 | `PublicController` | GET | `/api/v1/posts/:id/replies` | 949 | n/a |
| 91 | `PublicController` | GET | `/api/v1/reply-presets` | 954 | n/a |
| 92 | `PublicController` | POST | `/api/v1/posts/:id/replies` | 973 | n/a |
| 93 | `PublicController` | POST | `/api/v1/replies/:id/like` | 980 | n/a |
| 94 | `PublicController` | POST | `/api/v1/ai/generate` | 985 | n/a |
| 95 | `PublicController` | POST | `/api/v1/ai/tasks` | 994 | n/a |
| 96 | `PublicController` | GET | `/api/v1/ai/tasks/latest` | 1003 | n/a |
| 97 | `PublicController` | GET | `/api/v1/ai/tasks/:id` | 1020 | n/a |
| 98 | `PublicController` | GET | `/api/v1/letters/today` | 1030 | n/a |
| 99 | `PublicController` | GET | `/api/v1/letters` | 1055 | n/a |
| 100 | `PublicController` | GET | `/api/v1/letters/:id` | 1065 | n/a |
| 101 | `PublicController` | PATCH | `/api/v1/letters/:id/read` | 1071 | n/a |
| 102 | `PublicController` | POST | `/api/v1/letters/:id/like` | 1080 | n/a |
| 103 | `PublicController` | POST | `/api/v1/letters/:id/regenerate` | 1089 | n/a |
| 104 | `PublicController` | POST | `/api/v1/letters/generate` | 1134 | n/a |
| 105 | `PublicController` | POST | `/api/v1/letters/:id/poster` | 1148 | n/a |
| 106 | `PublicController` | POST | `/api/v1/share-image` | 1156 | n/a |
| 107 | `PublicController` | POST | `/api/v1/letters/:id/save-to-diary` | 1168 | n/a |
| 108 | `PublicController` | POST | `/api/v1/letters/:id/favorite` | 1186 | n/a |
| 109 | `PublicController` | DELETE | `/api/v1/letters/:id/favorite` | 1196 | n/a |
| 110 | `PublicController` | GET | `/api/v1/tools` | 1206 | n/a |
| 111 | `PublicController` | POST | `/api/v1/tools/emotion-decompose` | 1222 | n/a |
| 112 | `PublicController` | POST | `/api/v1/ai/tools/breakdown` | 1234 | n/a |
| 113 | `PublicController` | POST | `/api/v1/tools/decompose` | 1247 | n/a |
| 114 | `PublicController` | POST | `/api/v1/tools/run` | 1252 | n/a |
| 115 | `PublicController` | POST | `/api/v1/tools/rewrite` | 1277 | n/a |
| 116 | `PublicController` | POST | `/api/v1/tools/rant` | 1282 | n/a |
| 117 | `PublicController` | POST | `/api/v1/tools/heal` | 1287 | n/a |
| 118 | `PublicController` | POST | `/api/v1/tools/sleep` | 1292 | n/a |
| 119 | `PublicController` | POST | `/api/v1/tools/work` | 1297 | n/a |
| 120 | `PublicController` | POST | `/api/v1/tools/future` | 1302 | n/a |
| 121 | `PublicController` | POST | `/api/v1/tools/emotion-decompose/:taskId/save` | 1307 | n/a |
| 122 | `PublicController` | GET | `/api/v1/me/profile` | 1328 | n/a |
| 123 | `PublicController` | GET | `/api/v1/me/stats` | 1333 | n/a |
| 124 | `PublicController` | GET | `/api/v1/me/growth-card` | 1349 | n/a |
| 125 | `PublicController` | DELETE | `/api/v1/me/data` | 1354 | n/a |
| 126 | `PublicController` | POST | `/api/v1/diaries` | 1364 | n/a |
| 127 | `PublicController` | POST | `/api/v1/diaries/export` | 1393 | n/a |
| 128 | `PublicController` | GET | `/api/v1/exports/:assetId/download` | 1398 | n/a |
| 129 | `PublicController` | GET | `/api/v1/diaries` | 1457 | n/a |
| 130 | `PublicController` | GET | `/api/v1/diaries/months` | 1468 | n/a |
| 131 | `PublicController` | GET | `/api/v1/me/diaries` | 1480 | n/a |
| 132 | `PublicController` | GET | `/api/v1/me/diaries/months` | 1489 | n/a |
| 133 | `PublicController` | POST | `/api/v1/me/diaries` | 1494 | n/a |
| 134 | `PublicController` | GET | `/api/v1/diaries/:id` | 1509 | n/a |
| 135 | `PublicController` | DELETE | `/api/v1/diaries/:id` | 1516 | n/a |
| 136 | `PublicController` | GET | `/api/v1/favorites` | 1522 | n/a |
| 137 | `PublicController` | GET | `/api/v1/me/favorites` | 1552 | n/a |
| 138 | `PublicController` | GET | `/api/v1/me/letters` | 1557 | n/a |
| 139 | `PublicController` | DELETE | `/api/v1/favorites/:id` | 1562 | n/a |
| 140 | `PublicController` | GET | `/api/v1/reports/monthly` | 1569 | n/a |
| 141 | `PublicController` | GET | `/api/v1/reports/monthly/months` | 1574 | n/a |
| 142 | `PublicController` | GET | `/api/v1/report/month` | 1579 | n/a |
| 143 | `PublicController` | GET | `/api/v1/me/month-report` | 1584 | n/a |
| 144 | `PublicController` | GET | `/api/v1/reports/monthly/:month/advice` | 1589 | n/a |
| 145 | `PublicController` | POST | `/api/v1/reports/monthly/:month/poster` | 1594 | n/a |
| 146 | `PublicController` | POST | `/api/v1/report/share-image` | 1599 | n/a |
| 147 | `PublicController` | GET | `/api/v1/settings/privacy` | 1604 | n/a |
| 148 | `PublicController` | GET | `/api/v1/me/privacy` | 1610 | n/a |
| 149 | `PublicController` | GET | `/api/v1/privacy-settings` | 1615 | n/a |
| 150 | `PublicController` | PUT | `/api/v1/settings/privacy` | 1620 | n/a |
| 151 | `PublicController` | PATCH | `/api/v1/settings/privacy` | 1654 | n/a |
| 152 | `PublicController` | PATCH | `/api/v1/me/privacy` | 1659 | n/a |
| 153 | `PublicController` | PATCH | `/api/v1/privacy-settings` | 1664 | n/a |
| 154 | `PublicController` | GET | `/api/v1/feedback/categories` | 1669 | n/a |
| 155 | `PublicController` | GET | `/api/v1/feedback/faqs` | 1676 | n/a |
| 156 | `PublicController` | POST | `/api/v1/feedback` | 1689 | n/a |
| 157 | `PublicController` | GET | `/api/v1/feedback` | 1704 | n/a |
| 158 | `PublicController` | POST | `/api/v1/media/upload` | 1713 | n/a |
| 159 | `PublicController` | DELETE | `/api/v1/media/:id` | 1722 | n/a |
| 160 | `PublicController` | POST | `/api/v1/upload` | 1729 | n/a |
| 161 | `PublicController` | POST | `/api/v1/uploads` | 1734 | n/a |
| 162 | `PublicController` | POST | `/api/v1/export/diaries` | 1739 | n/a |
| 163 | `PublicController` | POST | `/api/v1/share/image` | 1744 | n/a |
| 164 | `PublicController` | POST | `/api/v1/assets/complete` | 1749 | n/a |
| 165 | `AdminController` | POST | `/api/admin/v1/auth/login` | 1856 | login-only |
| 166 | `AdminController` | POST | `/api/admin/v1/login` | 1863 | login-only |
| 167 | `AdminController` | POST | `/api/admin/v1/auth/logout` | 1868 | login-only |
| 168 | `AdminController` | GET | `/api/admin/v1/auth/me` | 1873 | yes |
| 169 | `AdminController` | GET | `/api/admin/v1/me` | 1878 | yes |
| 170 | `AdminController` | GET | `/api/admin/v1/dashboard/overview` | 1884 | NO |
| 171 | `AdminController` | GET | `/api/admin/v1/dashboard` | 1889 | NO |
| 172 | `AdminController` | GET | `/api/admin/v1/dashboard/summary` | 1894 | NO |
| 173 | `AdminController` | GET | `/api/admin/v1/dashboard/activity` | 1907 | NO |
| 174 | `AdminController` | GET | `/api/admin/v1/dashboard/emotion-distribution` | 1912 | NO |
| 175 | `AdminController` | GET | `/api/admin/v1/journeys` | 1917 | yes |
| 176 | `AdminController` | GET | `/api/admin/v1/actions` | 1935 | yes |
| 177 | `AdminController` | GET | `/api/admin/v1/checkins` | 1950 | yes |
| 178 | `AdminController` | GET | `/api/admin/v1/peer-experiences` | 1965 | yes |
| 179 | `AdminController` | PATCH | `/api/admin/v1/peer-experiences/:id/review` | 1977 | yes |
| 180 | `AdminController` | GET | `/api/admin/v1/peer-matches` | 1993 | yes |
| 181 | `AdminController` | GET | `/api/admin/v1/follow-ups` | 2005 | yes |
| 182 | `AdminController` | GET | `/api/admin/v1/notifications` | 2017 | yes |
| 183 | `AdminController` | GET | `/api/admin/v1/peer-conversations` | 2029 | yes |
| 184 | `AdminController` | GET | `/api/admin/v1/safety/events` | 2046 | yes |
| 185 | `AdminController` | GET | `/api/admin/v1/support/plans` | 2056 | yes |
| 186 | `AdminController` | GET | `/api/admin/v1/memory` | 2066 | yes |
| 187 | `AdminController` | GET | `/api/admin/v1/dashboard/ai-summary` | 2080 | NO |
| 188 | `AdminController` | GET | `/api/admin/v1/users` | 2085 | NO |
| 189 | `AdminController` | GET | `/api/admin/v1/users/:id` | 2102 | NO |
| 190 | `AdminController` | PATCH | `/api/admin/v1/users/:id/status` | 2106 | yes |
| 191 | `AdminController` | POST | `/api/admin/v1/users/:id/note` | 2122 | yes |
| 192 | `AdminController` | GET | `/api/admin/v1/users/export` | 2138 | NO |
| 193 | `AdminController` | PATCH | `/api/admin/v1/users/:id/tags` | 2148 | NO |
| 194 | `AdminController` | POST | `/api/admin/v1/users/:id/tags` | 2153 | NO |
| 195 | `AdminController` | DELETE | `/api/admin/v1/users/:id/data` | 2158 | NO |
| 196 | `AdminController` | GET | `/api/admin/v1/posts` | 2167 | NO |
| 197 | `AdminController` | GET | `/api/admin/v1/posts/:id` | 2191 | NO |
| 198 | `AdminController` | PATCH | `/api/admin/v1/posts/:id/moderation` | 2195 | yes |
| 199 | `AdminController` | PATCH | `/api/admin/v1/posts/:id/review` | 2206 | yes |
| 200 | `AdminController` | PATCH | `/api/admin/v1/posts/:id/approve` | 2224 | yes |
| 201 | `AdminController` | PATCH | `/api/admin/v1/posts/:id/reject` | 2229 | yes |
| 202 | `AdminController` | PATCH | `/api/admin/v1/posts/:id/block` | 2234 | yes |
| 203 | `AdminController` | PATCH | `/api/admin/v1/posts/:id/visibility` | 2238 | yes |
| 204 | `AdminController` | PATCH | `/api/admin/v1/posts/:id/risk` | 2257 | yes |
| 205 | `AdminController` | POST | `/api/admin/v1/posts/:id/regenerate-replies` | 2262 | NO |
| 206 | `AdminController` | DELETE | `/api/admin/v1/posts/:id` | 2296 | NO |
| 207 | `AdminController` | GET | `/api/admin/v1/replies` | 2304 | NO |
| 208 | `AdminController` | GET | `/api/admin/v1/replies/:id` | 2325 | NO |
| 209 | `AdminController` | PATCH | `/api/admin/v1/replies/:id/moderation` | 2329 | yes |
| 210 | `AdminController` | PATCH | `/api/admin/v1/replies/:id/review` | 2340 | yes |
| 211 | `AdminController` | PATCH | `/api/admin/v1/replies/:id/content` | 2353 | yes |
| 212 | `AdminController` | PATCH | `/api/admin/v1/replies/:id/approve` | 2358 | yes |
| 213 | `AdminController` | PATCH | `/api/admin/v1/replies/:id/block` | 2367 | yes |
| 214 | `AdminController` | PATCH | `/api/admin/v1/replies/:id/edit` | 2372 | yes |
| 215 | `AdminController` | GET | `/api/admin/v1/ai/providers` | 2377 | NO |
| 216 | `AdminController` | POST | `/api/admin/v1/ai/providers` | 2389 | yes |
| 217 | `AdminController` | PUT | `/api/admin/v1/ai/providers/:id` | 2417 | yes |
| 218 | `AdminController` | PATCH | `/api/admin/v1/ai/providers/:id` | 2435 | yes |
| 219 | `AdminController` | POST | `/api/admin/v1/ai/providers/:id/test` | 2443 | yes |
| 220 | `AdminController` | GET | `/api/admin/v1/ai/ollama/status` | 2457 | NO |
| 221 | `AdminController` | POST | `/api/admin/v1/ai/ollama/sync-models` | 2462 | yes |
| 222 | `AdminController` | DELETE | `/api/admin/v1/ai/providers/:id` | 2468 | yes |
| 223 | `AdminController` | GET | `/api/admin/v1/ai/routes` | 2480 | NO |
| 224 | `AdminController` | PUT | `/api/admin/v1/ai/routes/:style` | 2484 | yes |
| 225 | `AdminController` | PATCH | `/api/admin/v1/ai/routes/:style` | 2514 | yes |
| 226 | `AdminController` | POST | `/api/admin/v1/ai/routes/:style/test` | 2523 | yes |
| 227 | `AdminController` | GET | `/api/admin/v1/ai/jobs` | 2547 | NO |
| 228 | `AdminController` | GET | `/api/admin/v1/ai/jobs/:id` | 2551 | NO |
| 229 | `AdminController` | POST | `/api/admin/v1/ai/jobs/:id/retry` | 2555 | yes |
| 230 | `AdminController` | POST | `/api/admin/v1/ai/jobs/:id/fallback` | 2574 | NO |
| 231 | `AdminController` | GET | `/api/admin/v1/feedback/tickets` | 2579 | NO |
| 232 | `AdminController` | GET | `/api/admin/v1/feedback/summary` | 2603 | NO |
| 233 | `AdminController` | GET | `/api/admin/v1/feedback` | 2644 | NO |
| 234 | `AdminController` | GET | `/api/admin/v1/feedback/tickets/:id` | 2653 | NO |
| 235 | `AdminController` | GET | `/api/admin/v1/feedback/:id` | 2658 | NO |
| 236 | `AdminController` | POST | `/api/admin/v1/feedback/tickets/:id/reply` | 2663 | yes |
| 237 | `AdminController` | PATCH | `/api/admin/v1/feedback/:id/reply` | 2670 | yes |
| 238 | `AdminController` | POST | `/api/admin/v1/feedback/:id/reply` | 2679 | yes |
| 239 | `AdminController` | PATCH | `/api/admin/v1/feedback/tickets/:id/status` | 2688 | yes |
| 240 | `AdminController` | PATCH | `/api/admin/v1/feedback/:id/status` | 2699 | yes |
| 241 | `AdminController` | PATCH | `/api/admin/v1/feedback/:id/resolve` | 2708 | yes |
| 242 | `AdminController` | GET | `/api/admin/v1/faqs` | 2713 | NO |
| 243 | `AdminController` | POST | `/api/admin/v1/faqs` | 2717 | yes |
| 244 | `AdminController` | PUT | `/api/admin/v1/faqs/:id` | 2737 | yes |
| 245 | `AdminController` | PATCH | `/api/admin/v1/faqs/:id` | 2759 | yes |
| 246 | `AdminController` | DELETE | `/api/admin/v1/faqs/:id` | 2767 | yes |
| 247 | `AdminController` | GET | `/api/admin/v1/reply-presets` | 2778 | NO |
| 248 | `AdminController` | POST | `/api/admin/v1/reply-presets` | 2782 | yes |
| 249 | `AdminController` | PUT | `/api/admin/v1/reply-presets/:id` | 2801 | yes |
| 250 | `AdminController` | PATCH | `/api/admin/v1/reply-presets/:id` | 2821 | yes |
| 251 | `AdminController` | DELETE | `/api/admin/v1/reply-presets/:id` | 2829 | yes |
| 252 | `AdminController` | GET | `/api/admin/v1/feedback-categories` | 2840 | NO |
| 253 | `AdminController` | POST | `/api/admin/v1/feedback-categories` | 2848 | yes |
| 254 | `AdminController` | PUT | `/api/admin/v1/feedback-categories/:id` | 2860 | yes |
| 255 | `AdminController` | PATCH | `/api/admin/v1/feedback-categories/:id` | 2880 | yes |
| 256 | `AdminController` | DELETE | `/api/admin/v1/feedback-categories/:id` | 2888 | yes |
| 257 | `AdminController` | GET | `/api/admin/v1/system/settings` | 2912 | NO |
| 258 | `AdminController` | GET | `/api/admin/v1/settings` | 2924 | NO |
| 259 | `AdminController` | GET | `/api/admin/v1/config` | 2929 | NO |
| 260 | `AdminController` | PUT | `/api/admin/v1/system/settings` | 2934 | yes |
| 261 | `AdminController` | PATCH | `/api/admin/v1/settings` | 2965 | yes |
| 262 | `AdminController` | PATCH | `/api/admin/v1/config` | 2970 | yes |
| 263 | `AdminController` | POST | `/api/admin/v1/config/reset` | 2976 | yes |
| 264 | `AdminController` | GET | `/api/admin/v1/audit-logs` | 2981 | NO |


## 4. Front-facing write endpoints (`/api/v1`, POST/PATCH/PUT/DELETE)

104 endpoints. `store.service.ts method` lists the `StoreService` methods the handler calls (`this.store.<method>(...)`, including
transitively through other `PublicController` handlers); `Prisma model(s) written` lists the models whose rows those methods
mutate. Persistence path: `StoreService.persist()` (`apps/api/src/store.service.ts:1879-1893`) calls
`PrismaRuntimeService.saveRuntimeState`, which delegates to `saveRelationalRuntimeState`
(`apps/api/src/relational-runtime.mapper.ts:136-286`). That function upserts almost every table on every save, so the table
below records the models the *business logic* touches, not the full upsert fan-out.

Two code paths bypass the mapper and write Prisma directly, which is why `HiddenPost`, `MonthlyReport` and `ReportAdvice`
appear in the table without a runtime-snapshot round trip: `POST /api/v1/posts/:id/hide` -> `prisma.hiddenPost.upsert`
(`apps/api/src/store.service.ts:4841-4852`) and the three report-poster routes -> `prisma.monthlyReport` /
`prisma.reportAdvice` (`apps/api/src/monthly-report.service.ts:314-425`).

| # | Endpoint | Handler (line) | store.service.ts method(s) | Prisma model(s) written |
| ---: | --- | --- | --- | --- |
| 1 | `POST /api/v1/archive/journeys/:id/export` | `exportArchiveJourney` (L229) | `createJourneyArchiveExport` (L1718) | MediaAsset |
| 2 | `POST /api/v1/archive/journeys/:id/restore` | `restoreArchiveJourney` (L234) | `restoreArchivedJourney` (L2925) | LifeJourney |
| 3 | `DELETE /api/v1/archive/journeys/:id` | `deleteArchiveJourney` (L239) | `deleteJourneyArchive` (L2940) | AIJob, ActionCommitment, AgentDecisionLog, DecisionRecord, Diary, FollowUpJob, JourneyUpdate, LifeJourney, MediaAsset, MemoryItem, MessageToFutureSelf, Mood, OutcomeCheckin, PeerExperience, PeerMatch, PersonalSupportPlan, Post, RealityHandoff, RecoverySnapshot, SafetyEvent, SituationSnapshot, UserNotification |
| 4 | `POST /api/v1/journeys` | `createJourney` (L249) | `createJourney` (L2459) | AIJob, AIProvider, AgentDecisionLog, JourneyUpdate, LifeJourney, SafetyEvent, SituationSnapshot |
| 5 | `POST /api/v1/testing/cleanup-browser-fixtures` | `cleanupBrowserFixtures` (L270) | `cleanupBrowserFixtures` (L2633) | AIJob, ActionCommitment, AgentDecisionLog, CooldownItem, DecisionRecord, FollowUpJob, JourneyUpdate, LifeJourney, MemoryItem, MessageToFutureSelf, OutcomeCheckin, PeerExperience, PeerMatch, PersonalSupportPlan, RealityHandoff, RecoverySnapshot, SafetyEvent, SituationSnapshot, UserNotification |
| 6 | `PATCH /api/v1/journeys/:id/intent` | `journeyIntent` (L296) | `setJourneyIntent` (L2766) | LifeJourney, SafetyEvent |
| 7 | `PATCH /api/v1/journeys/:id` | `patchJourney` (L302) | `flush` (L1895)<br>`journeyDetail` (L2850)<br>`updateJourneyStatus` (L4810) | LifeJourney |
| 8 | `PATCH /api/v1/journeys/:id/situation` | `confirmSituation` (L316) | `confirmSituation` (L3014) | JourneyUpdate, LifeJourney, SituationSnapshot |
| 9 | `POST /api/v1/journeys/:id/snapshots` | `confirmSnapshot` (L342) | `confirmSituation` (L3014) | JourneyUpdate, LifeJourney, SituationSnapshot |
| 10 | `POST /api/v1/journeys/:id/situation/reanalyze` | `reanalyzeSituation` (L368) | `reanalyzeSituation` (L3136) | AIJob, AIProvider, AgentDecisionLog, JourneyUpdate, LifeJourney, SituationSnapshot |
| 11 | `POST /api/v1/journeys/:id/safety/acknowledge` | `acknowledgeSafety` (L373) | `acknowledgeSafety` (L3229) | JourneyUpdate, LifeJourney |
| 12 | `POST /api/v1/journeys/:id/updates` | `journeyUpdate` (L378) | `addJourneyUpdate` (L3247) | JourneyUpdate, LifeJourney |
| 13 | `POST /api/v1/journeys/:id/action-plan` | `actionPlan` (L386) | `generateActionPlan` (L3281) | AIJob, AIProvider |
| 14 | `POST /api/v1/journeys/:id/actions` | `createAction` (L391) | `createActionCommitment` (L3300) | ActionCommitment, FollowUpJob, JourneyUpdate, LifeJourney, OutcomeCheckin |
| 15 | `PATCH /api/v1/journeys/:id/status` | `journeyStatus` (L409) | `updateJourneyStatus` (L4810) | LifeJourney |
| 16 | `POST /api/v1/journeys/:id/graduate` | `graduate` (L414) | `graduateJourney` (L3491) | LifeJourney, RecoverySnapshot |
| 17 | `POST /api/v1/journeys/:id/graduation-consent` | `graduationConsent` (L419) | `saveGraduationConsent` (L3537) | PeerExperience |
| 18 | `POST /api/v1/actions/:id/checkin` | `actionCheckin` (L426) | `checkinAction` (L3373) | ActionCommitment, FollowUpJob, JourneyUpdate, OutcomeCheckin |
| 19 | `POST /api/v1/actions/:id/checkins` | `actionCheckins` (L442) | `checkinAction` (L3373) | ActionCommitment, FollowUpJob, JourneyUpdate, OutcomeCheckin |
| 20 | `POST /api/v1/peer-experiences` | `createPeerExperience` (L463) | `createPeerExperience` (L3630) | PeerExperience |
| 21 | `POST /api/v1/journeys/:id/peer-matches` | `peerMatches` (L480) | `suggestPeerMatches` (L3797) | PeerConversation, PeerMatch, UserNotification |
| 22 | `PATCH /api/v1/peer-matches/:id` | `peerMatch` (L490) | `updatePeerMatch` (L4008) | PeerMatch, UserNotification |
| 23 | `POST /api/v1/peer-matches/:id/respond` | `peerMatchRespond` (L504) | `updatePeerMatch` (L4008) | PeerMatch, UserNotification |
| 24 | `POST /api/v1/peer-matches/:id/consent` | `peerMatchConsent` (L513) | `startPeerConversation` (L4060) | PeerConversation, UserNotification |
| 25 | `PATCH /api/v1/peer-experiences/:id` | `updatePeerExperience` (L523) | `updatePeerExperience` (L3586) | PeerExperience |
| 26 | `POST /api/v1/actions/:id/adaptive-plan` | `adaptivePlan` (L545) | `requestAdaptiveAction` (L3450) | AIJob, AIProvider |
| 27 | `POST /api/v1/actions/:id/adapt` | `adaptiveAction` (L550) | `createAdaptiveAction` (L3474) | ActionCommitment, FollowUpJob, JourneyUpdate, LifeJourney, OutcomeCheckin |
| 28 | `POST /api/v1/decisions` | `decision` (L558) | `createDecision` (L4333) | DecisionRecord |
| 29 | `PATCH /api/v1/decisions/:id` | `updateDecision` (L568) | `updateDecision` (L4360) | DecisionRecord |
| 30 | `POST /api/v1/cooldowns` | `cooldown` (L584) | `createCooldown` (L4425) | CooldownItem, FollowUpJob |
| 31 | `POST /api/v1/handoffs` | `handoff` (L594) | `createRealityHandoff` (L4472) | RealityHandoff |
| 32 | `POST /api/v1/handoffs/:id/share` | `shareHandoff` (L599) | `shareRealityHandoff` (L4491) | RealityHandoff |
| 33 | `POST /api/v1/trusted-contacts` | `trustedContact` (L609) | `saveTrustedContact` (L4508) | TrustedContact |
| 34 | `POST /api/v1/future-messages` | `futureMessage` (L619) | `saveFutureMessage` (L4528) | FollowUpJob, MessageToFutureSelf |
| 35 | `POST /api/v1/support-plans` | `supportPlan` (L629) | `saveSupportPlan` (L4601) | PersonalSupportPlan |
| 36 | `PUT /api/v1/me/support-plan` | `supportPlanPut` (L642) | `saveSupportPlan` (L4601) | PersonalSupportPlan |
| 37 | `PUT /api/v1/me/stable-self` | `stableSelfProfilePut` (L655) | `saveStableSelfProfile` (L4646) | StableSelfProfile |
| 38 | `POST /api/v1/me/recovery` | `recoveryCheckin` (L668) | `saveRecoveryCheckin` (L4303) | RecoverySnapshot |
| 39 | `PATCH /api/v1/notifications/:id/read` | `readNotification` (L682) | `readNotification` (L4291) | UserNotification |
| 40 | `POST /api/v1/peer-conversations/:matchId/messages` | `peerMessage` (L692) | `sendPeerMessage` (L4158) | PeerMessage |
| 41 | `POST /api/v1/peer-conversations/:matchId/assist` | `peerMessageAssist` (L701) | `requestPeerResponseAssist` (L4178) | AIJob, AIProvider |
| 42 | `POST /api/v1/peer-conversations/:matchId/close` | `closePeerConversation` (L710) | `closePeerConversation` (L4196) | PeerConversation, UserNotification |
| 43 | `POST /api/v1/peer-conversations/:matchId/report` | `reportPeerConversation` (L715) | `reportPeerConversation` (L4203) | PeerConversation |
| 44 | `POST /api/v1/peer-conversations/:matchId/block` | `blockPeerConversation` (L724) | `blockPeerConversation` (L4216) | PeerConversation, PeerMatch, UserNotification |
| 45 | `POST /api/v1/peer-conversations/:matchId/feedback` | `peerConversationFeedback` (L729) | `savePeerConversationFeedback` (L4227) | PeerConversation, PeerExperience |
| 46 | `POST /api/v1/memory` | `memory` (L759) | `saveMemory` (L4704) | MemoryItem |
| 47 | `PATCH /api/v1/me/memories/:id` | `updateMemory` (L775) | `updateMemory` (L4751) | MemoryItem |
| 48 | `DELETE /api/v1/memory/:id` | `deleteMemory` (L784) | `deleteMemory` (L4784) | MemoryItem |
| 49 | `DELETE /api/v1/me/memories/:id` | `deleteMemoryAlias` (L789) | `deleteMemory` (L4784) | MemoryItem |
| 50 | `POST /api/v1/posts/:id/hug` | `hug` (L799) | `flush` (L1895)<br>`getPost` (L4860)<br>`persist` (L1879) | Post |
| 51 | `DELETE /api/v1/posts/:id/hug` | `unHug` (L808) | `flush` (L1895)<br>`getPost` (L4860)<br>`persist` (L1879) | Post |
| 52 | `POST /api/v1/posts/:id/hugs` | `hugs` (L817) | `flush` (L1895)<br>`getPost` (L4860)<br>`persist` (L1879) | Post |
| 53 | `POST /api/v1/posts/:id/favorite` | `favorite` (L822) | `addFavorite` (L1431)<br>`decoratePost` (L1863)<br>`getDemoUserId` (L2158)<br>`getPost` (L4860)<br>`persistAndFlush` (L1900) | Favorite, Letter, Post |
| 54 | `DELETE /api/v1/posts/:id/favorite` | `deleteFavorite` (L830) | `decoratePost` (L1863)<br>`getDemoUserId` (L2158)<br>`getPost` (L4860)<br>`persistAndFlush` (L1900)<br>`removeFavoriteByTarget` (L1450) | Favorite, Letter, Post |
| 55 | `POST /api/v1/posts/:id/report` | `report` (L838) | `flush` (L1895)<br>`getPost` (L4860)<br>`persist` (L1879) | Post |
| 56 | `POST /api/v1/posts/:id/hide` | `hideForCurrentUser` (L847) | `hidePostForCurrentUser` (L4841) | HiddenPost |
| 57 | `DELETE /api/v1/posts/:id` | `deletePost` (L853) | `flush` (L1895)<br>`getPost` (L4860)<br>`persist` (L1879) | Post |
| 58 | `POST /api/v1/posts` | `createPost` (L862) | `createMood` (L4869) | AIJob, AIProvider, Diary, Letter, Mood, Post, Reply |
| 59 | `POST /api/v1/moods` | `mood` (L887) | `createMood` (L4869) | AIJob, AIProvider, Diary, Letter, Mood, Post, Reply |
| 60 | `POST /api/v1/moods/:id/queue-ai-replies` | `queueReplies` (L911) | `getDemoUserId` (L2158)<br>`persist` (L1879)<br>`queueAI` (L5066)<br>`waitForAiJob` (L5179) | AIJob, AIProvider, Post, Reply |
| 61 | `POST /api/v1/posts/:id/replies` | `reply` (L973) | `createReply` (L6078)<br>`flush` (L1895) | Post, Reply |
| 62 | `POST /api/v1/replies/:id/like` | `likeReply` (L980) | `likeReply` (L4852) | Reply |
| 63 | `POST /api/v1/ai/generate` | `aiGenerate` (L985) | `queueAI` (L5066)<br>`resolveRuntimeUserId` (L2167) | AIJob, AIProvider |
| 64 | `POST /api/v1/ai/tasks` | `aiTask` (L994) | `queueAI` (L5066)<br>`resolveRuntimeUserId` (L2167) | AIJob, AIProvider |
| 65 | `PATCH /api/v1/letters/:id/read` | `readLetter` (L1071) | `persist` (L1879) | Letter |
| 66 | `POST /api/v1/letters/:id/like` | `likeLetter` (L1080) | `persist` (L1879) | Letter |
| 67 | `POST /api/v1/letters/:id/regenerate` | `regenerate` (L1089) | `persist` (L1879)<br>`queueAI` (L5066)<br>`resolveSourceContent` (L5873) | AIJob, AIProvider, Letter |
| 68 | `POST /api/v1/letters/generate` | `generateLetter` (L1134) | `getDemoUserId` (L2158)<br>`persist` (L1879)<br>`queueAI` (L5066)<br>`queueLetterGeneration` (L5013)<br>`resolveSourceContent` (L5873) | AIJob, AIProvider, Letter |
| 69 | `POST /api/v1/letters/:id/poster` | `poster` (L1148) | `createLetterPoster` (L1788) | MediaAsset |
| 70 | `POST /api/v1/share-image` | `shareImage` (L1156) | `createLetterPoster` (L1788) | MediaAsset, MonthlyReport, ReportAdvice |
| 71 | `POST /api/v1/letters/:id/save-to-diary` | `saveToDiary` (L1168) | `flush` (L1895)<br>`persist` (L1879) | Diary, Letter |
| 72 | `POST /api/v1/letters/:id/favorite` | `favoriteLetter` (L1186) | `addFavorite` (L1431)<br>`decorateLetter` (L1427)<br>`getDemoUserId` (L2158)<br>`persistAndFlush` (L1900) | Favorite, Letter, Post |
| 73 | `DELETE /api/v1/letters/:id/favorite` | `deleteFavoriteLetter` (L1196) | `decorateLetter` (L1427)<br>`getDemoUserId` (L2158)<br>`persistAndFlush` (L1900)<br>`removeFavoriteByTarget` (L1450) | Favorite, Letter, Post |
| 74 | `POST /api/v1/tools/emotion-decompose` | `decompose` (L1222) | `getDemoUserId` (L2158)<br>`queueAI` (L5066) | AIJob, AIProvider |
| 75 | `POST /api/v1/ai/tools/breakdown` | `aiBreakdown` (L1234) | `getDemoUserId` (L2158)<br>`queueAI` (L5066) | AIJob, AIProvider |
| 76 | `POST /api/v1/tools/decompose` | `decomposeAlias` (L1247) | `getDemoUserId` (L2158)<br>`queueAI` (L5066) | AIJob, AIProvider |
| 77 | `POST /api/v1/tools/run` | `runTool` (L1252) | `getDemoUserId` (L2158)<br>`queueAI` (L5066) | AIJob, AIProvider |
| 78 | `POST /api/v1/tools/rewrite` | `rewriteTool` (L1277) | `getDemoUserId` (L2158)<br>`queueAI` (L5066) | AIJob, AIProvider |
| 79 | `POST /api/v1/tools/rant` | `rantTool` (L1282) | `getDemoUserId` (L2158)<br>`queueAI` (L5066) | AIJob, AIProvider |
| 80 | `POST /api/v1/tools/heal` | `healTool` (L1287) | `getDemoUserId` (L2158)<br>`queueAI` (L5066) | AIJob, AIProvider |
| 81 | `POST /api/v1/tools/sleep` | `sleepTool` (L1292) | `getDemoUserId` (L2158)<br>`queueAI` (L5066) | AIJob, AIProvider |
| 82 | `POST /api/v1/tools/work` | `workTool` (L1297) | `getDemoUserId` (L2158)<br>`queueAI` (L5066) | AIJob, AIProvider |
| 83 | `POST /api/v1/tools/future` | `futureTool` (L1302) | `getDemoUserId` (L2158)<br>`queueAI` (L5066) | AIJob, AIProvider |
| 84 | `POST /api/v1/tools/emotion-decompose/:taskId/save` | `saveDecompose` (L1307) | `getDemoUserId` (L2158)<br>`persist` (L1879) | Diary |
| 85 | `DELETE /api/v1/me/data` | `clearData` (L1354) | `clearFavoritesForUser` (L1468)<br>`getDemoUserId` (L2158)<br>`persistAndFlush` (L1900) | Diary, Favorite, Letter, Post |
| 86 | `POST /api/v1/diaries` | `createDiary` (L1364) | `flush` (L1895)<br>`getDemoUserId` (L2158)<br>`persist` (L1879) | Diary |
| 87 | `POST /api/v1/diaries/export` | `exportDiaries` (L1393) | `createDiaryExport` (L1652)<br>`getDemoUserId` (L2158) | MediaAsset |
| 88 | `POST /api/v1/me/diaries` | `createMeDiary` (L1494) | `flush` (L1895)<br>`getDemoUserId` (L2158)<br>`persist` (L1879) | Diary |
| 89 | `DELETE /api/v1/diaries/:id` | `deleteDiary` (L1516) | — (none) | Diary |
| 90 | `DELETE /api/v1/favorites/:id` | `deleteFavoriteItem` (L1562) | `getDemoUserId` (L2158)<br>`persistAndFlush` (L1900)<br>`removeFavoriteById` (L1460) | Favorite, Letter, Post |
| 91 | `POST /api/v1/reports/monthly/:month/poster` | `reportPoster` (L1594) | — (none) | MediaAsset, MonthlyReport, ReportAdvice |
| 92 | `POST /api/v1/report/share-image` | `reportShareImage` (L1599) | — (none) | MediaAsset, MonthlyReport, ReportAdvice |
| 93 | `PUT /api/v1/settings/privacy` | `updatePrivacy` (L1620) | `flush` (L1895)<br>`persist` (L1879)<br>`resolveRuntimeUserId` (L2167) | PrivacySetting |
| 94 | `PATCH /api/v1/settings/privacy` | `patchPrivacy` (L1654) | `flush` (L1895)<br>`persist` (L1879)<br>`resolveRuntimeUserId` (L2167) | PrivacySetting |
| 95 | `PATCH /api/v1/me/privacy` | `patchMePrivacy` (L1659) | `flush` (L1895)<br>`persist` (L1879)<br>`resolveRuntimeUserId` (L2167) | PrivacySetting |
| 96 | `PATCH /api/v1/privacy-settings` | `patchPrivacyAlias` (L1664) | `flush` (L1895)<br>`persist` (L1879)<br>`resolveRuntimeUserId` (L2167) | PrivacySetting |
| 97 | `POST /api/v1/feedback` | `feedback` (L1689) | `createFeedbackTicket` (L1527)<br>`decorateFeedbackTicket` (L1510) | FeedbackTicket |
| 98 | `POST /api/v1/media/upload` | `uploadMedia*` (L1713) | `createMediaAsset` (L1622) | MediaAsset |
| 99 | `DELETE /api/v1/media/:id` | `deleteMedia` (L1722) | `deleteMediaAsset` (L1842) | MediaAsset |
| 100 | `POST /api/v1/upload` | `uploadAlias` (L1729) | — (none) | — (none) |
| 101 | `POST /api/v1/uploads` | `uploadsAlias` (L1734) | — (none) | — (none) |
| 102 | `POST /api/v1/export/diaries` | `exportDiariesAlias` (L1739) | `createDiaryExport` (L1652)<br>`getDemoUserId` (L2158) | MediaAsset |
| 103 | `POST /api/v1/share/image` | `shareImageAlias` (L1744) | `createLetterPoster` (L1788) | MediaAsset, MonthlyReport, ReportAdvice |
| 104 | `POST /api/v1/assets/complete` | `complete` (L1749) | — (none) | — (none) |

### 4b. Notes on individual rows

- `POST /api/v1/upload`: disabled legacy stub: always throws `BadRequestException`, writes nothing (`controllers.ts:1729-1732`)
- `POST /api/v1/uploads`: disabled legacy stub: always throws `BadRequestException`, writes nothing (`controllers.ts:1734-1737`)
- `POST /api/v1/assets/complete`: disabled legacy stub: always throws `BadRequestException`, writes nothing (`controllers.ts:1749-1752`)
- `POST /api/v1/media/upload`: `*` marks a handler name recovered by hand: the `@UseInterceptors(FileInterceptor(...))` decorator at `controllers.ts:1714` sits between the route decorator and `uploadMedia` (L1715)
- `POST /api/v1/posts/:id/hug`, `DELETE /api/v1/posts/:id/hug`, `POST /api/v1/posts/:id/hugs`, `POST /api/v1/posts/:id/report`,
  `DELETE /api/v1/posts/:id`: the handler mutates the `Post` object returned by `store.getPost()` in place (`post.hugCount += 1`,
  `post.reportCount += 1`, `post.status = 'deleted'`) and then calls `persist()`.
- `POST /api/v1/diaries` and `POST /api/v1/me/diaries`: push a plain object into `this.store.diaries` (`controllers.ts:1387`), which
  triggers the `set diaries` accessor (`store.service.ts:1254-1257`).
- `PATCH /api/v1/settings/privacy` / `me/privacy` / `privacy-settings` and `PUT settings/privacy`: assign into
  `this.store.privacySettings[runtimeId]` directly (`controllers.ts:1648`).
- `POST /api/v1/letters/:id/save-to-diary`: sets `letter.savedToDiary` and unshifts a diary (`controllers.ts:1168-1184`).
- `PATCH /api/v1/letters/:id/read` and `POST /api/v1/letters/:id/like`: mutate the `Letter` object in place then `persist()`
  (`controllers.ts:1071-1087`).
- `DELETE /api/v1/diaries/:id` and `DELETE /api/v1/me/data`: filter `this.store.diaries` / `letters` (accessor setters).
- `POST /api/v1/journeys/:id/action-plan`, `POST /api/v1/actions/:id/adaptive-plan`, `POST /api/v1/ai/generate`,
  `POST /api/v1/ai/tasks`, `POST /api/v1/tools/*`: queue an `AIJob` via `StoreService.queueAI` (`store.service.ts:5066-5100`) which
  unshifts into `aiJobs` and can add a synthetic `AIProvider` row for peer drafting.
- `POST /api/v1/peer-conversations/:matchId/close`: `closePeerConversation` (`store.service.ts:4196-4201`) calls the private
  helper `closePeerConversationRecord` (`store.service.ts:3959-3987`), which sets `conversation.status/closedAt/closedReason`
  and enqueues two `UserNotification` rows via `peerNotification`.
- `POST /api/v1/posts/:id/hide`: `HiddenPost` is written through `prisma.hiddenPost.upsert` and is NOT part of the runtime
  snapshot, so it never round-trips through `relational-runtime.mapper.ts`.

### 4c. Write endpoints with no business-model write

`POST /api/v1/upload` (L1729), `POST /api/v1/uploads` (L1734) and `POST /api/v1/assets/complete` (L1749) are declared
routes whose handlers unconditionally throw `BadRequestException` (`controllers.ts:1729-1752`); they persist nothing.
They remain in the OpenAPI document published by `apps/api/src/main.ts:162-190` (`/docs` and `/docs-json`).


## 5. Admin endpoint -> DB model matrix

Models are attributed from the `this.store.<collection>` accessors used in each handler (`apps/api/src/store.service.ts:1226-1400`),
plus `AuditLog` for `store.audit(...)` and `AdminUser` for `store.login(...)` / `store.verifyToken(...)` (so every guarded
handler picks up `AdminUser`).

| Method | Path | Line | Auth | Handler | Prisma model(s) read/written |
| --- | --- | ---: | --- | --- | --- |
| POST | `/auth/login` | 1856 | login-only | `login` | AdminUser, AuditLog |
| POST | `/login` | 1863 | login-only | `loginAlias` | AdminUser, AuditLog |
| POST | `/auth/logout` | 1868 | login-only | `logout` | — |
| GET | `/auth/me` | 1873 | yes | `authMe` | AdminUser |
| GET | `/me` | 1878 | yes | `me` | AdminUser |
| GET | `/dashboard/overview` | 1884 | NO | `overview` | — |
| GET | `/dashboard` | 1889 | NO | `dashboardAlias` | — |
| GET | `/dashboard/summary` | 1894 | NO | `dashboardSummary` | — |
| GET | `/dashboard/activity` | 1907 | NO | `dashboardActivity` | — |
| GET | `/dashboard/emotion-distribution` | 1912 | NO | `dashboardEmotionDistribution` | — |
| GET | `/journeys` | 1917 | yes | `adminJourneys` | ActionCommitment, AdminUser, JourneyUpdate, LifeJourney |
| GET | `/actions` | 1935 | yes | `adminActions` | ActionCommitment, AdminUser |
| GET | `/checkins` | 1950 | yes | `adminCheckins` | AdminUser, OutcomeCheckin |
| GET | `/peer-experiences` | 1965 | yes | `adminPeerExperiences` | AdminUser, PeerExperience |
| PATCH | `/peer-experiences/:id/review` | 1977 | yes | `reviewPeerExperience` | AdminUser, AuditLog, PeerExperience |
| GET | `/peer-matches` | 1993 | yes | `adminPeerMatches` | AdminUser, PeerMatch |
| GET | `/follow-ups` | 2005 | yes | `adminFollowUps` | AdminUser, FollowUpJob |
| GET | `/notifications` | 2017 | yes | `adminNotifications` | AdminUser, UserNotification |
| GET | `/peer-conversations` | 2029 | yes | `adminPeerConversations` | AdminUser, PeerConversation, PeerMessage |
| GET | `/safety/events` | 2046 | yes | `safetyEvents` | AdminUser, SafetyEvent |
| GET | `/support/plans` | 2056 | yes | `supportPlans` | AdminUser, PersonalSupportPlan |
| GET | `/memory` | 2066 | yes | `adminMemory` | AdminUser, MemoryItem |
| GET | `/dashboard/ai-summary` | 2080 | NO | `dashboardAiSummary` | — |
| GET | `/users` | 2085 | NO | `users` | User |
| GET | `/users/:id` | 2102 | NO | `user` | PrivacySetting, User |
| PATCH | `/users/:id/status` | 2106 | yes | `userStatus` | AdminUser, AuditLog, User |
| POST | `/users/:id/note` | 2122 | yes | `userNote` | AdminUser, AuditLog |
| GET | `/users/export` | 2138 | NO | `exportUsers` | User |
| PATCH | `/users/:id/tags` | 2148 | NO | `userTags` | — |
| POST | `/users/:id/tags` | 2153 | NO | `userTagsPost` | — |
| DELETE | `/users/:id/data` | 2158 | NO | `deleteUserData` | Diary, Favorite, Letter, Post |
| GET | `/posts` | 2167 | NO | `adminPosts` | Post |
| GET | `/posts/:id` | 2191 | NO | `adminPost` | Reply |
| PATCH | `/posts/:id/moderation` | 2195 | yes | `postModeration` | AdminUser, AuditLog, Post |
| PATCH | `/posts/:id/review` | 2206 | yes | `postReview` | AdminUser, AuditLog, Post |
| PATCH | `/posts/:id/approve` | 2224 | yes | `postApprove` | AdminUser, AuditLog, Post |
| PATCH | `/posts/:id/reject` | 2229 | yes | `postReject` | AdminUser, AuditLog, Post |
| PATCH | `/posts/:id/block` | 2234 | yes | `postBlock` | AdminUser, AuditLog, Post |
| PATCH | `/posts/:id/visibility` | 2238 | yes | `postVisibility` | AdminUser, AuditLog |
| PATCH | `/posts/:id/risk` | 2257 | yes | `postRisk` | AdminUser, AuditLog, Post |
| POST | `/posts/:id/regenerate-replies` | 2262 | NO | `regenerateReplies` | AIJob, AIProvider, Reply |
| DELETE | `/posts/:id` | 2296 | NO | `adminDeletePost` | — |
| GET | `/replies` | 2304 | NO | `adminReplies` | Reply |
| GET | `/replies/:id` | 2325 | NO | `adminReply` | Reply |
| PATCH | `/replies/:id/moderation` | 2329 | yes | `replyModeration` | AdminUser, AuditLog, Post, Reply |
| PATCH | `/replies/:id/review` | 2340 | yes | `replyReview` | AdminUser, AuditLog, Post, Reply |
| PATCH | `/replies/:id/content` | 2353 | yes | `replyContent` | AdminUser, AuditLog, Post, Reply |
| PATCH | `/replies/:id/approve` | 2358 | yes | `replyApprove` | AdminUser, AuditLog, Post, Reply |
| PATCH | `/replies/:id/block` | 2367 | yes | `replyBlock` | AdminUser, AuditLog, Post, Reply |
| PATCH | `/replies/:id/edit` | 2372 | yes | `replyEdit` | AdminUser, AuditLog, Post, Reply |
| GET | `/ai/providers` | 2377 | NO | `providers` | AIProvider |
| POST | `/ai/providers` | 2389 | yes | `createProvider` | AIProvider, AdminUser, AuditLog |
| PUT | `/ai/providers/:id` | 2417 | yes | `updateProvider` | AIProvider, AdminUser, AuditLog |
| PATCH | `/ai/providers/:id` | 2435 | yes | `patchProvider` | AIProvider, AdminUser, AuditLog |
| POST | `/ai/providers/:id/test` | 2443 | yes | `testProvider` | AIProvider, AdminUser, AuditLog |
| GET | `/ai/ollama/status` | 2457 | NO | `ollamaStatus` | AIProvider |
| POST | `/ai/ollama/sync-models` | 2462 | yes | `syncOllamaModels` | AdminUser |
| DELETE | `/ai/providers/:id` | 2468 | yes | `deleteProvider` | AIProvider, AdminUser, AuditLog |
| GET | `/ai/routes` | 2480 | NO | `routes` | AIStyleRoute |
| PUT | `/ai/routes/:style` | 2484 | yes | `updateRoute` | AIProvider, AIStyleRoute, AdminUser, AuditLog |
| PATCH | `/ai/routes/:style` | 2514 | yes | `patchRoute` | AIProvider, AIStyleRoute, AdminUser, AuditLog |
| POST | `/ai/routes/:style/test` | 2523 | yes | `testRoute` | AIJob, AIProvider, AdminUser, AuditLog |
| GET | `/ai/jobs` | 2547 | NO | `jobs` | AIJob |
| GET | `/ai/jobs/:id` | 2551 | NO | `job` | AIJob |
| POST | `/ai/jobs/:id/retry` | 2555 | yes | `retryJob` | AIJob, AIProvider, AdminUser, AuditLog |
| POST | `/ai/jobs/:id/fallback` | 2574 | NO | `fallbackJob` | — |
| GET | `/feedback/tickets` | 2579 | NO | `tickets` | FeedbackTicket |
| GET | `/feedback/summary` | 2603 | NO | `feedbackSummary` | FeedbackTicket, SystemSetting |
| GET | `/feedback` | 2644 | NO | `feedbackAlias` | FeedbackTicket |
| GET | `/feedback/tickets/:id` | 2653 | NO | `ticket` | — |
| GET | `/feedback/:id` | 2658 | NO | `feedbackItemAlias` | — |
| POST | `/feedback/tickets/:id/reply` | 2663 | yes | `ticketReply` | AdminUser, AuditLog, FeedbackTicket |
| PATCH | `/feedback/:id/reply` | 2670 | yes | `feedbackReplyAlias` | AdminUser, AuditLog, FeedbackTicket |
| POST | `/feedback/:id/reply` | 2679 | yes | `feedbackReplyPostAlias` | AdminUser, AuditLog, FeedbackTicket |
| PATCH | `/feedback/tickets/:id/status` | 2688 | yes | `ticketStatus` | AdminUser, AuditLog, FeedbackTicket |
| PATCH | `/feedback/:id/status` | 2699 | yes | `feedbackStatusAlias` | AdminUser, AuditLog, FeedbackTicket |
| PATCH | `/feedback/:id/resolve` | 2708 | yes | `feedbackResolveAlias` | AdminUser, AuditLog, FeedbackTicket |
| GET | `/faqs` | 2713 | NO | `adminFaqs` | FaqItem |
| POST | `/faqs` | 2717 | yes | `createFaq` | AdminUser, AuditLog, FaqItem |
| PUT | `/faqs/:id` | 2737 | yes | `updateFaq` | AdminUser, AuditLog, FaqItem |
| PATCH | `/faqs/:id` | 2759 | yes | `patchFaq` | AdminUser, AuditLog, FaqItem |
| DELETE | `/faqs/:id` | 2767 | yes | `deleteFaq` | AdminUser, AuditLog, FaqItem |
| GET | `/reply-presets` | 2778 | NO | `adminPresets` | ReplyPreset |
| POST | `/reply-presets` | 2782 | yes | `createPreset` | AdminUser, AuditLog, ReplyPreset |
| PUT | `/reply-presets/:id` | 2801 | yes | `updatePreset` | AdminUser, AuditLog, ReplyPreset |
| PATCH | `/reply-presets/:id` | 2821 | yes | `patchPreset` | AdminUser, AuditLog, ReplyPreset |
| DELETE | `/reply-presets/:id` | 2829 | yes | `deletePreset` | AdminUser, AuditLog, ReplyPreset |
| GET | `/feedback-categories` | 2840 | NO | `adminCategories` | FeedbackCategory, FeedbackTicket |
| POST | `/feedback-categories` | 2848 | yes | `createCategory` | AdminUser, AuditLog, FeedbackCategory |
| PUT | `/feedback-categories/:id` | 2860 | yes | `updateCategory` | AdminUser, AuditLog, FeedbackCategory |
| PATCH | `/feedback-categories/:id` | 2880 | yes | `patchCategory` | AdminUser, AuditLog, FeedbackCategory |
| DELETE | `/feedback-categories/:id` | 2888 | yes | `deleteCategory` | AdminUser, AuditLog, FeedbackCategory, FeedbackTicket |
| GET | `/system/settings` | 2912 | NO | `settings` | SystemSetting |
| GET | `/settings` | 2924 | NO | `settingsAlias` | SystemSetting |
| GET | `/config` | 2929 | NO | `config` | — |
| PUT | `/system/settings` | 2934 | yes | `updateSettings` | AdminUser, AuditLog, PrivacySetting, SystemSetting |
| PATCH | `/settings` | 2965 | yes | `patchSettingsAlias` | AdminUser, AuditLog, PrivacySetting, SystemSetting |
| PATCH | `/config` | 2970 | yes | `patchConfig` | AdminUser, AuditLog, PrivacySetting, SystemSetting |
| POST | `/config/reset` | 2976 | yes | `resetConfig` | AdminUser, AuditLog, PrivacySetting, SystemSetting |
| GET | `/audit-logs` | 2981 | NO | `auditLogs` | AuditLog |


## 6. Prisma model coverage

`artifacts/product-audit/db-models.json` lists 51 models and 18 enums. `relational-runtime.mapper.ts` reads them in
`loadRelationalRuntimeState` (L25-66) and upserts them in `saveRelationalRuntimeState` (L136-285).

`Mapped` = the model has a `db.<model>` or `tx.<model>` call in `relational-runtime.mapper.ts`.
`Front write` = some `/api/v1` POST/PATCH/PUT/DELETE reaches it (section 4). `Admin write` = an `/api/admin/v1` write does.

| Prisma model | Mapped | Front write | Admin write | Note |
| --- | --- | --- | --- | --- |
| User | yes | no | yes | `DELETE /api/v1/me/data` clears favorites/diaries/letters but does not delete the User row |
| AdminUser | yes | no | yes | — |
| AdminRole | yes | no | no | upserted by the mapper (`relational-runtime.mapper.ts:169`) from admin role strings; no dedicated API |
| PrivacySetting | yes | yes | yes | — |
| SystemSetting | yes | no | yes | — |
| Mood | yes | yes | no | `DELETE /api/v1/archive/journeys/:id` detaches `journeyId` rather than deleting the row (`store.service.ts:2973`) |
| Post | yes | yes | yes | same detach path as `Mood` (`store.service.ts:2974`) |
| Reply | yes | yes | yes | — |
| Letter | yes | yes | yes | — |
| Diary | yes | yes | yes | same detach path (`store.service.ts:2972`) |
| LifeJourney | yes | yes | yes | — |
| SituationSnapshot | yes | yes | no | — |
| JourneyUpdate | yes | yes | yes | — |
| ActionCommitment | yes | yes | yes | — |
| OutcomeCheckin | yes | yes | yes | — |
| PeerExperience | yes | yes | yes | same detach path (`store.service.ts:2975`) |
| PeerMatch | yes | yes | yes | same detach path (`store.service.ts:2976`) |
| PeerReputation | yes | no | no | mapper-only today: `suggestPeerMatches` reads it, no route writes it |
| DecisionRecord | yes | yes | no | same detach path (`store.service.ts:2977`) |
| CooldownItem | yes | yes | no | — |
| RealityHandoff | yes | yes | no | same detach path (`store.service.ts:2978`) |
| TrustedContact | yes | yes | no | — |
| MessageToFutureSelf | yes | yes | no | same detach path (`store.service.ts:2979`) |
| PersonalSupportPlan | yes | yes | yes | same detach path (`store.service.ts:2980`) |
| StableSelfProfile | yes | yes | no | — |
| MemoryItem | yes | yes | yes | same detach path (`store.service.ts:2981`) |
| RecoverySnapshot | yes | yes | no | same detach path (`store.service.ts:2982`) |
| SafetyEvent | yes | yes | yes | same detach path (`store.service.ts:2983`) |
| AgentDecisionLog | yes | yes | no | same detach path (`store.service.ts:2984`) |
| FollowUpJob | yes | yes | yes | same detach path (`store.service.ts:2985`) |
| UserNotification | yes | yes | yes | rows filtered out when `targetRoute` points at the deleted journey (`store.service.ts:2965`) |
| PeerConversation | yes | yes | yes | — |
| PeerMessage | yes | yes | yes | — |
| Favorite | yes | yes | yes | — |
| MonthlyReport | no | yes | no | written outside the mapper: `monthly-report.service.ts:337` |
| ReportAdvice | no | yes | no | written outside the mapper: `monthly-report.service.ts:425` |
| MediaAsset | yes | yes | no | — |
| MoodAttachment | yes | no | no | join table rewritten wholesale by the mapper (`relational-runtime.mapper.ts:236-238`); no dedicated API |
| DiaryAttachment | yes | no | no | join table rewritten wholesale by the mapper (`relational-runtime.mapper.ts:239-241`); no dedicated API |
| RuntimeState | yes | no | no | holds the legacy JSON payload and the `persistence: relational-primary` marker (`prisma-runtime.service.ts:19-31`) |
| FeedbackTicket | yes | yes | yes | — |
| FeedbackCategory | yes | no | yes | — |
| FaqItem | yes | no | yes | — |
| ReplyPreset | yes | no | yes | — |
| HugAction | no | no | no | schema-only, no reader or writer in `apps/api/src` |
| HiddenPost | no | yes | no | written outside the mapper: `store.service.ts:4844` |
| AIProvider | yes | yes | yes | — |
| AIStyleRoute | yes | no | yes | — |
| AIJob | yes | yes | yes | rows filtered out only when `contentId` matches the journey or one of its actions (`store.service.ts:2964`) |
| ModerationLog | no | no | no | schema-only, no reader or writer in `apps/api/src` |
| AuditLog | yes | no | yes | — |

### 6b. Models outside the runtime snapshot

- `RuntimeState` - holds the legacy JSON payload and the `persistence: relational-primary` marker
  (`prisma-runtime.service.ts:19-31`, `relational-runtime.mapper.ts:284`).
- `HiddenPost` - written by `prisma.hiddenPost.upsert` and read by `prisma.hiddenPost.findMany`
  (`store.service.ts:4825`, `4844`) from `POST /api/v1/posts/:id/hide`. Not in the mapper, so it is never restored into `this.data`.
- `MonthlyReport` / `ReportAdvice` - written only by `MonthlyReportService` (`monthly-report.service.ts:314-425`).
- `AdminRole` - upserted by the mapper (`relational-runtime.mapper.ts:169`) from admin role strings; no dedicated API.
- `HugAction` and `ModerationLog` - declared in `prisma/schema.prisma` (L942, L1044) but have **zero** references in `apps/`,
  `packages/` and `tests/` (grep for `HugAction`/`hugAction`/`ModerationLog`/`moderationLog` returns only the schema).
  Static analysis found no reader or writer. **UNCONFIRMED at runtime** - only source inspection was used.
- `MoodAttachment` / `DiaryAttachment` - rewritten wholesale by the mapper (`relational-runtime.mapper.ts:236-241`);
  no dedicated API.


## 7. Side-writers outside AdminController / PublicController

`MonthlyReportService` is reachable through `PublicController` (`GET /api/v1/reports/monthly` L1570,
`GET /api/v1/reports/monthly/:month/advice` L1590, `POST /api/v1/reports/monthly/:month/poster` L1595). The follow-up worker
is not reachable through any HTTP route.

| File | Lines | Models | Trigger |
| --- | --- | --- | --- |
| `apps/api/src/monthly-report.service.ts` | 314, 318, 337, 370, 425 | MonthlyReport, ReportAdvice, AIJob | called from `GET /api/v1/reports/monthly`, `GET /api/v1/reports/monthly/:month/advice`, `POST /api/v1/reports/monthly/:month/poster` |
| `apps/api/src/follow-up-worker.service.ts` | 27, 38, 51, 53, 55, 58 | FollowUpJob, UserNotification, MessageToFutureSelf, CooldownItem, DecisionRecord, PrivacySetting | BullMQ worker on the `FOLLOW_UP_QUEUE_NAME` Redis queue (`follow-up-queue.ts`), no HTTP route |

The follow-up worker is the only component that writes `FollowUpJob.status = 'delivered'` and releases `CooldownItem` /
`DecisionRecord` rows; it then calls `store.reloadRuntimeState()` to refresh the in-memory snapshot.

## 8. Confirmation status

| Claim | Evidence | Status |
| --- | --- | --- |
| 264 endpoints, 3 controllers | `artifacts/product-audit/api-endpoints.json` cross-checked by re-parsing `controllers.ts` | confirmed (0 diffs) |
| 100 admin endpoints, 61 enforced | handler bodies parsed, delegation closure computed | confirmed |
| 39 orphan admin endpoints | all `/api/admin/v1` literals in `apps/admin/src` enumerated | confirmed for the UI surface; `scripts/*.ts` call 4 of them (`login`, `auth/me`, `posts/:id/approve`, `feedback/tickets`) |
| Admin resource -> endpoint mapping | `TablePage.vue:43-67` + per-view `adminApi` literals | confirmed |
| Front write -> store method -> model | handler + store method bodies parsed; helper methods read manually | confirmed (helper-only writers `applyFavoriteRemoval`, `closePeerConversationRecord`, `peerNotification` were read by hand and folded in) |
| `HugAction` and `ModerationLog` unused | grep for `HugAction`/`hugAction`/`ModerationLog`/`moderationLog` across `apps/`, `packages/`, `tests/` | **UNCONFIRMED at runtime** - only the two `prisma/schema.prisma` declarations match, but only static analysis was used |
| `PATCH`/`POST users/:id/tags` do not persist | handler body `controllers.ts:2148-2156` returns `{ item: { id, tags } }` without touching the store | confirmed |
| `DELETE users/:id/data` does persist | handler body `controllers.ts:2158-2165` filters `diaries` and `letters` and calls `persistAndFlush` | confirmed |

