# 晚安树洞实现计划

## 需求理解

本项目必须交付可运行的前台、后台和统一业务后端。前台 14 张参考图映射为 13 个正式路由加 1 个详情页 bottom sheet 状态；后台 10 张参考图映射到管理端主导航页面。FAQ、回复预设、反馈分类、AI 路由、系统设置必须从后端领域服务读取，不能作为前端写死常量。

## 信息架构修正说明

- `04-树洞详情-回复抽屉打开态` 不是独立路由，而是 `/pages/post/detail` 内 `showReplySheet=true` 的状态。
- 用户隐私偏好落在 `PrivacySetting`；平台默认策略落在 `SystemSetting`，后台更新默认值不覆盖历史用户。
- 前台工具入口、FAQ、反馈分类和回复预设都由后端配置服务提供，前端只渲染接口返回结果。
- AI 前端只感知业务意图与风格，供应商、模型、Prompt、重试和兜底由后台配置和后端 AI Router 决定。

## 开发任务拆解

1. 归档 DOCX 与参考图，生成 front/admin manifest。
2. 初始化 pnpm monorepo、TS strict、ESLint、Prettier、Docker、环境变量模板。
3. 完成 Prisma PostgreSQL schema、seed、NestJS API、Swagger、Auth/RBAC、AuditLog、AI Router、UploadService。
4. 完成前台 4 个 tabBar 页、全部非 tab 页和隐式状态，并接入 API SDK。
5. 完成后台登录、数据总览、用户、内容、回应、AI、反馈、配置和审计页，并接入管理 API。
6. 编写 unit/api/e2e/cross/visual 测试和自动 QA 顺序脚本。
7. 跑 `qa:all`，按失败项修复并复测。
