# GoodnightTreeHole 中断恢复对账

## 2026-07-12 admin visual reconstruction start

The new task freezes the working business runtime and begins only from the shared admin visual shell. `artifacts/test-report/admin-functional-baseline-before-visual.md` records the current login, dashboard, moderation, provider, routing/job, feedback, setting, API-restart, PostgreSQL, and front/admin evidence. The old Vite instance was found serving a stale `Layout.vue`; it was restarted from the project source before visual capture. The first shell-only replay reduced dashboard diff from 25.45% to 10.42% at 1440 and from 26.49% to 10.61% at 1366, but both still fail and no page is marked passed.

## 2026-07-12 Phase 5 current replay

Phase 5 remains `PARTIAL`. The current browser/UI → API → PostgreSQL → API-restart → front/admin replay now verifies real Ollama provider testing, route persistence, a route-v4 front `emotion_analysis` job using `llava:7b`, feedback reply visibility on the front, and config disable/restore of human responses. Audit snapshots and response-path `flush()` calls were repaired for these admin writes. The 10 current admin pages were captured at 1366 and 1440 and all 20 diffs were generated, but their 8.89%–27.47% range fails the mandatory <=5% threshold (18 are >10%). Required next work is design-aligned admin visual reconstruction and re-capture, not Phase 6 pass reporting. Evidence: `artifacts/test-report/phase5-admin-sync-report.md`, `artifacts/screenshots/admin/`, `artifacts/diffs/admin/`.

## 2026-07-12 Phase 2 current replay

Phase 2 remains `VERIFIED_PASS`. This replay did not cite historical command outcomes: `pnpm diagnose:front-layout` exited 0 in 22.4 seconds and refreshed the four layout reports; current screenshot and diff smoke commands both exited 0; and `pnpm typecheck` exited 0. Screenshot tooling now uses explicit DOM and rendering-frame readiness instead of `networkidle`/fixed waiting and closes page, context, and browser in `finally`. The current 01-square diff is 17.16%; it is an explicit Phase 6 failure input and must not be counted as a visual pass. There are no duplicate project watchers, and missing Docker CLI remains `DEPLOYMENT_DOCKER_UNVERIFIED`. Evidence: `artifacts/test-report/phase2-toolchain-replay-20260712-1900.md`, `artifacts/layout/`, `artifacts/screenshots/phase2-toolchain-smoke/`, and `artifacts/diffs/phase2-toolchain-smoke/`.

## 2026-07-12 恢复更新：Phase 4 已收口

Phase 4 当前状态为 `VERIFIED_PASS`。项目整体仍为 `INCOMPLETE`，因为 Phase 5 和 Phase 6 尚未按本恢复链重新执行。

- 真实浏览器完成前台 14 页访问与操作；私密/公开心情均使用真实 PNG/JPEG multipart 上传，并写入 Mood、Diary/Post、MediaAsset、附件关系和异步 AiJob。
- 公开帖 `post_1283ef2e34` 从后台待审核变为已发布，前台可见；抱抱、收藏和真人回应均写入关系表并经刷新/重启复核。清空收藏时会按 Favorite 关系回算 Post 收藏计数。
- 今日回信四种风格均由 Ollama 异步任务生成不同内容；保存日记和两类分享图均产生真实持久化 SVG 文件，而不是返回占位路径。
- 情绪拆解、负面改写、发疯文案、治愈短句、失眠安慰、工作破防、未来信件和月报均创建真实 AiJob，记录 provider、model、状态与结果。工具页新增任务类型专属的输出契约面板，避免标题替换式的通用结果页。
- 个人中心完成隐私设置持久化与清空记录的取消/确认路径；确认仅清除 `user_demo` 的日记、回信和收藏，`user_guest` 及其两条帖子保留。
- 反馈页已删除伪签名上传逻辑，改用真实 multipart 媒体；工单 `ticket_1783852478577` 关联真实截图并在后台反馈页可见。
- 关键写入接口现在在返回成功前等待关系表持久化队列完成；最终重启后公开帖、工单、隐私设置和清空范围均保持。

证据：`artifacts/test-report/phase4-front-business-flow-report.md`、`artifacts/screenshots/phase4/`、`artifacts/resume/checkpoint.json`。

## 2026-07-12 恢复更新：Phase 3 已收口

Phase 3 当前状态为 `VERIFIED_PASS`。项目整体仍为 `INCOMPLETE`，因为 Phase 4–6 尚未按本恢复链重新执行。

- 已保存迁移前 JSON 与三份 Phase 3 源备份，再将业务权威源切换到 PostgreSQL 关系表。
- 已迁移用户、心情、日记、树洞、回应、回信、媒体、AI Provider/Route/Job、反馈、审计、隐私设置和附件关系。
- `PrismaRuntimeService` 在 `RuntimeState.default.payload.persistence = relational-primary` 时从关系表恢复运行态；持久化会写入关系表，RuntimeState 仅剩 132-byte 标记。
- 实际 SQL 显示核心表均非零：Mood=17、Diary=13、Post=13、Reply=15、AIJob=70、AIProvider=14、AIStyleRoute=5、FeedbackTicket=7、AuditLog=42；同时已查询外键约束。
- 迁移按真实唯一约束折叠 1 条重复收藏，并用 `legacySourceMoodId` 保存 2 条历史无效回信来源，未破坏外键。
- `RELATION_PHASE3_FINAL_20260712170719` 已进入 Diary 表，经 API 重启仍可读取，并在前台刷新后显示；后台用户页和前后台树洞列表也在刷新后显示关系表数据。
- `pnpm typecheck` 已实际执行并以 exit code 0 完成。

证据：`artifacts/test-report/phase3-relational-migration-report.md`、`artifacts/test-report/phase3-relational-migration.json`、`artifacts/resume/checkpoint.json`。

恢复审计时间：2026-07-12（Asia/Shanghai）  
范围：只重建原六阶段状态并建立后续证据链。本文件不宣布任何阶段通过。

## 证据规则

- `progress.md`、历史报告和已有截图中的 PASS/完成仅是历史声明，未在本轮对应命令重跑前不得作为 `VERIFIED_PASS`。
- 当前项目目录不是 Git 仓库：`git status`、`git branch --show-current`、`git log`、`git diff`、`git diff --stat` 均返回 “not a git repository”。因此不存在可核验的提交链，也不会执行 reset、checkout 或 clean。
- `AGENTS.md` 的规则优先：不得使用整张设计图背景或透明热点；关键流必须验证 UI → API → PostgreSQL → 刷新持久化 → 跨端同步；每次 AI 调用必须产生异步 AiJob。
- README 仍声称“将设计参考作为页面背景并以可点击层覆盖”，与 `AGENTS.md` 冲突。源码扫描未显示前后台直接使用 `design_refs` 作为背景；该 README 文案本身仍是待修复的错误项目说明。

## 原始六阶段

### Phase 1 — 需求、设计参考与页面清单

**原始目标：** 归档 DOCX/设计参考，建立前台 14 页与后台 10 页的页面/交互清单。  
**原始验收条件：** 设计参考、资产和前后台 manifest 可追溯；页面实现不能把整张设计图当背景或通过透明热区伪造交互。  
**昨天声明状态：** `progress.md` 声称已移除设计图 shell，并列出前后台页面与诊断产物。  
**当前代码证据：** `design_refs/front` 有 14 张 `941×1672` PNG；`design_refs/admin` 有 10 张 `1448×1086` PNG；`apps/mp/src/assets/goodnight/asset-manifest.json` 与前后台路由源码存在。README 已改为符合 `AGENTS.md` 的规则：设计图仅作基准，页面必须为真实 DOM/CSS/局部资产。  
**当前测试证据：** 本轮 `pnpm audit:design-references` 于 2026-07-12 13:18 +08:00 退出码 0：14 个前台参考、10 个后台参考、14 个前台映射均齐全；所有供应的设计路由存在；前后台 `.vue/.ts/.scss` 无直接 `design_refs/` 引用。产物：`artifacts/resume/phase1-design-reference-audit.json`。前后台像素视觉验收仍属于 Phase 4/5/6，尚未作为本阶段通过证据。  
**真实状态：** `VERIFIED_PASS`

### Phase 2 — Monorepo 与开发基础设施

**原始目标：** 初始化 pnpm monorepo、TypeScript、ESLint、Prettier、Docker/环境配置与可重复启动方式。  
**原始验收条件：** 三个应用可通过工作区脚本启动，依赖和配置可追溯，基础检查在当前环境实际运行。  
**昨天声明状态：** `progress.md` 列出大量 lint/typecheck/QA PASS。  
**当前代码证据：** `pnpm-workspace.yaml`、根 `package.json`、`docker-compose.yml`、`.env.example`、前后台/API package 存在；本轮当前运行态无重复项目监听器，前台通过 in-app browser 从本机 Vite 加载真实 DOM。布局公共遍历已由 `networkidle`/固定 sleep 改为 DOM 可见和渲染帧条件，并在 finally 关闭 browser/context。  
**当前测试证据：** 本轮 `pnpm lint`、`pnpm typecheck`、截图/diff smoke 均 exit code 0；原始完整 `pnpm diagnose:front-layout` 在修复后 20.61 秒 exit code 0，并输出四份各 56 行的报告。Docker CLI 缺失已按新约束记录为 `DEPLOYMENT_DOCKER_UNVERIFIED`，不影响本机阶段验收。详见 `artifacts/test-report/phase2-toolchain-report.md`。  
**真实状态：** `VERIFIED_PASS`

### Phase 3 — Prisma/PostgreSQL、API、鉴权、上传与 AI 基础链路

**原始目标：** 提供关系型 Prisma schema/PostgreSQL、Nest API、鉴权/RBAC/审计、上传、AI Router 与异步任务。  
**原始验收条件：** 核心业务实体写入关系表；上传真实保存媒体；AI 调用记录真实的异步 AiJob、provider/model/status/result 或 error。  
**昨天声明状态：** 历史报告声称上传、AiJob 队列、数据库与 AI 流已验证。  
**当前代码证据：** `prisma/schema.prisma` 定义了 User、Mood、Diary、Post、Reply、MediaAsset、AIJob、AIProvider、AIStyleRoute、FeedbackTicket、AuditLog 等模型；`apps/api/src/prisma-runtime.service.ts` 仅 upsert User 和 MediaAsset，然后将完整 StoreData 写入 `RuntimeState.payload`。  
**当前测试证据：** 本轮实际 PostgreSQL 审计见 `artifacts/test-report/postgresql-real-schema-audit.md`：Mood/Diary/Post/Reply/AIJob/AIProvider/AIStyleRoute/FeedbackTicket/AuditLog 表均为 0，而 `RuntimeState.payload` 仍存 moods=17、diaries=12、posts=13、replies=15、aiJobs=70、aiProviders=14、aiRoutes=5 等完整业务集合。  
**真实状态：** `PARTIAL`

### Phase 4 — 前台全部页面与真实业务 SDK 链路

**原始目标：** 落地四个 Tab 和所有非 Tab 前台页面，以 API SDK 接入真实数据和业务动作。  
**原始验收条件：** 每个关键流程可从浏览器点击，验证 API、数据库、刷新持久化及后台同步；前台视觉与设计图逐页达标。  
**昨天声明状态：** 历史进度标注前台重建和多项真实浏览器 PASS。  
**当前代码证据：** 前台路由、`MoodCreate.vue` 真实 multipart 上传代码、日记附件渲染与异步 AiJob 轮询代码存在。  
**当前测试证据：** 历史 `front-rest-cross-flow.md` 为 4 项中 2 项失败（工具拆解保存响应超时、月报 locator 超时）；历史前台像素差异为 11.45%–21.33%，高于本任务要求的 ≤5% 且有多页 >10%。本轮尚未执行新的浏览器业务流或截图。  
**真实状态：** `PARTIAL`

### Phase 5 — 管理后台、审核、AI 配置、反馈与审计

**原始目标：** 实现后台登录、概览、用户、内容、回应审核、AI provider/route/job、反馈、系统设置和审计，并与前台共享同一权威数据源。  
**原始验收条件：** 真实后台数据/动作和前台同步；十个设计页面完成多视口视觉比较。  
**昨天声明状态：** 历史进度称后台资源页、配置联动及管理端浏览器验证通过。  
**当前代码证据：** 后台的 Layout、Dashboard、TablePage、ConfigPage 路由/API 文件存在；本轮 in-app browser 刷新后台后显示数据总览、内容审核、AI、反馈、设置和审计入口，以及动态树洞和 AI 任务数据。  
**当前测试证据：** 没有后台 10 页在 1366/1440 的本轮截图、diff 图或结构/布局报告；`artifacts/diffs/admin` 为空。  
**真实状态：** `PARTIAL`

### Phase 6 — 单元/API/E2E/跨端/视觉/自动 QA

**原始目标：** 运行并保留 unit、API、E2E、跨端业务流、视觉回归及自动 QA 的可复核证据。  
**原始验收条件：** 所有完整命令 exit code 为 0；无 timeout/skipped；前后台页面均有新截图、trace、API 和数据库证据；前台和后台视觉均达阈值。  
**昨天声明状态：** `progress.md` 在不同日期列出多组 QA PASS。  
**当前代码证据：** 根脚本拥有多类诊断/测试命令，但 `visual:capture-front` 和 `visual:compare-front` 只覆盖前台；未定义后台同等 capture/compare 命令。`diagnose:front-layout` 由四个独立 Chromium 遍历串行组成，历史父命令超时。  
**当前测试证据：** 历史前台 diff 超标、父布局诊断 timeout、前台跨页流程 2 FAIL、后台全页视觉结果缺失；本轮尚未重跑完整 QA。  
**真实状态：** `FAILED`

## 昨天的真实中断点

中断发生在 Phase 1 尚未达到可验收状态之后，且六阶段矩阵没有被重建。遗留证据显示：前台 14 页截图/差异图虽曾生成，但 diff 为 11.45%–21.33%；布局父命令 timeout；数据库仍为 RuntimeState JSONB 聚合；后台没有完整视觉比较。旧 `progress.md` 的 Stage 9 与 PASS 不能跨中断自动继承。

Phase 1 已以本轮可重复静态审计关闭。下一步必须按顺序进入 Phase 2 的首项未验证验收条件。所有阶段的状态、命令和失败项均由 `artifacts/resume/checkpoint.json` 管理。
