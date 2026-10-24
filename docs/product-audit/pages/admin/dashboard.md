# admin: dashboard (数据总览)

Route: `/dashboard`
Component: `apps/admin/src/views/Dashboard.vue`
Group: 总览

## PURPOSE

The operator's landing screen after login. It renders one aggregate payload, `GET /api/admin/v1/dashboard/overview`, as four headline metrics (today's new users, today's posts, pending reviews, AI success rate), a 7-day activity line chart, an emotion donut, the 8 most recent posts, an AI job status table, an eight-cell "现实陪跑" strip that deep-links into the experience/safety resources, and a collapsed AI monitor panel.

## USER_JOB

"Show me whether anything is on fire right now, and give me one tap into the queue that needs me."

## ENTRY

- `/login` posts to `/api/admin/v1/auth/login` then `router.push('/dashboard')` (`apps/admin/src/views/Login.vue:23-32`).
- `/` redirects to `/dashboard` (`apps/admin/src/router.ts:100`).
- The sidebar brand mark is a `RouterLink to="/dashboard"` (`apps/admin/src/views/Layout.vue:92`), and `/dashboard` is the first entry of `primaryPaths` (`Layout.vue:26-36`), so it is always in the visible nav with `data-testid=admin-nav-dashboard` (`Layout.vue:66`).

## EXIT

Every exit is an in-app `router.push`, all of them guarded only by the client-side `router.beforeEach` token check (`apps/admin/src/router.ts:120-123`):

| source | target |
| --- | --- |
| 现实陪跑 strip (8 buttons) | `/experience/journeys`, `/experience/actions`, `/experience/checkins`, `/experience/peers`, `/safety/events`, `/experience/follow-ups`, `/experience/peer-conversations`, `/experience/notifications` (`Dashboard.vue:126-133`) |
| 最新树洞动态 → 查看全部 | `/posts` (`Dashboard.vue:187`) |
| AI 任务概览 → 查看全部 | `/ai/jobs` (`Dashboard.vue:195`) |
| 快捷操作 | `/posts`, `/ai/providers`, `/ops/feedback` (`Dashboard.vue:210-212`) |

## ROUTES

`/dashboard` — `artifacts/product-audit/admin-routes.json` entry `{ path: "/dashboard", component: "Dashboard.vue", title: "数据总览", resource: "dashboard", viaTablePage: false, group: "总览" }`. Declared at `apps/admin/src/router.ts:101`. No aliases, no query parameters, no dynamic segments.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading message, panel-replacing | `loading` (ref false) | `Dashboard.vue:9`, `:96` |
| error banner, panel-replacing | `error` | `Dashboard.vue:10`, `:97` |
| loaded body | `overview` truthy | `Dashboard.vue:8`, `:99` |
| zero-data variants of each block | computed from `overview.*` | see EMPTY_STATES |

There is no partial state: `overview` is assigned in one statement (`Dashboard.vue:83`), so either the whole page renders or neither the loading nor the body branch matches and the screen is blank.

## CONTROLS

| control | handler | real effect |
| --- | --- | --- |
| 刷新数据 `data-testid=admin-dashboard-refresh` | `load` (`Dashboard.vue:208`) | re-issues `GET /api/admin/v1/dashboard/overview`; the only control on the page that touches the API |
| 8 现实陪跑 cells `Dashboard.vue:126-133` | `router.push(...)` | client-side navigation only; no request |
| 查看全部 (树洞) `data-testid=admin-dashboard-open-posts` | `router.push('/posts')` | navigation only |
| 查看全部 (AI) `data-testid=admin-dashboard-open-jobs` | `router.push('/ai/jobs')` | navigation only |
| 审核内容 `data-testid=admin-shortcut-posts` | `router.push('/posts')` | navigation only |
| 查看 AI 配置 `data-testid=admin-shortcut-ai` | `router.push('/ai/providers')` | navigation only |
| 处理反馈 `data-testid=admin-shortcut-feedback` | `router.push('/ops/feedback')` | navigation only |
| AI 运行监控 `<details>` `data-testid=admin-ai-monitor` | native disclosure | expands six read-only values from `overview.aiMonitor`; two of them (本地推理 / 远程主路由 / 远程备用) are hard-coded strings, not data |

No filters, no pagination, no search. `artifacts/product-audit/control-manifest.json` lists 36 entries for `Dashboard.vue`, but that count double-reports each `router.push` as both `click` and `routerpush` (13 duplicated entries), so the real distinct control count is 14 click targets plus 9 `data-testid` markers.

## API_READS

- `GET /api/admin/v1/dashboard/overview` — `Dashboard.vue:83`. Handler `AdminController.overview` (`apps/api/src/controllers.ts:1884-1887`), which returns `{ item: this.dashboardData() }`; `dashboardData` is `controllers.ts:1774-1854`.

No other read. The page never calls `/posts`, `/users` or `/ai/jobs` directly; it renders whatever the aggregate already embedded (`latestPosts`, `aiJobs`, `activeTrend`, `emotionDistribution`, `journeySummary`, `aiSummary`, `aiMonitor`).

## API_WRITES

None. The dashboard is strictly read-only; every action on it is a navigation. `ISSUE-014`'s list of uncalled admin endpoints includes four sibling dashboard reads that no UI reaches: `GET /dashboard` (`controllers.ts:1889`), `GET /dashboard/summary` (`1894`), `GET /dashboard/activity` (`1907`), `GET /dashboard/emotion-distribution` (`1912`), `GET /dashboard/ai-summary` (`2080`).

## DB_ENTITIES

`dashboardData()` reads the whole in-memory store snapshot, so the endpoint touches: **User** (today count, 7-day trend), **Post** (today count, pending review count, emotion distribution, latestPosts), **Reply** (pending review count, trend), **AIJob** (success rate, aiSummary, aiMonitor), **LifeJourney**, **ActionCommitment**, **OutcomeCheckin**, **PeerExperience**, **SafetyEvent**, **PersonalSupportPlan**, **FollowUpJob**, **UserNotification**, **PeerMatch**, **PeerConversation**, **RecoverySnapshot** (all inside `journeySummary`, `controllers.ts:1804-1821`), and **AIProvider** via `ollamaStatus()` (`store.service.ts:2038`).

No Prisma model is written. Cross-checked against `artifacts/product-audit/db-models.json`; the agent-4 resource table records 16 models for this endpoint.

## ADMIN_VISIBILITY

This *is* the admin visibility surface. Note that the page is itself unguarded server-side: `GET /api/admin/v1/dashboard/overview` is in the `artifacts/product-audit/admin-unguarded.json` list (line 1884), and the live proof for `ISSUE-001` confirms it returns `200` with no `authorization` header. The client-side gate is only `router.beforeEach` reading `localStorage` (`router.ts:120-123`).

## AI_USAGE

Indirect only, and read-only. The page reports `aiSuccessRate` (`controllers.ts:1826-1828`), `aiSummary` (succeeded/fallback/failed, `:1833-1838`) and `aiMonitor` (todayCalls, successRate, failureRate, averageDurationMs, fallbackCount, `:1839-1852`). It creates no `AIJob`. Because `aiSuccessRate` counts `succeeded` **and** `fallback` as successful (`controllers.ts:1792`), a stack where every job degrades to the template fallback still reports a high success rate — the exact condition recorded in `ISSUE-007` (8/8 recent jobs `status = fallback`, `HTTP 402`). The metric is real but its definition hides the degradation.

The monitor panel labels are partly hard-coded: 本地推理 shows the literal string 已禁用 and 远程主路由 / 远程备用 show literal 本地推理/`CLI Proxy`/`DeepSeek` (`Dashboard.vue:221-226`), not values read from `overview.aiMonitor`.

## PRIVACY

The aggregate is computed over unfiltered store arrays, so it exposes counts and — in `latestPosts` — the first 8 posts' full objects including `content` and `userId` (`controllers.ts:1831`). `latestPosts` is sliced without any visibility or review filter, so private (`visibility: PRIVATE`) and not-yet-published posts appear in 最新树洞动态 with their raw text (`Dashboard.vue:181-186`). The operator sees them by design, but because the endpoint has no token check (`ISSUE-001`) an anonymous caller also receives them.

## ERROR_STATES

There is an error state: `load()` catches and sets `error`, rendered as `<p v-if="error" class="panel danger dashboard-message">{{ error }}</p>` (`Dashboard.vue:84-85`, `:97`). The message is the `ApiError.message` from `packages/api-sdk/src/index.ts:22` (the server `message` field) or the fallback 数据总览加载失败.

Weaknesses, all confirmed by reading the template: the banner replaces nothing (the `v-if="overview"` body is also hidden, so the operator gets a single red line on an otherwise empty page with no retry affordance other than the 刷新数据 button that lives *inside* the hidden body); and the error is not dismissible.

## EMPTY_STATES

No explicit empty state anywhere on this page. Each block degrades silently:

- `emotionDistribution` empty → `emotionGradient` becomes the literal `'#eaf0e7 0 100%'` and the donut centre reads 总数 0 (`Dashboard.vue:15-24`, `:162`).
- `activeTrend` empty → `activityPoints` is `''`, so the SVG renders only the four grid lines and no polyline (`Dashboard.vue:36-43`, `:146-147`).
- `latestPosts` empty → the `v-for` renders zero rows; the table header stays and the 查看全部 button remains (`Dashboard.vue:179-188`).
- `aiSummary` all zero → `total` is forced to `Math.max(1, 0)` so the three ratio rows render 0.0% rather than blank (`Dashboard.vue:49`).
- `journeySummary` missing → every strip cell shows `0` via the `?? 0` fallbacks (`Dashboard.vue:126-133`).

None of these is a labelled empty state, which is a finding (see ISSUES, P3 UX).

## NATIVE_RISKS

None specific. This is a desktop web console, not the mp WebView: no `env(safe-area-inset-*)`, no back-button interception, no keyboard, no clipboard, no dial intent, no camera. The only asset is the inline SVG set in `Dashboard.vue:144-149`, so there is no network-image dependency. The page is not rendered on Android.

## ISSUES

- **P1 FUNCTIONAL** — the KPI 待审核内容 and 审核内容 shortcuts cannot complete the job they imply. `pendingReviews` counts `Post.reviewStatus === 'pending_review'` **plus** `Reply.status === 'pending_review'` (`controllers.ts:1801-1803`), but 审核内容 pushes to `/posts` (`Dashboard.vue:210`) which lists posts only, and the pending-reply queue lives at `/replies/moderation`. A dashboard that says "N waiting" and then lands the operator on a page that does not contain N is a navigation defect in the core loop.
- **P1 DATA** — `aiSuccessRate` is inflated by definition. `successfulJobs` counts `['succeeded','fallback']` (`controllers.ts:1792`) and the denominator is *all* jobs including `queued`/`running` (`:1826-1828`). With the live `ISSUE-007` state (every job falling back on `HTTP 402`) the operator sees a healthy-looking rate while the product is serving canned text.
- **P2 PRIVACY** — `latestPosts` is unfiltered (`controllers.ts:1831`), so private and unpublished post bodies are rendered on the landing page and returned to any caller because the endpoint is unguarded.
- **P3 UX** — no empty states, and the AI monitor panel mixes real metrics (`todayCalls`, `averageDurationMs`, `failureRate`) with hard-coded labels (本地推理 已禁用 / CLI Proxy / DeepSeek, `Dashboard.vue:221-226`) so an operator cannot tell which numbers are live.
- **P3 UX** — the error banner hides the whole body including the refresh button (`Dashboard.vue:96-99`), leaving no in-page recovery path.
- **P3 DUPLICATE** — four sibling dashboard endpoints (`/dashboard`, `/dashboard/summary`, `/dashboard/activity`, `/dashboard/emotion-distribution`, `/dashboard/ai-summary`) re-expose slices of the same `dashboardData()` and none has a caller (`ISSUE-014`).

## FINAL_STATUS

DONE — single real read (`controllers.ts:1884`) traced end to end, all 14 controls classified as navigation, all six empty variants and the single error path verified in the template; the findings are data-quality and navigation issues, not missing wiring.

### Static evidence

- Controls discovered in component: 36
- API reads (static): `GET /api/admin/v1/dashboard/overview`
- API writes (static): none
- Candidate fake markers in `artifacts/product-audit/fake-markers.json` for `Dashboard.vue`: 0; adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` row A26 ("every figure is computed from GET /api/admin/v1/dashboard/overview ... No fixed arrays").
- Appended: `artifacts/product-audit/admin-unguarded.json` lists all six `dashboard/*` GETs as unguarded (lines 1884, 1889, 1894, 1907, 1912, 2080); the live proof under `ISSUE-001` returned 200 for `dashboard/overview` with no token.
