# 晚安树洞前台 06-14 真实交互修复报告

生成时间：2026-07-05

## 修复范围

本轮只修复前台 06-14，不重做后台，不扩散改动 01-05。保留 first5 旧入口，并新增 06-14 文档要求的 alias 路由。

## 核心改动

- 06 情绪工具：九个工具入口全部是真实按钮；工具卡进入 `/pages/tool/run?type=...`，温柔回信进入 `/pages/letter/today`，拆解与月报进入对应页面。
- 07 情绪拆解：运行调用 `POST /api/v1/tools/emotion-decompose`，保存调用 `POST /api/v1/diaries`，复制与重新拆解有真实状态。
- 08 我的：日记、回信、收藏、月报、隐私、帮助与反馈全部真实跳转；清空记录调用 `DELETE /api/v1/me/data`。
- 09 我的日记：月份、情绪、回信筛选调用 `GET /api/v1/diaries`；卡片可进详情；写新日记跳 `/pages/mood/create`。
- 10 情绪月报：月报接口返回趋势、分布、关键词；分享图、保存、建议弹层真实生效。
- 11 我的回信：全部、未读、已收藏筛选调用后端；查看全文标记已读并进详情；收藏、喜欢写入后端。
- 12 我的收藏：回信、树洞、日记三类筛选调用后端；取消收藏真实删除。
- 13 隐私设置：四个开关写后端；清缓存写本地状态；导出日记调用 `POST /api/v1/diaries/export`。
- 14 帮助与反馈：FAQ 展开、全部 FAQ 路由、上传截图、提交反馈工单、更多支持弹层全部可用。

## 新增验证资产

- 交互合同：`tests/contracts/front-phase2-phase3-interactions.json`
- 合同文档：`docs/front-phase2-phase3-interaction-contract.md`
- 修复前后诊断：`docs/front-rest-current-diagnosis.md`
- 修复报告：`docs/front-rest-fix-report.md`
- 诊断脚本：`scripts/diagnose/diagnose-phase2-phase3-runtime.ts`、`overlay.ts`、`clickability.ts`、`routes.ts`、`api.ts`
- 真实浏览器测试：`scripts/front-phase2-tools.ts`、`scripts/front-phase3-me.ts`、`scripts/front-rest-cross-flow.ts`

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm diagnose:front-rest` | PASS，29/29 真实点击通过 |
| `pnpm test:front-phase2-tools` | PASS |
| `pnpm test:front-phase3-me` | PASS |
| `pnpm test:front-rest-cross-flow` | PASS |
| `pnpm qa:front-rest` | PASS |
| `pnpm qa:first5` | PASS，确认 01-05 未破坏 |

## 证据位置

- 点击诊断 JSON：`artifacts/diagnosis/front-rest-clickability-report.json`
- 点击诊断 Markdown：`artifacts/diagnosis/front-rest-clickability-report.md`
- 自动测试报告：
  - `artifacts/test-report/front-phase2-tools.md`
  - `artifacts/test-report/front-phase3-me.md`
  - `artifacts/test-report/front-rest-cross-flow.md`
- 截图：
  - `artifacts/screenshots/front-rest/before/*.png`
  - `artifacts/screenshots/front-rest/after/*.png`
- Trace：
  - `artifacts/traces/front-rest/diagnose-front-rest-clickability.zip`
  - `artifacts/traces/front-rest/front-phase2-tools.zip`
  - `artifacts/traces/front-rest/front-phase3-me.zip`
  - `artifacts/traces/front-rest/front-rest-cross-flow.zip`

## 当前服务

本地 API 已启动在 `http://127.0.0.1:3000`，前台已启动在 `http://127.0.0.1:5173/pages/tool/index`。
