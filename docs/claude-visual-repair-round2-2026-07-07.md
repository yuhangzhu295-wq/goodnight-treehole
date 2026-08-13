# 晚安树洞前台视觉修复二轮报告

生成时间：2026-07-07

## 本轮修复重点

- 02-写下心情：按设计图恢复首屏表单密度，隐藏写心情页不应出现的底部 tabbar，心情选择改为一行 6 个圆形选项，补齐 2 个图片占位，并让发布按钮回到首屏底部。
- 05-今日回信：移除污染裁片背景，改用干净信封和透明底叶子素材；返回箭头改为绝对定位，避免把标题和正文整体往下顶；压紧正文卡和建议区，避免底栏遮挡建议按钮。
- 08-我的：补回设计图中的“晚安树洞”头部文案，头像改用干净头像裁片，成长卡叶子改为透明底素材，清空按钮完整露出在底栏上方。
- 通用素材：重新裁剪 `tree-top.png`，避免页头树图带入其他卡片边缘；为叶子装饰增加浅色背景透明化处理，避免截图白块叠在卡片里。

## 关键改动文件

- `apps/mp/src/views/MoodCreate.vue`
- `apps/mp/src/views/Me.vue`
- `apps/mp/src/styles.scss`
- `scripts/visual/extract-design-assets.ts`
- `apps/mp/src/assets/goodnight/*`

## 全量视觉回归

截图目录：`artifacts/screenshots/claude-after/`

| 页面 | diffRate |
| --- | ---: |
| 01-square | 16.40% |
| 02-mood-create | 18.12% |
| 03-post-detail | 15.68% |
| 04-post-detail-reply-sheet | 15.93% |
| 05-letter-today | 16.25% |
| 06-tool-index | 17.30% |
| 07-tool-decompose | 18.34% |
| 08-me | 11.71% |
| 09-diary-list | 16.57% |
| 10-report-month | 20.78% |
| 11-letter-list | 15.64% |
| 12-favorite-list | 13.86% |
| 13-privacy-settings | 13.10% |
| 14-feedback-help | 16.60% |

## 自动验证

- `pnpm lint`：通过
- `pnpm typecheck`：通过
- `pnpm qa:first5`：通过
- `pnpm qa:front-rest`：通过
- `pnpm qa:visual-front`：通过

## 浏览器抽查

- 02 `/pages/mood/create`：无横向滚动；底部 tabbar 隐藏；发布按钮位于视口 `724-764`。
- 05 `/pages/letter/index`：无横向滚动；正文卡位于 `302-572`；建议按钮行位于 `669-703`，不再被正文卡或污染背景覆盖。
- 08 `/pages/me/index`：无横向滚动；菜单列表位于 `439-645`；清空按钮位于 `655-697`，完整位于底栏上方。

## 仍有差异的原因

当前页面使用真实 API 数据和可交互列表，部分设计图为静态示例文本，因此 diff 不会归零。10-情绪月报的差异最高，主要来自真实图表和月报数据与设计图固定插画图表不同；这不影响真实交互回归。
