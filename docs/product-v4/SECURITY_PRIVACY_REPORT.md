# 《晚安树洞》V4.1 安全与隐私合规审计报告 (SECURITY & PRIVACY REPORT)

> **文档标识**：`docs/product-v4/SECURITY_PRIVACY_REPORT.md`  
> **版本**：V4.1.0-RELEASE-CANDIDATE  
> **审计基准**：三用户隔离对抗测试、越权渗透防御、数据最小化与物理擦除保障

---

## 一、 三用户隔离对抗测试与越权防御矩阵

为验证多租户数据隔离的严密性，测试套件构建了三个相互独立的模拟用户身份与独立管理员角色：
- **用户 A**（会话发起方）
- **用户 B**（经历分享与会话接收方）
- **用户 C**（第三方无关访客/潜在攻击者）
- **管理员 Admin**（受限运营审核员）

### 1. 负向对抗测试执行矩阵

| 测试场景 | 攻击/越权操作向量 | 服务端防护机制 | 响应状态码 | 判定结论 |
| :--- | :--- | :--- | :--- | :--- |
| **私密日记防偷窥** | 用户 B 尝试调用 `GET /api/v1/diaries/:id` 读取用户 A 的私密日记 | `DiaryPersistenceService` 强制按当前请求身份 `userId` 施加查询限制 | **HTTP 404** (Not Found)<br>不泄露存在性 | **PASS** |
| **会话第三方防窃听** | 用户 C 构造 `GET /api/v1/peer-conversations/:matchId/sync` 刺探 A与B 的私密聊天 | `requirePeerConversation` 严格比对 `starterUserId` 与 `receiverUserId` | **HTTP 404** (Not Found)<br>防关系探测 | **PASS** |
| **撤回越权拦截** | 用户 B 尝试调用 `POST .../messages/:id/recall` 撤回用户 A 发送的消息 | 数据库行锁内校验 `msg.senderUserId === currentUserId` | **HTTP 400** (Bad Request)<br>只有发送方可撤回 | **PASS** |
| **过期会话防伪造** | 在 72 小时生命周期结束后，用户 A 尝试调用 `POST .../messages` 发送新消息 | 行锁内比对数据库当前时间 `clock_timestamp() >= expiresAt`，触发 CAS 关闭 | **HTTP 400** (Bad Request)<br>会话已经结束 | **PASS** |
| **拉黑双向阻断** | 用户 A 点击屏蔽用户 B 后，用户 B 尝试继续向该会话发送消息 | 匹配状态已原子变为 `blocked`，数据库 `PeerBlockPair` 全局拦截 | **HTTP 400** (Bad Request)<br>会话已关闭 | **PASS** |
| **AI 记忆跨用户隔离** | 用户 B 触发 AI 今日回信，尝试诱导模型引用用户 A 的记忆或日记 | `activeMemoriesForTask` 强制按当前用户 ID 检索数据库并过滤状态 | **PASS** (Zero Leakage)<br>绝对无 A 记忆 | **PASS** |
| **管理后台隐私脱敏** | 管理员在后台查看树洞审核列表 | 接口仅下发脱敏后的公域内容，剥离发帖人底层 `userId` 与真实设备号 | **PASS** (脱敏展示)<br>无 PII 穿透 | **PASS** |

---

## 二、 个人数据销毁与物理级联保障（`DELETE /api/v1/me/data`）

针对《个人信息保护法》与欧洲 GDPR 的“被遗忘权”，晚安树洞建立了物理级的数据彻底销毁机制：

1. **跨实例分布式排他悲观锁**：
   - 采用 PostgreSQL 咨询锁 `SELECT pg_advisory_xact_lock(hash(userId))`，确保在数据清除事务执行期间，该用户的所有并发写入与数据导出操作被强制挂起等待，杜绝边删边写导致的孤儿数据残留。
2. **级联物理清除范围**：
   - `Diary` 表：物理删除该用户所有私密日记；
   - `Letter` 表：物理删除该用户所有收到与寄出的慢递信件；
   - `Favorite` 表：清空所有收藏记录，并原子递减对应公域树洞的被收藏计数；
   - `MediaAsset` 表：清除所有私有媒体记录，并对本地物理磁盘文件执行 `fs.unlinkSync` 擦除；
   - 贴纸收藏与 AI 陪伴偏好：调用 `clearUserFavorites` 与 `clearUserPersona`，彻底移除持久化数据。

---

## 三、 联系方式与 PII 注入综合防御体系

在匿名心理互助中，交换微信、电话号码极易引发杀猪盘诈骗或现实跟踪。系统建立了四道纵深防御网：

```
客户端输入草稿
      │
      ▼
【第一道：前端规则提示】────────► 明确告知“不交换联系方式，不透露真实身份”
      │
      ▼
【第二道：服务端正向脱敏】──────► assertPeerDraftSafe 正则拦截手机号、微信号、QQ号变体
      │
      ▼
【第三道：贴纸与媒体严格白名单】──► 仅限库内受控贴纸，拒绝任意内联 SVG，防止文本隐写
      │
      ▼
【第四道：Prompt Injection 过滤】─► 剥离伪造的【系统最高安全规则】指令标记，防止诱导 AI
```

---

## 四、 客观合规免责与边界声明

1. **非端到端加密（E2EE）说明**：
   - 树洞通信不宣传为 Signal 级的无条件端到端不可视加密。因承担法定的危机干预（自残自杀预警）与反骚扰举报证据留存义务，服务端在严格 RBAC 和审计管控下保存只读密文索引。
2. **非专业医疗诊断说明**：
   - 树洞陪伴助手（AI Persona）已在系统最高安全规则（`systemSafetyPolicy`）中明文确立：助手不是医生，不做心理疾病诊断，不做绝对承诺，紧急危机优先引导 120/12356 专线。
