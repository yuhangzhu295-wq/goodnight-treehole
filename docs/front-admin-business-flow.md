# 晚安树洞前后台业务闭环

更新时间：2026-07-10

## 真实数据源

当前仓库实际运行的数据源是 `apps/api/src/store.service.ts` 管理的 JSON Store，不是 Prisma 直连。前台 `apps/mp/src/api.ts` 和后台 `apps/admin/src/api.ts` 均通过同一个 API 服务访问该 Store。

默认运行文件：

- 开发默认：`data/goodnight-store.json`
- 自动验证：`apps/api/data/goodnight-store.real-browser-cross.json`

## 已跑通闭环

1. 前台发布公开树洞
   - 前台页面：`/pages/mood/create`
   - 写接口：`POST /api/v1/moods`
   - 后台页面：`/posts`
   - 后台审核接口：`PATCH /api/admin/v1/posts/:id/review`
   - 前台读取接口：`GET /api/v1/posts`
   - 验证结果：`post=post_9cbdbedbec`

2. 前台发布真人回应
   - 前台页面：`/pages/post/detail?id=:id&sheet=reply`
   - 写接口：`POST /api/v1/posts/:id/replies`
   - 后台页面：`/replies/moderation`
   - 后台审核接口：`PATCH /api/admin/v1/replies/:id/review`
   - 前台读取接口：`GET /api/v1/posts/:id/replies`
   - 验证结果：`reply=reply_d358b44a57`

3. 前台反馈工单
   - 前台页面：`/pages/help/feedback`
   - 写接口：`POST /api/v1/feedback`
   - 后台页面：`/ops/feedback`
   - 后台回复接口：`POST /api/admin/v1/feedback/:id/reply`
   - 前台读取接口：`GET /api/v1/feedback`
   - 验证结果：`ticket=ticket_1783687727428; status=resolved`

4. 后台配置影响前台详情页
   - 后台页面：`/ops/config`
   - 写接口：`PATCH /api/admin/v1/config`
   - 前台读取接口：`GET /api/v1/config`
   - 前台行为：`allowHumanRepliesDefault=false` 时，详情页回复抽屉不会打开，并显示“真人回应已关闭”。
   - 验证截图：`artifacts/screenshots/cross-flow/05-front-reply-disabled-by-config.png`

## 自动验证报告

- API 报告：`artifacts/test-report/admin-api-report.md`
- 后台 UI 报告：`artifacts/test-report/admin-ui-report.md`
- 前后台闭环报告：`artifacts/test-report/front-admin-cross-flow-report.md`
- 数据一致性报告：`artifacts/test-report/database-consistency-report.md`
- Trace：`artifacts/traces/admin-sync-full-report-trace.zip`
