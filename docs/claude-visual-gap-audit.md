# 晚安树洞前台 01-14 修前视觉差距审计

生成时间：2026-07-07

## 审计结论

当前前台 01-14 已具备真实路由、按钮事件和 API 交互基础，但视觉层仍属于“相似实现”，不是设计稿 1:1 还原。主要差距集中在：

- H5 入口缺少 `viewport` 元信息，移动端截图时页面按 980px 布局居中缩小，导致整体尺度与设计稿不一致。
- 顶部水彩树、芽仔、信封、花叶边框、底部横幅等关键设计资产未按局部素材还原，当前多为 CSS 图形或简化占位。
- 多数卡片圆角、阴影、边框、间距、按钮大小和字体层级与设计稿有偏差。
- 04 不是独立路由，而是 03 详情页内 bottom sheet 状态；当前状态已能打开，但视觉遮罩、抽屉高度、卡片层级与设计稿差异最大。
- 当前 14 页截图均未发现横向滚动条。

## 审计产物

- 修前截图目录：`artifacts/screenshots/claude-before/`
- 修前联系图：`artifacts/screenshots/claude-before-contact.png`
- 修前 diff 目录：`artifacts/diffs/claude-front/before/`
- 修前 diff JSON：`artifacts/diffs/claude-front/before-report.json`

## 逐页差距表

| 页面 | 当前截图 | 设计图 | diffRate | 横向滚动 | 主要差距 | 必修元素 |
| --- | --- | --- | ---: | --- | --- | --- |
| 01-广场 | `artifacts/screenshots/claude-before/01-square.png` | `design_refs/front/01-square.png` | 0.1409 | 否 | 页面被居中缩小；顶部树洞标题与水彩树比例不符；分类胶囊、帖子卡片、悬浮写心情按钮和底栏位置不贴设计稿。 | viewport、树洞页头局部素材、分类胶囊、帖子卡片、底栏、FAB |
| 02-写下心情 | `artifacts/screenshots/claude-before/02-mood-create.png` | `design_refs/front/02-mood-create.png` | 0.1707 | 否 | 输入卡、心情选择区、匿名设置、提交按钮整体尺寸偏小；右上树与小芽仔装饰缺失。 | 表单大卡、情绪胶囊、匿名开关、发布按钮、局部花叶素材 |
| 03-树洞详情 | `artifacts/screenshots/claude-before/03-post-detail.png` | `design_refs/front/03-post-detail.png` | 0.1135 | 否 | 详情页卡片层级、作者信息、回复列表、行动按钮与设计稿间距不同；插画资产仍偏占位。 | 详情主卡、回复卡、真实按钮状态、花叶边框 |
| 04-树洞详情-回复抽屉打开态 | `artifacts/screenshots/claude-before/04-post-detail-reply-sheet.png` | `design_refs/front/04-post-detail-reply-sheet.png` | 0.4082 | 否 | bottom sheet 打开逻辑存在，但遮罩、抽屉高度、圆角、输入区和操作按钮与设计稿差距极大。 | 03 页内 bottom sheet 状态、遮罩、抽屉卡、回复输入区 |
| 05-今日回信 | `artifacts/screenshots/claude-before/05-letter-today.png` | `design_refs/front/05-letter-today.png` | 0.1197 | 否 | 信件卡片、语气切换、按钮组和建议区视觉层级不足；装饰花叶/芽仔缺少设计稿水彩感。 | 今日信件卡、语气分段控件、保存/分享/换风格按钮 |
| 06-情绪工具 | `artifacts/screenshots/claude-before/06-tool-index.png` | `design_refs/front/06-tool-index.png` | 0.1367 | 否 | 顶部树洞插画、工具宫格、横幅、底栏尺度与设计稿不一致；卡片图标仍偏简单。 | 工具页头、主推荐横幅、2 列工具宫格、底部标语 |
| 07-情绪拆解 | `artifacts/screenshots/claude-before/07-tool-decompose.png` | `design_refs/front/07-tool-decompose.png` | 0.1246 | 否 | 输入区和结果卡结构存在，但视觉未贴近设计稿的纸张质感、标签与按钮层级。 | 拆解输入卡、分析结果卡、真实生成按钮 |
| 08-我的 | `artifacts/screenshots/claude-before/08-me.png` | `design_refs/front/08-me.png` | 0.0895 | 否 | 页面整体接近但仍缩小居中；成长卡、菜单列表、清空记录危险按钮的间距/圆角/插画不够贴合。 | 成长卡、菜单行、危险按钮、底栏 |
| 09-我的日记 | `artifacts/screenshots/claude-before/09-diary-list.png` | `design_refs/front/09-diary-list.png` | 0.1477 | 否 | 列表卡片、筛选标签、空态/内容态装饰和右上树洞素材差异明显。 | 日记列表卡、筛选胶囊、写日记入口 |
| 10-情绪月报 | `artifacts/screenshots/claude-before/10-report-month.png` | `design_refs/front/10-report-month.png` | 0.1557 | 否 | 统计图、趋势区、情绪分布、建议卡的版式与设计稿差异较大。 | 月报统计卡、折线/柱状视觉、情绪分布、建议卡 |
| 11-我的回信 | `artifacts/screenshots/claude-before/11-letter-list.png` | `design_refs/front/11-letter-list.png` | 0.1338 | 否 | 回信列表、状态标签、收藏/已读动作的视觉层级和图标素材不够贴合。 | 回信列表卡、筛选、收藏/已读按钮 |
| 12-我的收藏 | `artifacts/screenshots/claude-before/12-favorite-list.png` | `design_refs/front/12-favorite-list.png` | 0.1120 | 否 | 收藏列表功能存在，但收藏状态、卡片纹理、右侧动作区与设计稿不一致。 | 收藏卡、取消收藏按钮、状态标签 |
| 13-隐私设置 | `artifacts/screenshots/claude-before/13-privacy-settings.png` | `design_refs/front/13-privacy-settings.png` | 0.0984 | 否 | 设置项已可交互，但开关样式、分组卡、底部说明与设计稿仍有偏差。 | 设置分组、真实开关、数据政策入口 |
| 14-帮助与反馈 | `artifacts/screenshots/claude-before/14-feedback-help.png` | `design_refs/front/14-feedback-help.png` | 0.1360 | 否 | FAQ、反馈表单、类别选择与设计稿卡片比例和花叶装饰不一致。 | FAQ 折叠项、反馈表单、提交按钮、帮助入口 |

## 修复原则

- 不使用整张设计图作为页面背景或覆盖层。
- 只允许从设计图裁剪局部装饰素材，例如树洞页头、花叶边角、芽仔/信封/工具图标等。
- 保留现有真实接口、路由、状态和按钮事件。
- 04 继续作为 03 详情页内 bottom sheet 状态验证。
- 修后必须重新输出 `claude-after` 截图、`claude-front` diff、真实点击测试和 API 回归结果。
