# UI V2 整改 — 持续执行状态

> 本文件是 UI V2 整改的活状态。`docs/design-v2/UI_V2_SOURCE_INDEX.md` 是资料索引与 Batch 0 基线，
> `docs/design-v2/UI_V2_MASTER_QUEUE.json` 是逐页队列。**只有每种验收条件都有证据，一页才标 DONE。**

## 当前状态

- **HEAD `ad93531`**（分支 `codex/ui-v2-native-redesign`），已推送，PR #2 OPEN 未合并。
- **资料已读取并索引**：V2 交付包 137 文件（39 设计图 / 39 逐页提示词 / 45 HTML 原型 / 8 状态图 /
  DOCX）、审计包（`C:\Users\zyu33\Downloads\审计` 是 Word 文档，433 段 + 52 表 + 82 图）。
- **基线已核定**：真实 54 路由 / 39 独立视图；8 组共用组件；审计 52 页 = 30 P1 + 22 P2。
- **已完成页面：0**（第一页广场已改造并通过一轮独立审查修复，但动态验收未做完，故不标 DONE）。

## 逐页状态（节选，完整以队列为准）

| 页面 | 路由 | 实现 | 渲染 | 交互 | 业务 | 视觉审查 | 代码审查 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Square 广场 | `/pages/square/index` | yes | yes | **17/17 控件实测通过** | spec 3/3 | 待独立复审 | 一轮 FAIL → 已修 → **待复审** | IN_REVIEW |

### Square 的证据

- 改动：`apps/mp/src/views/Square.vue`；提交 `e87074c`（首版）、`ad93531`（审查修复轮）。
- 设计契约（从 `可复现HTML原型/Square.html` 读出）：白底 `#fff`、正文 `#242A32`、强调 `#275F56`、
  分隔线 `#E8EAED`、34px 头像、无圆角卡片、无插画。
- 量化改进：墨量 21.1% → 12.0%，饱和色 2657 → 220（基线图 `.bak` 已保留，未污染基线集）。
- 计算样式实测：标题 21px、FAB 102×46 r10、分隔线 `#E8EAED`、无横向溢出、FAB 不遮挡内容。
- 控件实测：`scripts/verify-square-controls.mjs` 对 `tests/interaction-manifest.front.json` 的
  17 项逐一点击，全部产生预期导航/API 效果。
- 审查代理（code-reviewer）首轮 FAIL，8 项发现；逐条核验后 5 项成立并已修（testid 契约、
  假作者身份、重复标题、筛选竞态、共享样式尺寸），1 项不成立（"标题 48px"——实测 21px），
  2 项为既知机制（seed 互动数）。

## 本轮自查记录（自己的错，记下避免复发）

1. 用 `npm run build`（production，`VITE_API_BASE_URL` 为空）而不是 `build:native-debug`，
   导致 bundle 打到 WebView 自身、把 index.html 当 JSON 解析。**原生调试包必须用
   `build:native-debug`。**
2. 曾把筛选键从英文改成中文（以为服务端不认），实际 `MOOD_KEY_TO_EMOTION` 有英文映射——
   改契约前先读映射表。
3. 控件验证脚本三次误报 MISSING：tab 点击后跳走仍探广场、数据未到就探首帖、setupClick 后
   又重新导航把菜单状态清掉。夹具先修再下结论。

## 阻塞（如实标记）

- 无 DAPI secret → AI 生成类 `NOT_RUN_NO_SECRET`。
- 无实体 Android → `PHYSICAL_ANDROID_VERIFIED=false`；模拟器可采截图。
- 无 Mac → `IOS_SOURCE_VERIFIED=true` / `IOS_NATIVE_VERIFIED=false`。
- 环境：WSL PostgreSQL 周期性断连（本轮断 3 次，均 `docker compose restart postgres` 恢复）；
  模拟器前台被 `com.yuhangzhu295.cozyfocus` 抢占导致 CDP 断（采集脚本已改为抢不回即中止）。

## 下一项 READY

按审计优先级与批次顺序，**Batch 1 的共享视觉系统**尚未做完（全局装饰层仍有 13 处
`tree-top-cutout` / `tool-baby-letter-cutout` 等），且广场页的动态验收（360/390/430 宽、
字体放大、断网重试）与独立视觉复审未完成。
