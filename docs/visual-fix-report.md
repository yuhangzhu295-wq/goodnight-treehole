# 晚安树洞视觉还原与布局修复报告

生成时间：2026-07-09

## 结论

本轮视觉修复没有把页面替换成整张截图，而是在现有真实业务组件上修复布局、主题 token、图片裁切、tabBar 安全区和滚动问题。最终验证：

- `pnpm test:visual`：通过。
- `pnpm diagnose:overflow`：通过，前台 14 页在 375/390/414/430 宽度无横向溢出。
- `pnpm diagnose:clickability`：通过，视觉层没有覆盖真实按钮。
- `pnpm qa:real-all`：通过。

## 统一主题与基础页面

- 新增/整理 `apps/mp/src/styles/goodnight-theme.scss`，统一 `--gn-bg`、`--gn-green`、`--gn-card`、`--gn-border`、`--gn-radius-card`、`--gn-shadow-card` 等治愈风 token。
- 所有前台页根容器统一 `.goodnight-page`：`min-height: 100vh`、`overflow-x: hidden`、`padding-bottom: calc(130px + env(safe-area-inset-bottom))`，避免底部 tabBar 遮挡正文。
- 底部 tabBar 激活态统一改回绿色系，取消橙色描边感。
- 装饰图片使用局部素材和 CSS 裁切融合，禁止整页截图覆盖，装饰素材不承载点击。

## 重点问题修复

| 问题 | 修复方式 | 验证 |
| --- | --- | --- |
| 顶部大树背景裁切硬、右侧压迫 | 用统一 hero 图层、渐变遮罩和 object-position 约束，让树图向背景自然过渡 | 前台截图 01/02/05/06/08 |
| 分类栏横向溢出、“工作”被截断 | 分类栏允许横向滚动并隐藏滚动条，按钮设定最小宽度和不压缩 | overflow 报告全 OK |
| 广场昵称、标签、时间断层 | 卡片头部拆成 avatar/meta/more 结构，昵称、标签、时间各自稳定排布 | 01-square 截图 |
| 广场插画挤压正文 | 卡片中部改为正文 + 固定宽度插画列，插画不参与文字流 | 01-square 截图 |
| “写心情”悬浮按钮离 tabBar 太近 | 提高 floating action bottom，保留至少 96px 间距 | 01-square 截图 |
| tabBar 橙色描边 | 改为绿色激活态和柔和阴影 | 01/05/06/08 截图 |
| 写心情 textarea 统计和 resize 角挤在一起 | 禁止 textarea resize，字数统计独立定位并留边距 | 02-mood-create 截图 |
| 写心情可见性/回应区域被底部遮挡 | 增加页面底部 padding 和区块间距 | 02-mood-create 截图 |
| 今日回信信封白底矩形 | 替换为透明局部素材/裁切容器，去除白底块 | 05-letter-today 截图 |
| 今日小建议拥挤 | 建议按钮使用 flex-wrap，正文与按钮分层 | 05-letter-today 截图 |
| 情绪工具主卡插画白底方块 | 改用透明素材或圆形裁切背景，不展示白色矩形边 | 06-tool-index 截图 |
| 情绪工具横幅叠字/空白 | 横幅文案只保留一次，限制高度与装饰位置 | 06-tool-index 截图 |
| 我的成长卡三列挤 | 三列按标题、数字、单位分层，分隔线不穿文字 | 08-me 截图 |
| 我的菜单行太紧、图标简陋 | 菜单行高度调整到 64-72px，图标/文字/箭头分列 | 08-me 截图 |
| 顶部树图与背景融合不自然 | 统一 hero 背景 token、遮罩和页面背景色 | 前台 01-14 截图 |

## 截图路径

前台最终截图：

- `artifacts/screenshots/front/01-square.png`
- `artifacts/screenshots/front/02-mood-create.png`
- `artifacts/screenshots/front/03-post-detail.png`
- `artifacts/screenshots/front/04-post-detail-reply-sheet.png`
- `artifacts/screenshots/front/05-letter-today.png`
- `artifacts/screenshots/front/06-tool-index.png`
- `artifacts/screenshots/front/07-tool-decompose.png`
- `artifacts/screenshots/front/08-me.png`
- `artifacts/screenshots/front/09-diary-list.png`
- `artifacts/screenshots/front/10-report-month.png`
- `artifacts/screenshots/front/11-letter-list.png`
- `artifacts/screenshots/front/12-favorite-list.png`
- `artifacts/screenshots/front/13-privacy-settings.png`
- `artifacts/screenshots/front/14-feedback-help.png`

后台最终截图：

- `artifacts/screenshots/admin/login.png`
- `artifacts/screenshots/admin/dashboard.png`
- `artifacts/screenshots/admin/users.png`
- `artifacts/screenshots/admin/posts.png`
- `artifacts/screenshots/admin/replies-moderation.png`
- `artifacts/screenshots/admin/ai-providers.png`
- `artifacts/screenshots/admin/ai-routes.png`
- `artifacts/screenshots/admin/ai-jobs.png`
- `artifacts/screenshots/admin/ops-feedback.png`
- `artifacts/screenshots/admin/ops-config.png`

## 是否满足视觉约束

- 是否保留 API 和真实按钮：是，点击诊断 110/110 通过。
- 是否去掉横向滚动条：是，前台 14 页 4 种宽度均 OK。
- 是否修复白底插画：是，信封、工具小人、卡片插画不再作为白底矩形块展示。
- 是否修复 tabBar 遮挡：是，统一 `.goodnight-page` 底部安全 padding。
- 是否修复数字拥挤：是，“我的”成长卡三列层级已重排。
- 是否禁止整图背景：是，页面仍由真实 DOM 和局部装饰素材组成。
- 是否禁止透明热区：是，交互点均为真实 DOM 元素。

## 仍然不一致的地方

- 真实页面使用动态数据，时间、计数、发布内容与设计图静态文字不会完全相同。
- 04 是 03 详情页的 bottom sheet 状态，截图路径独立，但路由仍是详情页状态，不作为独立页面。
- 当前自动视觉测试已做截图、布局和溢出验证；如要做“像素级 1:1 阈值”验收，需要冻结字体渲染、数据种子、浏览器缩放和设计图裁剪边界。

## 下一步建议

- 把 `artifacts/screenshots/front` 和 `artifacts/screenshots/admin` 的关键截图纳入 CI artifact。
- 后续任何视觉变更都先跑 `pnpm diagnose:overflow && pnpm diagnose:clickability && pnpm test:visual`。
- 如接入真实外部图片/AI 结果，增加“图片透明通道/白底检测”和“AI 内容高度回流”专项测试。
