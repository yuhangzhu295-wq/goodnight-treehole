# 第一阶段 UI Visual Convergence Pass 2

基线：`49519f1d77fcc827aa5b2115b637558b1101372a`。

## 本轮范围

- Journey 的 #36 经历确认、#29 情绪温度、#13 当前需要、#32 稳定支持、#34 Journey 时间线。
- #1 Tonight、#33 Safety、#16 现实求助卡、#39 提醒与回访。
- 第一阶段共享字体、SVG 图标、全局 TabBar、安全区和全宽场景头部。

未重写 API、Prisma、BullMQ、AI Provider、Action/#6 或 Adaptive Action/#37 的业务结构；Peer、Me、Report、Admin 不在本轮页面改造范围。唯一涉及 Action 的改动是把真实 sheet 的层级提高到 TabBar 之上，修复了“保存这次回顾”被导航遮挡的可点击性问题。

## 设计与实现

- `JourneyDetail.vue` 只保留加载、状态机、API 和路由；五个状态各自使用独立 Screen，并共享 `JourneyFlowShell`。
- 旅程时间线将更新类型映射为用户可理解的故事节点，不展示 `domain`、`stage`、`confidence` 等工程字段。
- Tonight 压缩 Hero，保留真实输入、感情二级选择 Bottom Sheet 和唯一的进行中 Journey 卡；通知只由右上角铃铛进入。
- Safety 保留现实求助卡、12356、120、确认暂时安全和三步保护行为，使用统一 SVG 图标与纵向步骤。
- Reality Handoff 的求助话术会随“希望 TA 怎么帮”实时改变，保存和复制仍调用真实接口；联系人管理维持在折叠的次级入口。
- Notification 按类型映射时钟、同路、信件、暂停和嫩芽 SVG，并把通知页加入全局导航显示集合。
- 主 UI 的展示字体统一为 `Songti SC / Noto Serif SC / Source Han Serif SC`，正文使用系统中文字体栈；清除了 `STKaiti`、`KaiTi`、`FangSong` 和第一阶段核心页面中的旧 Unicode 图标。
- 最终 TabBar 高 `72px`、底部 `safe-area + 8px`、圆角 `28px`；激活态采用深绿色文字和小型底部指示条，而不是整块绿色或橙色描边。

## 视觉验收

参考源逐张打开并对照：`C:\Users\zyu33\Desktop\图片素材88\晚安树洞_UI_01-41_业务说明` 中的 #1、#13、#16、#29、#32、#33、#34、#36、#39。

- 四种实际视口：375x812、390x844、393x852、430x932。
- 每页核对 Hero 高度、主内容起点和宽度、主 CTA Y、TabBar Y、滚动高度、主要分区数量和横向溢出。
- QA 没有将实际截图拉伸为参考图，也没有把任何设计图作为页面背景。
- 壳层截图与几何数据：`artifacts/reference-qa/first-stage-shells/`、`docs/first-stage-shell-reference-qa.md`。
- Journey 状态截图与几何数据：`artifacts/reference-qa/journey/`、`docs/journey-reference-qa-report.md`。

## 真实业务验证

- `pnpm test:real-browser-first-batch`：17 个不同的浏览器状态截图；Tonight -> Journey -> 指纹确认 -> 温度 -> 需求 -> Action -> 自适应 -> 时间线，以及高压分支 -> Safety -> Reality Handoff；验证了通知已读和受控清理后的持久化回读。
- `pnpm test:real-browser-goodnight-2`：浏览器完成行动、冷静箱、决定、现实求助卡、未来信入口，并实际登录后台读取 Journey、Action、Check-in、同路和安全事件。
- `pnpm test:goodnight-2`：3 项业务测试通过，覆盖 PostgreSQL 刷新持久化、Redis/BullMQ 逾期提醒、前后台同源数据和双用户同路会话。
- `pnpm test:dapi-live`：实际远端 DAPI 调用成功，记录 `provider_dapi_deepseek / deepseek-v4-flash`，`fallbackUsed=false`；未使用 Ollama 或本地模型。

完整浏览器证据：`artifacts/test-report/real-browser-first-batch.md`、`artifacts/test-report/real-browser-goodnight-2.md`。

## 最终检查

- `pnpm lint` 通过。
- `pnpm typecheck` 通过。
- `pnpm test:reference-qa-first-stage-shells` 通过。
- `pnpm test:reference-qa-journey` 通过。
- `pnpm test:real-browser-first-batch` 通过。
- `pnpm test:real-browser-goodnight-2` 通过。
- `pnpm test:goodnight-2` 通过。
- `pnpm test:dapi-live` 通过。
- `git diff --check` 通过。
- 前台、后台、API 在重启后均返回 HTTP 200。

## 保留事项

- 本轮有意不重做 Peer、Me、Report、Admin 的页面结构；它们应在下一阶段用同一套 token 与 SVG 系统逐页收口。
- Redis 当前为 `5.0.14.1`，BullMQ 在测试中工作正常，但输出了建议升级到 6.2+ 的运行时警告；这不是本轮 UI 修改导致的失败。
