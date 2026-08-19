# 第二阶段 Peer Support 初始审计

审计时间：2026-08-19

## 基线与范围

- 唯一基线：`24effae81c46c7a2e9ba6077bac422d6a87cdd29`（`fix: finish first-stage reference fidelity`）。
- 第一阶段状态：`FIRST_STAGE_UI_FROZEN=true`。本阶段不得修改 #1、#36、#29、#13、#32、#33、#16、#6、#37、#39、#34，除非 Peer 改动造成确定回归。
- 本审计已打开 UI 源目录中的 #2、#5、#28、#31、#21、#4、#40：`C:\Users\zyu33\Desktop\图片素材88\晚安树洞_UI_01-41_业务说明`。

## 已有可复用实现

| 层 | 已有能力 | 复用结论 |
| --- | --- | --- |
| 路由 | `/pages/peers/index`、`/pages/peer/detail`、`/pages/peer/requests`、`/pages/peer/conversation` | 保留；#31 用请求页状态，#21 用接受后的同意 sheet，#40 用关闭态，不为图号制造平行路由。 |
| C 端 | `PeerNetwork.vue`、`PeerExperienceDetail.vue`、`PeerRequests.vue`、`PeerConversation.vue` | 直接重构现有页面，不新建另一套 Peer 页面。 |
| API | `/api/v1/peers`、PeerExperience 创建/详情、匹配建议、请求响应、会话、消息、AI assist、关闭、通知、隐私设置 | 继续使用这些真实端点；在同一 Peer API 边界最小扩展请求文本、同意、反馈、举报和安全校验。 |
| 数据 | Prisma `PeerExperience`、`PeerMatch`、`PeerConversation`、`PeerMessage`、`UserNotification`，关系型 runtime mapper 已同步这些实体 | 增量扩展现有模型；不重建模型或另存第二套数据。 |
| 匹配 | 已按领域、子领域、标签、阶段、恢复进度生成匹配，并排除 `experience.userId === requester` | 保留算法和自匹配排除；C 端只显示真实 reasons/explanation 的人类化表达。 |
| 隐私 | `allowPeerMatching` 与 `allowAnonymousExperienceStats` 已由 API 检查，Experience 创建已有显式 `consented` | 保留并将未开启文案改为参考的边界说明；公开内容继续从 consented/reviewed Experience 读取。 |
| 持久化 | Store 的 `persistAndFlush()` 与 relational mapper 已能回读 Peer 数据；Admin 已有 PeerExperience、PeerMatch、PeerConversation 列表与 Experience 审核入口 | 新字段同样写入 mapper；本轮只验证 Admin 可读，不重做后台页面。 |
| 现有测试 | `tests/business/goodnight-2-incremental.spec.ts` 已覆盖两个用户、非 self-match、请求通知、72 小时会话和双方消息写库 | 保留为回归基础，并新增阶段专用双用户、安全、过期、PII、视觉测试。 |

## 当前缺失或不符合项

| 区域 | 审计发现 | 必须增量修复 |
| --- | --- | --- |
| #2 同路 | 当前列表可显示 5 条，并向 C 端泄漏相似度、帮助信誉、原始领域/阶段等内部信息。 | 收束为 1 主 + 最多 2 次推荐；只显示真实匹配原因、走过时间和 later 摘要；移除全部 score/reputation/status/raw key。 |
| 隐私未开 | 当前文案和 CTA 偏工程化。 | 改为“不会自动让别人看到你”的边界说明，明确会/不会分享什么，并真实 PATCH 现有隐私 API。 |
| #5 经历详情 | 现有页面是泛用卡片，展示 raw domain/stage、action status。 | 组织为“TA 的后来故事”，把原始字段映射为人类文案；保留真实 timeline/actions/later 数据。 |
| 请求与 #31 等待 | `requested` 只变更状态，无法保存发起原因/短问题；通知 target route 当前指向不存在的 `/pages/peer/request`；等待状态没有参考所需的安抚页。 | 在 `PeerMatch` 最小增加请求原因/问题；正确路由到 `/pages/peer/requests`；请求提交后展示真实 `requested` 等待状态，不进入会话。 |
| #28 收到请求 | 当前只显示 Experience 标题、领域、阶段和三个生硬状态按钮。 | 展示对方为何找到这段经历、问题和公开经历；采用“愿意陪 TA 聊一会 / 这次先不了 / 不再收到此人的请求”文案，仍映射 connected/declined/blocked。 |
| #21 同意边界 | 当前发布者接受请求即创建 `active` 会话。 | 需要最小 conversation consent 记录；接受后先显示双方边界，只有主动确认才创建/激活 72 小时会话。 |
| #4 会话 | 真实消息、结束和 assist 已有，但所有消息都叫“匿名参与者”；没有剩余时间、PII 保护、举报，关闭没有双方通知。 | 根据 senderUserId 显示“我/TA”，显示剩余小时；assist 只回填 draft；添加发送前 PII 提醒/阻止、真实举报、关闭确认与通知。 |
| 72 小时 | 服务端发送已拒绝过期/closed 会话，但没有明确 `startsAt`，会话在受邀方接受时就开始；assist 未校验 active/expiry。 | 用 consent 后的 `startsAt`/`consentAcceptedAt` 建立会话；assist、发送、读取及 UI 全部执行 active/expiry 权限校验，且旧会话不得因 URL 或新请求恢复。 |
| #40 结束与飞轮 | 关闭后没有反馈、可选记忆句、公开后来选择或关闭通知。 | 在现有关闭态保存 conversation feedback 和可选 note，按隐私/明确 consent 创建或更新最小 redacted PeerExperience draft。 |
| PII/举报 | 目前没有前后端 PII 检测提示；Message 只有 `reportedAt/blockedAt`，没有真实 Report API/后台可读记录。 | 新增最小 redaction/PII guard；不静默删除。添加 Conversation report 的真实持久化并复用 Admin 可见数据能力。 |
| 共享类型与通知 | `NotificationType` 只有 `PEER_REQUEST`/`PEER_ACCEPTED`，Conversation 未暴露 consent/feedback。 | 最小扩充关闭/临近结束通知类型和 Peer 会话字段，所有 targetRoute 指向真实页面。 |
| Reference QA | 第一阶段只有独立的 first-stage 脚本。 | 新建隔离的 Peer Stage 参考捕获、四尺寸 shell 检查、逐页 reviewer evidence；不得修改第一阶段审计器。 |

## 参考图契约

| Reference | 页面/状态 | 导航契约 |
| --- | --- | --- |
| #2 | 同路推荐 | 四 Tab，`同路` active。 |
| #5 | 匿名经历详情 | Detail，返回控制；不强行添加固定 TabBar。 |
| #28 | 我的请求 | 四 Tab，`同路` active。 |
| #31 | 同路匹配等待 | 作为请求的真实 waiting 状态，四 Tab，`同路` active。 |
| #21 | 会话前确认 | 接受后的 consent sheet/状态，底层保持 Peer 导航。 |
| #4 | 72 小时匿名会话 | 沉浸式 Detail，不显示固定 TabBar。 |
| #40 | 结束/分享后来 | 会话关闭态，不显示固定 TabBar。 |

## 最小新增数据设计

在现有 Prisma/mapper/store 类型上增量添加，而非另建系统：

- `PeerMatch.requestReason`、`PeerMatch.requestQuestion`、`PeerMatch.acceptedAt`：保留请求上下文和真实接收方决定。
- `PeerConversation.startsAt`、`PeerConversation.consentAcceptedAt`、`PeerConversation.feedback`、`PeerConversation.feedbackNote`、`PeerConversation.reportedAt`：使 72 小时从明确同意开始，并能回读关闭反馈/举报。
- `PeerMessage.piiFlags`：仅保存检测类别，不静默篡改用户草稿。
- Notification 枚举添加 `CONVERSATION_ENDING`、`CONVERSATION_CLOSED`，以已有 `UserNotification` 持久化。

## 禁止修改

- 不修改第一阶段页面、第一阶段 reference QA 或其冻结结论。
- 不展示匹配分数、信誉、排行、原始状态、数据库键或真实身份。
- 不使用整张参考图背景、透明热区、静态假匹配、静态假会话、假 AI 发送或新的平行 Peer 数据源。
- 不重做 Admin UI；若 Admin 缺少必要展示，只在最终报告记录。

## 实施顺序

1. 最小 Schema/mapper/shared types/API 状态机与测试数据清理。
2. #2、#5、请求与 #31、#28、#21、#4、#40 的真实 UI 重构。
3. PII、举报、72 小时、关闭通知与匿名 Experience 飞轮。
4. Peer Reference capture/reviewer、双用户/安全/过期/PII/DAPI 测试。
5. 全量回归、第一阶段复验、最终报告和提交。
