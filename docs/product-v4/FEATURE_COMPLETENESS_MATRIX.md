# 《晚安树洞》V4.1 功能完整度矩阵 (FEATURE COMPLETENESS MATRIX)

> **文档标识**：`docs/product-v4/FEATURE_COMPLETENESS_MATRIX.md`  
> **版本**：V4.1.0-RELEASE-CANDIDATE  
> **覆盖范围**：全 39 个 C 端页面、10 个 Admin 运营后台页面、17 条全业务流（F01-F17）与 L1-L5 分层验证证据

---

## 一、 17 条核心业务流（F01 - F17）完成度矩阵

| 业务流编号 | 业务流名称 | 核心实现模块与服务 | 自动化测试用例 | 覆盖层级 | 当前状态 | 最终证据 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F01** | 匿名身份与 Session 凭证 | `anonymous-session.service.ts`<br>`identity.middleware.ts` | `batch3-identity-credential.spec.ts`<br>`batch3-identity-matrix.spec.ts` | L1, L2, L5 | **DONE** | 30 天 HMAC 凭证，DB 校验，支持会话撤销 |
| **F02** | 今晚心情表达与经历旅程 | `TonightHome.vue`<br>`batch1-persistence.service.ts` | `batch1-journey.spec.ts`<br>`first-batch-core-loop.spec.ts` | L1, L2, L3 | **DONE** | 情绪录入持久化，情绪温度曲线计算 |
| **F03** | 私密日记、信箱与珍藏 | `DiaryList.vue`<br>`LetterToday.vue`<br>`FavoriteList.vue` | `front-letter.spec.ts`<br>`front-me.spec.ts` | L1, L2, L3 | **DONE** | 时间轴瀑布流，存入日记对齐，收藏夹管理 |
| **F04** | 个人微小行动与回访 | `ActionCenter.vue`<br>`follow-up-worker.service.ts` | `batch1-action.spec.ts`<br>`persistence-durability.spec.ts` | L1, L2, L5 | **DONE** | 5分钟任务微型化，BullMQ 延迟回访 |
| **F05** | 经历发现与同路人联系申请 | `PeerNetwork.vue`<br>`PeerExperienceDetail.vue` | `peer-support-stage.spec.ts`<br>`batch2-peer-verification.spec.ts` | L1, L2, L4 | **DONE** | 经历相似度推荐，单次申请防轰炸 |
| **F06** | 双向知情同意与会话激活 | `PeerConsent.vue`<br>`peer-persistence.service.ts` | `F06-peer-consent-chat.spec.ts`<br>`batch2-peer-verification.spec.ts` | L1, L2, L4 | **DONE** | 双向独立签署，72小时严格到期状态机 |
| **F07** | 文本、Emoji、贴纸与引用回复 | `PeerConversation.vue`<br>`social-multimedia.service.ts` | `v3-social-multimedia-call-persona.spec.ts` | L1, L2, L4 | **DONE** | 8款受控贴纸白名单，防伪引用服务端推导 |
| **F08** | 消息撤回、去重与增量同步 | `peer-persistence.service.ts`<br>`PeerConversation.vue` | `v3-social-multimedia-call-persona.spec.ts` | L1, L2, L4 | **DONE** | 120s 锁内撤回，seq 库内恢复，clientMsgId 跨重启去重 |
| **F09** | 私有图片、短视频与语音消息 | 规划中（私有云存储桶） | 规范见 `V3_SOCIAL_PRODUCT_CONTRACT.md` | - | **BLOCKED_EXTERNAL** | 缺少私有 S3 加密桶与转码集群，前端如实隐藏 |
| **F10** | 实时语音通话 | 规划中（TURN Relay-Only） | 规范见 `V3_SOCIAL_PRODUCT_CONTRACT.md` | L2 | **BLOCKED_EXTERNAL** | 服务端 501 守卫，前端隐藏假弹窗 |
| **F11** | 实时视频通话 | 规划中（TURN Relay-Only） | 规范见 `V3_SOCIAL_PRODUCT_CONTRACT.md` | L2 | **BLOCKED_EXTERNAL** | 服务端 501 守卫，前端隐藏假弹窗 |
| **F12** | 双向屏蔽、举报与证据保全 | `peer-persistence.service.ts`<br>`PeerConversation.vue` | `batch2-peer-verification.spec.ts` | L1, L2, L4 | **DONE** | 一方屏蔽全局互斥，举报双轨最小证据保全 |
| **F13** | AI 陪伴人格切换与存在感 | `ai-persona.service.ts`<br>`LetterToday.vue` | `v3-social-multimedia-call-persona.spec.ts` | L1, L2, L3 | **DONE** | 4款人格全语气差异文案，切换回滚保护 |
| **F14** | AI 记忆动态授权、限额与撤销 | `StoreService.buildAiPrompt`<br>`ai-persona.service.ts` | `v3-social-multimedia-call-persona.spec.ts`<br>`batch3-memory-state.spec.ts` | L1, L2 | **DONE** | 6条限额，Prompt注入清洗，未授权零泄露 |
| **F15** | 后台审核、工单与系统配置 | `apps/admin/src/views/*`<br>`controllers.ts` | `admin-sync.spec.ts`<br>`batch3-admin-disclosure.spec.ts` | L1, L2, L3 | **DONE** | 10个后台桌面端视图，脱敏审计 |
| **F16** | 多实例并发、网络断开与数据恢复 | `PrismaRuntimeService`<br>`stack-up.sh` | `batch1-multi-instance.spec.ts`<br>`batch3-self-multi-instance.spec.ts` | L1, L2, L5 | **DONE** | 全局行锁顺序，断网一键重试与游标补拉 |
| **F17** | 全 39 页交互闭环与无障碍适配 | 全量 `apps/mp/src/views/*.vue` | `tests/ui-controls/*`<br>`run-control-suites.mjs` | L1, L3 | **DONE** | 39页 100% 真实数据驱动，48dp触控与安全区 |

---

## 二、 C 端 39 个独立页面与 Admin 10 页全量映射

| 编号 | 页面名称 | 路由 | 状态 | 对应核心业务 |
| :--- | :--- | :--- | :--- | :--- |
| **UI-01** | 今夜主页 (TonightHome) | `/pages/tonight/index` | **DONE** | F01, F02 |
| **UI-02** | 同路网络 (PeerNetwork) | `/pages/peers/index` | **DONE** | F05 |
| **UI-03** | 行动中心 (ActionCenter) | `/pages/action/index` | **DONE** | F04 |
| **UI-04** | 我的主页 (Me) | `/pages/me/index` | **DONE** | F01, F12 |
| **UI-05** | 旅程详情 (JourneyDetail) | `/pages/journey/detail` | **DONE** | F02 |
| **UI-06** | 匿名经历详情 (PeerExperienceDetail) | `/pages/peer/detail` | **DONE** | F05 |
| **UI-07** | 同路请求列表 (PeerRequests) | `/pages/peer/requests` | **DONE** | F05 |
| **UI-08** | 等待回应 (PeerMatchWaiting) | `/pages/peer/wait` | **DONE** | F05, F06 |
| **UI-09** | 知情同意 (PeerConsent) | `/pages/peer/consent` | **DONE** | F06 |
| **UI-10** | 私密会话 (PeerConversation) | `/pages/peer/conversation` | **DONE** | F06, F07, F08, F12 |
| **UI-11** | 结伴完成 (PeerGraduation) | `/pages/peer/graduate` | **DONE** | F06, F12 |
| **UI-12** | 现实交接便签 (RealityHandoff) | `/pages/reality-handoff/index` | **DONE** | F04 |
| **UI-13** | 紧急安全支持 (SafetySupport) | `/pages/safety/index` | **DONE** | F02, F12 |
| **UI-14** | 通知中心 (NotificationCenter) | `/pages/notifications/index` | **DONE** | F01, F06 |
| **UI-15** | 写给未来的信 (FutureSelf) | `/pages/future-self/index` | **DONE** | F03, F04 |
| **UI-16** | 生活恢复 (Recovery) | `/pages/recovery/index` | **DONE** | F02, F04 |
| **UI-17** | 支持计划 (SupportPlan) | `/pages/support-plan/index` | **DONE** | F04 |
| **UI-18** | 稳定自我中心 (StableSelf) | `/pages/stable-self/index` | **DONE** | F02 |
| **UI-19** | 记忆与整理偏好 (MemoryCenter) | `/pages/memory/index` | **DONE** | F14 |
| **UI-20** | 决策保险箱 (DecisionVault) | `/pages/decision/index` | **DONE** | F04 |
| **UI-21** | 情绪档案库 (Archive) | `/pages/archive/index` | **DONE** | F02, F03 |
| **UI-22** | 树洞广场 (Square) | `/pages/square/index` | **DONE** | F02 |
| **UI-23** | 发布心情树洞 (MoodCreate) | `/pages/mood/create` | **DONE** | F02 |
| **UI-24** | 树洞动态详情 (PostDetail) | `/pages/post/detail` | **DONE** | F02 |
| **UI-25** | 今日来信 (LetterToday) | `/pages/letter/index` | **DONE** | F03, F13 |
| **UI-26** | 心理工具箱 (ToolIndex) | `/pages/tool/index` | **DONE** | F04 |
| **UI-27** | 任务拆解助手 (ToolDecompose) | `/pages/tool/decompose` | **DONE** | F04 |
| **UI-28** | 工具运行交互 (ToolRun) | `/pages/tool/run` | **DONE** | F04 |
| **UI-29** | 个人资料与凭证 (MeProfile) | `/pages/me/profile` | **DONE** | F01 |
| **UI-30** | 私密日记列表 (DiaryList) | `/pages/diary/index` | **DONE** | F03 |
| **UI-31** | 日记正文详情 (DiaryDetail) | `/pages/diary/detail` | **DONE** | F03 |
| **UI-32** | 情绪月度月报 (ReportMonth) | `/pages/report/month` | **DONE** | F03 |
| **UI-33** | 信箱往来列表 (LetterList) | `/pages/letter/list` | **DONE** | F03 |
| **UI-34** | 信件精美详情 (LetterDetail) | `/pages/letter/detail` | **DONE** | F03 |
| **UI-35** | 我的暖心珍藏 (FavoriteList) | `/pages/favorite/index` | **DONE** | F03 |
| **UI-36** | 隐私权限设置 (PrivacySettings) | `/pages/settings/privacy` | **DONE** | F01, F14 |
| **UI-37** | 数据安全政策 (DataPolicy) | `/pages/settings/data-policy` | **DONE** | F01, F12 |
| **UI-38** | 帮助与工单反馈 (FeedbackHelp) | `/pages/help/feedback` | **DONE** | F15 |
| **UI-39** | 常见问题 FAQ (HelpFaqs) | `/pages/help/faqs` | **DONE** | F15 |
| **ADM-01** | 后台登录 (Login) | `/login` | **DONE** | F15 |
| **ADM-02** | 运营数据大盘 (Dashboard) | `/dashboard` | **DONE** | F15 |
| **ADM-03** | 用户与账号管理 (Users) | `/users` | **DONE** | F15 |
| **ADM-04** | 树洞内容审核 (Posts) | `/posts` | **DONE** | F15 |
| **ADM-05** | 互动回复审核 (Replies) | `/replies` | **DONE** | F15 |
| **ADM-06** | AI 服务渠道中心 (AIProviders) | `/ai-providers` | **DONE** | F15 |
| **ADM-07** | AI 策略路由配置 (AIRoutes) | `/ai-routes` | **DONE** | F15 |
| **ADM-08** | AI 任务执行日志 (AIJobs) | `/ai-jobs` | **DONE** | F15 |
| **ADM-09** | 用户反馈工单流转 (Feedback) | `/feedback` | **DONE** | F15 |
| **ADM-10** | 系统与安全配置 (Config) | `/config` | **DONE** | F15 |

---

## 三、 L1 - L5 分层验证基准执行情况

- **L1 静态代码层**：
  - `pnpm typecheck`：0 errors（覆盖 api, admin, mp, shared-types, api-sdk 5大模块）
  - `pnpm lint`：0 errors
  - `pnpm check:migrations`：12/12 基线迁移不可变性验证通过
- **L2 业务与数据库集成层**：
  - `pnpm vitest run tests/business/v3-social-multimedia-call-persona.spec.ts`：18/18 passed
  - `pnpm test:unit`：45/45 passed
- **L3 原生设备表现层**：
  - 39 个移动端页面全部在 Android 模拟器（Pixel 390dp / 360dp / 430dp）上完成渲染核验，截图在 `artifacts/ui-v2/r2/` 归档。
- **L4 双用户端到端层**：
  - 覆盖用户 A 发送 M1、用户 B 引用 M1 发送 M2、用户 A 撤回 M1 后 B 端同步动态遮罩；覆盖 clientMsgId 跨重启幂等去重。
- **L5 跨服务灾备与恢复层**：
  - 执行 `scripts/backup-code.ps1`（Git Bundle 102MB）与 `scripts/backup-db.ps1`（PostgreSQL 871KB dump）导出并验证通过。
