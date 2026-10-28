# 晚安树洞 V3 社交能力产品合同与架构规范

**状态：设计合同 / 待实施，非上线证明。** 基准：2026-10-29，分支 `feat/v3-social-ai-persona` 的静态源码审查。本文不表示 V3 模型、接口、任务、通话或测试已经交付；历史文档中的测试通过结论不等于本合同验收通过。规范中的 `MUST` 为上线阻断项；涉及时间均以数据库 UTC 时钟为准。实现不得修改已应用的迁移，须新增迁移。审查未执行应用、数据库或真机测试。

## 0. 产品边界与裁决

晚安树洞是**低唤醒、去成瘾、保护脆弱情绪的匿名支持空间**，不是全站陌生人私信、公开交友、直播间或连续打卡产品。两名用户只能因服务器生成的具体匿名经历匹配而进入一次受限的双边关系；接受请求不等于同意聊天，同意聊天不等于同意通话，举报不等于将整段私密对话永久保留。客户端不显示稳定的跨会话标识、真实身份、联系方式、头像/在线状态/正在输入/已读回执/人气排行；服务端为安全与屏蔽保留内部用户 ID，但从不把参与者 ID 或可复用的匿名代码下发给对方。不得出现静态图片充当对话、通话、媒体上传或未读数的“演示功能”，也不得在前端硬编码消息和匹配结果。

### 0.1 本次代码审查范围与可信边界

| 领域 | 已观察现状 | 问题与原因 | V3 裁决 / 优先级 |
| --- | --- | --- | --- |
| 身份与范围 | `IdentityMiddleware` 验证数据库匿名会话，控制器读 `currentIdentity()`；会话按 starter/receiver 限制访问（`apps/api/src/identity.middleware.ts:20-34`、`apps/api/src/controllers.ts:147-161`、`apps/api/src/peer-persistence.service.ts:1218-1226`）。 | 已有会话的第三方发送被拒；但匹配/请求/同意不统一查双方隐私、账号状态和跨经历拉黑；`PeerMatch` 的唯一键只是 `(userId, peerExperienceId)`。没有全站私信接口不等于不会通过新经历再匹配被屏蔽的人。 | 建立成对关系门禁并在**生成匹配、请求、同意、发送、通话**原子写路径复核，P0。 |
| 双方同意 | `PeerMatch.requesterConsentAt/ownerConsentAt` 在锁内分别写，第二方同意时创建 active 会话，重复同意不延长（`apps/api/src/peer-persistence.service.ts:791-948`）。 | 仅有两列时间戳，没有独立 `PeerConsent` 签署版本、条款摘要、撤销事实；旧活跃行的迁移仅填 owner、requester 为空（`prisma/migrations/20261007000000_peer_bilateral_consent/migration.sql:1-14`）。`sendMessage` 仅核参与者/active/期限，未核双方签署、匹配未 blocked、用户状态（同文件 `:1218-1265`）。 | 保留旧字段仅用于迁移核对；`PeerConsent` 成为强制依据，绝不回填臆造同意，P0。 |
| 72 小时 | 第二方确认时计算 `startsAt + 72h`；发送和读取时触发到期扫表，SQL 用数据库时钟并 CAS 关闭（同文件 `:903-916,964-1027,1233-1269`；`apps/api/src/store.service.ts:6240-6263`）。 | `expirePeerConversations` 只在特定 API 路径被调用；没有独立周期 worker，闲置会话不会及时落库 closed；发送在锁内校验发生在提交之前，不能宣称“提交瞬间绝不越界”。默认 status 为 active（`prisma/schema.prisma:836-850`）。 | 独立周期任务 + 所有写入口时间门禁 + 可验证的提交边界，P0。 |
| 聊天与媒体 | `PeerMessage` 只有 content 与作者/时间，无消息序号、附件、撤回/删除标记；`PeerConversation.vue` 只呈现文本并每 3 秒轮询完整列表（`prisma/schema.prisma:894-908`；`apps/mp/src/views/PeerConversation.vue:31-51,168-175,231-280`）。 | 现有上传只收图片，文件写本地盘并返回 `/uploads/` URL，API 把整个上传目录作为静态资源公开（`apps/api/src/controllers.ts:2612-2619`、`apps/api/src/store.service.ts:2534-2565`、`apps/api/src/main.ts:231-241`）。**不能复用此公开路径承载聊天图片/视频/语音**；数据库删除状态不会撤销已知 URL。 | 独立私有媒体域和附件关联，禁公开静态 URL，P0；未接通前不声称支持媒体。 |
| 举报 | `PeerReport` 一次举报一行，同一人重复 open 举报不改旧行；历史由 admin 读取（`prisma/schema.prisma:870-892`；`apps/api/src/peer-persistence.service.ts:1284-1419`）。 | `PeerReport.conversationId` 为 `onDelete: Cascade`；没有独立取证快照、消息锚点、文本脱敏窗口、媒体散列、不可篡改承诺。删除会话会连带删除举报；仅有 reason，不能满足证据保全。 | 独立最小证据包、审计与独立保留，P0。 |
| 屏蔽 | `blockConversation` 在一个事务 CAS 当前 match 和 active conversation（`apps/api/src/peer-persistence.service.ts:1087-1135`）。 | 不建跨匹配双向索引；新经历仍可重新匹配。`respondMatch(...blocked)`/`blockMatchDirect` 仅改 Match，若已存在 active 会话，可能仍可发消息（同文件 `:609-693`）。UI 文案“双方均无法再次联络”（`apps/mp/src/views/PeerConversation.vue:333`）比代码实际保证更强。 | 所有屏蔽入口统一双向关系索引、关闭所有当前会话并强制发送拒绝，P0。 |
| 通话 | 当前会话控制器/模型/界面没有 CALL_OFFER/接受/拒绝、房间或 WebRTC 信令（`apps/api/src/controllers.ts:1200-1255`）。 | **尚未实现**，绝不能因聊天双方同意就自动获取音视频或发房间令牌。 | 未就绪前隐藏通话入口；完整通话同意闭环验收后才能开启，P0 使能门禁。 |
| 通知与同步 | `UserNotification` 可列出/标记已读；Peer 通知只见请求、激活和关闭且写在状态提交之后，失败仅记进程内数组，无持久重试（`apps/api/src/batch1-persistence.service.ts:573-672`、`apps/api/src/store.service.ts:6143-6205`）。 | 通知未读≠聊天未读；聊天无序号/游标、无去重与断线重放，轮询整表会重复下载；到期扫表通知失败可永久丢失。 | 消息序列+每用户游标+事务性 outbox/推送与补拉，P1（在多端消息能力发布前阻断）。 |
| 账号限制/删除 | 身份验证读 User.status（`apps/api/src/anonymous-session.service.ts:115-163`），`assertCanWrite` 定义于 `apps/api/src/store.service.ts:4350-4362`。 | 现有 peer 请求、同意、发送路径未调用该写门禁；`DELETE /me/data` 清理的是日记/普通图片等，不是社交媒体/举报证据（`apps/api/src/controllers.ts:2139-2159`）。 | 在所有社交写入统一检查账号限制；独立保全优先于用户清除并说明保留范围，P0。 |

**证据边界：** `tests/acceptance/F06-peer-consent-chat.spec.ts:125-352` 证明现有文本双同意、参与者限制、关闭后拒发和跨实例读取的选定场景；`tests/business/batch2-peer-verification.spec.ts:295-339,603-681,867-900` 覆盖选定并发、到期、第三方负例。它们不覆盖 V3 的独立 PeerConsent、全局拉黑、聊天媒体、证据、通话或序列恢复。旧审查历史可能针对旧提交；以上结论以本次所读当前源码为准。

## 1. 领域权威、不可变式与授权矩阵（核心问题 1、2）

### 1.1 唯一通信路径

* 仅允许已验证、状态为 `normal` 且 `allowPeerMatching=true` 的不同用户，通过**服务器生成**的 `PeerMatch` 与发布/审核通过的 `PeerExperience` 建立请求。match 必须保存 requester、experienceOwner、experienceId、来源 journey 及生成时间；服务端拒绝 requester=owner，即使数据导入绕过推荐页面也必须拒绝。`limited`/`banned` 账号不得请求、签署、发送或发起/接受通话；举报、屏蔽及自己历史访问仍可用。
* `suggested` 只是推荐，不是许可；owner 明确接受使其变为 `connected`，仍无聊天发送权。`active` 只能由双方针对**同一 match、同一合同版本**独立签署后出现。请求、接受、签署、消息、附件绑定、通话令牌及信令都不得通过任意 userId/对方 ID 绕过关系对象；客户端可持有 match/conversation ID，但服务端始终以凭证身份重新查参与者和状态。
* 私人身份资料与持久可追踪化标识不得在匿名经历/消息/提醒/信令中互相暴露。二人的真实 User ID 只留在受限的服务端关系和安全存储。拒绝交换联系方式的规则在**提交前**检查文本，在历史输出再脱敏；视频/语音的 PII 风险需在明确告知、举报/屏蔽操作和内容风控中体现，不宣称算法能完全消除。
* `PeerBlockPair` 存无向有序对 `(lowUserId,highUserId)`，低/高按稳定内部 ID 字节序排列，`UNIQUE(low,high)` + 双向查询索引；任何一方阻止后两人永久互不可匹配/请求/聊天/通话，无默认解封路径。两名用户或其体验若有任何一方禁止匹配/身份已撤销，未连接关系不得推进。已有 active 会话在隐私开关撤销时须关闭 `privacy_revoked`；关闭前后的举报/屏蔽权限不受撤销影响。

### 1.2 授权矩阵（默认拒绝）

| 操作 | requester | experience owner | 第三方 / 管理员 |
| --- | --- | --- | --- |
| 生成匿名建议 | 仅本人 journey，非本人经历且无 block | 不能为别人的 journey 生成 | 均不能替用户生成 |
| `suggested -> requested` | 本人单次发起且无 block | 不得冒充请求者 | 不得发起 |
| `requested -> connected/declined` | 不得替对方决定 | 仅 owner 独立决定 | 管理员可安全终止，不得代签同意 |
| 签署 `PeerConsent` | 仅自己对同一 match 签署 | 同左 | 不得代签；后台封禁只能撤销/终止 |
| 发消息/绑定附件/读历史 | 仅本会话且读写状态分别满足条件 | 同左 | 第三方 404；管理员仅按举报证据最小授权访问，不得当参与者读完整历史 |
| 举报、屏蔽 | 任意参与者，包括 closed 后举报窗口内；屏蔽始终可执行 | 同左 | 第三方 404；管理员可封禁用户/处理举报，动作需审计 |
| 呼叫/接听 | 双方仍 active 时独立每次授权 | 同左 | 均不得代同意或签发参与者令牌 |

写入口在数据库事务内对账号/隐私/关系/参与者、block pair 与截止时间复核；不能依赖 C 端按钮禁用、旧缓存或控制器先查后写。外键和 `CHECK(starterUserId <> receiverUserId)` 约束不可省。屏蔽插入与匹配生成及消息提交须共用既有 `User(按 ID 排序) -> LifeJourney(按 ID 排序) -> Peer` 全局锁序；新增 pair/consent/call/seq 行在 peer 锁之后按稳定顺序加锁；匹配的经历 owner 在生成和推进时也参与根锁，并锁后再读，消除“已屏蔽后并发推荐/发送”的检查-写入间隙。

### 1.3 发送判定

`CAN_SEND(actor, conv, db_now)` 当且仅当：凭证有效、actor 为其中一人、账号可写、两人均有同版本有效 `PeerConsent` 且未撤销、match=connected、pair 无屏蔽、会话 `status=active`、`startsAt <= db_now < expiresAt`、附件所有权及用途绑定均有效。**任何一项失败不写消息、不增序号、不出通知**；closed 后只允许受限的只读历史、举报、屏蔽、本人可见性删除和指定的反馈。此谓词必须被 text/image/video/voice、AI 草稿最终发送、批量/重试、WebSocket 和所有替代入口复用。AI 只能建议草稿，永不自动创建 PeerMessage。

## 2. 双方签署、状态机与幂等（核心问题 3）

* `PeerMatch.status`: `suggested -> requested -> connected`；`suggested/requested/connected -> blocked`；`requested -> declined`；无自动重开/自动好友关系。`connected` 表示 owner 接受请求，**不**等于已经 active；`active/closed` 只属于 `PeerConversation.status`，不要在 PeerMatch 增加第二个含混的 active 枚举。`PeerConversation.status` 的默认值必须取消 `active`，只允许 activation service 生成 active。`extended` 不允许上线，绝不延期。
* `PeerConsent` 是独立事实表：`(matchId, signerUserId, contractVersion, termsDigest, signedAt, revokedAt?, method)`；`UNIQUE(matchId, signerUserId, contractVersion)`，签署 UI 展示匿名、时间、可退出、举报/媒体清理边界并提交确切合同版本+摘要。服务端对照当前版本验签，不接受客户端自填签署时间，不替另一方签署；撤销仅单向有效，不得静默恢复。旧时间戳可映射为 `legacy_observed` 供审计，但**不得**被提升为已签署 V3 同意。
* 请求者提交请求：同一事务锁住双方根/屏蔽对/匹配，验证 suggestion 来源、状态和隐私，以 CAS `suggested -> requested` 写请求文本；不允许用户凭 targetUserId 任意创建请求。owner 接受时 CAS `requested -> connected`；拒绝或屏蔽终止路径同理。两个事务竞争时只成功一次，其余返回明确冲突（推荐 409），不得成功重放不同决定。
* 在 `connected` 下，任何一方第一次签署只写本人 PeerConsent（以及必要的合同版本锚点），返回 `pending_other_party`；不得生成 PeerConversation。第二方签署在**同一事务**内写自己的签署、重验双方有效签署/未被屏蔽/隐私与账号状态，单次生成会话并设置时间；一条 match 最多一条会话。重复同版本签署幂等返回当前 pending 或原会话，不改变 `startsAt/expiresAt`；过期/封禁/拉黑/隐私撤销后重复请求不能复活旧会话。已有旧活跃行若缺失 V3 双份明示签署，V3 生效时**先关为 `consent_missing` 并提供新的建议入口**，不得假造另一方签名或用旧时间戳维持发送权；历史数据修复需事前公告与灰度核验。
* `PeerConversation` 行含 `matchId UNIQUE`、两端内部 ID、`startsAt, expiresAt, status, closedAt, closedReason, nextSeq`。事件状态和权限检查以 DB 为准，通知走事务性 outbox。客户端只能展示明确状态，不得把推荐、请求、接受或单侧同意描述为正在聊天。

## 3. 72 小时不可延期生命周期（核心问题 4）

* 会话**创建时刻=第二份有效签署被写入并激活会话的同一事务中取得的数据库时间**，`startsAt=createdAt=activatedAt`；事务提交后才对外可见；`expiresAt=startsAt + interval '72 hours'`。在 DB 中 `CHECK(expiresAt = startsAt + interval '72 hours')` 或等价数据库触发器/受控生成逻辑，不允许客户端参数、后台手改或续期；72 小时是固定 259200 秒，绝不因 DST、离线、通知延迟或重连重算。
* 到期即逻辑上不可写：所有发送/上传最终绑定/offer/accept/令牌/信令必须由**持锁的 DB 时钟**判 `clock_timestamp() < expiresAt`，过期时 CAS `active -> closed, closedReason='expired', closedAt=db_now`；过期关闭事务提交后对发送返回 409/410。已 closed 不覆盖原关闭原因，屏蔽事件另入独立关系索引。**判定点约定**：是否允许一条消息，以锁内执行带有效期谓词的原子消息写入所取数据库时间为准（其 `createdAt` 应等于该时间）；数据库事务提交后消息才对外可见。提交晚于截止不等于消息在截止后被接受，但不能宣称“提交一定早于截止”：当前 PostgreSQL 应用事务的插入前检查没有提交时的原子校验。事务应限制时长、禁止锁内外部 I/O，且在临界窗口采取提前拒绝的保守策略；验收须分别测试写入判定点与提交可见点。若产品未来要求**提交时间也必须早于截止**，应另立可证明的提交时序机制和门禁，不得以 `pre-insert` 或仅在提交前再读取时钟冒充保证。
* 独立周期 worker 每分钟扫描 `status=active AND expiresAt <= clock_timestamp()`，条件 UPDATE ... RETURNING 幂等批处理；多实例互斥/重入无双重关闭，不依赖有用户发请求。服务端入口仍需即时防线，worker 停机不影响拒写。outbox 为双方生成**静默**到期提示（不唤醒深夜设备），`expired` 与 `blocked` 的 race 保留明确审计事件和单一最终关闭理由。前端倒计时只作提示；失联/恢复后必须以服务器状态为准，closed 状态只读，不能继续 composer/媒体/通话。

## 4. 私密媒体与到期后的数据处置（核心问题 5）

* 新建 `PeerMedia`/`PeerMessageAttachment`，用途固定 `peer-chat`，字段含 `ownerUserId, conversationId, messageId?, kind(image|short_video|voice), storageKey, mimeDetected, bytes, durationMs?, sha256, status(staged|ready|quarantined|purging|purged), createdAt, purgeAt`；附件关联消息，普通 `MediaAsset` 的 mood/diary/feedback 资源**不得**跨用途关联。消息 kind 是严格枚举，文本最多 1000 字；图片 JPEG/PNG/WebP 最大 5 MiB；短视频 MP4/WebM 最大 15 MiB、15 秒；语音条 Opus/WebM 或 M4A 最大 5 MiB、30 秒；参数为 V3 上限而非当前已实现能力。服务端嗅探文件类型、解码/时长并做限制，剥离 EXIF、GPS、嵌入元信息及可识别文件名；生成预览/转码衍生物都作为同一附件的**级联删除对象**。无法可靠处理的文件拒绝，不以 MIME 声明替代检查；禁外链/第三方 URL/通用相册直链。
* **禁止**用现有 `/uploads/` 静态目录放聊天媒体；文件在私有对象存储（或受控私有目录）加密，只有后端短时授权下载/播放/Range 访问；每次校验身份、参与者、未屏蔽、媒体与会话状态及有效期，URL 短寿命且不可被 CDN 长缓存。上传采用限时 staged 槽：只有 active 双签双方可申请，完成与消息绑定在数据库事务内验证会话依然 active；未绑定对象在 1 小时内回收。媒体访问在会话关闭/到期时**立即**撤销；关闭后保留的物理文件不是可浏览的历史。客户端清空缓存/停止播放器，临时 CDN 对象和加密密钥/缩略图/转码/备份按同一删除策略，不能仅把 `status` 改为 deleted。
* 到期或提前关闭时，消息记录即时转为只读并分离：会话视图展示有限脱敏文字摘要或撤回/媒体占位，不继续暴露原图片、视频、音频；原始媒体在私有隔离区保留**最长至 `closedAt + 7 天`**（到期关闭恰为 `expiresAt + 7 天`），仅供自动生成依法授权的最小证据摘要，不得向参与者再开放。宽限期届满物理删除**所有**原件、缩略图、波形、转码、临时上传、缓存副本、对象版本，数据库行置 `purgedAt` 并移除可恢复 storageKey；同时销毁加密密钥/备份恢复路径，独立重试/核验任务对账，报告孤儿文件、失败重试和删除证明。没有举报时不保留原始媒体；有举报也**只保留媒体 SHA256 摘要而非原媒体**，不得借举报无限保留音视频。确需司法保全的单独法定流程必须记录依据、期限、审批且不使普通应用读取原媒体。
* 文本消息原文在会话关闭时转为**脱敏、限长摘要**供七日内举报锚定；可撤回内容不出现在普通历史。`closedAt + 7 天` 后未进入证据包的原文/摘要均物理清理或不可逆匿名聚合；已冻结的举报证据包按 §5 的独立有限期限处理。用户可以在此 7 日举报窗口内引用消息；超过窗口仅允许提交不依赖已删除内容的新理由，不宣称还能找回原文。上述“删除”包括索引、备份与缩略图，必须在 UI 隐私声明里如实区分立即断开访问与 7 日物理清理。

## 5. 举报与独立证据保全（核心问题 6）

* 新增 `PeerReportEvidence`（或独立安全库）与 `PeerReportEvidenceItem`，**不以会话删除级联**；报告主体可删除/匿名化，但证据须按独立期限/审批规则维护。`PeerReport` 保留举报人、原因、状态、锚定消息 `anchorMessageId?`、证据包 ID/签署版本，只有参与者可提交；每个 open 举报可幂等复用，不覆盖已有举报理由/证据。举报可以选择会话整体，此时以举报时最后可见消息为锚；如果无消息则只保存事件和原因，不抓取其他会话。
* 在同一可串行化事务/一致性快照里冻结**锚点本身 + 它之前最多 10 条 + 之后最多 10 条**，仅限同一 conversation、按 `seq`（并列按 id）排列；时间点已存在的后 10 条，不未来追采；脱敏原文本（电话、账户、真实姓名/位置、链接等）且保留消息 id 的不可逆映射、seq、发送方角色、时间、kind、撤回/已删除状态与附件 SHA-256、大小/媒体种类，不保存二进制媒体、原始 URL、EXIF 或整段对话。举报原因也需单独 PII 净化，按需要与证据包分开授权。若先撤回再举报，普通内容不可恢复，证据仅含撤回占位及已存在合法元数据；若先举报后撤回，已冻结的最小证据不因用户撤回被无痕篡改，但普通可见文本仍须撤回，并在证据追加撤回事件。
* 每个包写 `evidenceHash=SHA256(规范化序列化内容)` 与不可修改存储的签名/哈希链、创建时间、版本、审计主体；业务账号只能追加处理记录，不能 UPDATE/DELETE 历史证据字段。安全审计每次管理员读取、导出、处理均留日志；前台不回显对方身份，后台按最小 RBAC 分权、默认只看脱敏包，导出须二次审批。WORM/append-only 存储与密钥隔离，不能只靠应用层禁改声称“不可篡改”。
* 默认证据保留到举报**结案后 30 天且最长自提交起 180 天**；若 180 天仍未结案须转入单独合规续期审批/法定保全，按月复审，不允许无限自动续存。到期物理删除证据文本及加密密钥，仅保留不可逆处置审计；删号、删除会话或宽限期媒体清理不应悄然删掉尚在有效期的最小证据。未提交举报不建立永久证据副本。

## 6. 仅自己删除与双方撤回（核心问题 7）

* “删除对话/消息”默认仅对当前用户**不可见**：`PeerMessageVisibility(messageId,userId,hiddenAt)` 或会话级 read cursor/hidden flag，只改变自己的展示，不改对方可见内容、不增假消息、不影响合规证据；UI 写清楚“仅对我隐藏”。服务端读历史与未读计算均过滤该用户隐藏标记；用户重装/另一设备仍保持一致。对已过期内容仍遵从 §4 的全局物理清理，不把“只对自己隐藏”误写为物理擦除。
* “撤回”必须由原发送人、**创建后 120 秒内**发起，时间用 DB 时钟，CAS `visible -> recalled` 幂等；原文与附件访问立即失效，双端显示固定占位“**一条消息已撤回**”，保留最少元数据、seq 和 tombstone 供同步；不可借修改时钟或重新发送刷新窗口。原媒体及衍生物进入优先删除队列（立即停止签发访问、24 小时内物理清理且不晚于 §4 的 7 天截止），个人“仅自己不可见”不触发对方撤回。撤回前已冻结的合法举报证据依 §5 处理，不能私下销毁或继续公开。并发撤回/报告/发送/到期按锁序和事件顺序测试。

## 7. 屏蔽与双向反制（核心问题 8）

* 任一参与者可从建议/请求/会话/已结束的历史发起屏蔽；事务内写 `PeerBlockPair(low,high,blockedBy,createdAt,reasonCode?)` 的唯一索引、CAS 所有两人间尚可推进的 match 到 `blocked`、CAS 所有 active 会话到 `closed(reason='blocked')`、终止待接通通话/撤销所有令牌，并写出站事件。两人对此关系均不可再被推荐或发请求（安全**对称**，不意味着被屏蔽者获得对方身份线索）。重复屏蔽幂等；若已以 expired/closed 等理由结束，不改写首次 `closedReason`，但 pair 永久阻断、审计新 block 事件，UI 可展示“已屏蔽”。
* 配对索引与所有入口使用同一数据库权限/事务检查。补偿扫描旧 match/会话、跨服务实例缓存失效；即使扫描未完，配对索引已提交就必须让所有写入口立即拒绝。原 `respondMatch(blocked)`、`blockMatchDirect`、`blockConversation` 等路径不得各自维护局部语义，统一调一个领域事务。不要依赖当前单 match `blocked` 列作为跨经历黑名单，也不能由对方通过错误信息探测是谁屏蔽自己。

## 8. 实时通话需每次独立双同意（核心问题 9）

**V3 通话是条件能力，不是默认可用功能。未通过完整闭环前，UI、OpenAPI 与后台不得声称已可通话。** 同意聊天**不授权**获取麦克风/摄像头或 WebRTC。仅 active 会话、双方 PeerConsent 有效、双方无 block 时：

1. 主叫明确点发起，创建 `PeerCallOffer(id,conversationId,callerId,calleeId,kind(audio|video),status=offered,createdAt,deadlineAt=db_now+30s,offerNonce)`；仅发送一次**低唤醒的应用内**请求给接收方。主叫的 offer 只代表主叫对本次通话的明示请求，不能直接建立房间或拉起任何一方媒体流。
2. 被叫在**独立弹窗**看到通话类型、匿名关系、剩余 30 秒及“接受”“拒绝”两个明确操作；默认不接受、不可自动接听。关闭弹窗/退到后台/无响应在到期时原子标记 `timed_out` 并挂断；拒绝原子标记 `declined`。主叫撤销标记 `cancelled`。并发双呼叫做去重，只存在一个有效 offer；30 秒按数据库时钟而非客户端倒计时，必须有独立 worker 回收。
3. 只有被叫的明确 `accept` 成功 CAS `offered -> accepted`，且在同一事务再次校验双方身份/同意/状态/期限/拉黑后，才生成一次性授权 `CallGrant`；令牌**在成功 accept 提交后**短时签发，绑定双方各自身份、conversationId、offerId、媒体类型、房间、5 分钟或更短有效期，连接后会话内定期复核并可撤销。信令服务/TURN/媒体网关必须逐次验证 grant 与会话状态，只把指定两人加入该临时房间；不接受客户端任意 room/userId，也不在 accept 前处理 SDP/ICE 或打开 `getUserMedia`。`getUserMedia` 必须发生在双方同意结果对两端确认后，经本机系统权限再单独授权；对端离开、block、到期、网络断联则立即挂断/停止 tracks/清理房间。端到端传输加密，默认不录音录像、无通话排行榜。
4. 离线推送不包含身份/原话、不发响铃式催促；30 秒内未接通仅有一次安静结果。失败回滚不得签发孤儿令牌；发出令牌后服务器对账并回收超时房间，防止旧令牌在 closed 会话复用。

## 9. 未读、实时序列与补拉（核心问题 10）

* 在 `PeerConversation` 内维持单调递增 `nextSeq`，`PeerMessage UNIQUE(conversationId,seq)`，客户端提交 `clientMessageId`（每设备 UUID）并约束 `UNIQUE(conversationId,senderUserId,clientMessageId)`。消息插入、seq 分配、收件人未读指针/未读计数投影、outbox 事件在**同一事务**；重试同 id 返回原消息/seq 而不重复发送或加未读，复用 id 但更改内容/附件返回 409。`seq` 不许由客户端指定，删除和撤回留下 tombstone，不得复用；对发送失败的事务不消耗可见 seq。
* 每人每会话 `PeerReadState(conversationId,userId,lastReadSeq,updatedAt)`，打开并实际展示消息时以 `max(old, acknowledgedSeq)` 原子推进，不可倒退或代对方已读；未读数按 `sender!=viewer AND seq>lastReadSeq AND visibleToViewer AND kind=message` 由 DB 计算或事务维护可重建投影，关闭会话将未读提醒安静保留直到用户查看或七日窗口清理，绝不把已读回执显给对方。`UserNotification.status=unread` 是系统通知，不得与聊天未读混算或当作聊天真值。
* HTTP `GET /peer-conversations/:id/messages?afterSeq=N&limit<=100` 仅对参与者，返回升序 `seq`、`hasMore`、`lastSeq`、服务器状态/到期时间；Socket/SSE 仅投递 `{conversationId,seq,eventId,type}`（内容另行授权读取），断网/后台/重连时先按游标补拉、按 `(conversationId,seq)` 去重并检测缺口，直到追至服务器 `lastSeq`。至少一次投递 + 幂等消费，不以“推送成功”代替持久消息；边界窗口与分页 cursor 必须可重放，blocked/closed 后只允许合规的只读和 tombstone 事件。
* `PeerOutbox` 与主事务同提交，后台按 `eventId UNIQUE` 重试指数退避并记录 dead-letter/告警；推送静默、合并/节流（深夜勿连续震动、勿显示消息原文），只提示“有一段同行留了消息”，用户明确进入后才展示内容。已有 `peerNotificationFailures` 进程数组不是可靠 outbox；改造前不得宣称离线消息通知可靠。前端停止每 3 秒全会话全量轮询，改为可见时增量/断线重放、后台降低频率；不得用无限轮询或连击提醒制造依赖。

## 10. 建议的数据结构与 API 合同（仅设计，尚无实现）

| 数据/服务 | 核心约束与索引 | 单一权威与访问 |
| --- | --- | --- |
| `PeerMatch`/`PeerConversation` | 现有 match 唯一引用；新加 pair 快照/`nextSeq`、会话状态与绝对 72h 约束；CHECK 两方不同；有效会话唯一 | PostgreSQL 状态机服务，所有动作 CAS；历史旧字段只读审计 |
| `PeerConsent` | `matchId, signerUserId, contractVersion` 唯一；条款 digest、DB 签署时刻、撤销时刻 | 两人分别签署，非代签；有效态派生 |
| `PeerBlockPair` | 有序用户对唯一及双方向索引；关系建立/消息/通话同步校验 | 永久拦截，以 DB 为准；不可被用户资料删除恢复关联 |
| `PeerMessage`/`PeerReadState` | 会话 seq 唯一 + 客户端幂等键；每用户会话游标唯一；撤回/隐藏明确区分 | 文本与事件由 DB 权威；附件仅引用私有媒体 |
| `PeerMedia`/`PeerMessageAttachment` | 上传者、会话、消息、SHA256、删除状态/截止时间；消息级外键和孤儿回收 | 私有文件适配器，读/写授权统一检查 |
| `PeerReport`/`PeerReportEvidence` | 证据指针不随会话级联；证据 immutable/WORM，保留截止及审计索引 | 安全存储与 RBAC；仅授权管理员可查脱敏摘录 |
| `PeerCallOffer`/`CallGrant` | 每会话一个待决 offer（部分唯一索引）；30 秒 TTL、受限令牌/撤销 | 服务端信令/房间校验，拒绝单方签发 |
| `PeerOutbox` | eventId 唯一、状态/重试/投递时间、DLQ | 消息与通知事务同写，工作进程幂等投递 |

**外部接口建议：** 沿用 `/api/v1/peer-matches/:id/consent` 但增加合同版本与条款摘要，并显式返回 `pending_other_party|active`；匹配请求/接受继续原路径但必须按状态码区分 404(无权/无关系)、409(竞态/状态失效)、410(会话到期)、403(本人账号限制或隐私撤销)，不得泄露对方 block 事实。新消息接口要求 `clientMessageId, kind, content? / stagedAssetIds?`；新增 `GET /api/v1/peer-conversations/:id/messages?afterSeq`、`POST /:id/read-cursor`、`POST /:id/media/stage`、`POST /:id/messages/:messageId/recall`、`DELETE /:id/messages/:messageId?scope=self`、`POST /:id/call-offers`、`POST /:id/call-offers/:offerId/{accept,decline,cancel}`、`GET /:id/sync`。所有新接口复用已验证匿名凭证，不接受浏览器注入的 `userId` 字段或公开 storage URL；管理员取证使用独立管理端权限，不向 C 端投影 `PeerReportEvidence` 的内部身份。合同外的新 V3 媒体/通话端点在实现前必须不存在或返回明确 501/禁用，而非假 200。

**演进约束：** 先用新增迁移建表/索引/NOT NULL 可行性校验并清点遗留 `active`、失效/跨本人匹配、旧 `blocked` 与旧 public media；生成匿名化迁移报告，不编辑既有 `prisma/migrations` 文件。先统一 `PeerBlockPair` + 发送门禁并封住旧屏蔽入口，再推出 Consent V3 与保守关停旧会话；之后私有媒体与清理、证据和撤回、消息序列/outbox；最后单独灰度通话。对旧 `/uploads/` 历史内容作单独隔离方案，禁止把已经公开的 URL 宣称为私有。后台/客户端同时读取同一权威 DB 状态，旧 in-memory Store fallback 不得绕过新门禁；迁移期间双写不等于双真相。

## 11. 验收与上线优先级

| 优先级 | 必要验收（必须有 API → DB → 多实例/重启 → 客户端证据） |
| --- | --- |
| **P0，任何 V3 社交扩展前** | 生成/请求/签署/发送/屏蔽/通话均拒绝自己、非参与者、已拉黑对、账号受限、隐私撤销；已有 active 匹配屏蔽后**所有**旧入口拒发；双方 PeerConsent 独立并发一次激活、不伪造 legacy；72h 到期 worker 关闭且即使 worker 停摆仍拒发；私密媒体无法从 `/uploads/` 直链或已关闭令牌读取；举报快照独立于会话并在删会话后可按授权读。 |
| **P1，消息/媒体正式开放前** | 图片/短视频/语音真实上传、限制、投影、重启/跨端存在性、预览与物理回收；到期+7天文件/所有派生物/备份对账可证明物理清理；举报前后 10 条和 digest 固定、管理员只能最小化读取；120 秒撤回/仅自己隐藏覆盖竞态；两个客户端并发发送 seq 唯一，离线重放不漏不重，通知投递失败经 outbox 修复，read cursor 多端单调。 |
| **P0（通话开关单独门禁）** | 主叫单方 offer 永不触发 `getUserMedia`/房间令牌/SDP；被叫接受、拒绝、无操作 30 秒、双方同时发起、接听与 block/expire 竞态均对账；令牌只有 accept 后可签发且失效后无信令/媒体流；后台无强提醒。 |
| **P2，体验与维护** | 控制客户端轮询流量；匿名/低唤醒文案、辅助技术弹窗操作、失败提示、数据删除说明一致；死信与回收监控、媒体孤儿扫描、按期删除报表和审计查阅。 |

**验收反例必须覆盖：** 同一人持两个客户端重复发送同 id；两人恰好在 72h 边界并发发送/屏蔽/同意/通话；举报与撤回、报告与媒体清理并发；另一实例更新状态而本实例旧缓存仍展示 active；持有旧公开 URL/短期签名的非参与者访问；网络断开后消息 1..N 按序补齐；身份封禁后的旧凭证继续尝试所有社交写入口。测试应使用隔离数据库和真实文件适配器，验证磁盘对象已删除及访问失败，而非只断言 200、前端 toast 或图片占位。所有缺项标记 `NOT_IMPLEMENTED`，不得以旧 F06/BATCH2 通过替代 V3 通过。

## 12. 与“2D 宠物/家具/动画/成长”审查目标的边界

本仓库本次定位的 PeerConversation/PeerMessage、匹配和通知均为匿名情绪支持社交域；在受审 API、Vue 视图与 Prisma 模型中**未定位** Companion Runtime、Furniture System、Animation Pipeline、Growth System 的实现。不能把聊天列表轮询认作 Companion Runtime，不能把静态配图认作动画或宠物行为，也不能为了社交功能引入持续在线陪伴/连续喂养/数值化情绪成长。若另有宠物系统须另起设计审查、以真实状态机/资源索引驱动，确保其通知、留存及媒体不冲突于本文的匿名、低唤醒和 72h 限制；本合同不对未找到的系统给出“通过”结论。
