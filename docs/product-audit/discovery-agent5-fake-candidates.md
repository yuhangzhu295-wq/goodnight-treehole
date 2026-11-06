# Agent-5 — FAKE FUNCTION HUNTER (discovery)

Read-only adjudication of every static fake-marker candidate for 晚安树洞.

| Item | Value |
| --- | --- |
| Repo | C:/Users/zyu33/Projects/goodnight-treehole |
| Branch / HEAD | codex/post-recovery-validation / 158c298 |
| Inputs | artifacts/product-audit/fake-markers.json, control-manifest.json, mp-routes.json, admin-routes.json, api-endpoints.json, db-models.json |
| Scope | apps/mp/src/**, apps/admin/src/**, apps/api/src/** |
| Phase | PHASE 1 DISCOVERY (read-only, no source modified) |

## Method

Every candidate from fake-markers.json was opened and read in context, not string-matched. For each
one I traced the handler to its API endpoint and then into apps/api/src/controllers.ts,
store.service.ts and monthly-report.service.ts to see whether a real read/write/persist happens.
I additionally scanned both front-ends for the whole-category risks the task names (localStorage as
persistence, front-end AI generation, router.push to non-existent routes, tables backed by fixed
arrays, fabricated export URLs), and for buttons with no handler at all (definition A).

### Verdict definitions used

| Verdict | Meaning |
| --- | --- |
| FAKE | The control or claim is real to the user but the underlying function does not exist. |
| NOT_FAKE | Real behaviour; the marker is a false positive (the word placeholder used as an HTML attribute, or a setTimeout used as a poll interval). |
| NEEDS_RUNTIME_CHECK | Static reading is genuinely ambiguous; a live click / DB read is required. |

## Summary

| Verdict | Count |
| --- | ---: |
| FAKE | 4 |
| NOT_FAKE | 58 |
| NEEDS_RUNTIME_CHECK | 2 |
| Total adjudicated | 64 |

## Candidates

| id | view/file:line | candidate | verdict | evidence | severity | runtime check needed |
| --- | --- | --- | --- | --- | --- | --- |
| M01 | apps/mp/src/views/ActionCenter.vue:76 | setTimeout | NOT_FAKE | wait() is the poll interval of waitForJob() (line 79-89) which loops on GET /api/v1/ai/tasks/:id and stops on succeeded/fallback/failed. No result is synthesised locally. | - | no |
| M02 | apps/mp/src/views/ActionCenter.vue:348,360,366 | placeholder | NOT_FAKE | HTML placeholder attributes on the completion-reflection textarea and cooldown/decision inputs. | - | no |
| M03 | apps/mp/src/views/Archive.vue:143-164 | export claim | NOT_FAKE | POST /api/v1/archive/journeys/:id/export calls store.createJourneyArchiveExport which writes a real JSON file to disk and returns a URL served by GET /api/v1/exports/:assetId/download (store.service.ts:1718-1786). | - | no |
| M04 | apps/mp/src/views/DecisionVault.vue:191,196,243,244,250 | placeholder | NOT_FAKE | Textarea/input placeholder attributes. | - | no |
| M05 | apps/mp/src/views/DiaryList.vue:115 | placeholder | NOT_FAKE | CSS class diary-entry-placeholder on a decorative glyph. | - | no |
| M06 | apps/mp/src/views/FeedbackHelp.vue:192 | placeholder | NOT_FAKE | Textarea placeholder attribute. | - | no |
| M07 | apps/mp/src/views/FutureSelf.vue:175 | placeholder | NOT_FAKE | Textarea placeholder attribute. | - | no |
| M08 | apps/mp/src/views/JourneyDetail.vue:59 | setTimeout | NOT_FAKE | sleep() paces waitForAnalysis() (line 60-69) polling GET /api/v1/ai/tasks/:jobId. | - | no |
| M09 | apps/mp/src/views/LetterToday.vue:76 | setTimeout | NOT_FAKE | Poll interval inside waitForAiJob() (line 68-79) against the real job endpoint. | - | no |
| M10 | apps/mp/src/views/LetterToday.vue:140,247 | share-image preview | NEEDS_RUNTIME_CHECK | POST /api/v1/letters/:id/poster is real (controllers.ts:1148-1153; store.service.ts:1788+ writes an SVG asset), but the modal renders shareUrl as bare text (line 247) instead of an img. The asset exists; whether the user can actually see or save it is a UI defect, not a missing backend. | P3 | yes |
| M11 | apps/mp/src/views/LetterToday.vue:51 | hardcoded advice | NOT_FAKE | The three-item array is only the empty-state fallback when aiStructured.advice is absent; the real AI advice is used when present (line 50, 117). | P3 | no |
| M12 | apps/mp/src/views/MemoryCenter.vue:221,224 | placeholder | NOT_FAKE | Input/textarea placeholder attributes. | - | no |
| M13 | apps/mp/src/views/MoodCreate.vue:78-87 | placeholder | NOT_FAKE | placeholder is a local optimistic-upload object ({id:'uploading-...', uploading:true}) replaced by the real uploadMedia() response at line 83-85, and removed on failure at 87. | - | no |
| M14 | apps/mp/src/views/PeerConversation.vue:12 | setTimeout | NOT_FAKE | wait() paces the assist() loop polling GET /api/v1/ai/tasks/:id after POST .../assist; a non-succeeded status throws and keeps the user's original draft. | - | no |
| M15 | apps/mp/src/views/PeerConversation.vue:28,32 | placeholder | NOT_FAKE | Textarea placeholder attributes in the composer and safety sheet. | - | no |
| M16 | apps/mp/src/views/PeerGraduation.vue:23 | placeholder | NOT_FAKE | Textarea placeholder attribute; the share button posts to POST /api/v1/peer-conversations/:matchId/feedback which really creates a pending_review PeerExperience (store.service.ts:4243-4276). | - | no |
| M17 | apps/mp/src/views/PeerNetwork.vue:63 | router.push('/pages/privacy/index') | FAKE | Target path does not exist in apps/mp/src/router.ts (artifacts/product-audit/mp-routes.json has no /pages/privacy/index; the real route is /pages/settings/privacy). The 看看隐私边界 control is a dead end. | P2 | no |
| M18 | apps/mp/src/views/PeerNetwork.vue:54, PeerRequests.vue:24 | tab button, no @click | NOT_FAKE | These are the active tab of a two-tab switcher; the sibling tab carries the navigation handler. Local UI state, excluded by the task definition. | - | no |
| M19 | apps/mp/src/views/PostDetail.vue:278 | placeholder | NOT_FAKE | Reply textarea placeholder attribute. | - | no |
| M20 | apps/mp/src/views/PrivacySettings.vue:92,93 | localStorage | NOT_FAKE | clearCache() deletes local caches (localStorage/sessionStorage/Cache Storage/IndexedDB) — a genuine device-side action, not persistence pretending to be a server. Settings themselves are saved via PUT /api/v1/settings/privacy (line 68). | - | no |
| M21 | apps/mp/src/views/RealityHandoff.vue:63 | placeholder | NOT_FAKE | Input placeholder attributes in the trusted-contact form; saving posts to POST /api/v1/trusted-contacts (line 52). | - | no |
| M22 | apps/mp/src/views/Recovery.vue:152 | placeholder | NOT_FAKE | Textarea placeholder attribute; save posts to POST /api/v1/me/recovery (line 102). | - | no |
| M23 | apps/mp/src/views/ReportMonth.vue:27,124 | setTimeout | NOT_FAKE | Poll interval of waitForAiJob() (line 22-30) and a re-read backoff (line 121-125) against GET /api/v1/ai/tasks/:id and GET /api/v1/reports/monthly. | - | no |
| M24 | apps/mp/src/views/Square.vue:72 | discarded api.get('/api/v1/reply-presets') | NOT_FAKE | Result is thrown away, then navigates to the reply sheet which re-fetches presets. Dead code, no user-visible claim. | P3 | no |
| M25 | apps/mp/src/views/StableSelf.vue:155,261 | placeholder | NOT_FAKE | Textarea placeholder attributes. | - | no |
| M26 | apps/mp/src/views/SupportPlan.vue:204,216,230,242,248 | placeholder | NOT_FAKE | Input/textarea placeholder attributes. | - | no |
| M27 | apps/mp/src/views/TonightHome.vue:72 | placeholder | NOT_FAKE | Textarea placeholder attribute. | - | no |
| M28 | apps/mp/src/views/ToolDecompose.vue:40,97 | setTimeout + placeholder | NOT_FAKE | setTimeout is the poll() interval (line 32-43); line 97 is a textarea placeholder. Result comes from state.structured of the real job. | - | no |
| M29 | apps/mp/src/views/ToolRun.vue:62 | setTimeout | NOT_FAKE | poll() interval (line 54-65); result assigned from completed.result (line 76). | - | no |
| M30 | apps/mp/src/views/ToolIndex.vue:19 | route /pages/report/month | NOT_FAKE | Route exists in mp-routes.json. | - | no |
| M31 | apps/mp/src/views/FeedbackHelp.vue:108-129 | claim 反馈已提交，后台工单已创建 | NOT_FAKE | POST /api/v1/feedback creates a real FeedbackTicket, then the list is re-read from GET /api/v1/feedback (line 128-129) before the claim is shown. | - | no |
| M32 | apps/mp/src/views/NotificationCenter.vue:22-27 | fake notifications | NOT_FAKE | List is GET /api/v1/notifications; opening marks PATCH /api/v1/notifications/:id/read and follows the server-provided targetRoute. | - | no |
| M33 | apps/mp/src/views/FutureSelf.vue:129-135 | fake FutureSelf delivery | NOT_FAKE | POST /api/v1/future-messages persists a MessageToFutureSelf and enqueues a real BullMQ FollowUpJob (store.service.ts:4567-4592); the worker creates the notification and stamps deliveredAt (follow-up-worker.service.ts:26-64). | - | no |
| M34 | apps/mp/src/views/Archive.vue:143 | fake archive export URL | NOT_FAKE | See M03 — the URL is a real server-written asset, unlike the admin user export (A03). | - | no |
| M35 | apps/mp/src/views/PeerNetwork.vue:24, PeerMatchWaiting.vue:9 | frontend-generated match results | NOT_FAKE | Matches are computed server-side in store.service.ts:3800-3870 (domain / fingerprint / stage / trust / safety score breakdown) and persisted; the client only reads GET /api/v1/peers. | - | no |
| M36 | apps/mp/src/views/ReportMonth.vue:56-106 | randomly generated monthly report | NOT_FAKE | All figures derive from report.recovery and report.dailyTrend returned by GET /api/v1/reports/monthly; monthly-report.service.ts aggregates real diaries/journeys/checkins. No Math.random anywhere in the front-ends or the report service. | - | no |
| M37 | apps/mp/src/views/PeerGraduation.vue:15 | 愿意匿名分享 | NOT_FAKE | shareLater:true triggers a real privacyAllows() gate and creates a persisted PeerExperience with status 'pending_review' (store.service.ts:4243-4276) — not a frontend-array push. | - | no |
| A01 | apps/admin/src/views/TablePage.vue:86-96 | placeholder | NOT_FAKE | A {label, placeholder} prompt dictionary used for the placeholder attribute at line 811. | - | no |
| A02 | apps/admin/src/views/TablePage.vue:804,811,836 | placeholder | NOT_FAKE | Input placeholder attributes. | - | no |
| A03 | apps/admin/src/views/UsersPage.vue:104-105 (duplicate handler in the dead TablePage branch, TablePage.vue:471-474) | claim 导出文件已生成 | FAKE | Two independent defects. (1) The route is shadowed: @Get('users/export') is declared after @Get('users/:id') (controllers.ts:2102 vs 2138), so Nest matches id='export' first and returns {item: undefined} -> literal body {}. Verified live: GET /api/admin/v1/users/export returns {} with HTTP 200, with and without a valid admin token, while /users/user_demo returns the user correctly. (2) Even if reached, exportUsers() fabricates downloadUrl '/exports/users-<ts>.json' (controllers.ts:2138-2147); no code writes that file and no route serves /exports/* (only GET /api/v1/exports/:assetId/download exists). UsersPage.vue:105 then falls back to the bare string 导出文件已生成, so the operator is told an export was generated when no file, URL or record exists. | P1 | no (runtime-confirmed) |
| A04 | apps/admin/src/views/TablePage.vue:529-531 | claim 已执行模板兜底 | NOT_FAKE | The handler would throw before the message is shown, but this branch is unreachable (see A08) — no route instantiates TablePage with resource='jobs'. Dead code, not a clickable fake. | P3 | no |
| A05 | apps/admin/src/views/TablePage.vue:496-498 | addProvider | NOT_FAKE | Hardcodes type:'template', baseUrl:'local://template' ignoring operator input, but the branch is unreachable (A08); /ai/providers is served by AIProvidersPage.vue. Dead code. | P3 | no |
| A06 | apps/admin/src/views/TablePage.vue:513-517 | saveRoute | NOT_FAKE | Silently picks the first enabled non-primary provider instead of the operator's choice, but the branch is unreachable (A08). Dead code. | P3 | no |
| A07 | apps/admin/src/views/TablePage.vue:508-511 | testProvider | NOT_FAKE | Surfaces the real result of POST /api/admin/v1/ai/providers/:id/test (controllers.ts:2443-2454) which performs an actual model call. Unreachable branch, but honest. | - | no |
| A08 | apps/admin/src/views/TablePage.vue:842-912 | action panel branches | NOT_FAKE | The router only feeds TablePage the experience/* and safety/* resources (router.ts:111-118 filter). The users/posts/replies/providers/routes/jobs/tickets/settings/faqs/presets/categories action buttons never render, so they are not visible or clickable. Only peer-experiences buttons are reachable and they call real review APIs. | P2 | no |
| A09 | apps/admin/src/views/AIJobsPage.vue:72,304 | stub / placeholder | NOT_FAKE | Line 72 is a display label (Fixture Stub) for a job whose provider id contains stub; line 304 is an input placeholder. | - | no |
| A10 | apps/admin/src/views/AIProvidersPage.vue:40,358 | Stub / placeholder | NOT_FAKE | Display labels for modelMeta.fixtureOnly providers and an input placeholder. | - | no |
| A11 | apps/admin/src/views/AIProvidersPage.vue:363-364 | 今日调用 / 平均耗时 | NEEDS_RUNTIME_CHECK | todayCalls and avgLatencyMs are incremented on real calls (store.service.ts:2134-2137, 5443-5446) but the seed values are hardcoded (e.g. todayCalls: 31 at store.service.ts:934). A freshly seeded DB can show non-zero call counts that never happened. Needs a DB read to quantify. | P3 | yes |
| A12 | apps/admin/src/views/AIRoutesPage.vue:64,126 | Stub | NOT_FAKE | Display label for modelMeta.fixtureOnly. | - | no |
| A13 | apps/admin/src/views/FaqPage.vue:133-135 | placeholder | NOT_FAKE | Input placeholder attributes; the page's add/save/delete all call real /api/admin/v1/faqs endpoints. | - | no |
| A14 | apps/admin/src/views/FeedbackCategoriesPage.vue:122 | placeholder | NOT_FAKE | Input placeholder attribute. | - | no |
| A15 | apps/admin/src/views/FeedbackTicketsPage.vue:162,166 | placeholder | NOT_FAKE | Input placeholder; the ticket history line renders the real createdAt. | - | no |
| A16 | apps/admin/src/views/Layout.vue:185 | placeholder | NOT_FAKE | Search input placeholder; the handler pushes to /posts?q= which is consumed by PostsPage.vue:14. | - | no |
| A17 | apps/admin/src/views/Login.vue:27,29 | localStorage | NOT_FAKE | Storing the admin auth token (remember vs session) — standard auth storage, read back by api.ts:5. | - | no |
| A18 | apps/admin/src/views/Login.vue:109,116,124 | placeholder | NOT_FAKE | Input placeholder attributes. | - | no |
| A19 | apps/admin/src/views/Login.vue:119-127 | 验证码 (captcha) | FAKE | The captcha field is required-looking but is never validated: login() (line 15-36) posts only {username,password}, and the API POST /api/admin/v1/auth/login accepts only those two fields (controllers.ts:1856-1861). The code shown is static text 7 · 3 · K · 8 (line 126). A security control is presented that does not exist. | P2 | yes |
| A20 | apps/admin/src/views/Login.vue:38-40 | 忘记密码 | NOT_FAKE | Sets a notice telling the operator to contact the system administrator — honest guidance, not a fake reset flow. | P3 | no |
| A21 | apps/admin/src/views/PostsPage.vue:190 | placeholder | NOT_FAKE | Input placeholder attribute. | - | no |
| A22 | apps/admin/src/views/RepliesPage.vue:202 | placeholder | NOT_FAKE | Input placeholder attribute. | - | no |
| A23 | apps/admin/src/views/ReplyPresetsPage.vue:130 | placeholder | NOT_FAKE | Input placeholder attribute. | - | no |
| A24 | apps/admin/src/views/UsersPage.vue:129,165 | placeholder | NOT_FAKE | Input/textarea placeholder attributes. | - | no |
| A25 | apps/admin/src/views/ConfigPage.vue:18-49 (mirror: TablePage.vue:817-839) | system-setting controls | FAKE | The form writes 19 keys to SystemSetting via PUT /api/admin/v1/system/settings (controllers.ts:2934-2962) — a real DB write — but 15 of them are never read by any backend logic: appShortName, defaultPageSize, highRiskBlockEnabled, manualReviewThreshold, cloudModelBackup, aiTimeoutSeconds, aiFailoverEnabled, aiRetryCount, logRetentionDays, sensitiveContentEncrypted, scheduledCacheCleanup, abnormalNotifyEnabled, notifyEmail, dailyDigestEnabled, dailyDigestTime. Only allowHumanRepliesDefault (store.service.ts:1867,6081), defaultVisibility (controllers.ts:2948-2952) and allowMonthlyReportShare (privacy setting, monthly-report.service.ts:439) actually affect behaviour. ConfigPage.vue:34 claims these control AI timeout/failover, content review and notifications; they do not. | P1 | yes |
| A26 | apps/admin/src/views/Dashboard.vue:12-55 | admin tables | NOT_FAKE | Every figure is computed from GET /api/admin/v1/dashboard/overview, which aggregates the live store (controllers.ts:1780-1853). No fixed arrays. | - | no |
| A27 | apps/admin/src/views/AIJobsPage.vue:344 | 模板兜底 disclosure | NOT_FAKE | The copy accurately says a fallbackUsed job is a historical template record and that the current policy keeps real failures. Consistent with fallbackJob throwing (controllers.ts:2574-2577). | - | no |

## Special focus areas

### apps/admin/src/views/TablePage.vue

The file is a shared shell for 11 resources (journeys, actions, checkins, peer-experiences,
peer-matches, follow-ups, peer-conversations, notifications, safety-events, support-plans, memory).
Its table, search, filter, pagination, detail drawer and row selection are all backed by real
endpoints (the endpoints map at line 43-67, load() at 415-437). Of the reachable resource actions,
only the peer-experiences buttons exist and they call PATCH /api/admin/v1/peer-experiences/:id/review
— real. No TablePage action button is a fake, but the majority of its action-panel branches (A08)
are unreachable dead UI because the router assigns those paths to dedicated pages.

### localStorage as a persistence substitute

Checked exhaustively. Only four sites exist:

| Site | Purpose | Verdict |
| --- | --- | --- |
| apps/admin/src/api.ts:5, Login.vue:27,29, router.ts:123 | admin auth token | NOT_FAKE — real auth storage |
| apps/mp/src/views/PrivacySettings.vue:92,93 | clearCache() deletes device caches | NOT_FAKE — a genuine local action |

No view stores business data in localStorage and presents it as server state.

### AI results generated on the frontend

None. All eight setTimeout sites are poll intervals for GET /api/v1/ai/tasks/:id (M01, M08, M09,
M14, M23, M28, M29). There is no Math.random in apps/mp or apps/admin. Every AI surface posts to
POST /api/v1/ai/tasks and renders the job's own result / structured field. One nuance worth
recording: the backend degrades to a template (composeDynamicText, store.service.ts:6034-6072) with
status 'fallback' when the remote provider fails — the client treats fallback as success and never
tells the user (e.g. ToolRun.vue:59). The content is server-generated, not fabricated, but the UI
does not disclose the degradation. Tracked as a transparency risk, not a fake.

### Router targets

Every router.push target in apps/mp was resolved against artifacts/product-audit/mp-routes.json.
All 60+ literal targets resolve; the only non-existent one is /pages/privacy/index (M17).
Backend-supplied targetRoute values (store.service.ts:2814-2847, follow-up-worker.service.ts:67-73)
all resolve too.

### Admin system settings

See A25 — the single largest functional gap found. The write path is real; the read path is missing
for 15 of 19 keys.

## Highest-severity candidate

**A03 — admin user export produces nothing**, apps/admin/src/views/UsersPage.vue:104.

Clicking 导出用户 shows 导出文件已生成. Runtime-confirmed against the live API: the endpoint returns an
empty object (HTTP 200, body {}) because @Get('users/export') is shadowed by @Get('users/:id')
(apps/api/src/controllers.ts:2102 vs 2138); and even if it were reached it would hand back a fabricated
/downloadUrl that no code writes and no route serves (controllers.ts:2138-2147). No export file, URL or
record is ever created. Severity P1.
