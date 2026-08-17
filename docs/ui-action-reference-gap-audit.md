# ActionCenter Reference Gap Audit

## 审查范围与证据

- 基线提交：`9a16eb2ade1bec0811cd149890ff08ba81ce1b59`
- 代码审查对象：`apps/mp/src/views/ActionCenter.vue`
- Reference #6：`C:\Users\zyu33\Desktop\图片素材88\晚安树洞_UI_01-41_业务说明\06_今晚只做这一件事.png`
- Reference #37：`C:\Users\zyu33\Desktop\图片素材88\晚安树洞_UI_01-41_业务说明\37_AdaptiveMicroAction.png`
- 实际页面：`http://127.0.0.1:5173/pages/action/index`
- 实际截图：`artifacts/screenshots/action-before-ui-rework-current.png`
- 实测视口：390x844；当前文档宽度 390px，高度 1056px，未发现横向溢出。

本审查实际打开了两张 PNG Reference，而非只读取目录 README。所有结论以下列两张 Reference 的信息架构、首屏结构和视觉层级为准。

## Reference #6 区域拆解

1. 深暮蓝夜景 Hero：品牌、月亮、树影、主标题和一句低压副标题；Hero 约占首屏上半部。
2. 单一暖白纸张容器：标题为“今晚的行动”，只呈现一个真实的小行动。
3. 行动标题为最大内容；下方才是时长、约定和一句完成说明。
4. 主按钮“我愿意试试”全宽且位于行动卡底部；“换一个更小的版本”为次级按钮。
5. 只显示一条优先 follow-up 提示，不出现待回顾列表。
6. 底部有四个同等权重的辅助入口：先别发出去、一个重要决定、找现实中的人、留给未来的我。
7. 底部导航独立且固定，Action 使用松绿色选中态。

## Reference #37 区域拆解

1. 延续夜景 Hero，标题“没做到也没关系”，副标题直接说明“再缩小一点”。
2. 先以一张横向轻卡说明“上一次的小行动”，不继续展示完整 Action 首页。
3. “什么让它变难了？”后只有六个可见 barrier 选择，使用松绿色实心选中态。
4. AI 返回后以一张主纸张区展示更小一步、时长和难度，行动标题是视觉主角。
5. 主按钮“试试这个更小一步”与次按钮“我想换一个”固定在内容底部附近，不要求滚动到长表单末尾。
6. 仍保持同一套底部导航和安全区。

## 当前 ActionCenter 实测问题

| 区域 | 当前实际状态 | 与 #6/#37 的差异 | 返工目标 |
| --- | --- | --- | --- |
| Hero | “把想法变成一小步”，当前树景为较硬的圆角图块 | 标题、色彩和首屏语义均不一致；缺少 #6 的“今晚，只做这一件事”焦点 | 改为夜景品牌 Hero，使用 #6/#37 的标题层级、月亮/树影留白和低压副标题。 |
| 行动主区 | 当前显示工程化“今晚的行动”卡、时间线按钮、说明、textarea | 已接受状态首屏塞入回顾输入框，不符合 #6 的“一个行动 + 两个决策” | 空态、推荐、已接受分别只呈现一个主任务；已接受状态移除默认 textarea。 |
| 推荐状态 | 现有实现虽然可请求真实 AI Job，但 CTA 文案为“给我一个可确认的建议” | 缺少 #6 的单一纸张比例、最大行动标题、预计时长、约定和精确 CTA | 保留 API/轮询，重构为 #6 行动纸张，CTA 改为“帮我整理一个小行动”/“我愿意试试”。 |
| Follow-up | 现页显示“待回顾 2”和两条“回顾这次行动” | 与 #6 的单条优先回访完全不一致，也造成首屏拥挤 | 首页仅计算并显示最优先一条；其他回访只在通知中心展示。 |
| 辅助能力 | `Decision`、`Cooldown`、`Handoff`、`SupportPlan`、`Memory` 和保存记录仍在 Action 一级页面结构内 | 形成多屏管理页，暴露业务状态词并破坏手机应用焦点 | 保留接口与路由，只留四张视觉入口；移除一级页的完整表单、历史记录和工程状态。 |
| Adaptive | 现有 `missedAction` 是主页面中的内联卡片 | 不符合 #37 的独立全屏/85dvh Sheet；输入区与前页面内容混在一起 | 采用全屏状态或 85dvh Bottom Sheet，按 #37 的上一次行动、barrier、缩小行动顺序呈现。 |
| Barrier | 当前有 7 项，包含“临时发生别的事” | #37 只有 6 项，且选中态、网格比例与层级不一致 | 可保持后端枚举，但 UI 显示 #37 的 6 个主选择；“其他”承接现有 `other`。 |
| CTA | 当前“完成并回顾”“没做到”与输入框同屏 | 主次关系不清、按钮过小，且主状态存在 textarea | “做到了”先打开反思 Bottom Sheet；“没做到”立即进入 #37 Adaptive UI。 |
| 底部导航 | 现有导航功能可用，Action 选中正确 | 周围内容高度和卡片堆叠使导航视觉上压进内容区 | 统一安全区和底部留白，保持 Action 松绿色选中态。 |
| 数据卫生 | 实际 DOM 与截图显示 `通知验证行动 1786977695532` | 普通运行时暴露 browser test fixture，违反产品呈现要求 | 审查并隔离 `real-browser-first-batch` 及相关脚本产生的数据；测试结束自动清理。 |

## 当前实现中必须保留的真实能力

- `POST /api/v1/journeys/:id/action-plan` 及 AiJob 轮询。
- `POST /api/v1/journeys/:id/actions` 保存已接受行动。
- `POST /api/v1/actions/:id/checkin` 的 completed/missed 状态。
- `POST /api/v1/actions/:id/adaptive-plan` 及 AiJob 轮询。
- `POST /api/v1/actions/:id/adapt` 保存更小行动。
- Journey、Action、Notification、RealityHandoff 等既有数据库和 API 合同。

## 视觉验收门槛

Action #6 和 Adaptive #37 只有同时满足以下项才可标记通过：

1. 区域顺序、Hero 高度、单主纸张容器和 CTA 位置接近 Reference。
2. 推荐状态首屏可见“今晚，只做这一件事”、真实行动标题和“我愿意试试”。
3. Adaptive 状态首屏可见“没做到也没关系”、barrier 选择和缩小行动主区。
4. 无巨大开发工具区、JSON、provider/job id、测试 fixture 或工程状态词。
5. 375x812、390x844、393x852、430x932 下无横向滚动、截断或 tabBar 遮挡。
6. 真实点击仍可造成 API、数据库、刷新读取和通知/时间线状态变化。

## 本次实施边界

本阶段只返工 `ActionCenter` 与其必要的 Action 子组件、测试隔离和 Reference QA。`TonightHome`、`JourneyDetail`、`SafetySupport`、`RealityHandoff`、`NotificationCenter`、Peer、Me、Report、Admin、AI Provider 和数据库模型均不在本阶段修改范围内。
