# 第二阶段同路人匿名互助闭环 - 最终报告

## 结论

- 基线：`24effae81c46c7a2e9ba6077bac422d6a87cdd29`（`fix: finish first-stage reference fidelity`）。
- 交付状态：`SECOND_STAGE_PEER_FROZEN=true`。
- 本次为增量实现：保留既有 Journey、PeerExperience、PeerMatch、Notification、AiJob、Store/Mapper 和管理端读取入口；没有把参考图作为页面背景，也没有增加静态假数据或透明热区。
- 视觉来源：`C:\Users\zyu33\Desktop\图片素材88\晚安树洞_UI_01-41_业务说明`。参考图只用于本地对照，不进入产品渲染。

## 页面与参考状态

| Reference | 页面/状态 | 状态 | 已实现的真实行为 |
| --- | --- | --- | --- |
| #2 | 同路推荐 | DONE | 隐私未开启说明与真实开关、至多 1 主 + 2 次经历、真实匹配解释、查看经历和暂不查看入口。 |
| #5 | 同路经历 / TA 后来怎么样 | DONE | 按当时、后来、时间片段、有帮助/无帮助内容展示；可提交原因和一个问题，创建真实请求。 |
| #28 | 收到的同路请求 | DONE | 展示请求原因、问题和关联经历；接受、婉拒、停止接收均落到真实 PeerMatch 状态。 |
| #31 | 匹配等待 | DONE | 请求后保持 `requested`，轮询真实状态，不制造倒计时或虚假聊天入口。 |
| #21 | 交流前边界确认 | DONE | 明示匿名、72 小时、禁止交换可识别信息、可结束和 AI 只整理草稿；主动同意才创建会话。 |
| #4 | 72 小时匿名会话 | DONE | 区分“我/TA”消息、显示真实到期时间、DAPI 草稿整理但不自动发送、结束确认、举报和停止匹配。 |
| #40 | 同行结束 / 留下后来 | DONE | 结束后真实反馈、可选备注、匿名留下后来进入待审核 PeerExperience。 |

每个状态在 420x786 生成了 reference、actual、side-by-side、difference，并在 375x812、390x844、393x852、430x932 复验无横向溢出。产物位于 `artifacts/reference-fidelity/peer-stage/`（运行产物，未纳入版本库），总览见 `artifacts/reference-fidelity/peer-stage/audit.md`。

## 数据与 API 变更

- Prisma 最小增量：`PeerMatch` 增加请求原因、问题、接受时间；`PeerConversation` 增加开始/同意/关闭原因/反馈/举报字段；`PeerMessage` 增加 PII 标识。迁移：`prisma/migrations/20260819000000_second_stage_peer_support/migration.sql`。
- 请求和会话边界：请求方只能从 `suggested` 提交到 `requested`；被请求方接受后仍未创建会话，只有其明确同意边界才创建 72 小时 active conversation。
- 新增或补全真实端点：同意边界、会话关闭、举报、停止匹配、反馈，以及现有请求/消息/AI assist 的权限和持久化约束。
- 对 C 端投影移除了内部匹配分数、权重、信誉和原始状态代码。匿名公开内容和后续摘要经过手机号、邮箱、微信/QQ、身份证、地址及姓名线索的最小脱敏层。
- 管理端沿用既有 peer conversations、peer experiences、peer matches 与安全事件读取入口；`test:peer-stage-business` 以管理员身份实际读取 `/api/admin/v1/peer-conversations`，并断言举报人、举报原因和消息数量，证明举报、反馈与会话状态可从同一权威数据源跨端读取。

## 两用户数据库证据

独立 PostgreSQL schema 的真实浏览器链路创建两个匿名用户：A 有 Journey 与匹配需求，B 有已审核公开的 PeerExperience。验证结果：

- A 只看到 B 的经历，未匹配到自己的经历。
- A 发送请求后，`PeerMatch=requested`，B 收到 `PEER_REQUEST`。
- B 接受后，A 仍不能发送消息；B 完成边界同意后才创建会话。
- 双方刷新后看见彼此的三条已持久化消息；DAPI assist 仅回填发送框，未创建自动发送消息。
- 会话关闭后持久化为 `closed`，并写入 `feedback=helpful`、关闭通知和待审核匿名后来。

最近一次证据：`artifacts/reference-fidelity/peer-stage/database-evidence.json`，其中会话包含 `startsAt`、`expiresAt`、`consentAcceptedAt`、3 条消息、关闭状态、反馈、`PEER_REQUEST`/`PEER_ACCEPTED`/`CONVERSATION_CLOSED` 通知和共享经历 ID。

## 安全与隐私验证

- 自己匹配自己：服务端不返回自身经历。
- 隐私关闭：C 端进入明确的匿名边界说明，匹配/请求操作仍由服务端拒绝。
- 未接受、仅接受未同意、已拒绝、已停止匹配、已关闭和已过期会话：服务端均拒绝发送。
- 改写 `matchId` 的第三方读取/发送：服务端拒绝。
- PII 测试覆盖手机号、邮箱、微信提示和地址样式；公开经历自动脱敏，消息/请求中的高风险信息会被阻止而不是悄悄删除。
- 72 小时限制以 `startsAt`、`expiresAt`、`status` 服务端校验；刷新和 URL 修改无法重新获得会话时长。

## 实际通过的验证

所有下列命令在本次最终实现上退出码为 0：

```text
pnpm lint
pnpm typecheck
pnpm test:reference-fidelity-first-stage
pnpm test:reference-fidelity-peer-stage
pnpm test:peer-stage-business
pnpm test:peer-stage-security
pnpm test:peer-stage-two-user
pnpm test:peer-stage-expiry
pnpm test:click-all
pnpm test:business-flow
pnpm test:cross
pnpm test:dapi-live
pnpm qa:all
```

`pnpm test:dapi-live` 与跨端验收均记录了 `provider_dapi_deepseek / deepseek-v4-flash` 的成功 AiJob、远程模型、终态 trace 和结果；本次未使用 Ollama 或本地模型。`qa:all` 还通过了前后台真实浏览器点击、可达性诊断、运行态诊断、可见测试产物审计以及前台 14 页无横向溢出捕获。

## 第一阶段保护

冻结页 #1、#36、#29、#13、#32、#33、#16、#6、#37、#39、#34 未被作为第二阶段重构对象修改。`pnpm test:reference-fidelity-first-stage` 在本次完成后重新运行通过，Journey、Action、Safety、Reality Handoff、Notification 与 DAPI 链路保持可用：`FIRST_STAGE_UI_FROZEN=true`。

## 变更范围

核心实现位于：

- `apps/api/src/controllers.ts`、`apps/api/src/main.ts`、`apps/api/src/store.service.ts`、`apps/api/src/relational-runtime.mapper.ts`
- `prisma/schema.prisma` 与本阶段 Prisma migration
- `packages/shared-types/src/goodnight-2.ts`、`packages/shared-types/src/index.ts`
- `apps/mp/src/views/PeerNetwork.vue`、`PeerExperienceDetail.vue`、`PeerRequests.vue`、`PeerMatchWaiting.vue`、`PeerConsent.vue`、`PeerConversation.vue`、`PeerGraduation.vue`
- `apps/mp/src/assets/goodnight/peer/peer-night-tree.png`
- `scripts/reference-fidelity-peer-stage.ts` 与 `tests/business/peer-support-stage.spec.ts`

## 后续观察

- 水彩局部资产采用无文字、无按钮的局部裁切以维持真实交互；日后如补充独立授权插画，可替换该局部素材而不改变数据与交互契约。
- 管理后台本轮只验证既有读取入口，没有进行视觉重构；这是刻意保持第二阶段范围收敛的结果。
