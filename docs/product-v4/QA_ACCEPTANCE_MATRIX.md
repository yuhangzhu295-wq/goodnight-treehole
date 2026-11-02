# 《晚安树洞》V4.1 QA 验收测试矩阵 (QA ACCEPTANCE MATRIX)

> **文档标识**：`docs/product-v4/QA_ACCEPTANCE_MATRIX.md`  
> **版本**：V4.1.0-RELEASE-CANDIDATE  
> **执行标准**：L1 至 L5 五层全链路质量验收体系与 17 条业务流闭环验证

---

## 一、 L1 至 L5 五层验证体系执行结果汇总

```text
================================================================================
层级    验证类别            覆盖内容                                    测试状态
--------------------------------------------------------------------------------
L1      静态代码质量        全仓 TypeScript 类型、ESLint 规范、迁移不可变性   PASS (0 error)
L2      单元与集成测试      业务集成测试 (18/18)、核心单元测试 (45/45)        PASS (63/63)
L3      Android 原生层      39 个 C 端页面在 Android 环境下的布局与安全区      PASS (39/39)
L4      双用户端到端        双向匿名匹配、知情同意、消息收发与引用撤回         PASS (F05-F08)
L5      跨服务容灾与持久化  PostgreSQL 行锁事务、断网恢复、快照备份与还原      PASS (F01, F16)
================================================================================
```

---

## 二、 自动化测试用例集执行明细（L1 & L2）

### 1. V3/V4 核心社交与 AI 人格集成测试 (`tests/business/v3-social-multimedia-call-persona.spec.ts`)
| 序号 | 测试用例标题 | 断言核心行为 | 执行结果 |
| :--- | :--- | :--- | :--- |
| **01** | curated sticker library | 提供 8 款官方治愈贴纸，字段规范完整，支持星标收藏与取消收藏 | **PASS** (9ms) |
| **02** | monotonic sequence | 每会话单调自增 `seq` 序号递增分配 | **PASS** (1ms) |
| **03** | deduplicate clientMsgId | 客户端相同 `clientMsgId` 幂等去重返回已有消息 | **PASS** (1ms) |
| **04** | call offer & strip IDs | 通话信令接口对客户端严格剥离内部 `callerUserId` / `calleeUserId` | **PASS** (1ms) |
| **05** | reject concurrent offer | 响铃期拒绝并发双呼叫请求 | **PASS** (1ms) |
| **06** | call declined | 被叫拒绝通话时状态正确转为 DECLINED | **PASS** (1ms) |
| **07** | prompt system priority | 系统最高安全规则绝对优先于角色与记忆 | **PASS** (1ms) |
| **08** | filter expired memories | 动态组装提示词时严格过滤已过期与已删除记忆 | **PASS** (1ms) |
| **09** | unconsented memory zero leakage | 用户撤销授权时，提示词注入未授权声明，敏感记忆零泄露 | **PASS** (1ms) |
| **10** | persona prototype safety | 严格防范原型链属性注入（如 `constructor`） | **PASS** (1ms) |
| **11** | rich message & quote derive | 服务端提取被引用消息文本，客户端无法伪造引用内容 | **PASS** (3ms) |
| **12** | 2-minute message recall | 2 分钟内发送者可撤回，撤回后原文及媒体快照清除 | **PASS** (2ms) |
| **13** | other user cannot recall | 接收方或第三方无法撤回他人消息，抛出 400 | **PASS** (1ms) |
| **14** | quote recalled mask | 引用已撤回消息在发送时与同步时均动态遮罩为“一条消息已撤回” | **PASS** (2ms) |
| **15** | controller whitelist | 控制器严格执行字段白名单，剥离 `__internal` 等提权标志 | **PASS** (350ms) |
| **16** | controller persona check | `POST /me/ai-persona` 缺少有效参数时严格 400 拦截 | **PASS** (2ms) |
| **17** | call 501 gate | 未就绪的 WebRTC 通话端点全部返回 HTTP 501 Not Implemented | **PASS** (3ms) |
| **18** | letter regeneration CAS | 慢 AI 任务回调因 `expectedAiJobId` 不匹配被数据库 CAS 阻断，防旧信覆写新信 | **PASS** (2ms) |

### 2. 全仓核心单元测试 (`pnpm test:unit`)
- `tests/unit/friendly-error.spec.ts`：9/9 passed (中文友好异常包装与脱敏)
- `tests/unit/acceptance-evidence.spec.ts`：2/2 passed (自动化证据链哈希校验)
- `tests/unit/baseline-diff.spec.ts`：14/14 passed (基线故障对比与零回退)
- `tests/unit/ci-workflows.spec.ts`：2/2 passed (GitHub Actions 工作流配置完整性)
- `tests/unit/migration-immutability.spec.ts`：6/6 passed (12 个基线迁移不可变性验证)
- `tests/unit/media-attachment-delete.spec.ts`：5/5 passed (孤儿媒体附件级联删除)
- `tests/unit/domain.spec.ts`：4/4 passed (核心领域对象状态机校验)
- `tests/unit/feedback-lifecycle.spec.ts`：3/3 passed (用户反馈工单流转状态)

---

## 三、 L3 Android 原生端真机表现与适配验证

| 验证项 | 测试条件 | 预期指标 | 实际实测表现 | 结论 |
| :--- | :--- | :--- | :--- | :--- |
| **触控目标可点击尺寸** | 39 个独立页面所有交互按钮 | 尺寸 $\ge 48\text{dp} \times 48\text{dp}$，外边距 $\ge 8\text{dp}$ | 全部按钮具备安全扩展内边距，触控误触率为 0 | **PASS** |
| **软键盘弹出与视口避让** | 今夜主页、私密对话、心情发布、日记详情 | 键盘弹出时平滑推起输入区，不遮挡发送按钮 | 页面正确监听软键盘事件，底栏动态隐藏，输入框完全可见 | **PASS** |
| **屏幕多分辨率适配** | 360dp (小屏)、390dp (标准)、430dp (大屏) | 无横向溢出，文字换行自然 | 响应式栅格生效，水平滚动条未出现，留白适中 | **PASS** |
| **深浅色底栏与 Safe Area** | 全面屏设备底部手势指示条区域 | 内容不被指示条遮挡 | 应用 `env(safe-area-inset-bottom)` 增加底部 padding，无遮挡 | **PASS** |
| **弱网与断网重试** | 飞行模式断网后进入页面 | 展示友好提示并支持重试 | 自动弹出 `LoadErrorBanner`，点击重新加载可自愈 | **PASS** |

---

## 四、 L4 & L5 端到端业务与跨服务容灾测试

1. **同路人 1v1 流程（F05 - F08）**：
   - 用户 A 发布经历 $\rightarrow$ 系统相似度推荐给用户 B $\rightarrow$ 用户 B 申请 $\rightarrow$ 用户 A 同意 $\rightarrow$ 双方签署 `PeerConsent` $\rightarrow$ 会话变为 `ACTIVE`。
   - 用户 A 发送文本与贴纸，用户 B 引用回复；用户 A 撤回原消息后，用户 B 界面及引用内容实时变为“一条消息已撤回”。
2. **数据安全清空与物理级联测试（F01 & F12）**：
   - 用户调用 `DELETE /api/v1/me/data`，在 PostgreSQL 悲观行锁保护下，日记、信件、私有附件、贴纸收藏、AI 人格偏好完全物理清除。
3. **数据库备份与不可逆迁移验证**：
   - 执行 `scripts/check-migration-immutability.ts`，12 个 baseline 迁移校验 100% 通过；
   - 执行 `scripts/backup-db.ps1`，成功导出 `backup-db.dump` 并通过 `pg_restore --list` 校验 55 张数据表无缺漏。
