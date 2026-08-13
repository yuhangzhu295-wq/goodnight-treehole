# 晚安树洞管理后台重构报告

更新时间：2026-07-10

## 原始问题

后台主要问题不是接口完全不存在，而是页面层把所有资源塞进一个泛化壳子：

- `TablePage.vue` 只展示 `ID / 内容名称 / 状态 / 模型` 等通用列，无法体现用户、树洞、回应、AI Provider、工单等真实字段。
- 详情区使用 `JSON.stringify` 裸展示，业务不可读。
- 输入框默认值是“后台操作文本”，按钮文案有“查看首个用户/查看首条树洞/查看首个任务”等测试痕迹。
- `/ops/config` 没有真实配置表单，后台保存配置无法影响前台。
- 仪表盘使用固定趋势数组，无法反映 Store 中的真实帖子、回应、AI 任务和反馈数据。

## 本轮修复

1. 后台页面重构
   - 重写 `apps/admin/src/views/TablePage.vue`。
   - 每类资源都有独立列定义、筛选、操作按钮和结构化详情。
   - 去掉 JSON 裸展示、测试文案和默认“后台操作文本”。

2. 后台接口补齐
   - 文件：`apps/api/src/controllers.ts`
   - 新增或补齐用户、树洞、回应、AI Provider、风格路由、AI Job、反馈、FAQ、回复预设、反馈分类、系统配置接口。
   - 所有列表接口统一返回 `items/page/pageSize/total/totalPages`。

3. 配置联动
   - 后台：`GET/PATCH /api/admin/v1/config`
   - 前台：`GET /api/v1/config`
   - 详情页：`apps/mp/src/views/PostDetail.vue` 读取配置，真实禁用真人回应入口。

4. 登录页修复
   - 文件：`apps/admin/src/views/Login.vue`
   - 不再预填 `admin/admin123`。
   - 增加验证码区域和忘记密码入口。
   - 登录仍走真实接口 `POST /api/admin/v1/auth/login`。

5. 仪表盘修复
   - 文件：`apps/admin/src/views/Dashboard.vue`
   - 使用后端聚合数据展示趋势、情绪分布、最新树洞和 AI 调用概况。

6. 后台样式稳定
   - 文件：`apps/admin/src/styles.scss`
   - 表格可滚动但不让页面横向溢出，详情区结构化，配置页使用响应式表单网格。

## 验证结果

- `pnpm lint`：通过
- `pnpm typecheck`：通过
- `pnpm test:api`：2/2 通过
- `pnpm test:admin-sync-full`：API 3/3、后台 UI 17/17、跨端闭环 4/4、数据一致性 1/1 全部通过
- `pnpm test:real-browser-admin-clicks`：通过
- `pnpm test:real-browser-cross-flow`：通过
- `pnpm test:real-browser-front-clicks`：通过

## 仍然不一致的地方

- 当前数据层仍是 JSON Store，不是生产数据库；这是现仓库实际实现。Prisma 目录存在，但本轮没有切换运行数据源，避免破坏已有前台/后台/API 流。
- 后台视觉已经按功能型管理台修复，但没有做像素级 1:1 重画全部 admin 设计稿。
- 管理员账号来源仍是种子数据 `apps/api/src/store.service.ts`，登录页不再暴露默认账号。
