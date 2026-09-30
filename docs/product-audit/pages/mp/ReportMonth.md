# ReportMonth

Source: `apps/mp/src/views/ReportMonth.vue`

Routes: `/pages/report/month`, `/pages/me/month-report`

## PURPOSE

ReportMonth is the monthly review. Every number on it is aggregated server-side from the user's own records for the selected month - days recorded, the most frequent emotion, journeys, actions, check-ins, peer conversations, decisions and three life-function rows - and the page draws a day-by-day trend line from those real scores. The only generative element is the closing narrative, which is asked to summarise the already-computed statistics and is explicitly forbidden from inventing figures.

## USER_JOB

"I want to look back at this month and see, from what I actually recorded, how it went - and get a gentle summary I can keep."

## ENTRY

- Me, 情绪月报, `data-testid=entry-report` -> `router.push('/pages/me/month-report')` (`apps/mp/src/views/Me.vue:82`, rendered `:211-212`).
- ToolIndex card 情绪月报 -> `router.push('/pages/report/month')` (`apps/mp/src/views/ToolIndex.vue:19`) - but ToolIndex itself is unreachable (`docs/product-audit/ISSUE_REGISTER.md` ISSUE-004), so this path is not live.

A repo-wide search for `/pages/report/month` and `/pages/me/month-report` returns the two route declarations (`apps/mp/src/router.ts:95-96`), the two `tabbarPaths` entries (`App.vue:28-29`), the Me entry and the ToolIndex card.

## EXIT

Back only: `router.back()` (`ReportMonth.vue:195`). Month selection, poster generation and advice loading all stay on the page; the poster and advice surfaces are modals dismissed with 关闭 / 知道了. The route **is** in `tabbarPaths` (`App.vue:28-29`), so the tab bar is visible and `activeTab` maps it to 我的 (`App.vue:62-68`).

## ROUTES

`/pages/report/month` and `/pages/me/month-report` (`apps/mp/src/router.ts:95-96`), both mounting the same component; `artifacts/product-audit/mp-routes.json` records them as one `aliasGroup` of 2. Both are in `tabbarPaths`.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading / load-error page (replaces everything) | `!report` | `ReportMonth.vue:12`, `:193`, `:291` |
| load error text | `loadError` | `ReportMonth.vue:20`, `:254`, `:291` |
| month from the query string | `requestedMonth` (validated against `/^\d{4}-(0[1-2]\d|...)$/`) | `ReportMonth.vue:8-10` |
| selected month | `month` | `ReportMonth.vue:11` |
| month picker sheet open | `monthOpen` | `ReportMonth.vue:16`, `:261` |
| available months list | `availableMonths` | `ReportMonth.vue:15`, `:108-112` |
| summary job polling | `summaryLoading` | `ReportMonth.vue:18`, `:117-124`, `:248` |
| advice job polling | `adviceLoading` | `ReportMonth.vue:19`, `:168-174`, `:282` |
| summary paragraphs rendered | `summaryParagraphs` from `report.summary` | `ReportMonth.vue:49`, `:249` |
| analysis disabled copy | `!report.analysisAllowed` | `ReportMonth.vue:250` |
| summary unavailable copy | `!summaryParagraphs.length` | `ReportMonth.vue:251` |
| life-function rows rendered | `lifeRows` | `ReportMonth.vue:78-84`, `:225` |
| life-function empty copy | `!lifeRows.length` | `ReportMonth.vue:229` |
| trend polyline rendered | `trendPoints` | `ReportMonth.vue:86-100`, `:238` |
| trend empty copy | `!trendPoints.length` | `ReportMonth.vue:241` |
| poster preview modal open | `poster` | `ReportMonth.vue:13`, `:268` |
| poster download label flipped | `saved` | `ReportMonth.vue:17`, `:274` |
| advice sheet open | `advice` | `ReportMonth.vue:14`, `:279` |

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| ‹ (`front-report-back`) | `router.back()` | history back |
| month chip (`filter-report-month`) | `monthOpen = true` | opens the month sheet |
| one button per month (`report-month-<YYYY-MM>`) | `selectMonth(value)` | sets `month`, closes the sheet, reloads |
| 生成分享图 (`btn-report-poster`) | `makeShareImage` | `POST /api/v1/reports/monthly/:month/poster` |
| 查看温柔建议 (`btn-report-advice`) | `loadAdvice` | `GET /api/v1/reports/monthly/:month/advice`, polling if queued |
| 关闭 (`btn-report-poster-close`) | `poster = undefined` | closes the preview |
| 下载分享图 (`btn-report-poster-save`) | `saveShareImage` | synthetic `<a download>` click on `posterUrl` |
| 知道了 (`btn-report-advice-close`) | `advice = undefined` | closes the advice sheet |
| trend chart (`report-trend-chart`) | none | the SVG is a static render of `trendPoints` |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 18 entries; `artifacts/post-recovery/control-coverage.json` records 9 visible controls on the real APK (4 buttons, 4 tab links, 1 chart element), with the month buttons only existing once the sheet is open. `android-route-manifest.json` records 8 visible controls and textLength 466 for `/pages/report/month`.

## API_READS

- `GET /api/v1/reports/monthly/months` (`ReportMonth.vue:109`) -> `controllers.ts:1574-1577` -> `MonthlyReportService.availableMonths` (`apps/api/src/monthly-report.service.ts:275-305`), which unions the months present in diaries, moods, journeys, action commitments, check-ins, recovery snapshots, decisions, peer experiences and peer conversations, always adds the current month, and sorts descending.
- `GET /api/v1/reports/monthly?month=YYYY-MM` (`ReportMonth.vue:117` and `:122`) -> `controllers.ts:1569-1572` -> `MonthlyReportService.monthly` (`monthly-report.service.ts:307-402`). This is the page's whole data source; the handler returns the statistics, the stored trend, the stored distribution, the keywords, `summary`, `aiJobId`, `aiJobStatus` and `analysisAllowed`.
- `GET /api/v1/ai/tasks/:jobId` (`ReportMonth.vue:25`) -> `controllers.ts:1020-1023`, polled every 450 ms by `waitForAiJob` with a 120-second deadline (`ReportMonth.vue:22-30`).
- `GET /api/v1/reports/monthly/:month/advice` (`ReportMonth.vue:168` and `:172`) -> `controllers.ts:1589-1592` -> `MonthlyReportService.advice` (`monthly-report.service.ts:404-435`).

## API_WRITES

- `POST /api/v1/reports/monthly/:month/poster` (`ReportMonth.vue:144`) -> `controllers.ts:1594-1597` -> `MonthlyReportService.poster` (`monthly-report.service.ts:437-447`), which throws `ForbiddenException` unless `allowMonthlyReportShare` is true (`:439`) and `BadRequestException` unless a summary exists and the job is terminal (`:441-443`). It then calls `store.createMonthlyReportPoster` (`store.service.ts:1815-1848`), which writes a real 1080x1440 **SVG** file to the uploads directory and inserts a **MediaAsset** row with `usageType: 'monthly-report-poster'` and `url: /uploads/<storageKey>`.

Store method: `StoreService.createMonthlyReportPoster`. Prisma model changed: **MediaAsset**.

**Implicit writes during the GET.** `monthly()` is not read-only. On every request it recomputes a `sourceSignature` hash of the statistics and, when the stored signature differs or no summary job exists yet, it deletes the previous `ReportAdvice` rows (`monthly-report.service.ts:328`), queues an AI job when analysis is allowed (`:318-326`) and upserts a **MonthlyReport** row (`:340-358`). When the job is terminal it writes the summary back into that row (`:363-372`). Prisma models changed by the GET: **MonthlyReport**, **ReportAdvice**, **AIJob**.

## DB_ENTITIES

Reads: **Diary**, **Mood**, **LifeJourney**, **ActionCommitment**, **OutcomeCheckin**, **RecoverySnapshot**, **PeerConversation**, **PeerExperience**, **DecisionRecord**, **Post**, **Reply** (all inside `statisticsFor` / `recoveryFactsFor` / `availableMonths`), **MonthlyReport**, **ReportAdvice**, **AIJob**.

Writes: **MonthlyReport**, **ReportAdvice**, **AIJob** (from the GET); **MediaAsset** (from the poster POST).

Cross-checked against `prisma/schema.prisma:821-837` (MonthlyReport, `@@unique([userId, month])`), `:839-845` (ReportAdvice), `:847-864` (MediaAsset), `:1013-1042` (AIJob).

## ADMIN_VISIBILITY

**Partly.** `/ai/jobs` (`apps/admin/src/router.ts:50`) lists AIJob, so the `monthly_recovery_summary` job and its status are visible to an operator (`controllers.ts:2547` `GET /api/admin/v1/ai/jobs`). There is **no** admin resource for `MonthlyReport` or `ReportAdvice` - a grep of `apps/api/src/controllers.ts` for `monthlyReport` finds only the public service call, and `apps/admin/src/router.ts` menuGroups has no report entry. So an operator can see that a summary job ran and whether it fell back, but cannot read the report or the advice text.

## AI_USAGE

**Yes - two jobs, both `taskType: 'monthly_recovery_summary'`, style `'rational'`.**

1. The summary. `monthly()` queues `queueAI({taskType: 'monthly_recovery_summary', content: JSON.stringify(statistics), style: 'rational', userId, sourceId: ...})` (`monthly-report.service.ts:318-326`) **only when `analysisAllowed`**, i.e. when `allowJourneyLongTermAnalysis` is true (`:312`). The job is keyed on a `sourceSignature` so an unchanged month does not re-queue.
2. The advice. `advice()` queues a second `monthly_recovery_summary` job whose prompt embeds the full statistics object and instructs: 基于以下真实月报统计给出三条温和、可执行的建议，不要改写或虚构数字 (`monthly-report.service.ts:413-419`).

**What the page does when AI fails.** Three layers, all honest:

- The statistics block is computed before and independently of any job (`monthly-report.service.ts:310-311`), and the response always returns `statistics` spread first (`:378`). Every figure on the page - the brief grid, the life rows, the trend polyline, the counts - comes from that block, so a failed or disabled summary leaves the numbers intact.
- When the job is terminal the summary is taken from `job.result` only for `succeeded` or `fallback`, and otherwise set to the empty string (`:363-366`). The client renders 本月回顾暂时不可用，稍后刷新可查看任务状态 (`ReportMonth.vue:251`) when `summaryParagraphs` is empty, and 长期旅程分析已关闭；你仍可以查看上面的真实记录 (`:250`) when `analysisAllowed` is false.
- `cleanLine` and `richParagraphs` (`ReportMonth.vue:32-47`) strip markdown prefixes, `**`, `??` and a stray `jiaolv` token, and cap the narrative at five paragraphs - defensive clean-up of model output, not generation.
- The poster path refuses to run without a terminal job (`monthly-report.service.ts:441-443`), so the share image can never contain an empty or in-flight summary.

There is no `Math.random`, no client-side score synthesis and no fabricated figure anywhere in the view or the service (`docs/product-audit/discovery-agent5-fake-candidates.md` M36 records the same conclusion). The known DAPI 402 condition makes these jobs end as `status: 'fallback'` with the safe template and the error string preserved (`store.service.ts:5513-5530`); the page treats `fallback` exactly like `succeeded` (`monthly-report.service.ts:365`), so the user sees a template summary rather than an error, and nothing on the page tells them the model did not run.

## PRIVACY

- The **summary and advice** are gated by `allowJourneyLongTermAnalysis` (`monthly-report.service.ts:312`, `:406-408`). With it off the response carries `aiJobStatus: 'disabled'` and an empty summary, the two AI buttons are disabled (`ReportMonth.vue:258`) and the copy explains why (`:250`). The 生成分享图 button is separately disabled by `!report.summary` (`:257`), which is empty when analysis is off - so the poster is unreachable without the flag too, even before the server's `allowMonthlyReportShare` check.
- The **poster** is gated by `allowMonthlyReportShare` (`monthly-report.service.ts:439`).
- **The raw statistics are not gated by any privacy flag.** `statisticsFor` and `recoveryFactsFor` read diaries, recovery snapshots and decisions unconditionally (`:132-231`), so a user with `allowRecoveryData` off still gets the recovery counts and life-function rows on this page. The only flag that removes content is `allowJourneyLongTermAnalysis`, which removes the narrative, not the numbers. See ISSUES.
- `monthly()` uses `this.store.getDemoUserId()` rather than the runtime user (`monthly-report.service.ts:309`, `:325`), unlike the `me/*` routes which honour `x-goodnight-user-id`. Same pattern as `me/profile`.
- `availableMonths` also uses `getDemoUserId()` (`:276`), so the month list is not scoped by header either.

## ERROR_STATES

- Month list failure: caught and degraded to `[month.value]` (`ReportMonth.vue:182-187`), so the picker still opens with the current month.
- Report load failure: `loadError` = API message or 月报加载失败，请稍后重试 (`:127-129`), rendered inline at `:254` **and** as the whole-page fallback text when `report` is still undefined (`:291`).
- Summary job timeout: `waitForAiJob` throws 月报生成超时，请稍后刷新重试 after 120 s (`:29`), which lands in `loadError`.
- Poster failure: `loadError` = API message or 分享图生成失败，请稍后重试 (`:146-148`), so a `403` from `allowMonthlyReportShare` surfaces in the same red line as a network error.
- Advice failure: `advice` is cleared and `loadError` = API message or 建议加载失败，请稍后重试 (`:175-178`).
- `loadError` is never cleared before the poster or advice actions (`:143`, `:166`), so a stale error can sit on screen under a successful action.

## EMPTY_STATES

- No life-function records: 本月还没有生活恢复记录，先如实写下今天也可以 (`ReportMonth.vue:229`).
- No trend points: 本月还没有足够的记录来绘制起伏 (`:241`).
- No summary: 本月回顾暂时不可用，稍后刷新可查看任务状态 (`:251`) or the analysis-disabled copy (`:250`).
- No advice paragraphs: 建议暂时未生成，请稍后再试 (`:284`).
- No records at all: `recovery` falls back to an all-zero object (`:56-68`) and `hardestMoment` shows 还在慢慢记录 when `topEmotion === '暂无'` (`:70`), so a brand-new user gets a coherent all-zero report rather than a blank screen.

## NATIVE_RISKS

- Safe area: `.report-page` pads `calc(110px + env(safe-area-inset-bottom))` (`ReportMonth.vue:297`) and the route is a tab route, so the tab bar clears.
- The 120-second `waitForAiJob` loop (`:22-30`) holds the page in a `summaryLoading` state with the two AI buttons disabled (`:257-258`); on a device that is backgrounded mid-poll, Android may throttle the timers, so the deadline can be reached without the user seeing progress. There is no cancel control.
- The month sheet and the advice sheet are `.sheet-mask` overlays (`:261`, `:279`) with no `Escape` handler and no focus trap.
- The poster download uses a synthetic `<a download>` click (`:151-160`) that hands off to the Android download manager, and the button label flips to 已开始下载 immediately (`:274`) whether or not the file arrives.
- The trend chart is a fixed `viewBox="0 0 320 118"` SVG (`:236`) with coordinates computed in JS (`:86-100`); on a very narrow viewport the labels in `.trend-axis` compress but the plot does not.
- Back button: no custom handling; BACK walks WebView history (`apps/mp/src/native/back-button.ts:30-36`).

## ISSUES

- P1 PRIVACY: the raw monthly statistics are not gated by any privacy flag. `statisticsFor` and `recoveryFactsFor` read recovery snapshots, decisions and diaries unconditionally (`monthly-report.service.ts:132-231`), so a user who has turned `allowRecoveryData` off still sees 生活正在慢慢回来 with their sleep / contact / comfort rows and the recovery check-in count on this page. The only flag consulted is `allowJourneyLongTermAnalysis`, which removes the narrative, not the data.
- P1 PRIVACY: `monthly()` and `availableMonths()` both resolve the user with `getDemoUserId()` (`monthly-report.service.ts:276`, `:309`) rather than the runtime header, unlike every other `me/*` route (`store.service.ts:2167-2173`). The report is therefore not scoped to the caller by construction.
- P2 AI: a `fallback` summary is rendered exactly like a `succeeded` one (`monthly-report.service.ts:365`) with no badge, so under the known DAPI 402 condition every user reads template text believing it was written from their month. The advice sheet has the same gap (`:427`).
- P2 STATE_MACHINE: `loadError` is not reset before `makeShareImage` or `loadAdvice` (`ReportMonth.vue:143`, `:166`), so a previous failure line stays visible under a later success, and there is no success confirmation for either action.
- P2 UX: the 120-second polling loop disables both AI buttons and offers no cancel or progress indicator beyond a sentence (`ReportMonth.vue:22-30`, `:248`). On Android, backgrounding the app can throttle the timers until the deadline passes.
- P2 DATA: the GET performs writes. `monthly()` deletes and recreates `ReportAdvice` rows and upserts `MonthlyReport` on signature change (`monthly-report.service.ts:328`, `:340-358`), so a simple page load mutates three tables, and two devices opening the report concurrently can race on the same `userId_month` upsert.
- P2 DUPLICATE / NAVIGATION: the same component is mounted at `/pages/report/month` and `/pages/me/month-report` (`apps/mp/src/router.ts:95-96`) and two different entry points use the two different paths (`Me.vue:82` vs `ToolIndex.vue:19`).
- P3 UX: `trendTickDays` derives the axis labels from the number of `dailyTrend` entries (`ReportMonth.vue:103-106`) and prints them as `MM/day` (`:244`), so the tick values are rounded bucket boundaries rather than the actual first and last recorded days.
- P3 UX: the poster button flips to 已开始下载 on click (`ReportMonth.vue:274`) before any file is confirmed, and a second click re-triggers the synthetic download with no debounce.
- P3 DATA: `cleanLine` strips the literal token `jiaolv` (`:35`), a transliteration artefact rather than a general encoding fix; the same workaround is duplicated server-side in `safeSummary` (`monthly-report.service.ts:97-101`).

## FINAL_STATUS

PARTIAL - both routes, all four reads, the poster write, the two AI jobs, the fallback handling and every state are traced to lines, and the runtime sweep shows the route rendering with 8-9 controls and 0 console errors, but no month with a completed AI summary was observed in this pass, so the polling loop and the `fallback` rendering were verified statically only.

### Static evidence

- Controls discovered: 18
- API reads (static): `/api/v1/ai/tasks/:param`, `/api/v1/reports/monthly`, `/api/v1/reports/monthly/:param/advice`, `/api/v1/reports/monthly/months`
- API writes (static): `POST /api/v1/reports/monthly/:param/poster`
- Candidate fake markers: 2
- Appended: both fake-marker candidates (`setTimeout` at lines 27 and 124) are the `waitForAiJob` poll interval and a re-read backoff, both against `GET /api/v1/ai/tasks/:id` and `GET /api/v1/reports/monthly`, adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` (M23, M36).
- Appended: group-C "numbers come from the DB, AI may only summarise" check - `statisticsFor` computes every figure from store records before any job is queued (`monthly-report.service.ts:310-311`), the response returns those statistics first (`:378`), and the advice prompt instructs the model 不要改写或虚构数字 (`:416`).
- Appended: runtime cross-check `artifacts/recovery/android-route-manifest.json` - `/pages/report/month` and `/pages/me/month-report` both rendered=true with textLength 466, 8 visible controls, 0 console errors, 0 failed requests. `artifacts/post-recovery/control-coverage.json` records 9 controls for `/pages/report/month`, state `default`.