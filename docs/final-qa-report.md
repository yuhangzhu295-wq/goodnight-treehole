# 晚安树洞最终 QA 报告

生成时间：2026-07-09

## 总结

本轮已完成设计还原层、真实业务层、自动验证层的绑定修复。最终执行：

- `pnpm qa:real-all`：通过。
- 前台真实点击：8/8 通过。
- 前后台联动：3/3 通过。
- 点击诊断：110/110 通过。
- API 绑定诊断：疑似缺失 API 绑定 0。
- 前台横向溢出：14 页 x 4 宽度全部 OK。
- 视觉截图：前台 14 张、后台 10 张核心设计页均已输出。

## 命令结果

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `pnpm lint` | PASS | 代码规范通过 |
| `pnpm typecheck` | PASS | 类型检查通过 |
| `pnpm diagnose:api-bindings` | PASS | 110 个控件，疑似缺失 API 绑定 0 |
| `pnpm diagnose:clickability` | PASS | 110 个交互点全部可点且行为符合合同 |
| `pnpm diagnose:overflow` | PASS | 前台 14 页在 375/390/414/430 宽度无横向溢出 |
| `pnpm test:front-business` | PASS | 前台发布、回复、工具、回信、我的等业务流通过 |
| `pnpm test:admin-sync` | PASS | 前台发布/回复/反馈到后台审核闭环通过 |
| `pnpm test:ai-routing` | PASS | AI provider、路由、job 操作通过 |
| `pnpm test:visual` | PASS | 前台/后台截图与布局断言通过 |
| `pnpm qa:real-all` | PASS | 全链路命令通过 |

运行中仅出现 Node `spawn(shell: true)` deprecation warning，不影响本次测试结果。

## 关键修复文件

| 文件 | 内容 |
| --- | --- |
| `apps/api/src/store.service.ts` | 情绪 key 归一化、种子数据补齐、封禁写操作拦截、公开/私密发布真实分流 |
| `apps/api/src/controllers.ts` | 前台/后台兼容 API 别名补齐 |
| `apps/api/src/main.ts` | OpenAPI paths 同步 |
| `apps/mp/src/views/Square.vue` | 广场筛选改为稳定 mood key 并发真实查询 |
| `apps/mp/src/router.ts` | 写心情路由别名补齐 |
| `apps/mp/src/views/ToolRun.vue` | 通用工具结果复制/保存真实按钮 |
| `apps/mp/src/styles/goodnight-theme.scss` | 统一主题 token 和 `.goodnight-page` 基础布局 |
| `tests/interaction-manifest.front.json` | 前台按钮合同 |
| `tests/interaction-manifest.admin.json` | 后台按钮合同 |
| `scripts/test-click-all.ts` | 支持 setup 后再点击验证 |
| `scripts/diagnose/diagnose-clickability.ts` | 支持 setup、生成点击诊断 |
| `scripts/real-browser-front-clicks.ts` | 前台真实浏览器点击流 |
| `scripts/real-browser-cross-flow.ts` | 前后台真实联动流 |
| `scripts/test-business-flow.ts` | 业务 API 级验证 |
| `scripts/visual-compare.ts` | 前后台截图捕获 |

## 产物路径

| 类型 | 路径 |
| --- | --- |
| 当前诊断 | `docs/current-project-diagnosis.md` |
| 前台业务报告 | `docs/front-business-flow-report.md` |
| 后台同步报告 | `docs/admin-sync-flow-report.md` |
| 视觉修复报告 | `docs/visual-fix-report.md` |
| API 地图 | `docs/api-endpoint-map.md` |
| 按钮交互地图 | `docs/button-interaction-map.md` |
| 最终 QA | `docs/final-qa-report.md` |
| 本轮跳转布局审查 | `docs/front-navigation-layout-audit-2026-07-09.md` |
| 前台点击报告 | `artifacts/test-report/real-browser-front-clicks.md` |
| 前后台联动报告 | `artifacts/test-report/real-browser-cross-flow.md` |
| 点击诊断 | `artifacts/diagnosis/clickability-report.md` |
| API 绑定诊断 | `artifacts/diagnosis/api-binding-report.md` |
| 横向溢出报告 | `artifacts/layout/front-horizontal-overflow.md` |
| 前台截图 | `artifacts/screenshots/front/` |
| 后台截图 | `artifacts/screenshots/admin/` |
| 本轮跳转审查截图 | `artifacts/screenshots/navigation-audit/` |

## 当前本地服务

本轮收尾已重新常驻启动开发服务，便于人工复查：

| 服务 | 地址 | 状态 |
| --- | --- | --- |
| API | `http://127.0.0.1:3000` | listening |
| 前台 | `http://127.0.0.1:5173/pages/square/index` | listening，内置浏览器已打开 |
| 后台 | `http://127.0.0.1:5174/login` | listening |

日志与进程号在 `artifacts/dev-server/dev.out.log`、`artifacts/dev-server/dev.err.log`、`artifacts/dev-server/dev.pid`。

## 逐项验收

| 要求 | 结果 |
| --- | --- |
| 不能只有静态 UI | PASS，发布/回复/审核/反馈/工具均走真实接口 |
| 所有按钮可点击 | PASS，110/110 通过 |
| 保留 API/store/router | PASS，没有删除 API，补齐兼容别名 |
| 禁止假按钮/透明热区 | PASS，诊断通过，交互点为真实 DOM |
| 禁止英文测试按钮 | PASS，真实浏览器首屏检查通过 |
| 禁止横向滚动条 | PASS，前台 14 页 4 宽度均无横向溢出 |
| 禁止 tabBar 遮挡正文 | PASS，统一底部 safe-area padding |
| 04 不是独立路由 | PASS，保持详情页 `sheet=reply` 状态 |
| 前台 01-14 截图 | PASS，已输出到 `artifacts/screenshots/front` |
| 后台 01-10 截图 | PASS，已输出到 `artifacts/screenshots/admin` |
| 前后台真实联动 | PASS，发布审核、回复审核、反馈解决 3/3 通过 |
| 分类按钮放大回归 | PASS，430/710 宽度下分类行 62px，按钮 44px，工作分类有真实 published 数据 |
| 前台跳转页面审查 | PASS，20/20 通过，无错误页、无横向溢出、无 tabBar 遮挡阻塞 |

## 仍然不一致/风险

- 真实业务数据导致截图文字、时间、计数不可能与设计稿静态内容完全一致。
- 当前视觉自动化以截图捕获、布局断言、溢出检测、点击不遮挡为准；如果后续要求像素级 1:1，需要把动态数据冻结和像素阈值作为单独 CI 规则。
- 本地 QA 脚本会启动并清理本地服务；如果人工浏览器仍停在旧标签，需要重新打开对应 `127.0.0.1` 页面或重新启动网关。

## 建议

- 将 `pnpm qa:real-all` 作为每次交付前必跑命令。
- 新增页面时必须同步新增 API map、button manifest、真实浏览器测试和截图捕获。
- 接入真实外部 AI provider 后，增加网络失败、限流、fallback、内容审核失败四类专项测试。
