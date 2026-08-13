# 晚安树洞全业务流与逐页交互审计报告

生成时间：2026-08-08

## 本轮结论

- 已在最新代码上完成前台 74 项、后台 50 项，共 124 项登记交互的真实点击回归：124 通过，0 失败。
- 前台 14 个正式页面均在 375、390、414、430 四档宽度下完成 DOM 重叠和横向溢出检查；文字重叠、按钮越界、页面横向滚动均为 0。
- 用户指出的“写回应”抽屉已限制为 `min(430px, 100vw)`，桌面浏览器中与 430px 应用壳左右边界完全一致，不再铺满浏览器。
- 修复了详情页把服务端收藏状态错误当成永久悬浮提示的问题；抽屉打开后不再被“已收藏”提示覆盖。
- AI 验收只调用 DAPI。真实任务使用 `provider_dapi_deepseek` / `deepseek-v4-flash`，`AiJob` 成功落库，`fallbackUsed=false`，未调用 Ollama 或本地模型。
- API、前台和后台已在 3000、5173、5174 端口完成干净重启并通过健康检查。

## 页面与业务覆盖

前台覆盖广场、写下心情、树洞详情、详情回复抽屉、今日回信、情绪工具、情绪拆解、我的、我的日记、情绪月报、我的回信、我的收藏、隐私设置、帮助与反馈。

真实点击覆盖：底部导航、广场筛选、详情跳转、写心情、真实图片上传、公开/私密发布、抱抱、收藏、回应、回应点赞、复制、举报、屏蔽、四种回信风格、保存日记、生成海报、八类情绪工具、结果保存与复制、月报海报与建议、隐私开关、数据说明、反馈提交和清空记录确认。

后台覆盖：登录、数据总览、用户管理、树洞内容、回应审核、DAPI 供应商、风格路由、AI 任务、反馈工单、系统设置、FAQ、回复预设、反馈分类和审计日志。

后台真实点击覆盖：用户封禁及恢复、内容通过/隐藏/风险标记、回应审核、DAPI 连通测试与配置保存、远程供应商启停及恢复、DAPI 路由保存与测试、工单处理中/真实回复/结单、系统配置保存及恢复，以及 FAQ、预设、分类的真实创建。

## 发现并修复的问题

1. 回复抽屉继承了全浏览器固定层宽度，在桌面浏览器中铺满页面。现将抽屉自身宽度和最大宽度固定为应用壳规格，并保留遮罩覆盖浏览器视口。
2. 视觉回归脚本原本只打开详情页，注释声称点击了回复按钮但代码未执行点击。现通过 `btn-open-reply` 真实点击并等待 `[data-state="reply-sheet"]` 可见后再截图。
3. 详情页加载时把 `favoritedByCurrentUser` 写入临时提示，导致“已收藏”永久悬浮并穿透抽屉。现按钮直接读取服务端收藏状态，临时提示仅在真实操作后显示，抽屉打开时隐藏。
4. 广场和详情页的复制动作已接入真实 Clipboard API；失败时明确反馈，不再使用假提示。
5. 屏蔽内容已接入 `HiddenPost` 持久化及查询过滤，刷新后仍生效。
6. 回应点赞已接入真实 API 和数据库计数，刷新后仍保留。
7. 私密心情、回信、工具和月报的异步结果改为等待持久化完成；所有 AI 调用生成真实 `AiJob`。
8. 后台专项脚本原先会误点供应商列表首项。现固定测试 `provider_dapi_deepseek`，禁止测试 Ollama/本地模型。
9. 后台反馈专项脚本原先跳过回复直接结单。现先提交真实回复，再调用状态接口结单。

## 回复抽屉尺寸实测

主服务浏览器实测环境：视口 933 × 898。

- 应用壳：left 244，right 674，width 430。
- 回复抽屉：left 244，right 674，width 430。
- 快捷回应区：width 394，scrollWidth 394。
- 页面横向溢出：否。
- 抽屉打开时可见悬浮提示：0。

## API、数据库和跨端证据

- 公开发布：前台创建 -> 后台审核 -> 前台广场可见。
- 真人回应：前台提交 -> 后台审核 -> 前台详情可见。
- 用户反馈：前台提交 -> 后台真实回复并解决 -> 前台读取同步状态。
- 屏蔽、收藏、抱抱、回应点赞、隐私设置、日记保存、海报和反馈均验证了真实 API；关键状态验证刷新持久化。
- DAPI 任务：`job_e26f042589`，状态 `succeeded`，模型 `deepseek-v4-flash`，记录终态轨迹与结果，未使用 fallback。

## 自动验证结果

- `pnpm test:click-all`：124/124 通过。
- `pnpm test:real-browser-front`：通过。
- `pnpm test:real-browser-admin`：6/6 通过。
- `pnpm test:real-browser-cross`：通过。
- 前台业务 Vitest：6 个文件、8 个测试通过。
- 后台同步 Vitest：1 个文件、1 个测试通过。
- `pnpm diagnose:front-layout`：通过。
- `pnpm visual:front-layout`：14 页成功截图，无横向滚动。
- `pnpm test:dapi-live`：全部检查通过。
- `pnpm typecheck`：通过。

## 证据路径

- 全按钮报告：`artifacts/test-report/click-all-report.md`
- 后台浏览器报告：`artifacts/test-report/real-browser-admin-clicks.md`
- 前台浏览器报告：`artifacts/test-report/real-browser-front-clicks.md`
- 跨端报告：`artifacts/test-report/real-browser-cross-flow.md`
- DAPI 报告：`artifacts/test-report/dapi-live-report.md`
- 重叠报告：`artifacts/layout/front-overlap-report.md`
- 横向溢出报告：`artifacts/layout/front-horizontal-overflow.md`
- 14 页截图：`artifacts/screenshots/layout-after/`
- 回复抽屉截图：`artifacts/screenshots/layout-after/04-post-detail-reply-sheet.png`
- 视觉差异图：`artifacts/diffs/layout/`

## 仍有差异与下一步

本轮已解决尺寸失控、抽屉遮挡、假交互和 DAPI 验证问题，但视觉对比仍不是逐像素 0 差异。14 页当前像素差异约为 10.39% 至 22.42%，真实打开的回复抽屉页为 11.35%。差异主要来自真实动态数据、文字长度、浏览器字体渲染和交互状态，不代表横向溢出或控件失效。后续视觉精修应以每页差异图为依据逐项收敛，同时继续保留当前 API、数据库和点击回归门禁。
