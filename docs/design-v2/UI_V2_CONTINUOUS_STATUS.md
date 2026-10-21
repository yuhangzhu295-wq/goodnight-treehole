# UI V2 整改 — 持续执行状态

> 本文件是 UI V2 整改的活状态。`docs/design-v2/UI_V2_SOURCE_INDEX.md` 是资料索引与 Batch 0 基线，
> `docs/design-v2/UI_V2_MASTER_QUEUE.json` 是逐页队列。**只有每种验收条件都有证据，一页才标 DONE。**

## 当前状态

- **HEAD `8ab8da5`**（分支 `codex/ui-v2-native-redesign`），已推送，PR #2 OPEN 未合并。
- **资料已读取并索引**：V2 交付包 137 文件（39 设计图 / 39 逐页提示词 / 45 HTML 原型 / 8 状态图 /
  DOCX）、审计包（`C:\Users\zyu33\Downloads\审计` 是 Word 文档，433 段 + 52 表 + 82 图）。
- **基线已核定**：真实 54 路由 / 39 独立视图；8 组共用组件；审计 52 页 = 30 P1 + 22 P2。
- **已完成页面：0**（广场与日记列表已改造，均未做独立视觉复审与全部动态验收）。

## 逐页状态

| 页面 | 路由 | 实现 | 渲染 | 交互 | 业务 | 视觉审查 | 代码审查 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Square 广场 | `/pages/square/index` | yes | yes | **17/17 控件实测** | spec 3/3 | 待独立复审 | 一轮 FAIL→已修→待复审 | IN_REVIEW |
| DiaryList 日记 | `/pages/diary/index` | yes | yes | 待控件实测 | 待 spec | 待独立复审 | 未审 | IN_PROGRESS |

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
