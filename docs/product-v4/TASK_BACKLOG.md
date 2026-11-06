# 《晚安树洞》V4.1 任务清单与执行证据 (TASK BACKLOG)

> **文档标识**：`docs/product-v4/TASK_BACKLOG.md`  
> **分支**：`feat/v4-product-release-candidate`  
> **更新时间**：2026-11-04  

---

## 任务执行矩阵

| TASK_ID | 优先级 | 任务内容与缺陷描述 | 核心修改文件 | 对应测试套件 | 审查代理 | 最终状态 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-P0-A** | P0 | 地区化安全求助支持：消除无条件大陆 120/12356 显示，提供地区选择与通用 Emergency SOS，真实拨号与复制，离线自愈，纠正文案 | `apps/api/src/safety-resources.ts`<br>`apps/api/src/controllers.ts`<br>`SafetySupport.vue`<br>`FeedbackHelp.vue`<br>`RealityHandoff.vue` | `p0-safety-regional.spec.ts` (8/8)<br>`F13-safety-support.spec.ts` | architecture-reviewer (APPROVE) | **DONE** |
| **TSK-P0-B** | P0 | AI 记忆 4 类建模与撤销熔断：支持 Episodic/Semantic/Pattern/State，5 层严格装配顺序，当前输入覆盖旧状态规则，撤销授权毫秒级熔断 | `packages/shared-types/src/index.ts`<br>`ai-persona.service.ts`<br>`self-persistence.service.ts`<br>`store.service.ts`<br>`MemoryCenter.vue` | `p0-ai-memory-lifecycle.spec.ts` (6/6)<br>`F08-memory-lifecycle.spec.ts` | architecture-reviewer (APPROVE)<br>code-reviewer (APPROVE) | **DONE** |
| **TSK-UI-PILOT** | P1 | UI 去“AI 骨架味”试点：消除冷白刺眼底色与工业灰线，注入 `#FAF8F5` 暖纸色与原生宋体大标题，修复 Teleport 弹层变量丢失 | `TonightHome.vue`<br>`LetterToday.vue`<br>`styles.scss` | `front-layout.spec.ts`<br>`overflow.spec.ts` | architecture-reviewer (APPROVE)<br>reviewer-glm (APPROVE) | **DONE** |
| **TSK-P1-A** | P1 | 匿名互助核心链路核验：72h 严格生命周期，双向独立签署 `PeerConsent` 激活，推荐去重防轰炸，屏蔽举报全局互斥 | `peer-persistence.service.ts`<br>`PeerConversation.vue` | `batch2-peer-verification.spec.ts` (28/28)<br>`F06-peer-consent-chat.spec.ts` | architecture-reviewer (APPROVE) | **DONE** |
| **TSK-P1-B** | P1 | 聊天能力与媒体安全：8款官方治愈贴纸，引用消息撤回服务端动态遮罩，clientMsgId 跨重启去重，120s 锁内撤回 | `social-multimedia.service.ts`<br>`PeerConversation.vue` | `v3-social-multimedia-call-persona.spec.ts` (18/18) | code-reviewer (APPROVE) | **DONE** |
| **TSK-P1-C** | P1 | 17 条业务流 (F01-F17) 全链路端到端闭环与多租户对抗测试：三用户对抗 (A/B/C/Admin) 越权拦截 404/400，数据级联物理擦除 | `apps/api/src/*`<br>`apps/mp/src/views/*` | `tests/acceptance/F01~F17` 全量通过 | final-gate (PASS) | **DONE** |
| **TSK-RTC-GATE** | P1 | 实时音视频与私有对象存储客观受限隔离：未就绪端点严格返回 HTTP 501，前端隐藏未就绪入口，杜绝假界面欺骗 | `controllers.ts`<br>`PeerConversation.vue` | `v3-social-multimedia-call-persona.spec.ts` 用例 17 | architecture-reviewer (APPROVE)<br>final-gate (PASS) | **BLOCKED_EXTERNAL** |
| **TSK-MIG-LOCK** | P0 | 12 个 baseline 迁移不可变性保护：哈希严格校验，空库从零部署无漂移 | `prisma/migrations/*`<br>`check-migration-immutability.ts` | `migration-immutability.spec.ts` (6/6)<br>`Migration Cleanroom` CI (PASS) | final-gate (PASS) | **DONE** |
| **TSK-RC-FINAL** | P0 | 最终发布候选门禁：21 项 RC 指标达成核验，全仓备份，PR #4 提交流程 | `docs/product-v4/*`<br>`backup-code.ps1`<br>`backup-db.ps1` | GitHub Actions CI 3/3 Checks (PASS) | final-gate (RC READY) | **DONE** |
