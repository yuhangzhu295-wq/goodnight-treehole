# UI V2 整改 — 持续执行状态

> 本文件是 UI V2 整改的活状态。`docs/design-v2/UI_V2_SOURCE_INDEX.md` 是资料索引与 Batch 0 基线，
> `docs/design-v2/UI_V2_MASTER_QUEUE.json` 是逐页队列。**只有每种验收条件都有证据，一页才标 DONE。**

## 当前状态

- **HEAD `dc5cf6c`**（分支 `codex/ui-v2-native-redesign`），已推送，PR #2 OPEN 未合并。
- **资料已读取并索引**：V2 交付包 137 文件（39 设计图 / 39 逐页提示词 / 45 HTML 原型 / 8 状态图 /
  DOCX）、审计包（`C:\Users\zyu33\Downloads\审计` 是 Word 文档，433 段 + 52 表 + 82 图）。
- **基线已核定**：真实 54 路由 / 39 独立视图；8 组共用组件；审计 52 页 = 30 P1 + 22 P2。
- **已完成页面：0**（广场与日记列表已改造，均未做独立视觉复审与全部动态验收）。

## 逐页状态

| 页面 | 路由 | 实现 | 渲染 | 交互 | 业务 | 视觉审查 | 代码审查 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Square 广场 | `/pages/square/index` | yes | yes | 17/17 控件点击 | spec 3/3 | 待独立复审 | 两轮 FAIL→已修 | IN_REVIEW |
| DiaryList 日记 | `/pages/diary/index` | yes | yes | 10/10 控件点击 | 待 spec | 待独立复审 | 一轮 FAIL→已修 | IN_REVIEW |
| LetterList 回信 | `/pages/letter/list` | yes | yes | 待控件实测 | 待 spec | 待独立复审 | 未审 | IN_PROGRESS |
| ToolIndex 工具 | `/pages/tool/index` | yes | yes | 待控件实测 | tools spec PASS | 待独立复审 | 未审 | IN_PROGRESS |
| ToolRun 工具执行 | `/pages/tool/run` | yes | yes | **7/7 控件点击** | tools spec PASS | 待独立复审 | 未审 | IN_REVIEW |
| SafetySupport 安全 | `/pages/safety/index` | yes | yes | **3/3 控件点击** | 待 spec | 待独立复审 | 未审 | IN_REVIEW |
| FutureSelf 未来信 | `/pages/future-self/index` | yes | yes | **7/7 控件点击** | 2 spec 5/5 | 待独立复审 | 未审 | IN_REVIEW |
| MoodCreate 写心情 | `/pages/mood/create` | yes | yes | **5/5 控件点击** | publish 3/5 | 待独立复审 | 未审 | IN_REVIEW |
| PostDetail 树洞详情 | `/pages/post/detail` | yes | yes | **7/7 控件点击** | 待 spec | 待独立复审 | 未审 | IN_REVIEW |
| LetterToday 回信 | `/pages/letter/today` | yes | yes | **4/4 控件点击** | letter spec PASS | 待独立复审 | 未审 | IN_REVIEW |
| PeerWait / PeerConversation | `/pages/peer/*` | yes | yes | 已核验状态不同 | peer spec 10/10 | 待独立复审 | 未审 | IN_REVIEW |

**审计"peer-wait 重大状态疑点"已证伪**：两页是独立组件、不同 class/header；同一 matchId 下分别渲染
"等待对方决定"与"还剩约 N 小时 + 真实消息"。

### 已完成批次

- **Batch 1（共享层，部分完成）**：
  - 新增 `components/LoadErrorBanner.vue`，**26 个页面**统一复用；每页各自写错误态且无重试的问题消除。
    保存/校验类反馈（StableSelf/MoodCreate/SafetySupport）与 Recovery 的隐私门说明**有意不加**重试。
  - 删除 styles.scss 中 **16 处伪元素装饰层**（`tree-top-cutout` / `tool-baby-letter-cutout` 等），
    8156 → 7823 行，diff 纯删除。
  - 仍留 5 处 cutout：它们画的是模板里真实渲染的元素（`.card-illustration` 等），归逐页整改处理。
- **Square**：墨量 21.1%→12.0%、饱和色 2657→220；计算样式实测标题 21px、FAB 102×46、
  分隔线 `#E8EAED`、无横向溢出；17 个交互契约控件全部点击通过。
- **DiaryList**：去掉头部情感文案与行内插画占位，改为日期+情绪+正文+时间的紧凑行；
  "查看回信"入口保留（提示词禁止为改视觉删功能）。

## 本轮自查记录（自己的错，记下避免复发）

1. 用 `npm run build`（production，`VITE_API_BASE_URL` 为空）而不是 `build:native-debug`，
   导致 bundle 打到 WebView 自身、把 index.html 当 JSON 解析。**原生调试包必须用
   `build:native-debug`。**
2. 曾把筛选键从英文改成中文（以为服务端不认），实际 `MOOD_KEY_TO_EMOTION` 有英文映射——
   改契约前先读映射表。
3. 控件验证脚本三次误报 MISSING：tab 点击后跳走仍探广场、数据未到就探首帖、setupClick 后
   又重新导航把菜单状态清掉。夹具先修再下结论。
4. 机械删 CSS 后，`.diary-letter-action,` 被留成悬空逗号（选择器列表断裂）。**构建通过不等于
   编辑干净**——这次是读文件发现的，不是构建报的。批量删除后必须读一遍结果。
5. 造数据时用了相同文案跑两次 seed，产生两条相同日记，看起来像重复写入缺陷。是自己的夹具
   制造了假象，不是产品问题。

## 阻塞（如实标记）

- 无 DAPI secret → AI 生成类 `NOT_RUN_NO_SECRET`。
- 无实体 Android → `PHYSICAL_ANDROID_VERIFIED=false`；模拟器可采截图。
- 无 Mac → `IOS_SOURCE_VERIFIED=true` / `IOS_NATIVE_VERIFIED=false`。
- 环境：WSL PostgreSQL 周期性断连（本轮断 3 次，均 `docker compose restart postgres` 恢复）；
  模拟器前台被 `com.yuhangzhu295.cozyfocus` 抢占导致 CDP 断（采集脚本已改为抢不回即中止）。

## 下一项 READY

1. **DiaryList 收尾**：控件实测（交互契约）+ 业务 spec + 独立视觉/代码复审。
2. **Batch 1 剩余**：共享设计令牌统一（`packages/ui-tokens` 与 styles.scss 的绿色/暖纸色体系
   与 V2 的白底/深墨/深绿契约仍有冲突），以及 5 处元素级插画的逐页处理。
3. **Batch 2 主 Tab**：今晚/广场/同路/行动/我的 的首页信息层级与首屏利用率。


## 第二轮独立审查结论（code-reviewer，FAIL）

5 项 P1，逐条核验后 **4 项成立并已修**：

1. **Square 用了未导入的 `LoadErrorBanner`**（真，我的疏漏）：模板渲染组件但没 import，错误分支静默渲染空白。
   vue-tsc 不报这类错，只有运行时才暴露。已修，并全仓审计 25 个使用页。
2. **日记"查看回信"打开的是错的回信**（真）：`openLetter` 在无 `letterId` 时跳 `/pages/letter/today`，
   而 manual 日记行只带 `hasLetter` 不带 `letterId`（实测 `source:"manual"` 三行全部 `letterId:null`）。
   改为仅有 `letterId` 时才显示入口——不冒充能打开该篇回信。
3. **日记加载失败被渲染成"还没有日记"**（真）：`load()` 无 catch，失败即空列表。已加错误横幅+重试+请求序号。
4. **日记行仍是圆角卡片**（真）：`.diary-card` 与 letter/favorite 共用四边边框+圆角，我只覆盖了
   `border-bottom`。实测 radius 12px → 0px。
5. **审查代理对"17/17、10/10"的读法被高估**（部分成立，已如实记录）：那两次运行只证明控件被找到、
   被点击、页面去了哪里，**不断言 API 或数据库效果**，且日记 10 项里有 6 项没有任何点击后断言。
   提交信息已注明这个数字的口径。

## 环境顽疾（本轮 8 次数据库中断，已定位根因）

- **直接原因**：`docker compose up -d postgres` 用基础 `docker-compose.yml`（映射 5432），
  而 `.env` 指向 15432；15432 映射在 `docker-compose.recovery.yml` 里。
  正确启动方式：`docker compose -f docker-compose.yml -f docker-compose.recovery.yml up -d postgres redis`。
- **加剧因素**：`wsl --shutdown` 时 PostgreSQL 正在 fsync，导致数据目录损坏、容器 Exited 255 反复崩溃；
  需要等恢复窗口（约 1 分钟）后再启动。
- **修复后**：`localhost:15432` 由 docker-proxy 监听（netsh 提权失败，无需它）。
- **App 曾无法启动**（"Activity class does not exist" / result code -92）：`adb install -r` 后组件注册异常，
  `adb uninstall` + 全新 `adb install` 解决。
- CozyFocus 持续抢占模拟器前台，多次切断 CDP；采集脚本的前置守卫已能正确中止而不是空转。


## 第三轮独立审查（code-reviewer，FAIL → 已修 10 项）

审查代理给出 FAIL 并列出 3 个 P0、9 个 P1、1 个 P2。逐条核验后**全部成立并已修**：

**P0**
1. MoodCreate / PostDetail 标题竖排（实测 32×99）——全局 grid 列为已删除的头像预留空间；
   改单列后实测 271×25。
2. ToolRun 生成失败后把**旧结果**连同**新 jobId** 存进日记——请求前清空 result/jobId，
   保存时要求两者同属本次运行。
3. 回复"仅作者可见"是假承诺——`createReply` 收了 `visibility` 却从不使用，Reply 表无此列。
   改为服务端明确拒绝 + UI 标注"暂不支持"并禁用提交（不隐藏选项、不悄悄公开）。

**P1**
4. 私密帖可被任何持 ID 者读取（`getPost` 未核验 visibility）——已补；当前无私密帖数据，
   属防御性缺口。
5. `LoadErrorBanner` 无重试处理器时仍渲染"重新加载"按钮——改为有 label 才渲染；
   FutureSelf 的保存错误不再引导去重载列表。
6. LetterList 读取失败无错误态；DiaryList `loadMonths` 阻塞列表加载；Square `relativeTime`
   遇无效日期会抛错并拖垮整个 Feed——三处均已修。
7. styles.scss 悬空选择器 `.decompose-page::before,`（Sass 静默合并下一条规则）——已删，
   并全文件复查同形状为 0。

**P2**：DiaryList 空态仍保留树叶插画（页面局部 CSS）——待处理。

## 审查代理的完成度结论（如实记录）

十页**全部 NOT DONE**。未过门槛主要是：360/390/430 三档宽度与字体放大未测、失败/离线重试未验、
控件点击未断言 API/DB 效果、独立视觉审查未做。这些是本轮之后的主要剩余工作。
