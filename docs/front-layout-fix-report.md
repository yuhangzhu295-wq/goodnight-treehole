# 晚安树洞前台布局修复报告

生成时间：2026-07-07

## 修复范围

本轮只处理前台 01-14 页面视觉排版问题，保留已有接口、按钮事件、路由和真实业务流。修复重点是底部遮挡、文本重叠、按钮拥挤、卡片呼吸感、脏裁剪素材和主 tabbar 在详情流程中的显示逻辑。

## 主要修复

1. 全局 tabbar 改为按页面显示。主入口和设计图中带底部导航的列表/设置页保留 tabbar，写心情、树洞详情、回复抽屉、情绪拆解等流程页不再显示全局 tabbar，避免 03/04 双底栏遮挡。
2. 05 今日回信压缩回信卡和操作区，把“今日小建议”按钮完整抬出底部导航遮挡区。
3. 06 情绪工具压缩工具卡片高度，重建底部标语底板，移除带文字裁剪图造成的重复/污染。
4. 08 我的页面重排成长卡指标，降低叶子装饰透明度，保证数字、单位、清空记录按钮可读可点。
5. 10 情绪月报把底部动作条固定到 tabbar 上方，避免“生成分享图 / 查看建议”被遮住。
6. 11 我的回信重建列表卡片视觉层级，清除不干净的裁剪素材，保留查看全文、收藏、喜欢真实按钮。
7. 14 帮助与反馈压缩 FAQ 和表单，将上传/提交按钮放成双列，并关闭遮挡按钮的旧伪元素。
8. 新增 layout 诊断脚本，覆盖重叠、横向溢出、卡片间距、安全区和视觉截图对比。

## 新增命令

- `pnpm diagnose:front-layout`
- `pnpm visual:front-layout`
- `pnpm qa:front-layout`

## 验证结果

- `pnpm lint`：通过
- `pnpm typecheck`：通过
- `pnpm diagnose:front-layout`：通过
- `pnpm qa:first5`：通过，01-05 真实点击和业务流全绿
- `pnpm qa:front-rest`：通过，06-14 真实点击和跨页流程全绿
- `pnpm visual:front-layout`：通过，14 页截图全部 `hscroll=false`

## 产物位置

- 修前截图：`artifacts/screenshots/layout-before/`
- 修后截图：`artifacts/screenshots/layout-after/`
- 布局报告：`artifacts/layout/`
- 视觉 diff：`artifacts/diffs/layout/`
- Playwright trace/video：`artifacts/traces/`
