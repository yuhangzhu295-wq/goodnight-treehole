# 第三阶段长期恢复与自我系统初始审计

审计日期：2026-08-20（Asia/Shanghai）

## 基线与冻结边界

- 分支：`codex/third-stage-self-system`
- 基线：`99c84de678abf1bc5359b5d360699ce7dbb6d383`
- 第一阶段：`FIRST_STAGE_UI_FROZEN=true`
- 第二阶段：`SECOND_STAGE_PEER_FROZEN=true`
- 本轮只修改第三阶段十个模块及其最小共享数据契约、API、测试和证据。Tonight、Peer、Action、Safety 等冻结页不做视觉或业务重构。
- 唯一视觉来源：`C:\Users\zyu33\Desktop\图片素材88\晚安树洞_UI_01-41_业务说明`。

## 扫描范围

已核对 `apps/mp/src/router.ts`、十个指定 Reference、现有前台 View、`apps/api/src/controllers.ts`、`apps/api/src/store.service.ts`、`apps/api/src/relational-runtime.mapper.ts`、`prisma/schema.prisma`、`packages/shared-types`、后台读取入口、交互契约和现有业务/视觉测试。

## 模块状态

| Reference | 模块 | 状态 | 现有 Route / UI | 现有 API | 现有 Model / Persistence | Admin | 主要缺口 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #38 | 我的 Final | `LEGACY` | `/pages/me/index`，旧版 Me | Profile/Stats、Journey 等分散读取 | Journey、Action、Checkin、Peer、Recovery 均已在 PostgreSQL | 无需新增私密读取 | 首屏仍以签到、回应、日记为中心；缺少 Journey/恢复/支持计划/决定/未来信入口与真实现实变化统计 |
| #9 | Recovery | `EXISTS_PARTIAL` | `/pages/recovery/index`，基础表单 | `GET/POST /api/v1/me/recovery` | `RecoverySnapshot(userId, journeyId, summary, signals, createdAt)` | 仅聚合计数 | 缺 Reference Hero、今日/七天/最近变化结构、Journey 自动关联与确定性趋势；当前权限关闭时页面只报错 |
| #41 | Personal Support Plan | `EXISTS_PARTIAL` | 无独立 View/Route | `GET/PUT /api/v1/me/support-plan`，另有 `POST /support-plans` | `PersonalSupportPlan` 的 `plan Json` 可承载全部结构字段 | 后台只读列表 | 保存每次新建，缺编辑语义、清空、Safety 最小授权读取、结构化 UI 和用户确认流程 |
| #27 | Stable Self | `MISSING` | 无 | 无 | 无同义模型 | 无 | 需要最小模型/API/View；只能与用户自己的 Recovery 对照，不能引入人群评分 |
| #15 | AI Memory | `EXISTS_PARTIAL` | 无独立 View/Route | `GET/POST/DELETE /api/v1/memory` | `MemoryItem` 已有 category/content/consent/expires/deleted | 后台存在广义只读列表，需避免扩大 | GET 隐藏 expired/deleted，用户无法审计全部状态；缺 title/source/scope/status、编辑/立即过期/禁止使用；AI 未记录使用的 Memory ID |
| #12 | Decision Vault | `EXISTS_PARTIAL` | Action 页仅能创建 Decision，无独立 View | `GET/POST/PATCH /decisions`，`POST/GET cooldown` | `DecisionRecord` + `CooldownItem` + `FollowUpJob` | 无私密全文入口 | 缺 cooling/ready 状态一致性、outcome/reviewedAt、结构化 UI、到期服务端回写和完整持久化测试 |
| #35 | Future Self Final | `EXISTS_PARTIAL` | `/pages/future-self/index`，基础表单 | `GET/POST /future-messages` | `MessageToFutureSelf` + `FollowUpJob` + Notification | 未扩大私密读取 | 缺 Reference 时间快捷选项、用户主动 Journey/Decision/Recovery 关联、送达状态细化与正式视觉 |
| #7 | Privacy 2.0 | `EXISTS_PARTIAL` | `/pages/settings/privacy`，已有真实开关 | `GET/PUT/PATCH /settings/privacy` | `PrivacySetting` 已有九项能力中的部分字段 | 不需要新增 | 权限粒度不足；月报分享、匿名经历分享、Memory 使用、归档保留、FutureSelf 通知未独立；部分服务端行为尚未强制执行 |
| #8 | Monthly Report 2.0 | `LEGACY` | `/pages/report/month`，旧情绪月报 | 月报、月份、advice、poster 均真实 | `MonthlyReport` + DAPI AiJob | AIJob 可审计 | 核心仍是情绪分布；未聚合 Journey/Action/Checkin/Recovery/Peer/Decision，分享权限未在服务端拒绝，统计口径不符合 #8 |
| #30 | Archive Final | `EXISTS_PARTIAL` | 日记列表存在，未形成 Journey Archive | Journey GET/PATCH 支持 `archived` | `LifeJourney.status=archived`，历史关联完整 | 无需扩大 | 缺 archive list/detail/export/delete/restore UI 与 API；当前 #30 旧档案只覆盖日记/树洞/回信，不覆盖完整 Journey 资产 |

## 可复用的权威数据

- Journey：`LifeJourney`、`SituationSnapshot`、`JourneyUpdate`。
- 行动与结果：`ActionCommitment`、`OutcomeCheckin`。
- 同路：`PeerExperience`、`PeerMatch`、`PeerConversation`、`PeerMessage`。
- 长期恢复：`RecoverySnapshot`、`PersonalSupportPlan`、`MemoryItem`、`DecisionRecord`、`CooldownItem`、`MessageToFutureSelf`。
- 异步送达：`FollowUpJob`、BullMQ、`UserNotification`。
- AI：现有远程 DAPI 路由与真实 `AIJob`，禁止本地/Ollama 作为第三阶段验收结果。

## 最小增量方案

1. 复用现有模型并补最小字段：Privacy 独立权限；Memory 的 title/source/scope/status；Decision 的 cooldownUntil/outcome/reviewedAt；FutureSelf 可选 decision/recovery 上下文；新增唯一缺失的 StableSelf 记录。
2. 继续以 PostgreSQL 为唯一权威源，同步更新 relational mapper；不建立平行 JSON/localStorage 数据系统。
3. API 以当前用户为边界补齐 CRUD、归档/恢复/导出和服务端权限拒绝；SupportPlan 对 Safety 只暴露用户明确保存的现实支持字段。
4. AI 仅用于真正需要的整理/总结，必须创建真实 DAPI `AiJob`；核心表单在 AI 失败时仍可手工完成。Memory 使用必须把 ID 写入任务 trace/decision log。
5. 前台按 #38→#9→#41→#27→#15→#12→#35→#7→#8→#30 顺序逐页完成，每页生成 reference/actual/side-by-side/difference 和四个响应式尺寸后才标记 `DONE`。
6. 新增第三阶段业务、安全、持久化、Memory、Decision、FutureSelf 和 Reference 测试；测试数据通过真实 API 创建并在结束时清理。

## 初始门禁

- 十页均未在本审计阶段预设 `DONE`。
- 下一步只进入 #38 Me Final；完成真实 API 数据读取、四 Tab 回归、Reference 比对和 Reviewer 后，才进入 #9。
- `THIRD_STAGE_SELF_SYSTEM_FROZEN=false`。
