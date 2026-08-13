# 晚安树洞前台 01-14 视觉修复报告

生成时间：2026-07-07

## 修复范围

- 修复 H5 入口缺少 `viewport` 导致移动端截图缩小居中的问题。
- 增加前台视觉自动化脚本：截图、像素 diff、局部素材裁剪、视觉 QA。
- 从设计图裁剪局部素材到 `apps/mp/src/assets/goodnight/`，包括树洞页头、芽仔头像、工具图标、回信/底部花叶等；未使用整张设计稿作为页面背景。
- 调整 01-14 的全局纸感、卡片、胶囊按钮、底栏、树洞页头、工具卡、回复 bottom sheet 和列表页视觉层级。
- 修复 04 回复 bottom sheet 过高、底部按钮不可见的问题。
- 修复视觉调整带来的点击遮挡：浮动提示不再拦截点击，详情页快捷抱抱留出底部安全空间。
- 保留现有真实路由、真实 API、按钮事件、store 和诊断脚本。

## 新增/更新命令

- `pnpm visual:extract-assets`
- `pnpm visual:capture-front`
- `pnpm visual:compare-front`
- `pnpm visual:front-audit`
- `pnpm visual:pixel-front`
- `pnpm visual:pixel-front:page -- 01`
- `pnpm qa:visual-front`

## 视觉结果

| 页面 | diffRate |
| --- | ---: |
| 01-square | 15.80% |
| 02-mood-create | 18.29% |
| 03-post-detail | 14.74% |
| 04-post-detail-reply-sheet | 14.66% |
| 05-letter-today | 16.77% |
| 06-tool-index | 17.08% |
| 07-tool-decompose | 18.34% |
| 08-me | 11.17% |
| 09-diary-list | 16.59% |
| 10-report-month | 20.67% |
| 11-letter-list | 15.64% |
| 12-favorite-list | 13.89% |
| 13-privacy-settings | 13.11% |
| 14-feedback-help | 16.59% |

## 验证结果

- `pnpm qa:visual-front`：通过。
- `pnpm lint`：通过。
- `pnpm typecheck`：通过。
- `pnpm qa:first5`：通过。
- `pnpm qa:front-rest`：通过。
- `pnpm diagnose:first5`：通过。
- `pnpm diagnose:front-rest`：通过。
- 应用内浏览器抽查：通过，底栏工具、情绪拆解、我的页均可真实点击跳转；我的页成长卡接口加载成功且无 console error。

## 产物目录

- 修前截图：`artifacts/screenshots/claude-before/`
- 修后截图：`artifacts/screenshots/claude-after/`
- diff：`artifacts/diffs/claude-front/`
- trace/video：`artifacts/traces/claude-front/`
- 修前审计：`docs/claude-visual-gap-audit.md`
- 逐页检查表：`docs/claude-page-by-page-visual-checklist.md`

## 残余差异

- 10-情绪月报 diff 最高，因为当前页面使用真实月报数据和可交互图表，设计稿是固定插画式图表。
- 02、07、09、14 仍有 16%-18% 的视觉差异，主要来自真实数据、动态列表高度、专属插画未逐项完全裁切。
- 03/04 为了保留现有真实业务流，底栏仍保持全局可点击，详情页底部和纯设计稿存在少量差异。
- 当前目标已从“壳子不符/按钮不可点”修复到“真实交互通过且视觉接近设计稿”；若继续追求更低 diff，应针对 02、07、10 做逐元素专属插画和图表复刻。
