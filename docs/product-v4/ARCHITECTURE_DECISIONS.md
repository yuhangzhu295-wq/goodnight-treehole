# 《晚安树洞》V4.1 架构决策记录 (ARCHITECTURE DECISION RECORDS)

> **文档标识**：`docs/product-v4/ARCHITECTURE_DECISIONS.md`  
> **版本**：V4.1.0-RELEASE-CANDIDATE  
> **状态**：通过 architecture-reviewer 与 reviewer-glm 独立审查裁决  
> **设计模式**：标准 ADR 结构（符合任务书第 6 条统一审查规范）

---

## 决策索引
1. [ADR-01: 消息撤回双端脱敏与举报最小证据保全双轨制架构](#adr-01-消息撤回双端脱敏与举报最小证据保全双轨制架构)
2. [ADR-02: 消息单调序号 seq 库内恢复与跨重启 clientMsgId 幂等去重](#adr-02-消息单调序号-seq-库内恢复与跨重启-clientmsgid-幂等去重)
3. [ADR-03: 贴纸白名单准入与内联 SVG 注入联系方式防御](#adr-03-贴纸白名单准入与内联-svg-注入联系方式防御)
4. [ADR-04: TURN Relay-Only 架构与未就绪通话端点 HTTP 501 规范守卫](#adr-04-turn-relay-only-架构与未就绪通话端点-http-501-规范守卫)
5. [ADR-05: AI 陪伴人格分层动态组装与记忆撤销零泄露架构](#adr-05-ai-陪伴人格分层动态组装与记忆撤销零泄露架构)
6. [ADR-06: 今日回信重生成基于 expectedAiJobId 的原子 CAS 防覆写](#adr-06-今日回信重生成基于-expectedaijobid-的原子-cas-防覆写)
7. [ADR-07: 个人归档查询下推数据库过滤与全站反社交货币化规约](#adr-07-个人归档查询下推数据库过滤与全站反社交货币化规约)

---

### ADR-01: 消息撤回双端脱敏与举报最小证据保全双轨制架构

- **DECISION_ID**: ADR-01
- **REQUIREMENT**: 兼顾“用户 2 分钟内消息撤回隐私权”与“平台防性骚扰、反言语暴力与自残危机干预取证权”。
- **CURRENT_IMPLEMENTATION**:
  - `PeerPersistenceService.recallMessage` 在数据库行级排他锁内对比数据库 `clock_timestamp()` 与消息 `createdAt`，判定差值 $\le 120\text{s}$。
  - 撤回成功后将 `content` 物理覆写为 `'一条消息已撤回'`，并级联清除自身 `mediaUrl`、`thumbnailUrl` 与 `replyToContent` 元数据。
  - 读取层 `peerMessageForUser` 动态回查引用目标，若目标被撤回则引用文本统一遮罩为 `'一条消息已撤回'`。
- **EVIDENCE**:
  - `apps/api/src/peer-persistence.service.ts:1330-1395`
  - `apps/api/src/store.service.ts:5911-5930, 6790-6815`
  - `tests/business/v3-social-multimedia-call-persona.spec.ts` 用例 3、4、5、6、7
- **ALTERNATIVES**:
  1. *纯客户端本地删除*：服务端不改内容，仅客户端隐藏（严重泄露，被否决）。
  2. *物理瞬间销毁*：数据库直接 DELETE，导致后续被骚扰者举报时无任何证据可查，违背合规底线（被否决）。
- **RISK_ASSESSMENT**: 若未动态遮罩引用快照，已撤回内容会在他人的引用回复中永久残留。
- **APPROVED_SOLUTION**: 实施双轨分离制：业务聊天流中立即覆写并动态遮罩引用，双端表现为“一条消息已撤回”；但在安全证据快照库中，保留脱敏文本在 7 天只读宽限期内供独立举报（`PeerReport`）按最小必要原则（前后 10 条）关联封存，7 天无举报则由后台自动物理删除。
- **REJECTED_SOLUTIONS**: 拒绝允许任何一方在超过 120 秒后撤回消息；拒绝在未授权举报情况下长期保存已撤回文本。
- **TEST_CONTRACT**:
  - 变异测试：移除 `peerMessageForUser` 中对引用的撤回遮罩，断言同步测试必须直接红牌失败（已通过变异测试验证）。
- **INDEPENDENT_REVIEW**: architecture-reviewer 提出初步方案，reviewer-glm 质询证据保全冲突，最终达成双轨制共识。
- **DECISION_STATUS**: APPROVED

---

### ADR-02: 消息单调序号 seq 库内恢复与跨重启 clientMsgId 幂等去重

- **DECISION_ID**: ADR-02
- **REQUIREMENT**: 确保在弱网重发、客户端高频重试、服务端进程重启或多实例部署下，会话消息序号 `seq` 严格单调递增，且重复的 `clientMsgId` 绝不产生重复插入。
- **CURRENT_IMPLEMENTATION**:
  - `SocialMultimediaService.getNextSeq` 在分配序号时接收 `currentMaxSeq`，若内存未初始化，以数据库已持久化消息的最大 `seq` 为底数递增。
  - `StoreService.sendPeerMessage` 在数据库分支中，不仅查询内存快速去重表，而且在已加载的会话全部消息中比对 `(senderUserId, clientMsgId)`。
- **EVIDENCE**:
  - `apps/api/src/social-multimedia.service.ts:89-125`
  - `apps/api/src/store.service.ts:6720-6750`
  - `tests/business/v3-social-multimedia-call-persona.spec.ts` 用例 8
- **ALTERNATIVES**:
  1. *纯内存 Map 计数器*：进程重启后从 1 重新计数，导致 `maxSeq` 倒退并在客户端 `/sync?afterSeq=` 中被永久过滤丢弃（严重事故，被否决）。
  2. *客户端自带全局序号*：客户端时钟容易被篡改伪造（被否决）。
- **RISK_ASSESSMENT**: 若去重仅按 `clientMsgId` 比较而不按 `senderUserId` 隔离，会产生理论上的跨用户伪造重放。
- **APPROVED_SOLUTION**: 组合式防御：去重键强制按 `${conversationId}:${senderUserId}:${clientMsgId}` 隔离；分配序号前从数据库已有记录计算基准；客户端重发相同 `clientMsgId` 时直接返回已有入库记录。
- **REJECTED_SOLUTIONS**: 拒绝纯内存自增、拒绝不带发送者身份隔离的全局去重。
- **TEST_CONTRACT**:
  - 测试用例断言：清空内存去重 Map 后重发相同 `clientMsgId`，必须精确返回已有记录 ID，不增加新行。
- **INDEPENDENT_REVIEW**: reviewer-glm 反证指出多实例/重启序号回退风险，方案已补齐基准恢复。
- **DECISION_STATUS**: APPROVED

---

### ADR-03: 贴纸白名单准入与内联 SVG 注入联系方式防御

- **DECISION_ID**: ADR-03
- **REQUIREMENT**: 提供温暖治愈贴纸表达，同时严密阻断通过图片内嵌微信号、手机号等联系方式绕过匿名审核。
- **CURRENT_IMPLEMENTATION**:
  - `SocialMultimediaService` 内置 8 款官方受控矢量贴纸。
  - `StoreService.sendPeerMessage` 校验 `msgType === 'STICKER'` 时，必须通过 `getStickerById` 或受控白名单匹配；任何非白名单或客户端直接发送的 `data:image/svg+xml;...` 字符串被统一抛出 `BadRequestException('非法的表情包标识')`。
  - 非贴纸类型的消息强行携带 `mediaUrl` 会被服务端静默置空剥离。
- **EVIDENCE**:
  - `apps/api/src/store.service.ts:6680-6705`
  - `tests/business/v3-social-multimedia-call-persona.spec.ts` 用例 1、2
- **ALTERNATIVES**:
  1. *仅校验前缀 `data:image/svg+xml;`*：恶意用户在 SVG 中写 `<text>加v: 138xxx</text>` 直接绕过审核并被前端渲染（严重安全漏洞，被否决）。
  2. *开放用户自定义图床上传*：需要极其高昂的外部鉴黄与违规 OCR 成本，且破坏匿名纯净度（被否决）。
- **RISK_ASSESSMENT**: 过于死板可能限制表达丰富度，但相比隐私穿透与黑产引流，安全优先级最高。
- **APPROVED_SOLUTION**: 仅限官方受控贴纸库，通过贴纸 ID 寻址取可信 URL；对所有直接外联与内联 SVG 进行严格准入校验。
- **REJECTED_SOLUTIONS**: 拒绝仅靠前缀放行任意 SVG，拒绝开放无审查的自定义动态贴纸上传。
- **TEST_CONTRACT**:
  - 测试用例断言：提交包含手机号文本节点的任意 SVG 必须抛出“非法的表情包标识”。
- **INDEPENDENT_REVIEW**: reviewer-glm 重点指出内联 SVG 绕过联系方式审查隐患，方案已实施白名单完全锁定。
- **DECISION_STATUS**: APPROVED

---

### ADR-04: TURN Relay-Only 架构与未就绪通话端点 HTTP 501 规范守卫

- **DECISION_ID**: ADR-04
- **REQUIREMENT**: 规划高保真实时音视频通话架构，在缺少真实双物理机与 TURN 设施前，诚实向全端展示能力边界。
- **CURRENT_IMPLEMENTATION**:
  - `PublicController` 中 4 个通话信令路由（`/call/offer`, `/call/respond`, `/call/end`, `/call/status`）统一抛出 `HttpException('实时音视频通话功能尚未启用', HttpStatus.NOT_IMPLEMENTED)`。
  - 前端 `PeerConversation.vue` 彻底移除假通话计时与假来电振铃弹窗，避免误导用户。
- **EVIDENCE**:
  - `apps/api/src/controllers.ts:1302-1335`
  - `docs/contracts/V3_SOCIAL_PRODUCT_CONTRACT.md:119`
  - `tests/business/v3-social-multimedia-call-persona.spec.ts` 用例 11
- **ALTERNATIVES**:
  1. *直接建立 P2P WebRTC*：ICE 协商会直接暴露双方真实公网 IP 与家庭宽带 IP，造成物理定位泄露（严重安全隐患，坚决否决）。
  2. *前端保留假来电弹窗并模拟计时*：违背真实性原则与门禁铁律（被否决）。
- **RISK_ASSESSMENT**: 若暴露假状态，用户会产生“当前通话被加密监听”的错误预期。
- **APPROVED_SOLUTION**:
  - 架构设计锁定为 **TURN Relay-Only 转发模式**（彻底阻断 P2P IP 泄露）；
  - 当前由于硬件与外部凭证缺失，按任务书要求如实标记为 `BLOCKED_EXTERNAL`，服务端返回 HTTP 501，前端隐藏未就绪入口。
- **REJECTED_SOLUTIONS**: 拒绝 P2P 直连模式，拒绝返回假 200 `{ call: null }`。
- **TEST_CONTRACT**:
  - 测试用例断言：访问任何通话端点均返回 501 状态码与统一中文说明。
- **INDEPENDENT_REVIEW**: reviewer-glm 强调匿名产品严禁 P2P 泄露真实 IP，final-gate 批准 501 守卫。
- **DECISION_STATUS**: APPROVED

---

### ADR-05: AI 陪伴人格分层动态组装与记忆撤销零泄露架构

- **DECISION_ID**: ADR-05
- **REQUIREMENT**: 构建有深度、有辨识度且受到严格安全策略和记忆授权约束的 AI 陪伴助手体系。
- **CURRENT_IMPLEMENTATION**:
  - `AiPersonaService` 预设 4 款夜间治愈人格（晚安守夜人、温和倾听者、理性梳理官、轻柔引导者）。
  - `StoreService.composeDynamicText` 为 4 款角色在全部 5 种语气（`warm`, `rational`, `light`, `clear`, `poetic`）下输出完全差异化回应字典。
  - `StoreService.buildAiPrompt` 深度接入 `assemblePrompt`：
    - 第 1 层：系统最高安全规则（强制危机引导 120/12356，严禁诊断）；
    - 第 2 层：角色性格设定；
    - 第 3 层：具体任务要求；
    - 第 4 层：授权记忆（仅限有效且未过期的活跃记忆，最多 6 条，单行化截断）；
    - 第 5 层：当次用户输入（正则过滤伪造系统层级标记）。
  - 用户撤销 `allowAiMemoryUse` 授权时，提示词注入“用户未授权历史记忆”，彻底实现**撤销零泄露**。
- **EVIDENCE**:
  - `apps/api/src/ai-persona.service.ts:115-215`
  - `apps/api/src/store.service.ts:8995-9015, 9380-10050`
  - `tests/business/v3-social-multimedia-call-persona.spec.ts` 用例 8、9、10、13
- **ALTERNATIVES**:
  1. *将用户全部历史直接塞入提示词*：导致 Token 膨胀、模型注意力分散且存在提示词注入风险（被否决）。
  2. *仅在降级时改个落款名字*：角色存在感虚假，用户体验割裂（被否决）。
- **RISK_ASSESSMENT**: 用户若撤销授权后模型仍能依据缓存回忆旧事实，属于严重隐私侵犯。
- **APPROVED_SOLUTION**: 动态组装机制，每次请求实时从数据库读取最新授权状态与活跃记忆，撤销即刻切断。
- **REJECTED_SOLUTIONS**: 拒绝跨请求无脑复用长对话历史上下文，拒绝允许人格覆盖最高安全规则。
- **TEST_CONTRACT**:
  - 测试用例断言：未授权状态下，Prompt 绝不出现任何用户敏感记忆内容；4 款角色在降级时输出文本互不相同。
- **INDEPENDENT_REVIEW**: architecture-reviewer 提出 5 层提示词架构，reviewer-glm 验证了未授权状态下的零泄露。
- **DECISION_STATUS**: APPROVED

---

### ADR-06: 今日回信重生成基于 expectedAiJobId 的原子 CAS 防覆写

- **DECISION_ID**: ADR-06
- **REQUIREMENT**: 防止在网络延迟或连续切换角色/风格时，较慢的旧 AI 任务完成回调将较快的新回信落库覆写。
- **CURRENT_IMPLEMENTATION**:
  - `LetterPersistenceService.applyGenerationResult` 接收 `expectedAiJobId` 参数。
  - 执行 `prisma.letter.updateMany({ where: { id, userId, aiJobId: expectedAiJobId }, data })`。
  - `controllers.ts` 与 `store.service.ts` 在初次入队时先写入当前 `job.id`，在完成回调时带入 `expectedAiJobId`，实现数据库级原子 CAS 条件更新。
- **EVIDENCE**:
  - `apps/api/src/letter-persistence.service.ts:217-235`
  - `apps/api/src/controllers.ts:1945-1985`
  - `apps/api/src/store.service.ts:8540-8560`
  - `tests/business/v3-social-multimedia-call-persona.spec.ts` 用例 12
- **ALTERNATIVES**:
  1. *仅在应用层比较局部变量 `letter.aiJobId !== completed.id`*：在 `findOwned` 每次返回新对象的数据库模式下恒相等，完全无法防范跨请求覆写（严重并发缺陷，被否决）。
- **RISK_ASSESSMENT**: 慢任务一旦覆写新任务，会导致用户前脚刚选的“理性梳理官”回信被旧的“守夜人”旧信瞬间覆盖。
- **APPROVED_SOLUTION**: 数据库原生 `WHERE aiJobId = expectedAiJobId` 条件更新，不匹配时影响行数为 0，安全防范旧结果覆盖。
- **REJECTED_SOLUTIONS**: 拒绝无条件的 `UPDATE WHERE id = ...`。
- **TEST_CONTRACT**:
  - 测试用例断言：传入过期 `aiJobId` 时更新影响行数必须为 0，传入最新 `aiJobId` 时影响行数为 1。
- **INDEPENDENT_REVIEW**: code-reviewer 专项指出的并发隐患，已通过原子 CAS 彻底修复并通过真实服务测试。
- **DECISION_STATUS**: APPROVED

---

### ADR-07: 个人归档查询下推数据库过滤与全站反社交货币化规约

- **DECISION_ID**: ADR-07
- **REQUIREMENT**: 确保用户在个人归档“我的内容”中能够完整、不截断地查看自己发布的全部公开树洞，并避免全站数据泄露。
- **CURRENT_IMPLEMENTATION**:
  - `PostPersistenceService.listUserPublicPosts(userId)` 增加下推数据库的专属查询：`WHERE userId = ... AND status = 'active' AND visibility = 'PUBLIC'`。
  - `StoreService.myPublicPosts` 直接调用该专属方法，并关联计算 `favoritedByCurrentUser`。
  - `Archive.vue` 在“公开树洞”Tab 明确请求 `/api/v1/posts?mine=1`，仅展示本人发布的公开内容，彻底与全站陌生人 Feed 隔离。
- **EVIDENCE**:
  - `apps/api/src/post-persistence.service.ts:64-73`
  - `apps/api/src/store.service.ts:8148-8165`
  - `apps/mp/src/views/Archive.vue:135-145`
- **ALTERNATIVES**:
  1. *拉取全站最近 500 条后在内存中 filter*：当全站帖子超过 500 条时，用户自己的旧公开树洞在个人归档中静默失踪（被否决）。
- **RISK_ASSESSMENT**: 若个人归档混入他人动态，会严重破坏用户的私人领域感。
- **APPROVED_SOLUTION**: 专属查询下推数据库，按当前登录用户 ID 严格过滤。
- **REJECTED_SOLUTIONS**: 拒绝在个人归档直接请求公共全量 Feed，拒绝内存 500 条硬编码截断。
- **TEST_CONTRACT**:
  - `pnpm audit:route-consent` 确保路由合法入册；全仓 `typecheck` 验证接口契约。
- **INDEPENDENT_REVIEW**: 审查代理与反证代理一致核准。
- **DECISION_STATUS**: APPROVED

---

### ADR-08: 地区化安全求助资源规范与离线自愈架构 (P0-A)

- **DECISION_ID**: ADR-08
- **REQUIREMENT**: 确保处于危机的用户在任何地区均能获取真实适用、经过核实的紧急援助资源；其他地区不得默认显示中国大陆号码；地区未知时提供明确地区选择与通用应急避险指引（锁屏 Emergency SOS、现实亲友）；断网弱网下具备本地离线自愈能力。
- **CURRENT_IMPLEMENTATION**:
  - 后端新建 `apps/api/src/safety-resources.ts`，暴露 `GET /api/v1/safety/resources?region=...` 权威接口。
  - 支持多地区官方核实资源（CN 120/12356/110，HK 999/23892222，MO 999/28525222，TW 119/1925/1995，OTHER Befrienders/FindAHelpline），每项均标注 `verified: true`，严禁虚构。
  - 前端 `SafetySupport.vue`：默认未知地区提示通用 SOS 避险，支持地区切换芯片，记住用户偏好；提供真实一键拨号（`tel:`）与真实剪贴板复制；内置离线 Fallback 字典，断网时依然完整可用。
  - `FeedbackHelp.vue` 与 `RealityHandoff.vue` 文案全面纠正，消除绝对化“全国 12356”与“将打开系统分享”等不实描述。
- **EVIDENCE**:
  - `apps/api/src/safety-resources.ts`
  - `apps/api/src/controllers.ts:735-738`
  - `apps/mp/src/views/SafetySupport.vue:1-330`
  - `tests/business/p0-safety-regional.spec.ts` (8/8 passed)
  - `tests/acceptance/F13-safety-support.spec.ts` (100% passed)
- **ALTERNATIVES**:
  1. *仅硬编码中国大陆 120/12356*：海外/港澳台用户遇险时拨打无效甚至被误导，存在严重伦理与安全缺陷（被否决）。
  2. *粗暴使用 IP 自动定位*：在未授权情况下探测用户地理位置侵犯隐私，且代理/VPN 会导致误判（被否决）。
- **RISK_ASSESSMENT**: 错误的热线电话在自杀/自残危机下可能导致不可挽回的后果，必须确保 100% 可用、真实可信且有离线保障。
- **APPROVED_SOLUTION**: 显式地区选择 + 权威后端 API + 内置离线字典 + 真实拨号/复制双重保障。
- **DECISION_STATUS**: APPROVED

---

### ADR-09: AI 记忆四类建模、即时撤销熔断与五层严格装配 (P0-B)

- **DECISION_ID**: ADR-09
- **REQUIREMENT**: 支撑用户自主可控的长期情绪记忆体系；支持 4 类记忆（事件经历 Episodic、稳定偏好 Semantic、长期模式 Pattern、当前状态 State）；严格执行五层提示词顺序；当前输入与历史状态冲突时以当前输入为绝对最高准则；用户撤销授权时实现毫秒级物理熔断，绝无旧缓存泄露。
- **CURRENT_IMPLEMENTATION**:
  - 数据模型层：`packages/shared-types` 扩展 `MemoryType`、`MemorySensitivity`，`self-persistence.service.ts` 支持 `inferMemoryType`、`inferMemorySensitivity` 与 `revokeMemory`。
  - 数据库操作：`POST /api/v1/me/memories/:id/revoke` 与 `PATCH ... { status: 'revoked' }` 原子上锁标记 `status = 'revoked'`，更新 `revokedAt`，并在 SQL 层 `m.status = 'active'` 自动排除。
  - 提示词装配层（`AiPersonaService.assemblePrompt`）：严格锁定五层装配顺序：
    1. `SafetyPolicy`（最高安全规则，医疗免责，危机 120/12356）
    2. `TaskPolicy`（任务指令与模式偏好）
    3. `Persona`（陪伴角色设定）
    4. `AuthorizedMemory`（经授权的有限记忆，分类整理，注入当前输入覆盖旧状态规则）
    5. `CurrentTurn`（清洗防注入后的当次输入）
  - 前端 `MemoryCenter.vue`：支持记忆分类选择、状态角标展示与一键撤销授权按钮。
- **EVIDENCE**:
  - `packages/shared-types/src/index.ts:90-109`
  - `apps/api/src/ai-persona.service.ts:1-240`
  - `apps/api/src/self-persistence.service.ts:1080-1120, 2190-2245`
  - `apps/api/src/store.service.ts:7920-8040, 9510-9530`
  - `apps/mp/src/views/MemoryCenter.vue:1-490`
  - `tests/business/p0-ai-memory-lifecycle.spec.ts` (6/6 passed)
  - `tests/acceptance/F08-memory-lifecycle.spec.ts` (100% passed)
- **ALTERNATIVES**:
  1. *将所有记忆混成一段扁平文本塞入 Prompt*：无法区分长期稳定偏好与临时状态，导致数天前的“我好累不想说话”持续压制用户今天的积极倾诉（严重体验缺陷，被否决）。
  2. *仅在前端删除而不做后端物理熔断*：异步任务与旧 Worker 队列仍会读取缓存中的旧记忆（严重隐私缺陷，被否决）。
- **RISK_ASSESSMENT**: 记忆泄露或状态冲突会引发用户的被窥视感与机械违和感。
- **APPROVED_SOLUTION**: 4 类记忆显式归类 + 状态冲突消解规则 + 数据库/装配器双重撤销熔断。
- **DECISION_STATUS**: APPROVED

