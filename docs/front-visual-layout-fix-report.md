# 晚安树洞前台视觉排版精修报告

生成时间：2026-07-08

## 1. 本轮修复页面

本轮只处理前台视觉排版，不重写业务逻辑，不删除 API，不替换为静态图。

- 01-广场：`/pages/square/index`
- 02-写下心情：`/pages/mood/create`
- 03-树洞详情：`/pages/post/detail`
- 04-树洞详情-回复抽屉：`/pages/post/detail?sheet=reply`
- 05-今日回信：`/pages/letter/index`
- 06-情绪工具：`/pages/tool/index`
- 08-我的：`/pages/me/index`

## 2. 公共视觉修复

- 新增统一主题变量文件：`apps/mp/src/styles/goodnight-theme.scss`。
- 前台页面统一接入 `.goodnight-page`，设置治愈米色背景、禁止横向溢出、预留底部安全区。
- 统一底部 tabBar 固定样式，选中态改为绿色治愈风，去掉橙色描边。
- 顶部大树素材改为透明裁切版，并叠加柔和渐隐，减少硬切和右侧压迫感。
- 新增透明装饰素材，修复插画白底方块：
  - `apps/mp/src/assets/goodnight/tree-top-cutout.png`
  - `apps/mp/src/assets/goodnight/square-baby-cutout.png`
  - `apps/mp/src/assets/goodnight/letter-envelope-cutout.png`
  - `apps/mp/src/assets/goodnight/tool-baby-letter-cutout.png`
  - `apps/mp/src/assets/goodnight/letter-baby-cutout.png`
- 装饰图均作为 CSS 装饰层使用，未作为整页截图覆盖，且不承担按钮点击。

## 3. 分页修复说明

### 01-广场

- 分类栏改为可横向滚动但隐藏滚动条，压缩按钮内距，避免“工作”等分类被裁断。
- 动态卡片重排为头像、昵称、标签、时间、更多按钮、正文、右侧插画、回应状态、操作区的清晰结构。
- 卡片右侧插画改用透明小精灵素材，降低正文被压窄和白底矩形问题。
- “写心情”悬浮按钮提高到底部 tabBar 上方，避免贴近 tabBar。
- tabBar 广场选中态改为绿色。

### 02-写下心情

- textarea 禁用 resize，字数统计改为独立圆角浮层，不再和右下角挤在一起。
- 心情选项改为更接近圆形头像式按钮。
- “谁可以看见”两张卡片完整显示，并保留选择状态。
- “想收到怎样的回应”按钮支持换行，不再被裁切。
- 发布按钮保留真实提交行为，并与底部留白保持安全距离。

### 03-树洞详情

- 详情页接入统一背景和底部安全区。
- 调整回复列表、操作按钮和底部抽屉之间的空间，避免固定底部元素遮挡正文。
- 保留抱抱、回复、抽屉打开等真实交互。

### 04-树洞详情-回复抽屉

- 保持 04 不是独立路由，而是 03 页面内 bottom sheet 状态。
- 回复输入框禁用 resize，抽屉内容高度和底部安全区重新整理。
- 验证了输入内容、关闭抽屉后 DOM 状态正常变化。

### 05-今日回信

- 信封插画改用透明裁切素材，去掉明显白底矩形。
- 回信卡片增加 padding，正文 line-height 提升到 1.75 以上。
- “换一种风格 / 已保存 / 分享图片”按钮高度提升，点击区更稳定。
- “今日小建议”按钮改为 flex-wrap，文案区域压缩到安全高度，避免拥挤和 tabBar 遮挡。
- 保留重新生成、保存、分享弹窗等真实交互。

### 06-情绪工具

- 主卡片右侧小人改用透明裁切素材，去掉白底方块。
- 双列工具卡片统一高度和 gap，卡片文字层级更清楚。
- 底部横幅改为单一文字层，不再叠字。
- 横幅高度压缩到接近设计图，底部不再留下巨大空白。
- tabBar 工具选中态保持绿色。

### 08-我的

- 用户卡片改为半悬浮在顶部背景下方，且容器允许溢出显示，不再被裁切。
- 情绪成长卡三列统计重排为标题、数字、单位三行，数字和单位不再拥挤。
- 分隔线改为卡片内部装饰，不穿过文字。
- 菜单行高度调整到 68px 左右，图标增加圆形承载，风格更接近设计图。
- 清空记录按钮上下留白重新整理。
- tabBar 我的选中态保持绿色。

## 4. API 与真实按钮保留情况

已保留现有 API、store、router 和按钮事件。本轮验证中通过真实点击确认：

- 广场分类“工作”点击后有选中变化。
- 广场“抱抱”点击后数量从 30 变为 31。
- 广场更多菜单可打开和取消。
- 广场回复按钮可进入详情并打开回复抽屉。
- 写心情发布走真实接口并跳转。
- 详情回复抽屉可输入并关闭。
- 今日回信可重新生成、保存、打开分享弹窗。
- 情绪工具卡可跳转到今日回信和情绪拆解。
- 我的页用户卡可跳转个人资料。
- 我的页清空记录可打开确认弹窗。

## 5. 横向滚动条

浏览器验证结果：所有检查页面 `overflow` 均为 0，未发现可见横向滚动条。

## 6. 白底插画

已处理大树、小精灵、信封、工具页主卡片小人等主要白底插画问题。当前页面不再使用整页截图覆盖，透明素材只承担装饰展示。

## 7. tabBar 遮挡

已统一增加底部安全区，并提高悬浮按钮距离。重点页面 02、03、04、06 在验证脚本中没有 tabBar 遮挡。

05 今日回信的验证脚本曾标记 `advice-section` 容器底部进入 tabBar 区域 8px，但复核实际文字和按钮底部均在 tabBar 上方：建议按钮底部约 653px，文案底部约 678px，tabBar 顶部约 682px，因此没有可见文字或按钮被遮挡。

01 广场和 08 我的在首屏长列表场景下，滚动内容容器会经过固定 tabBar 背后，这是移动端固定导航的正常滚动行为；页面底部已预留 padding，可继续向下滚动查看，不影响按钮点击。

## 8. 数字拥挤

08 我的页情绪成长卡已重排三列统计，数字、单位、说明分行显示，并调整分隔线位置。当前没有数字贴边、单位贴数字或分隔线穿字的问题。

## 9. 截图与验证产物

截图目录：`artifacts/screenshots/front-visual-layout-fix/`

- `artifacts/screenshots/front-visual-layout-fix/01-square.png`
- `artifacts/screenshots/front-visual-layout-fix/02-mood-create.png`
- `artifacts/screenshots/front-visual-layout-fix/03-post-detail.png`
- `artifacts/screenshots/front-visual-layout-fix/04-post-detail-reply-sheet.png`
- `artifacts/screenshots/front-visual-layout-fix/05-letter-today.png`
- `artifacts/screenshots/front-visual-layout-fix/06-tool-index.png`
- `artifacts/screenshots/front-visual-layout-fix/08-me.png`
- `artifacts/screenshots/front-visual-layout-fix/front-visual-layout-fix-validation.json`

## 10. 自动验证结果

- `pnpm lint`：通过。
- `pnpm typecheck`：通过。
- 真实浏览器截图与点击验证：通过主要业务流。
- `pnpm diagnose:front-layout`：曾因执行时间较长超时，但已生成横向溢出、文本重叠、安全区等诊断报告；其中横向溢出和文本重叠均未发现硬性问题。

## 11. 仍然不一致的地方

- 当前是按设计图视觉结构精修，不是逐像素还原；顶部树图由于使用响应式裁切，不同视口下和参考图会有少量位置差异。
- 01 广场和 08 我的长内容在首屏截图中会经过固定 tabBar 背后，但滚动留白可正常查看；如果要求截图首屏完全不出现任何内容在 tabBar 背后，需要进一步缩短首屏内容或改为非固定 tabBar。
- 05 今日回信为了避免建议区域被 tabBar 遮挡，文案字号和间距做了轻微压缩，和参考图可能存在细小差别。

## 12. 下一步建议

- 对 09-14 继续做同样粒度的逐页视觉审查，尤其是列表页、设置页和反馈页的固定底部安全区。
- 给视觉验证脚本增加更细的元素级规则，区分“容器背景进入 tabBar”与“文字或按钮被遮挡”。
- 将透明裁切素材的生成脚本固化到项目工具命令，后续替换设计稿时可以稳定复用。
