# 晚安树洞第一批核心支持链路交付报告

## 1. 交付范围

本轮严格按第一批任务范围完成以下 10 个业务节点：

| 节点 | 页面/状态 | 交付内容 |
| --- | --- | --- |
| #1 | 今晚首页 | 输入情绪、选择关系、创建 Journey、提交真实分析任务、读取未读通知和进行中的 Journey。 |
| #36 | 情绪指纹确认 | 展示 AI 草稿、确认当前处境、重新分析、写入确认后的快照和时间线。 |
| #13 | 情绪温度 | 选择 0-10 强度，真实保存温度并记录 `JourneyUpdate`。 |
| #29 | 支持意图 | 选择陪伴、下一步、拆解或安静空间，按安全状态分流到稳定页或行动页。 |
| #34 | 支持稳定页 | 完成稳定动作、换一种支持方式、继续到现实支持交接。 |
| #32 | 安全支持 | 高风险 Journey 进入安全优先流程，确认安全后进入稳定流程，展示官方求助信息。 |
| #33 | 现实支持交接 | 选择可信联系人和需求，保存真实交接卡，复制已保存内容，不自动发送。 |
| #16 | 行动中心 | DAPI 生成行动计划，接受、完成、错过、选择阻碍并生成自适应行动。 |
| #6/#37 | 行动跟进 | 真实 check-in、missed、barrier、adaptive plan 状态闭环，并回写时间线。 |
| #39 | 通知中心 | 读取后端通知、未读筛选、点击标记已读并跳转目标页面。 |

后续前台 01-41 和后台页面不在本轮视觉重做范围内；已有功能和接口未被删除或替换成静态页面。

## 2. 视觉和交互修复

### 今晚首页

- 使用夜间树景和局部装饰层，背景与内容卡片分离，避免整张设计图覆盖页面。
- 文本输入、关系选择、六个快捷入口和创建 Journey 均为真实控件。
- 加入加载、分析完成、当前 Journey 和通知入口状态，避免提交后只有静态提示。
- 页面保留底部导航，但主体内容为安全区预留空间，浏览器回归检查横向溢出为 `false`。

### 情绪指纹、温度和支持意图

- AI 草稿、确认按钮、重新分析按钮均绑定后端状态；重新分析会创建异步 AI Job，而不是改写前端文案。
- 温度选择使用明确的 0-10 控件，提交后服务端保存 Snapshot 并写入强度变化时间线。
- 支持意图使用可见卡片，选择后按实际 Journey 和安全事件分流；高风险状态不会进入普通行动页。
- 路由复用时监听 `id/mode` 查询参数，避免从稳定页返回意图选择时只换 URL 不换页面内容。

### 稳定、安全和现实交接

- 稳定页的完成、换一种支持、进入现实支持均产生真实状态变化或真实路由变化。
- 安全页采用独立安全优先布局，调整标题和卡片层级，消除窄屏下单字掉行；包含 12356、120、可信联系人和“我现在安全”操作。
- 现实交接页先保存交接卡，再允许复制保存后的内容；没有自动发送、假上传或只 Toast 的提交行为。

### 行动和通知

- 行动页每个主操作都对应真实 API：生成计划、接受、完成、错过、阻碍选择和自适应计划。
- DAPI 生成结果显示加载和失败状态，接受后的计划、check-in 和 JourneyUpdate 可刷新读取。
- 通知页使用真实后端列表和已读接口；点击通知会标记已读并跳转到对应 Journey/行动页面。
- 所有页面在 430x860 浏览器视口下检查了横向滚动条、文字重叠和底部固定导航遮挡。

## 3. 数据、API 和模型约束

- 保留现有 API、store、Prisma 数据库、BullMQ 异步任务和路由结构；新增接口仅用于第一批节点缺失的真实状态写入：
  - `POST /api/journeys/:id/situation/reanalyze`
  - `POST /api/journeys/:id/safety/acknowledge`
- 端到端数据链路为 UI → API → Prisma/Redis → 刷新读取；核心测试验证了 Journey、Snapshot、SafetyEvent、Handoff、Action、JourneyUpdate、Notification 的持久化。
- 所有 AI 调用均创建真实 `AiJob`，记录 provider、model、status、result/error。
- 本轮验证使用 DAPI：`provider_dapi_deepseek` / `deepseek-v4-flash`；已验证无 Ollama、本地模型和静态 AI 回退。
- 现实支持交接只保存用户明确提交的内容，不擅自联系第三方。

## 4. 浏览器截图证据

截图目录：`artifacts/screenshots/first-batch/`

| 状态 | 截图 |
| --- | --- |
| 首页空态、关系抽屉、已输入 | `01-tonight-empty.png`, `02-tonight-relation-sheet.png`, `03-tonight-text-entered.png` |
| 指纹加载、确认、温度、支持意图 | `04-fingerprint-loading.png`, `05-fingerprint-confirm.png`, `06-emotion-temperature.png`, `07-support-intent.png` |
| 稳定、安全、交接 | `08-stabilize.png`, `09-safety.png`, `10-reality-handoff.png` |
| 行动推荐、接受、通知、错过、阻碍、自适应、时间线 | `11-action-recommendation.png`, `12-action-accepted.png`, `13-follow-up-notification.png`, `14-action-missed.png`, `15-barrier-selected.png`, `16-adaptive-action.png`, `17-journey-timeline.png` |

浏览器脚本：`scripts/real-browser-first-batch.ts`。本次 17 个命名状态均单独截图，SHA-256 均唯一；每个状态均执行横向溢出断言。

## 5. 验证结果

已实际执行并通过：

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:dapi-live`
- `pnpm test:first-batch-core`：2/2
- `pnpm test:real-browser-first-batch`
- `pnpm test:real-browser-goodnight-2`
- `pnpm qa:all`

`qa:all` 还通过了前后台点击性、真实浏览器点击、跨端同步、业务流和数据库相关回归；点击性报告为 124/124 通过，横向滚动检查为 `hscroll=false`。

## 6. 当前仍存在的差异

- 本轮交付重点是第一批核心支持业务链路，不宣称前台 01-41 或后台 01-10 已完成新一轮逐像素重做。
- 现有全量视觉报告中的部分页面仍有像素差异，差异主要来自浏览器字体、素材裁切和不同视口渲染；这些页面未在本轮第一批功能范围内重构。
- 第一期截图使用本地真实素材和组件布局，没有把设计图整页作为背景；若要继续降低像素差异，应按用户指定的 `C:\Users\zyu33\Desktop\图片素材88\晚安树洞_UI_01-41_业务说明` 逐页提取局部素材并继续做视觉回归。

## 7. 下一步建议

1. 在服务重启后的干净环境再次运行第一批浏览器脚本，保留新的截图和 SHA 作为交付基线。
2. 继续按 UI 01-41 业务说明逐页处理视觉差异，优先处理字体、树景裁切、卡片间距和移动端安全区。
3. 继续扩展跨端验收：前台创建的 Journey、Action、Handoff、Notification 在管理端可查询，管理端的状态变更在前台刷新可见。
