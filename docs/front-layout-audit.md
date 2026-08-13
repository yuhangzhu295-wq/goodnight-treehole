# GoodnightTreeHole 前台 01-14 排版审计

生成时间：2026-07-07

本审计基于真实路由截图，不基于静态设计图拼贴。修前截图目录：`artifacts/screenshots/layout-before/`。设计图目录：`design_refs/front/`。

## 01-广场

- 当前截图路径：`artifacts/screenshots/layout-before/01-square.png`
- 设计图路径：`design_refs/front/01-square.png`
- 发现的问题：分类胶囊横向滚动可接受，但视觉边缘过满；第二张卡片底部被 tabBar 与写心情按钮压迫；右下写心情按钮离卡片正文较近。
- 具体修复方案：隐藏横向滚动条、增加列表底部安全区、降低浮动写心情按钮对卡片底部的压迫感。
- 是否需要调字体：局部，卡片正文保持 14-15px。
- 是否需要调卡片高度：需要，树洞卡片需要给底部动作区更多空间。
- 是否需要调 line-height：需要，正文保持 1.6 以上。
- 是否需要调 padding / margin：需要，卡片底部与列表底部增加 padding。
- 是否需要调图片位置：需要，右侧插画不能压正文。
- 是否需要调底部安全区：需要。

## 02-写下心情

- 当前截图路径：`artifacts/screenshots/layout-before/02-mood-create.png`
- 设计图路径：`design_refs/front/02-mood-create.png`
- 发现的问题：当前已接近设计，但整体纵向仍很满；发布按钮贴底；回应方式横向胶囊右侧被截断提示不够柔和。
- 具体修复方案：保留无 tabBar 表单页结构，给发布按钮增加安全底距；回应方式横向滚动隐藏滚动条并增加右侧淡出空间。
- 是否需要调字体：轻微，表单小标题可保持 15px。
- 是否需要调卡片高度：不需要大改。
- 是否需要调 line-height：textarea 需保持 1.55 以上。
- 是否需要调 padding / margin：需要，底部提交区增加安全区。
- 是否需要调图片位置：不需要。
- 是否需要调底部安全区：需要。

## 03-树洞详情

- 当前截图路径：`artifacts/screenshots/layout-before/03-post-detail.png`
- 设计图路径：`design_refs/front/03-post-detail.png`
- 发现的问题：主卡片顶部头像/标题/更多按钮较高；快捷回复胶囊横向内容右侧存在截断；底部输入条覆盖第二条回复开头。
- 具体修复方案：增加详情页底部内容 padding，快捷回复区域隐藏滚动条并保留左右留白；回复卡片底部留出固定输入条安全空间。
- 是否需要调字体：局部，回复卡片正文略小。
- 是否需要调卡片高度：需要，回复卡片最小高度增加。
- 是否需要调 line-height：需要。
- 是否需要调 padding / margin：需要。
- 是否需要调图片位置：需要确保头像不挤压作者信息。
- 是否需要调底部安全区：需要。

## 04-树洞详情-回复抽屉

- 当前截图路径：`artifacts/screenshots/layout-before/04-post-detail-reply-sheet.png`
- 设计图路径：`design_refs/front/04-post-detail-reply-sheet.png`
- 发现的问题：抽屉内容可用，但快捷回复区和设置区偏紧；抽屉内按钮靠底较近。
- 具体修复方案：保持 bottom sheet 非独立路由，增加 textarea 与设置行内部留白，快捷回复允许换行并保持 8-10px gap。
- 是否需要调字体：轻微。
- 是否需要调卡片高度：sheet 高度需保持合理。
- 是否需要调 line-height：textarea 需要。
- 是否需要调 padding / margin：需要。
- 是否需要调图片位置：不需要。
- 是否需要调底部安全区：需要。

## 05-今日回信

- 当前截图路径：`artifacts/screenshots/layout-before/05-letter-today.png`
- 设计图路径：`design_refs/front/05-letter-today.png`
- 发现的问题：今日小建议标题和按钮区贴近底部 tabBar，三个建议按钮被底栏视觉压住；回信正文卡高度占用过大，导致建议区被挤到首屏底部；操作按钮之间间距不足。
- 具体修复方案：压缩信纸卡无效空白但保留正文阅读行高；建议区改为独立层级并增加底部安全区；三个建议按钮使用可换行 flex，gap 不小于 10px；操作按钮 min-height 和文字居中统一。
- 是否需要调字体：需要，建议按钮 13-14px。
- 是否需要调卡片高度：需要，自适应而不是固定过高。
- 是否需要调 line-height：需要，正文 1.6 以上。
- 是否需要调 padding / margin：需要，建议区和底栏间距。
- 是否需要调图片位置：需要，叶子装饰不能占正文。
- 是否需要调底部安全区：需要。

## 06-情绪工具

- 当前截图路径：`artifacts/screenshots/layout-before/06-tool-index.png`
- 设计图路径：`design_refs/front/06-tool-index.png`
- 发现的问题：工具卡片纵向过高，底部横幅“每一种情绪都值得被看见”被挤出首屏并可能被 tabBar 压住；部分工具标题换行造成卡片内文字重心不稳；主功能卡插画背景仍有方形裁片感。
- 具体修复方案：统一工具卡片高度，压缩图标尺寸与文案行高；底部横幅重做为 flex 布局，左心形、中间文案、右侧小精灵，文案只渲染一次；增加工具页底部安全区。
- 是否需要调字体：需要，工具卡标题 14-15px。
- 是否需要调卡片高度：需要。
- 是否需要调 line-height：需要。
- 是否需要调 padding / margin：需要。
- 是否需要调图片位置：需要，主卡插画不能压文字且不能有白块。
- 是否需要调底部安全区：需要。

## 07-情绪拆解

- 当前截图路径：`artifacts/screenshots/layout-before/07-tool-decompose.png`
- 设计图路径：`design_refs/front/07-tool-decompose.png`
- 发现的问题：输入卡片可读，但页面中部留白过大；底部 tabBar 使页面显得空但仍占底部空间；结果卡出现后需要防止四项拥挤。
- 具体修复方案：调整输入卡片高度和按钮区位置；结果卡四项使用分隔线和足够 padding；底部按钮组不贴边。
- 是否需要调字体：轻微。
- 是否需要调卡片高度：需要。
- 是否需要调 line-height：需要。
- 是否需要调 padding / margin：需要。
- 是否需要调图片位置：不需要。
- 是否需要调底部安全区：需要。

## 08-我的

- 当前截图路径：`artifacts/screenshots/layout-before/08-me.png`
- 设计图路径：`design_refs/front/08-me.png`
- 发现的问题：情绪成长卡三列数字、单位、说明仍偏紧；分隔线穿过统计内容高度；“查看我的成长”按钮离三列过近；清空按钮虽然可见但与 tabBar 间距偏小。
- 具体修复方案：成长卡三列改为明确三行：标签、数字、单位说明；分隔线只覆盖统计区中段；按钮与统计区拉开 10-12px；清空按钮下方增加安全区。
- 是否需要调字体：需要，数字控制在 24-26px。
- 是否需要调卡片高度：需要，成长卡略增高但不挤菜单。
- 是否需要调 line-height：需要。
- 是否需要调 padding / margin：需要。
- 是否需要调图片位置：需要，叶子装饰降透明且不在数字下方。
- 是否需要调底部安全区：需要。

## 09-我的日记

- 当前截图路径：`artifacts/screenshots/layout-before/09-diary-list.png`
- 设计图路径：`design_refs/front/09-diary-list.png`
- 发现的问题：真实数据卡片文字较多，部分日记卡片高度偏紧；最后一条被 tabBar 遮挡风险高。
- 具体修复方案：日记卡片增加 padding 和底部安全区，标题/日期/链接行分层。
- 是否需要调字体：局部。
- 是否需要调卡片高度：需要。
- 是否需要调 line-height：需要。
- 是否需要调 padding / margin：需要。
- 是否需要调图片位置：不需要。
- 是否需要调底部安全区：需要。

## 10-情绪月报

- 当前截图路径：`artifacts/screenshots/layout-before/10-report-month.png`
- 设计图路径：`design_refs/front/10-report-month.png`
- 发现的问题：月报首卡三列统计略拥挤；情绪分布和关键词区域在底栏附近被遮挡；真实图表与设计图插画有差异。
- 具体修复方案：统计卡三列分层；报告页底部 padding 增加；图表卡保持足够高度。
- 是否需要调字体：需要。
- 是否需要调卡片高度：需要。
- 是否需要调 line-height：需要。
- 是否需要调 padding / margin：需要。
- 是否需要调图片位置：图表无需改成静态图。
- 是否需要调底部安全区：需要。

## 11-我的回信

- 当前截图路径：`artifacts/screenshots/layout-before/11-letter-list.png`
- 设计图路径：`design_refs/front/11-letter-list.png`
- 发现的问题：回信卡片按钮区偏高，摘要正文和按钮之间间距不足；第三张卡片被 tabBar 遮挡风险高。
- 具体修复方案：卡片内容区增加 padding；按钮组高度统一；列表底部加安全空间。
- 是否需要调字体：轻微。
- 是否需要调卡片高度：需要。
- 是否需要调 line-height：需要。
- 是否需要调 padding / margin：需要。
- 是否需要调图片位置：不需要。
- 是否需要调底部安全区：需要。

## 12-我的收藏

- 当前截图路径：`artifacts/screenshots/layout-before/12-favorite-list.png`
- 设计图路径：`design_refs/front/12-favorite-list.png`
- 发现的问题：收藏卡片首屏留白较多但结构稳定；取消收藏按钮与卡片正文距离可再拉开。
- 具体修复方案：保持三段 tab 比例，卡片正文增加 line-height，底部安全区维持。
- 是否需要调字体：轻微。
- 是否需要调卡片高度：不需要大改。
- 是否需要调 line-height：需要。
- 是否需要调 padding / margin：需要。
- 是否需要调图片位置：不需要。
- 是否需要调底部安全区：需要。

## 13-隐私设置

- 当前截图路径：`artifacts/screenshots/layout-before/13-privacy-settings.png`
- 设计图路径：`design_refs/front/13-privacy-settings.png`
- 发现的问题：switch 已是自定义样式但行内文字和开关横向空间偏紧；底部操作按钮过于扁长。
- 具体修复方案：设置行 grid 宽度固定开关列，标题和说明保持 1.45 以上行高；操作按钮增加 min-height。
- 是否需要调字体：轻微。
- 是否需要调卡片高度：需要。
- 是否需要调 line-height：需要。
- 是否需要调 padding / margin：需要。
- 是否需要调图片位置：不需要。
- 是否需要调底部安全区：需要。

## 14-帮助与反馈

- 当前截图路径：`artifacts/screenshots/layout-before/14-feedback-help.png`
- 设计图路径：`design_refs/front/14-feedback-help.png`
- 发现的问题：FAQ 行高可读但偏厚；反馈 textarea 下半部分被 tabBar 遮挡风险高；提交按钮在首屏外。
- 具体修复方案：反馈表单区增加底部安全 padding；textarea 字数统计不压 placeholder；上传框和提交按钮保持足够高度。
- 是否需要调字体：轻微。
- 是否需要调卡片高度：需要。
- 是否需要调 line-height：需要。
- 是否需要调 padding / margin：需要。
- 是否需要调图片位置：不需要。
- 是否需要调底部安全区：需要。

## 分组修复顺序

1. 第一组：05-今日回信、06-情绪工具、08-我的。
2. 第二组：01-广场、02-写下心情、03-树洞详情、04-回复抽屉。
3. 第三组：07-情绪拆解、09-我的日记、10-情绪月报、11-我的回信、12-我的收藏、13-隐私设置、14-帮助与反馈。

每组完成后必须重新截图、运行 overlap / 横向溢出 / 卡片间距 / safe-area 检查，并跑真实点击回归。
