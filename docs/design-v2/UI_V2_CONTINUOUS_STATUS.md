# UI V2 整改 — 持续执行状态

> 本文件是 UI V2 整改的活状态。`docs/design-v2/UI_V2_SOURCE_INDEX.md` 是资料索引与 Batch 0 基线，
> `docs/design-v2/UI_V2_MASTER_QUEUE.json` 是逐页队列。**只有每种验收条件都有证据，一页才标 DONE。**

## 当前状态

- **HEAD `aa121eb`**（分支 `codex/ui-v2-native-redesign`），已推送，PR #2 OPEN 未合并。
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

**P2**：DiaryList 空态仍保留树叶插画（页面局部 CSS）——**已修**（0d8f2a7，净删 32 行）。

## 审查代理的完成度结论（如实记录）

十页**全部 NOT DONE**。未过门槛主要是：360/390/430 三档宽度与字体放大未测、失败/离线重试未验、
控件点击未断言 API/DB 效果、独立视觉审查未做。这些是本轮之后的主要剩余工作。


## 当前可执行工作的边界

**已完成**：资料定位与索引、Batch 0 基线、共享层（错误横幅统一 26 页 + 删 16 处全局装饰层）、
10 个页面的视觉与交互整改、三轮独立审查的全部发现（含 3 个 P0）。

**仍未闭环（如实记录）**：
1. **十页全部 NOT DONE**——审查代理点名的验收项未做：360/390/430 三档宽度、字体放大、
   离线/失败重试的端到端验证、控件点击未断言 API/DB 效果、独立视觉审查未做。
2. **`PERSISTENCE_BATCH3_STABLE=false`** 等持久化门禁状态未变。
3. **外部阻塞**：无 DAPI secret（AI 生成走 fallback 模板）、无实体 Android、无 Mac。
4. **环境顽疾**：WSL PostgreSQL 本轮中断 10+ 次（根因已定位：基础 compose 映射 5432 而
   .env 指向 15432，该映射只在 docker-compose.recovery.yml；正确启动方式已写入状态文档）。
   模拟器前台被 CozyFocus 持续抢占导致 CDP 多次中断。

## 第四轮：审查点名的两项验收已闭环

1. **响应式：20/20 页面在 360/390/430 三档宽度 + 大字体下全部 PASS**
   （`scripts/verify-responsive-all.mjs`，量横向溢出/控件裁切/主操作遮挡/tabbar 压内容）。
2. **控件效果断言：17 个控件跨 4 页**（`scripts/verify-control-effects.mjs`，
   点击前后读 API 真实值比对）。已验证：广场情绪筛选返回非空结果集、回应按钮导航、
   回信收藏翻转 `favoritedByCurrentUser`、隐私对话框打开/跳转/导出、日记页 9/9、
   同行请求 accept 跳到边界确认页。

**仍未闭环**：
- 需要打字的控件无效果断言（`fill` 无法驱动该 WebView 里的 Vue `v-model`，
  已尝试 prototype setter / 原生 setter / 键盘事件三种方式均无效；如实记录而非伪装）。
- 抱抱按钮的效果无法断言（API 按用户幂等，二次抱抱不改变计数）。
- 剩余 P1 页面：peer-network、peer-detail、me-diaries、me-month-report、
  diary-detail、letter-detail、stable-self、decision-vault、future-self 细节等。

**本轮新改页面**：PeerConsent（去头像装饰、边界紧凑化、补 testid，2/2 控件）、
PeerRequests（三态生命周期 tab、去重复面板、补 testid、accept 效果已验证，4/5 控件）。

**环境**：本轮又出现第二个模拟器被拉起（emulator-5556）导致 adb 报 "more than one
device"，已 kill；App 两次因 `install -r` 后组件注册损坏而无法启动，改为
uninstall + install 后正常。


## 第五轮：peer 族三页 + 两个审计误判

- **peer-network**：实测发现推荐 tab 把同一段故事渲染了 6 遍（库里多条经历逐字相同，
  而去重按 experience id）。改为按 title 去重并显示"另有 N 位同行者留下过相同的经历"，
  文本 400+ → 140 字；推荐参考从竞争性色块降为正文下一行低调文字。
  首版按 `experience.content` 去重**完全无效**（该字段在网络视图返回空）——部署干净≠生效。
- **peer-requests**：三态生命周期 tab（待回应/已接受/已结束）+ 每 tab 空态；
  删除与"已接受"tab 职责重复的旧面板；补 4 个 testid；accept 按钮效果已验证
  （点击跳到边界确认页）。
- **peer-detail**：结构已符合"经历全文/后来/是否申请交流"三段式，审计该项**不成立**；
  补 4 个 testid，3/3 控件通过。

**两个审计误判已证伪并记录**：peer-wait 的"重大状态疑点"（两页是独立组件、状态不同）、
peer-detail 的"多个单独边框卡"（已是连续正文三段式）。

**环境**：本轮 GitHub 443 三次不可达（重试后成功）；数据库又断 2 次；
第二个模拟器又被拉起一次（已 kill）；App 两次需 uninstall+install 才恢复。


## 第六轮：环境问题根治（四个"机器不稳"全是代码/配置缺陷）

用户两次要求"必须修复环境问题"。逐一定位后，四个被归因为"机器不稳定"的现象**没有一个是机器的问题**：

1. **Node 用 IPv6 拨只监听 IPv4 的端口**。`.env` 的 `DATABASE_URL` 写 `localhost:15432`，
   Node 先解析到 `::1`，而 WSL2 docker-proxy 只听 IPv4。`127.0.0.1:15432` 通、`localhost:15432`
   不通。已 pinned 到 127.0.0.1 并在 `.env.example` 注明（`.env` 被 gitignore）。
   **这是绝大多数"INFRASTRUCTURE_FAILURE"和"数据库又断了"的真相。**
2. **API 在数据库未就绪时永久放弃**。Prisma 惰性连接，首次查询抛错后服务带着 500 跑着，
   直到有人手工重启。`waitForDatabase`（90s 带进度）+ `restart-api.ps1` 延长等待。
   反向证明：去掉等待→数据库停止时 API 起不来（000）；恢复→数据库回来后 API 自行 200。
3. **测试 runner 探测失败即退出**。改为先用 recovery override 拉栈再重探 6 次。
   实测：`docker compose stop postgres` 后跑 spec，runner 自己拉起来并 PASS。
4. **"前台被抢"实为 socket 失效**。24 秒 8 次采样前台稳定、12 次 CDP 调用全成功；
   真正杀死连接的是 App 被 force-stop/重装（本项目 `adb install -r` 后 activity 注册会坏）。
   `scripts/device-session.mjs` 统一持有连接并在失败时重连。

**顺带发现采集工具的一个静默失败**：`capture-page.mjs` 的页面状态表达式写在模板字符串里，
`	

` 被 Node 先解释，浏览器收到真实控制字符→正则被截断→SyntaxError→`ev` 返回 null，
脚本输出一条没有 `len`/`text`/`errs` 的记录——**看起来就像"这页是空的"**。已用 `String.raw` 修好。
这意味着此前某些"空页"结论的证据强度要打折扣。

**新增工具**：`scripts/stack-up.sh`（唯一正确的启动方式）、`scripts/stack-health.sh`
（分层诊断：端口/API/WSL/设备，不盲目全重启）。健康检查立刻发挥价值：它报告"API 挂但容器
全 Up"，直接指向原因 1。

**未修**：`capture-all-ui`/`capture-ui-v2-pages`/`measure-page-layout`/`probe-device-api`
和三个 seed 脚本仍自己开连接（一次性工具，未迁移）。

## 第七轮：输入能力（P0），先修"验收不了"这件事

用户点名 P0：Vue 的 `v-model` 根本收不到脚本输入，所以此前所有"输入后提交"的验收都没有真的验证过输入。

- **根因**：旧 `fill` 设 `.value` + `dispatchEvent('input')` 只改 DOM，不进 Vue。计数器仍显示
  `0/1000`，而页面看起来"填好了"。改为 CDP `Input.insertText`（走光标，等同真实键盘）。
- **矩阵** `scripts/verify-input-matrix.mjs` 7/7：中英标点多行到达 Vue、提交 body 与输入一致、
  空输入被拒且不写库、超长截到 1000、双击只写一行、回读 API、清空后重进仍为空。
- **抓到一个真缺陷**：MoodCreate 的 `submit` 只在按钮上加 `:disabled`，入口没有检查 `submitting`。
  双击时第二个请求照样发出，同一条心情写了两行。修法是在入口加守卫，不是加 `await` 或延时。
  **反向证明**：去掉守卫，矩阵报 2 行；加回守卫，报 1 行。

## 第八轮：tool 族两页

- `tool-decompose` 4/4：输入到达 Vue、任务带正确文本、结束于真实结果**或带来源标注的降级提示**、
  保存写入 diary 行。降级分支也断言，否则"AI 不可用"会被当成通过。
- `tool-breakdown` 别名路由 2/2：渲染同一组控件、接受输入。

## 第九轮：StableSelf 两段式

结构从五段碎块收成两段（"对自己的提醒"含稳定描述+现实提醒；"支持办法"含锚点+联系人），
联系人从独立 section 折进 `field-group`。`scripts/verify-stable-self.mjs` 4/4：两字段输入、
提交带文本、回读 API。回读用的凭据必须与读取在**同一个页面内表达式**里取用——跨调用取到的凭据
在 App 重启后属于另一个身份，会读成"写丢失"。

## 第十轮：DecisionVault，以及三个"我的仪器在骗我"

页面结构：标题改"重要决定"，列表前置，composer 折进 `<details>`，加状态 Tab（只显示 count>0 的）
与空态，9 个 testid。`scripts/verify-decision-vault.mjs` **7/7**。两个真缺陷 + 三个仪器缺陷：

1. **真缺陷：两扇门不同步**。`<details :open="composerOpen">` 被 summary 原生展开时 `open`
   变了但 ref 没变，按钮文案于是说谎（面板开着、按钮还写"＋ 新增决定"）。加 `@toggle` 同步。
   **反向证明**：去掉 `@toggle` 重建重装，用例报
   `[{"open":true,"label":"＋新增决定"},{"open":true,"label":"收起"}]`；恢复后 7/7。
2. **真缺陷：加载失败被渲染成"你还没有记录"**。空态条件是 `!items.length && !loading`，
   500 时 items 也是空，页面就断言了一件它不知道的事。加 `!error`。
   **反向证明来自事故现场**：一次 API 500 的实跑里，明明有 3 条记录，页面却出现了
   `decision-empty-add`（"写下第一个决定"）。
3. **仪器：`isForeground` 读的是 ANR 快照**。`dumpsys window` 开头有一段
   "WINDOW MANAGER LAST ANR"，里面自带 `mCurrentFocus`。任何 App 出过一次 ANR 后，
   第一行永远是那个崩掉的 App —— 于是每个会话都以为前台被抢、反复重启，而真前台一直是对的。
   改用 `dumpsys window displays`（只有实时段）。
4. **仪器：折叠面板里的控件"可测但不可点"**。Chrome 用 `content-visibility` 藏 `<details>` 内容，
   所以 `getBoundingClientRect` 有尺寸、`offsetParent` 非空，点击却落在 summary 上，
   字段永远不聚焦 —— 报告出来是"产品缺陷"。`waitForControl` 改为先看 `closest('details').open`
   + `checkVisibility()`，再 `scrollIntoView({block:'center'})` 后取坐标（顺带修好折叠线以下的控件）。
5. **仪器：`ev` 把页面异常吞成 null**。页面里抛错与"元素不存在"返回值一样，静默的探针等于
   一次什么都没测的空跑。现在 `exceptionDetails` 直接抛。

**另一个必须记住的事实**：本项目点 anchor 导航是**整页加载**（点击前设的 `window.__x` 点击后消失），
所以任何 window 级 hook 都会被"挂载被测页面"的那次导航冲掉；要拦请求只能用
`Page.addScriptToEvaluateOnNewDocument`。

**环境**：容器三个全 Up，但 15432/16379 又不可达（WSL2 转发失效，不是数据库挂了）。
`scripts/stack-up.sh` 重新 up 后恢复。新增 `scripts/preflight-api.mjs`：栈不健康时以 **exit 2**
退出并打印 `STACK DOWN`，与产品失败（exit 1）分开——否则一次断库会被写成五条"字段没聚焦"。

**状态未变**：39 个独立视图里本轮只完成了 decision-vault 一页的七轴验收；
`codeReviewApproved` 仍为 0，独立审查尚未覆盖本轮改动。
