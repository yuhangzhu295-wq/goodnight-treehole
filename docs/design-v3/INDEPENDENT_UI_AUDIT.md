# 晚安树洞 39 页独立复审综合报告与最终设计裁决（PHASE 1 Final Gate）

- **审查阶段**：PHASE 1 第三次审查（Final-Gate 最终设计裁决）
- **裁决日期**：2026-10-29
- **基准代码库**：`C:\Users\zyu33\Projects\goodnight-treehole`（分支 `feat/v3-social-ai-persona` / `codex/ui-v2-native-redesign`）
- **输入证据链**：
  1. 原 V2 设计交付包（`01_TonightHome.png` 至 `39_HelpFaqs.png` 及 39 份逐页提示词）
  2. 外部审计报告《`晚安树洞_49界面_社媒风格冲突与逐页视觉审计.md`》（2026-10-28）
  3. 39 页真实 Vue 视图源码（`apps/mp/src/views/*.vue`）、后端控制器与服务（`apps/api/src/*`）及 `artifacts/ui-v2/r2/` 最新重拍真机/模拟器实测截图
  4. 第一轮架构初审（`architecture-reviewer`）与第二轮反证质询（`reviewer-glm`）双盲核查记录

---

## 一、全局证据溯源与外部审计偏差定性

### 1.1 为什么外部审计对 Round 4 页面做出了“旧版吉祥物刷屏 / 404 空态”的指认？
经核查打包脚本 `scripts/package_screenshots_zip.py`（第 111 行 `src_sc = t.get('screenshot')`）与队列文件 `docs/design-v2/UI_V2_MASTER_QUEUE.json`：
- 在 `UI_V2_MASTER_QUEUE.json` 中，编号 `UI-V2-22`（Square）、`UI-V2-23`（MoodCreate）、`UI-V2-24`（PostDetail）、`UI-V2-25`（LetterToday）、`UI-V2-26`（ToolIndex）、`UI-V2-31`（DiaryDetail）、`UI-V2-32`（ReportMonth）、`UI-V2-34`（LetterDetail）等任务的顶层 `screenshot` 字段仍保留着早期采集路径 `artifacts/ui-v2/android/R4_*_capture.png`（含整改前的 V1 截图或未注入 fixture 的 404 空态图），而真实完成 V2 重构并通过控件验证的最新截图记录在嵌套字段 `evidence.screenshot`（即 `artifacts/ui-v2/r2/square-v8.png`、`mood-v8.png`、`post-v8.png`、`letter-v8.png`、`tool-v8.png`、`diary-detail-v4.png`、`report-month-v5.png`、`letter-detail-v4.png`）中。
- 打包脚本直接读取顶层 `t.get('screenshot')` 导出 ZIP，导致外部审计基于已淘汰的旧截图对 22、23、24、25、26、31、32、34 页提出了 A 级指摘。
- 同时，`scripts/package_screenshots_zip.py` 第 51 行将 `UI-V2-18`（`StableSelf.vue`，“清醒时候的我”提醒卡）的说明文字误写为“4-4-6-2呼吸法动态指导与着陆练习”（实际位于 `JourneyDetail` 的子组件 `StabilizeScreen.vue`），导致外部审计在第 18 页提出“呼吸法标签不要宣称临床标准”，而代码库全文从未出现过“临床标准”字样。

### 1.2 产品定位红线：心理安全庇护所 vs 通用高刺激社交媒体
外部审计引用了 Soul 官网广场等通用社媒参考，提出“匿名身份反复，社交识别度偏弱”等建议。作为最终质量门（Final Gate），本报告确立以下不可逾越的架构红线：
1. **严禁社媒化与人设化**：《晚安树洞》的核心定位是**低唤醒、去成瘾、匿名保护的夜间心理安全庇护所**，绝不是微博、小红书或 Soul 广场。严禁引入固定用户头像、大号昵称、粉丝/关注关系链、公开点赞排行榜、瀑布流高饱和视觉刺激或无限下拉推荐流。
2. **匿名不可追踪性**：公共树洞（`Square` / `PostDetail`）与同行网络（`PeerNetwork`）不向客户端下发作者身份标识（`authorCode` / `userId`），单条动态统一以“匿名树洞”或情绪标签呈现，防止跨帖拼图人肉与熟人社交压力。
3. **去绩优主义与真实数据承诺**：严禁虚构情绪折线图、“治愈指数”或连续打卡断签惩罚；所有数字统计、回信来源与同行匹配必须 100% 映射 PostgreSQL 真实持久化记录。

---

## 二、四大实质业务/工程缺陷（S1–S4）与五项运行时待验项（E1–E5）裁决

在剥离外部审计的过时截图误报与社媒化错误建议后，综合初审与反证对源码的逐行核查，确认以下 **4 项实质业务/代码缺陷（S1–S4）** 必须进入整改范围，以及 **5 项运行时证据采样项（E1–E5）** 需通过真机/API/DB 实测闭环：

### 2.1 实质业务与代码缺陷（批准进入 `MINOR_REFINE` 开发）

| 缺陷编号 | 涉及页面与代码位置 | 缺陷定性与根因分析 | 强制整改要求 |
|---|---|---|---|
| **S1** | `24_PostDetail`<br>`apps/mp/src/views/PostDetail.vue:272` | **前 5 条回应死截断无分页/无展开**：模板硬编码 `v-for="(reply, index) in replies.slice(0, 5)"`。当 `post.replyCount > 5` 时，第 6 条及之后的已审核回应被静默丢弃，页面既无“展开剩余回应”按钮也无分页加载；此外回应抽屉中 `replyVisibility` 保留了选中即禁用提交的 `PRIVATE` 选项。 | 移除死截断 `slice(0, 5)`，改为默认展示前 5 条并在 `replies.length > 5` 时渲染“展开全部 N 条回应 / 查看更多”交互（或分页加载）；简化可见范围说明为静态明确提示。 |
| **S2** | `25_LetterToday`<br>`apps/mp/src/views/LetterToday.vue:180-187, 241-248`<br>（关联 `34_LetterDetail:166-181`） | **“收藏”与“存日记”领域语义混淆 + 伪导航箭头**：按钮 `btn-letter-save` UI 显示 `收藏 / 已收藏`（配心形图标 `♡` 与右侧跳转箭头 `›`），但 `@click="saveToDiary"` 实际调用 `POST /api/v1/letters/:id/save-to-diary` 并提示“已保存到日记”，将 `Favorite`（收藏夹）与 `Diary`（私密日记）混为一谈；同时原地状态切换按钮误带跳转箭头 `›`（`LetterDetail.vue` 的收藏/喜欢行同样多出 `›`）。 | 对齐按钮文案与实际领域动作（明确为“存入日记 / 已存入日记”或提供真实收藏接口），并移除 `LetterToday.vue` 与 `LetterDetail.vue` 中所有非页面跳转行右侧的 `›` 箭头。 |
| **S3** | `21_Archive`<br>`apps/mp/src/views/Archive.vue:137` | **个人档案“公开树洞”Tab 混入全站公共流**：`Archive.vue` 在 `load()` 中直接请求 `api.get('/api/v1/posts')`，未按当前用户身份过滤，导致全站其他匿名用户的公开树洞全部混入当前用户的个人“内容档案”页。 | 个人档案页“公开树洞”Tab 必须仅查询并返回当前用户本人创建的公开树洞（如 `/api/v1/posts?mine=1` 或专用个人归档过滤），严禁混入他人帖子；同步理顺归档页顶栏标题。 |
| **S4** | `03_ActionCenter:98-113`<br>`05_JourneyDetail:64-79`<br>`10_PeerConversation:85`<br>`25_LetterToday:116-127`<br>`32_ReportMonth:26-34` | **异步 AI 轮询与定时器在组件卸载时未解绑**：上述 5 个页面的 `waitForAiJob` / `waitForJob` / `waitForAnalysis` 循环使用 `window.setTimeout` 轮询长达 15–120 秒，但未像 `ToolRun.vue` / `ToolDecompose.vue` 那样注册 `onBeforeUnmount` 中止守卫，导致用户离开页面后后台仍在持续发起请求并篡改已卸载组件的状态。 | 为上述 5 个视图统一补充 `onBeforeUnmount` 卸载标志（或递增 `runSeq` + `clearTimeout`），在组件卸载时立即中断轮询循环并阻止后续状态写入。 |

### 2.2 运行时证据待验项（`NEEDS_RUNTIME_EVIDENCE` / 专项回归）

| 证据编号 | 关联页面 | 待核验问题 | 采样与判定标准 |
|---|---|---|---|
| **E1** | `10_PeerConversation` | 长会话滚动、软键盘弹起避让、72 小时到期关闭与断网重连恢复。 | 在模拟器/真机注入 >20 条长短消息与软键盘聚焦，验证底部输入框固定、消息自动滚底、到期后只读并引导进入 `PeerGraduation`。 |
| **E2** | `13_SafetySupport` | 离线/后端异常下的危机支持可达性与区域拨号触发。 | 验证在 API 断连时首屏红色危机块、三步自救与 `tel:120` / `tel:12356` 展开动作 100% 正常工作，不因接口报错阻塞渲染。 |
| **E3** | `14_NotificationCenter` | 列表中同类通知重复显示的数据源定性。 | 核查 PostgreSQL `Notification` 表生成路径：确认重复行系测试夹具多次 seed 所致，还是业务事件触发缺少幂等去重键。 |
| **E4** | `31_DiaryDetail` | 私密心情投影日记（`backedByMood`）与独立日记的删除契约一致性。 | 验证 `DELETE /api/v1/diaries/:id` 与私密 `Mood` 记录的级联/隐藏关系，确保删除动作不会在下一次列表读取时“死而复生”。 |
| **E5** | `36_PrivacySettings` | 14 项隐私开关在全站读写与 AI 任务路由上的服务端负向拦截闭环。 | 针对全部受控路由执行关闭对应隐私开关后的请求测试，验证服务端返回 `403` 且不走过期的进程内缓存。 |

---

## 三、C 端 39 页逐页三轮审查与最终裁决详表

> **裁决枚举定义**：
> - `KEEP`：现状符合业务定位与 V2 设计规范，维持现状，禁止非必要重构。
> - `MINOR_REFINE`：主体结构合理，仅需局部微调（修复 S1–S4、去伪箭头、文案对齐等），已批准进入开发。
> - `REDESIGN_REQUIRED`：结构或信息层级存在重大缺陷，必须重新设计并经架构批准（本轮复核后为 0 项）。
> - `NEEDS_RUNTIME_EVIDENCE`：UI 结构已合格，需要运行时真机/API/DB 测试采样后定夺（不触发盲目 UI 改动）。
> - `REJECT_AUDIT_FINDING`：外部审计提出的整改项违背匿名庇护所业务契约，或基于打包脚本错配的过时截图，正式予以驳回。

### 01. `TonightHome`（今晚主页 | `/pages/tonight/index`）
- **外部审计意见**：B 级。输入框与近日记录已转紧凑，留白合理；建议优化主 CTA 与最近记录，对空/已填/键盘展开状态分开验收。
- **第一轮初审（architecture-reviewer）**：`TonightHome.vue` 已完成 V2 紧凑化改造，支持 `localStorage` 草稿持久化、Capacitor 键盘高度监听与 `onUnmounted` 清理、分类与关系场景抽屉、当前旅程与待办概览。
- **第二轮反证（reviewer-glm）**：实测截图 `R1_TonightHome_after_RECAPTURED.png` 与 `01_TonightHome.png` 高度一致，且已在 360/390/430 三档视口与大字体下通过溢出检测，控件套件 `tonight-home 2/2` PASS，无重构必要。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：页面视觉层级、留白与交互闭环均已对齐 V2 规范并通过多视口与真机模拟器验证，维持现状。

### 02. `PeerNetwork`（同路网络 | `/pages/peers/index`）
- **外部审计意见**：B 级。列表结构接近 V2，但认为“同类型经历密集，匿名身份反复，社交识别度偏弱”，建议参考 Soul 广场强化社交识别。
- **第一轮初审（architecture-reviewer）**：外部审计要求提高“社交识别度”直接冲突于本产品匿名防追踪设计；代码已实现按经历 `title` 去重并展示“另有 N 位同行者留下过相同的经历”，请求 Tab 已携带 `scope=sent`。
- **第二轮反证（reviewer-glm）**：`R2_PeerNetwork_after.png` 与 `peer-network 3/3` 已验证通过；若按审计建议增加个性化头像或固定人设标签，将诱导熟人认出或社交攀比，必须驳回。
- **最终裁决**：`REJECT_AUDIT_FINDING`（`approvedForDev: false`）
- **裁决理由**：正式驳回“强化社交识别度/对标社媒广场”的建议。同路网络的核心是“经历共鸣而非看人社交”，现有按标题合并去重与低调推荐理由已解决内容重复问题。

### 03. `ActionCenter`（行动中心 | `/pages/action/index`）
- **外部审计意见**：B 级。今日任务及完成/调整明确，下方支持入口分组接近设计；建议核验空任务与有任务及完成反馈。
- **第一轮初审（architecture-reviewer）**：页面结构完全符合 `03_ActionCenter.png`（含今日最小一步、“换更小一步”模式与支持入口），但发现 **S4 缺陷**：`ActionCenter.vue:98-113` 的 `waitForJob` 在 30 次循环中调用 `setTimeout` 轮询 AI 任务，缺少 `onBeforeUnmount` 卸载中止机制。
- **第二轮反证（reviewer-glm）**：UI 无需重排，但 S4 组件卸载后继续轮询属实，应批准最小范围代码修复。
- **最终裁决**：`MINOR_REFINE`（`approvedForDev: true`）
- **裁决理由**：主体 UI 结构保持不变；批准修复 **S4**，在 `ActionCenter.vue` 中增加 `onBeforeUnmount` 卸载清理与轮询中止守卫。

### 04. `Me`（我的主页 | `/pages/me/index`）
- **外部审计意见**：B 级。匿名资料与记录功能分组清楚，建议优化长列表密度、次级工具折叠。
- **第一轮初审（architecture-reviewer）**：`Me.vue` 已将“AI 记得什么 / 写给未来的我 / 决定保险箱”折叠进“更多自我支持”底部抽屉（`moreSupportSheetOpen`），首屏仅展示核心记录与高频自我支持。
- **第二轮反证（reviewer-glm）**：`R1_Me_after_RECAPTURED.png` 与 `04_Me.png` 完全一致，外部审计建议的折叠机制已在代码中实现，控件测试 `me 2/2` PASS。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：长列表分级与次级入口折叠早已落地并通过验收，维持现状。

### 05. `JourneyDetail`（旅程详情 | `/pages/journey/detail`）
- **外部审计意见**：B 级。时间线与阶段已展现，建议减少解释型文案，确保阶段核心 CTA 与时间线一致。
- **第一轮初审（architecture-reviewer）**：`JourneyDetail.vue` 的状态卡、温度变化、空心圆环垂直时间线与 `05_JourneyDetail.png` 完全对齐（见 `journey-detail-v2.png`）。但发现 **S4 缺陷**：`JourneyDetail.vue:64-79` 的 `waitForAnalysis` 轮询 36 次且在 `finally` 中调用 `await load()`，缺少组件卸载中止守卫。
- **第二轮反证（reviewer-glm）**：确认视觉与五阶段状态机合理，仅需修复 `waitForAnalysis` 卸载后继续执行的问题（S4）。
- **最终裁决**：`MINOR_REFINE`（`approvedForDev: true`）
- **裁决理由**：视觉结构维持现状；批准修复 **S4**，为 `waitForAnalysis` 增加 `onBeforeUnmount` 中止守卫，防止组件卸载后继续轮询及触发 `load()`。

### 06. `PeerExperienceDetail`（匿名经历详情 | `/pages/peer/detail`）
- **外部审计意见**：B 级。作者-经历-后来-申请入口齐全，认为视觉偏轻表单而非故事阅读。
- **第一轮初审（architecture-reviewer）**：核查 `PeerExperienceDetail.vue` 与 `peer-detail-check2.png`，页面已是“经历全文 / 后来是这样走过来的 / 申请交流”三段式连续阅读流，并已将提交申请错误 `requestError` 与页面加载错误隔离。
- **第二轮反证（reviewer-glm）**：审计所称“轻表单感”系旧版卡片边框印象，现行细线分段阅读体验自然，控件套件 `peer-detail 4/4` PASS。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：已是符合 V2 设计的三段式故事阅读布局，维持现状。

### 07. `PeerRequests`（同路请求 | `/pages/peer/requests`）
- **外部审计意见**：B 级。请求列表与分组已改善，建议验证等待/交流/结束可找性，状态与方向维度不互相覆盖。
- **第一轮初审（architecture-reviewer）**：`PeerRequests.vue` 已采用“待回应 / 已接受 / 已结束”三态生命周期 Tab，动态计算每个 Tab 下的真实状态标签并具备操作防重入守卫。
- **第二轮反证（reviewer-glm）**：`R2_PeerRequests_after.png` 与 `peer-requests 5/5`（含点击同意跳转知情同意页真实效果验证）均已通过。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：三态生命周期 Tab 与状态标识清晰准确，维持现状。

### 08. `PeerMatchWaiting`（等待回应 | `/pages/peer/wait`）
- **外部审计意见**：B 级。等待态显示清晰且退回入口直接，与设计基本一致；要求以待同意真实数据验证。
- **第一轮初审（architecture-reviewer）**：`PeerMatchWaiting.vue` 已按 `08_PeerMatchWaiting.png` 实现静态点环、请求对象与状态卡，无虚假倒计时，且 7 秒轮询已在 `onBeforeUnmount` 严格清理（`isUnmounted = true; clearTimeout(timer)`）。
- **第二轮反证（reviewer-glm）**：`peer-wait-v2.png` 即为真实 `seed-peer-incoming-request.mjs` 下的待回应状态截图，控件套件 `peer-wait 4/4` PASS。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：真实待回应数据截图、交互与定时器清理均已完备，维持现状。

### 09. `PeerConsent`（同行知情同意 | `/pages/peer/consent`）
- **外部审计意见**：B 级。授权条款齐全，建议压缩重复安全条款，突出真正同意边界、拒绝与返回。
- **第一轮初审（architecture-reviewer）**：`PeerConsent.vue` 已去除冗余外框与头像装饰，清晰列出四项同行边界，修复了预勾选复选框缺陷（UI2-013），双方独立签署后才创建会话。
- **第二轮反证（reviewer-glm）**：`peer-consent-r2.png` 与 `peer-consent 3/3` 已验证通过，安全边界说明紧凑且必要。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：知情同意边界呈现清晰、无冗余嵌套，维持现状。

### 10. `PeerConversation`（私密聊天 | `/pages/peer/conversation`）
- **外部审计意见**：B 级。气泡与双方方向明显，底部输入可见；要求验证长会话/软键盘/过期/离线。
- **第一轮初审（architecture-reviewer）**：主会话轮询 `pollTimer` 已在 `onBeforeUnmount` 清理，但 `PeerConversation.vue` 内 `requestAiAssist` 的 `wait(400)` 轮询未检查卸载标志（**S4**）；长会话、软键盘与会话到期状态归入运行时采样验证（**E1**）。
- **第二轮反证（reviewer-glm）**：同意 UI 布局无需改动，批准修复 `requestAiAssist` 卸载中止守卫（S4）并执行 E1 运行时核验。
- **最终裁决**：`MINOR_REFINE`（`approvedForDev: true`）
- **裁决理由**：修复 **S4**（为 `PeerConversation.vue` 中 AI 辅助轮询补充 `onBeforeUnmount` 中止守卫），并结合 **E1** 核验长会话/软键盘/到期状态。

### 11. `PeerGraduation`（结伴结束 | `/pages/peer/graduate`）
- **外部审计意见**：B 级。结束状态明确，与 V2 相近；建议明确“返回”“保存记录”主次。
- **第一轮初审（architecture-reviewer）**：`PeerGraduation.vue` 已按 `11_PeerGraduation.png` 重写，去除了彩纸勋章，提供折叠式“留给自己的记录”与“返回旅程时间线”主次按钮。
- **第二轮反证（reviewer-glm）**：`peer-graduate-v2.png` 与控件套件 `4/4` 已验证通过，维持现状。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：主次操作清晰、无社交游戏化噪音，维持现状。

### 12. `RealityHandoff`（现实求助 | `/pages/reality-handoff/index`）
- **外部审计意见**：B 级。联系人和拟稿流程可理解；建议按“找人→拟稿→用户自行发送”分段，减少多层辅助说明。
- **第一轮初审（architecture-reviewer）**：`RealityHandoff.vue` 已按选择信任联系人、3 个口语化快捷模板拟稿、保存并复制到剪贴板由用户自主发送三步组织，严格遵守“系统绝不替用户外发消息”的边界。
- **第二轮反证（reviewer-glm）**：`reality-handoff-v2.png` 与 `reality-handoff 6/6` 已验证通过，维持现状。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：分段清晰且严守现实交接伦理边界，维持现状。

### 13. `SafetySupport`（安全支持 | `/pages/safety/index`）
- **外部审计意见**：B 级。红色危机行动与普通建议区分明确；要求核验中国区域适用与拨号、离线可达，禁止将 12356 普适为全球。
- **第一轮初审（architecture-reviewer）**：`SafetySupport.vue:87-104` 已实现区域中立首屏（默认显示“查看紧急求助方式”与“紧急电话按国家/地区不同”提示，点击后展开“如果你在中国大陆：紧急医疗求助 120 / 心理援助热线 12356”），完全符合不将 12356 普适为全球的要求；离线可达性列为运行时核验项（**E2**）。
- **第二轮反证（reviewer-glm）**：`safety-r2.png` 与 `safety-support 4/4` 已验证通过，代码已妥善处理地区适用性说明，无需修改前端代码。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：区域适用说明与危机优先布局已在代码中完整实现，维持现状（配合 E2 离线可达性回归确认）。

### 14. `NotificationCenter`（通知中心 | `/pages/notifications/index`）
- **外部审计意见**：B 级。信息列表标准化；当前同类通知多条重复视觉，建议按时间分组、已读未读与原因区别，核验是否真实重复通知。
- **第一轮初审（architecture-reviewer）**：`NotificationCenter.vue` 已具备“全部/未读”Tab、“今天/昨天/更早”时间分组、未读圆点与类型副标题（`notifications-v2.png`）。截图中多条同类通知需通过运行时与数据库查询区分是 seed 脚本重复插入还是业务触发器重复写库（**E3**）。
- **第二轮反证（reviewer-glm）**：前端视图与 `14_NotificationCenter.png` 完全一致（控件套件 `4/4` PASS），不应改动 UI，应标记为 `NEEDS_RUNTIME_EVIDENCE` 排查 E3。
- **最终裁决**：`NEEDS_RUNTIME_EVIDENCE`（`approvedForDev: false`）
- **裁决理由**：UI 时间分组与已读/未读区分已达标；需通过 **E3** 运行时数据库采样核验同类通知是否由业务触发器重复生成。

### 15. `FutureSelf`（未来信 | `/pages/future-self/index`）
- **外部审计意见**：B 级。写作输入/时间选择/历史信管理具备；建议弱化次要选项，主写作与发送时间更明确，送达状态精确。
- **第一轮初审（architecture-reviewer）**：`FutureSelf.vue` 已按 `15_FutureSelf.png` 改为写作输入置顶、时间胶囊选择、到期提醒授权与底部历史信件状态列表（已送达信件展示正文），并移出 `tabbarPaths` 消除了底部遮挡。
- **第二轮反证（reviewer-glm）**：`future-self-v2.png`、`future-self-scrolled-v2.png` 与控件套件 `7/7`、权限测试 `batch3-future-self-authority.spec.ts` 均已通过。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：输入优先层级与送达状态闭环已验证完备，维持现状。

### 16. `Recovery`（生活恢复 | `/pages/recovery/index`）
- **外部审计意见**：B 级。控件/打卡已标准化，建议将高频状态与恢复建议拆层，空数据与权限关闭需分别测。
- **第一轮初审（architecture-reviewer）**：`Recovery.vue` 采用单话题切换记录、无打分七日实况格、近两次真实变化对比及 `allowRecoveryData` 隐私门禁态，已对齐 `16_Recovery.png`。
- **第二轮反证（reviewer-glm）**：`recovery-v2.png`、`recovery-scrolled-v2.png` 与控件套件 `2/2`、持久化突变测试（M13–M18）均已通过。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：布局清爽且严格遵循非量化评判原则，维持现状。

### 17. `SupportPlan`（低谷预案 | `/pages/support-plan/index`）
- **外部审计意见**：B 级。分节结构正确，建议增强可编辑状态、已保存状态和真正可执行的现实联系项。
- **第一轮初审（architecture-reviewer）**：`SupportPlan.vue` 已具备分节内联编辑、有序徽章列表、折叠附加项与保存状态反馈（`support-plan-v2.png`），并与 `SafetySupport.vue` 实时联动。
- **第二轮反证（reviewer-glm）**：控件套件 `support-plan 3/3` 已验证编辑与保存闭环，维持现状。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：可编辑态、保存反馈与安全页联动均已闭环，维持现状。

### 18. `StableSelf`（稳定自我 | `/pages/stable-self/index`）
- **外部审计意见**：B 级。建议“呼吸法标签不要宣称「临床标准」；测动画节奏、可暂停与降敏”。
- **第一轮初审（architecture-reviewer）**：外部审计被 `package_screenshots_zip.py` 的错误描述误导——`StableSelf.vue` 是“清醒时候的我”稳定状态参考卡（两段式表单），并非呼吸练习；而呼吸练习组件 `StabilizeScreen.vue` 也仅展示“1 吸气 4秒 / 2 停留 4秒 / 3 呼气 6秒 / 4 停留 2秒”，全仓从未出现“临床标准”字样。
- **第二轮反证（reviewer-glm）**：核查 `StableSelf.vue`（`stable-self-v5.png`，`verify-stable-self.mjs` 6/6）与 `StabilizeScreen.vue`，确认无任何医疗夸大用语，且呼吸定时器已在 `onBeforeUnmount` 清理。
- **最终裁决**：`REJECT_AUDIT_FINDING`（`approvedForDev: false`）
- **裁决理由**：正式驳回该项审计发现。`StableSelf.vue` 为稳定状态提醒卡，且全库呼吸练习组件均未宣称“临床标准”。

### 19. `MemoryCenter`（记忆管理 | `/pages/memory/index`）
- **外部审计意见**：B 级。开关与记录分组清晰，与 V2 一致；建议查撤销/删除/重授权的因果反馈。
- **第一轮初审（architecture-reviewer）**：`MemoryCenter.vue` 已实现 AI 记忆总开关、有效/已停用/已过期/已删除四态流转、单条停用与过期重授权（`POST /api/v1/me/memories/:id/reactivate`）及平实说明弹窗。
- **第二轮反证（reviewer-glm）**：`memory-center-v2.png` 与 `memory-center 6/6` 控件实测、状态机测试（9 用例）全部通过。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：记忆状态机、重授权反馈与自然语言化说明均已对齐 V2 规范，维持现状。

### 20. `DecisionVault`（决定保险箱 | `/pages/decision/index`）
- **外部审计意见**：B 级。实际功能多于参考，出现任务/冷静时长/历史结构，可接受扩展，需保证创建和列表都有场景截图。
- **第一轮初审（architecture-reviewer）**：`DecisionVault.vue` 已完成列表前置、单按钮控制“新增决定”折叠面板、冷静期倒计时（含 `onBeforeUnmount` 清理 `timer`）及错误态与空态分离（`decision-vault-v8.png`）。
- **第二轮反证（reviewer-glm）**：`verify-decision-vault.mjs` 7/7 与 `batch3-decision-cooldown.spec.ts` 已验证创建、冷静期锁定与自主决定闭环。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：业务扩展合理、主次清晰且定时器已正确解绑，维持现状。

### 21. `Archive`（旅程归档 / 内容档案 | `/pages/archive/index`）
- **外部审计意见**：B 级。按时间/类别筛选的归档列表，要求保持归档入口和历史来源一致，区分真正归档与普通记录。
- **第一轮初审（architecture-reviewer）**：发现严重业务数据越界缺陷 **S3（`Archive` 公开树洞混入全站流）**：`Archive.vue:137` 在加载用户个人档案的“公开树洞”Tab 时，直接调用 `api.get('/api/v1/posts')`，把全站所有用户的公开树洞当成当前用户的个人档案展示！同时顶栏标题在切换 Tab 时需保持个人档案语义一致。
- **第二轮反证（reviewer-glm）**：确认 S3 为必须修复的 P1 实质业务缺陷——个人档案中的“公开树洞”必须只包含当前用户自己发表的公开树洞。
- **最终裁决**：`MINOR_REFINE`（`approvedForDev: true`）
- **裁决理由**：必须修复 **S3**：将 `Archive.vue` 中“公开树洞”Tab 的数据源限定为当前用户本人发布的树洞（服务端或查询参数按当前身份过滤），严禁混入全站公共流；同步校准顶栏标题文案。

### 22. `Square`（树洞广场 | `/pages/square/index`）
- **外部审计意见**：A 级。批评“巨大深绿品牌标题与萌系吉祥物占首屏；每条帖子复用大幅同一插画，内容辨识弱；与 V2 中性信息流差异最大”。
- **第一轮初审（architecture-reviewer）**：核查 `Square.vue` 源码与最新实测图 `artifacts/ui-v2/r2/square-v8.png`：外部审计看到的是打包脚本引用的旧图 `R4_Square_capture.png`。现行代码早已删除深绿 Hero、实时时钟与每帖吉祥物插画，改为白底细线列表、`最新/热门` 真实服务端排序、情绪筛选胶囊与克制操作栏（墨量从 21.1% 降至 12.0%）。
- **第二轮反证（reviewer-glm）**：确认 `Square.vue` 已完全符合 `22_Square.png`，且 `verify-square-sort.mjs` 5/5 与 `square-effects 2/2` 已验证通过；坚决拒绝将广场改成大头像、强社媒刺激形态。
- **最终裁决**：`REJECT_AUDIT_FINDING`（`approvedForDev: false`）
- **裁决理由**：外部审计所指 V1 巨幅深绿标题与每帖重复吉祥物在现行 `Square.vue` 与 `square-v8.png` 中早已彻底移除，系打包脚本引用旧图所致；正式驳回重做要求及任何社媒化改造建议。

### 23. `MoodCreate`（发布心情 | `/pages/mood/create`）
- **外部审计意见**：A 级。批评“巨大标题、主装饰立绘、每个心情单独吉祥物和多重卡片，让写作变成漫长问卷；CTA 首屏不明显”。
- **第一轮初审（architecture-reviewer）**：核查 `MoodCreate.vue` 与 `artifacts/ui-v2/r2/mood-v8.png`：外部审计基于旧图 `R4_MoodCreate_capture.png`。现行代码已移除所有吉祥物立绘与卡片堆叠，首屏直接呈现文本编辑框、轻量情绪胶囊、可见范围（默认读取隐私设置并安全回退 `PRIVATE`）及底部主 CTA，且具备防双击重入守卫。
- **第二轮反证（reviewer-glm）**：`mood-v8.png`、输入矩阵 `7/7` 与 `mood-create 5/5 + effects 1/1` 已验证完备，审计指摘已过时。
- **最终裁决**：`REJECT_AUDIT_FINDING`（`approvedForDev: false`）
- **裁决理由**：现行 `MoodCreate.vue` 与 `mood-v8.png` 早已移除装饰立绘与多重卡片，首屏写作与提交 CTA 清晰直达，驳回基于过时截图的 A 级整改要求。

### 24. `PostDetail`（树洞动态详情 | `/pages/post/detail`）
- **外部审计意见**：A 级。指出截图显示“没有找到这条树洞”，无法验收正常内容详情与回复流。
- **第一轮初审（architecture-reviewer）**：正常内容态已在 `artifacts/ui-v2/r2/post-v8.png` 采集验证，但源码审查发现实质功能缺陷 **S1（`PostDetail` 前 5 条无分页/无展开）**：`PostDetail.vue:272` 硬编码 `v-for="(reply, index) in replies.slice(0, 5)"`，导致超过 5 条的已审核回应被静默截断，用户无法查看第 6 条及之后的回应；同时回应抽屉中 `replyVisibility` 的“仅作者可见（暂不支持）”下拉交互可进一步收敛为清晰说明。
- **第二轮反证（reviewer-glm）**：确认 S1 属实，标题显示总回应数而列表死截断前 5 条属于功能闭环缺失，必须修复。
- **最终裁决**：`MINOR_REFINE`（`approvedForDev: true`）
- **裁决理由**：批准修复 **S1**：移除 `replies.slice(0, 5)` 的无条件死截断，支持展开查看全部回应或分页浏览，并优化回应抽屉的可见范围提示。

### 25. `LetterToday`（今日回信 | `/pages/letter/index`）
- **外部审计意见**：A 级。批评“信封插画+巨大信纸标题+多组胶囊；行动选项文字被省略号截断”。
- **第一轮初审（architecture-reviewer）**：信封插画与胶囊截断已在 `letter-v8.png` 中消除（语气切换与分享图已收入右上角 `⋯` 菜单，小建议重复文本已去重），但源码存在两项实质缺陷：
  1. **S2（收藏存日记语义混淆 + 伪导航箭头）**：`LetterToday.vue:241-248` 的 `btn-letter-save` 按钮文案写着 `收藏 / 已收藏` 并带有右侧跳转箭头 `›`，实际调用的却是 `saveToDiary()`（`POST /api/v1/letters/:id/save-to-diary`），导致“收藏”与“存入日记”概念混同，且非跳转按钮误带 `›` 箭头；
  2. **S4（定时器卸载未清理）**：`LetterToday.vue:116-127` 的 `waitForAiJob` 轮询循环缺少 `onBeforeUnmount` 中止守卫。
- **第二轮反证（reviewer-glm）**：确认 S2 与 S4 均属实，应在保持现有信纸阅读版式的基础上做局部修正。
- **最终裁决**：`MINOR_REFINE`（`approvedForDev: true`）
- **裁决理由**：批准修复 **S2** 与 **S4**：理顺“存入日记/收藏”文案与接口语义一致性、移除非跳转行的 `›` 箭头，并为 `waitForAiJob` 增加 `onBeforeUnmount` 卸载中止守卫。

### 26. `ToolIndex`（情绪工具箱 | `/pages/tool/index`）
- **外部审计意见**：A 级。批评“吉祥物主卡+多种彩色图标插画九宫格，与 V2 纯功能列表及其他工具页完全不同”。
- **第一轮初审（architecture-reviewer）**：核查 `ToolIndex.vue` 与 `artifacts/ui-v2/r2/tool-v8.png`：外部审计看到的是旧图 `R4_ToolIndex_capture.png`。现行代码已完全重构为“整理事情 / 短暂停顿 / 留一份记录”三组白底细线功能列表，无任何吉祥物或九宫格插画。
- **第二轮反证（reviewer-glm）**：`tool-v8.png` 与 `tool-index 9/9` 控件导航验证全部通过，完全匹配 `26_ToolIndex.png`。
- **最终裁决**：`REJECT_AUDIT_FINDING`（`approvedForDev: false`）
- **裁决理由**：现行 `ToolIndex.vue` 与 `tool-v8.png` 已是三组细线功能列表，无吉祥物或九宫格，正式驳回基于旧截图的整改要求。

### 27. `ToolDecompose`（拆解工具 | `/pages/tool/decompose`）
- **外部审计意见**：B 级。输入—拆解—结果层级基本合理，建议补运行中/错误/完整长结果，去多重解释卡。
- **第一轮初审（architecture-reviewer）**：`ToolDecompose.vue` 已按 `27_ToolDecompose.png` 重构，支持最小行动卡、完整步骤清单、危机风险升级提示，且 `onBeforeUnmount` 已通过 `runSeq.value += 1` 清理在途轮询。
- **第二轮反证（reviewer-glm）**：`tool-decompose-minimal.png`、`tool-decompose-list.png`、`tool-decompose-safety.png` 三态截图及 `10/10` 控件测试均已通过。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：多状态渲染、防竞态与卸载清理均已完备，维持现状。

### 28. `ToolRun`（即时整理工具 | `/pages/tool/run`）
- **外部审计意见**：B 级。建议结果优先，错误与 fallback 明确，保存动作只能对当前结果启用。
- **第一轮初审（architecture-reviewer）**：`ToolRun.vue` 已按 `28_ToolRun.png` 重写（`tool-run-v2.png`），具备 `inputSnapshot` 校验、仅对当次运行结果允许保存到日记、`runSeq` 与 `onBeforeUnmount` 卸载清理、便签微调编辑及风险升级跳转。
- **第二轮反证（reviewer-glm）**：`tool-run 7/7` 控件实测与代码审查已通过，维持现状。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：已严格实现结果优先、诚实降级与当前结果保存门禁，维持现状。

### 29. `MeProfile`（个人资料 | `/pages/me/profile`）
- **外部审计意见**：B 级。资料列表标准，已有匿名 ID 展示；建议敏感凭据脱敏，保存禁用原因与可编辑性一致。
- **第一轮初审（architecture-reviewer）**：`MeProfile.vue` 已实现昵称编辑（NFC 归一化、不可见字符拦截、未修改时禁用保存）、匿名编号脱敏展示、活跃设备会话列表与非当前会话真实吊销。
- **第二轮反证（reviewer-glm）**：`me-profile-v4.png` 等四态截图与 `8/8` 控件测试、`F01 4/4` 验收全部通过。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：资料持久化、凭据脱敏与会话管理闭环完备，维持现状。

### 30. `DiaryList`（日记列表 | `/pages/diary/index`）
- **外部审计意见**：B 级。时间分组列表接近 V2；建议限制摘要行数，突出日期/标题和私人状态，不强迫做瀑布流。
- **第一轮初审（architecture-reviewer）**：`DiaryList.vue` 已采用按月分组、左日期+右摘要细线行结构（`border-radius: 0`），限制摘要长度，仅在关联有效 `letterId` 时展示回信入口。
- **第二轮反证（reviewer-glm）**：`diary-list-v6.png`、`verify-diary-list.mjs` 6/6 与 `diary-list 9/9` 控件测试均已通过。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：已是符合 V2 的紧凑时间分组列表，维持现状。

### 31. `DiaryDetail`（日记详情 | `/pages/diary/detail`）
- **外部审计意见**：A 级。指出截图为“没有找到这篇日记”空态，无法据此确认真实详情视觉合格。
- **第一轮初审（architecture-reviewer）**：核查 `artifacts/ui-v2/r2/diary-detail-v4.png`：外部审计看到的是无有效 ID 的旧图 `R4_DiaryDetail_capture.png`，而 `r2/diary-detail-v4.png` 已完整展示日期、标题、多段正文、关联回信入口与右上角操作菜单，`verify-diary-detail.mjs` 6/6 通过。针对由私密心情映射生成的日记（`backedByMood`）的删除语义，列为运行时/数据契约核验项（**E4**）。
- **第二轮反证（reviewer-glm）**：确认正文态截图与功能早已验证通过，驳回因旧包路径错配导致的 A 级缺失指摘。
- **最终裁决**：`REJECT_AUDIT_FINDING`（`approvedForDev: false`）
- **裁决理由**：真实详情态截图 `diary-detail-v4.png` 与 `verify-diary-detail.mjs` 6/6 已完备证实正文态符合 V2 设计，驳回旧截图导致的空态指摘（配合 E4 核验心情投影删除契约）。

### 32. `ReportMonth`（月报 | `/pages/report/month`）
- **外部审计意见**：A 级。批评“独立米黄色报告版式、植物纹样、强调绿字与其他白底页冲突；强行拟人化总结字眼”。
- **第一轮初审（architecture-reviewer）**：核查 `ReportMonth.vue` 与 `artifacts/ui-v2/r2/report-month-v5.png`：外部审计查看的是旧版米黄海报图 `R4_ReportMonth_capture.png`。现行 `ReportMonth.vue` 早已重做为纯白底事实清单（记录/行动结果/生活状态三项真实计数、这个月做过的事、你留下的话、按日期查看），彻底删除了米黄色背景、植物花纹、虚构情绪折线与进度条。但代码检查发现 **S4 缺陷**：`ReportMonth.vue:26-34` 的 `waitForAiJob` 轮询长达 120 秒，未注册 `onBeforeUnmount` 卸载中止守卫。
- **第二轮反证（reviewer-glm）**：确认视觉版式早已完成白底中性化重构（`verify-month-report.mjs` 8/8 PASS），无需重做 UI；仅需针对 `waitForAiJob` 补齐 `onBeforeUnmount` 卸载清理守卫（S4）。
- **最终裁决**：`MINOR_REFINE`（`approvedForDev: true`）
- **裁决理由**：旧版米黄海报视觉早已废除，现行白底事实清单版式维持不变；批准修复 **S4**，为 `ReportMonth.vue` 的 `waitForAiJob` 增加 `onBeforeUnmount` 卸载中止守卫。

### 33. `LetterList`（信箱列表 | `/pages/letter/list`）
- **外部审计意见**：B 级。按日期排序接近 V2，建议区分收到/寄出/已送达与未读，保持列表行密度。
- **第一轮初审（architecture-reviewer）**：`LetterList.vue` 已实现全部/未读/已读筛选、`queued/running` 生成中提示、未读绿点、关键词搜索、`loadSeq` 防竞态及 `onUnmounted` 清理 `clockTimer`。
- **第二轮反证（reviewer-glm）**：`letter-list-v1.png`、`letter-list-unread.png` 与 `letter-list 9/9` 控件测试已全部通过。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：未读/已读/生成中状态区分明确且定时器已清理，维持现状。

### 34. `LetterDetail`（信件详情 | `/pages/letter/detail`）
- **外部审计意见**：A 级。指出只显示“没有找到这封回信”，无正文态视觉可证实。
- **第一轮初审（architecture-reviewer）**：正文态已在 `artifacts/ui-v2/r2/letter-detail-v4.png` 完整采样并通过 `verify-letter-detail.mjs` 5/5（无 `id` 参数时自动回退读取今日回信）。但代码审查发现 `LetterDetail.vue:166-181` 中，`btn-letter-detail-fav`（收藏这封信）与 `btn-letter-detail-like`（喜欢这封信）两个原地状态切换按钮右侧均渲染了 `<span class="detail-chev" aria-hidden="true">›</span>` 跳转箭头，与真实页面跳转行混同。
- **第二轮反证（reviewer-glm）**：外部审计的空态指摘系旧图所致，但移除原地操作按钮右侧的伪导航箭头 `›` 属于必要的交互微调。
- **最终裁决**：`MINOR_REFINE`（`approvedForDev: true`）
- **裁决理由**：正文阅读态已验证完备；批准局部微调（去箭头）：移除 `btn-letter-detail-fav` 与 `btn-letter-detail-like` 右侧误导性的 `›` 导航箭头。

### 35. `FavoriteList`（收藏 | `/pages/favorite/index`）
- **外部审计意见**：B 级。分类列表已简洁，与参考一致；要求验证空态、取消收藏和跨类别数量正确。
- **第一轮初审（architecture-reviewer）**：`FavoriteList.vue` 已实现全部/树洞/回信/日记四分类、乐观取消收藏与失败回滚、已删除源内容过滤及 `onUnmounted` 清理 `clockTimer`。
- **第二轮反证（reviewer-glm）**：`favorite-list-v2.png` 与控件套件 `12/12`（含真实取消收藏）已验证通过。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：分类筛选、取消收藏同步与失效清理均已验证闭环，维持现状。

### 36. `PrivacySettings`（隐私设置 | `/pages/settings/privacy`）
- **外部审计意见**：B 级。设置开关合理且功能比设计更多；要求确认每个开关服务器侧生效。
- **第一轮初审（architecture-reviewer）**：`PrivacySettings.vue` 分组清晰，支持乐观更新与失败回滚、保留匿名凭证的本地缓存清理、带互斥锁的数据导出与账号清空。但 14 项隐私开关在所有受控业务路由上的服务端负向拦截矩阵需补齐完整运行时证明（**E5**）。
- **第二轮反证（reviewer-glm）**：前端 UI 已符合 `36_PrivacySettings.png`（`privacy-effects 3/3` PASS），无需改动视图代码；服务端全路由开关生效验证归入 `NEEDS_RUNTIME_EVIDENCE`（E5）。
- **最终裁决**：`NEEDS_RUNTIME_EVIDENCE`（`approvedForDev: false`）
- **裁决理由**：前端 UI 维持现状；需通过 **E5** 运行时测试验证全部隐私开关在服务端读写与 AI 路由上的实时拦截闭环。

### 37. `DataPolicy`（数据政策 | `/pages/settings/data-policy`）
- **外部审计意见**：B 级。建议增加清晰小标题、段落间距与目录，核对数据措辞真实准确。
- **第一轮初审（architecture-reviewer）**：`DataPolicy.vue` 已采用可折叠分节手风琴结构（`data-policy-v2.png`、`data-policy-collapsed.png`），并已核准默认可见度及本地导出副本边界措辞。
- **第二轮反证（reviewer-glm）**：控件测试 `data-policy 6/6` 已通过，维持现状。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：分节折叠层级与数据权属措辞清晰准确，维持现状。

### 38. `FeedbackHelp`（帮助反馈 | `/pages/help/feedback`）
- **外部审计意见**：B 级。表单结构正常，要求上传/重试/确认号和提交错误状态实测。
- **第一轮初审（architecture-reviewer）**：`FeedbackHelp.vue` 已完整打通 PostgreSQL `FeedbackPersistenceService`、多图上传与孤儿资源清理、真实 `ticketId` 回显及管理端回复同步。
- **第二轮反证（reviewer-glm）**：`feedback-help-v2.png`、`feedback-help-filled.png`、`feedback-help-submitted.png` 三态截图与 `10/10` 控件测试、跨端闭环测试全部通过。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：C 端提交至管理端流转与回读全链路已闭环，维持现状。

### 39. `HelpFaqs`（常见问题 | `/pages/help/faqs`）
- **外部审计意见**：B 级。标准检索与问答分组，和中性产品路线一致；要求核验折叠展开、搜索、无匹配。
- **第一轮初审（architecture-reviewer）**：`HelpFaqs.vue` 已具备常驻圆角搜索框、一键清除、折叠态双行摘要、展开态正文层级以及独立于加载状态的底部反馈入口。
- **第二轮反证（reviewer-glm）**：`help-faqs-v2.png`、`help-faqs-search.png`、`help-faqs-open.png` 三态截图与 `6/6` 控件测试全部通过。
- **最终裁决**：`KEEP`（`approvedForDev: false`）
- **裁决理由**：检索、折叠展开与兜底反馈入口均已验证通过，维持现状。

---

## 四、运营管理后台（Admin 10 页）审查边界说明

针对《`晚安树洞_49界面_社媒风格冲突与逐页视觉审计.md`》附带的 `ADM-01` 至 `ADM-10` 运营后台意见，裁决如下：
1. **B 端独立控制台定位**：管理后台（`apps/admin`）服务于内容审核员与系统运维人员，高密度表格、AI 渠道监控与策略路由同屏属于桌面端控制台的合理效率设计，不适用 C 端“低唤醒夜间庇护所”的留白标准。
2. **隐私与安全合规红线**：
   - `ADM-08 AI任务日志` 与 `Memory` 管理端接口（`GET /api/admin/v1/memory`）已严格限制为列表仅返回元数据，管理员调阅具体内容必须走带审计日志的单条受控接口（`getAuditedMemoryForAdmin`）。
   - `ADM-09 反馈工单` 已完成 PostgreSQL `FeedbackPersistenceService` 改造，消除了内存孤岛问题。
3. **本阶段范围控制**：PHASE 1 聚焦 C 端 39 页核心体验与 S1–S4 / E1–E5 闭环，管理后台不安排非必要视觉重绘。

---

## 五、PHASE 1 最终裁决统计与开发准入令

- **总计审定页面**：39 页（100% 覆盖）
  - `KEEP`：**23 页**（禁止非必要重构）
  - `MINOR_REFINE`：**8 页**（`03_ActionCenter`、`05_JourneyDetail`、`10_PeerConversation`、`21_Archive`、`24_PostDetail`、`25_LetterToday`、`32_ReportMonth`、`34_LetterDetail` —— **唯一获批进入 UI/前端代码修改的范围**）
  - `REJECT_AUDIT_FINDING`：**6 页**（`02_PeerNetwork`、`18_StableSelf`、`22_Square`、`23_MoodCreate`、`26_ToolIndex`、`31_DiaryDetail` —— 正式驳回社媒化建议及基于旧打包截图的误判）
  - `NEEDS_RUNTIME_EVIDENCE`：**2 页**（`14_NotificationCenter`、`36_PrivacySettings` —— 仅执行运行时与数据库验证，不改动 UI）
  - `REDESIGN_REQUIRED`：**0 页**
- **工程同步要求**：在完成上述 8 个 `MINOR_REFINE` 页面的靶向修复后，必须同步更新 `docs/design-v2/UI_V2_MASTER_QUEUE.json` 中各任务的顶层 `screenshot` 字段指向 `artifacts/ui-v2/r2/` 下的最新实测截图，防止打包脚本再次导出过时图像。
