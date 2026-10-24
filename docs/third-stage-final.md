# 第三阶段长期恢复与自我系统：最终验收记录

验收日期：2026-08-22（Asia/Shanghai）  
开发分支：`codex/third-stage-self-system`  
开发基线：`99c84de678abf1bc5359b5d360699ce7dbb6d383`

## 交付范围

第三阶段十个前台模块均已落地为真实数据闭环，并以 PostgreSQL 为唯一权威数据源：我的、恢复、个人支持计划、稳定自我、AI 记忆、决定库、未来的自己、隐私 2.0、月度报告 2.0 与档案馆。

- 档案馆新增 Journey 归档列表、详情、导出、恢复和双重确认删除。导出会真实创建持久化的 `MediaAsset`，不会伪造文件下载。
- 我的页恢复了日记、回信、收藏、月报、隐私和帮助等既有真实入口；清空记录改为真实 API 调用，并把确认面板固定在 tabBar 上方，避免被导航遮挡。
- 隐私页把“人工回应”和“月报分享”置于可见的真实开关区域；服务端继续拦截未授权的 Memory、月报、匿名经历、归档和导出操作。
- 月报测试会先通过真实隐私 API 显式授权，再调用远端 DAPI 并轮询真实 `AiJob`；任务状态不是 `succeeded` 即判失败，未接受本地或降级模型结果。

## 视觉验收

视觉唯一来源为 `C:\Users\zyu33\Desktop\图片素材88\晚安树洞_UI_01-41_业务说明`。第三阶段十页已生成 reference、actual、side-by-side 与 difference 工件，位于：

`artifacts/reference-fidelity/third-stage/`

最终比对差异率：

| 页面 | Route | 差异率 |
| --- | --- | ---: |
| 我的 Final | `/pages/me/index` | 20.54% |
| Recovery | `/pages/recovery/index` | 25.95% |
| Support Plan Final | `/pages/support-plan/index` | 26.37% |
| Stable Self | `/pages/stable-self/index` | 24.97% |
| AI Memory | `/pages/memory/index` | 24.82% |
| Decision Vault | `/pages/decision/index` | 27.93% |
| Future Self Final | `/pages/future-self/index` | 28.19% |
| Privacy 2.0 | `/pages/settings/privacy` | 19.76% |
| Monthly Report 2.0 | `/pages/report/month` | 22.14% |
| Archive Final | `/pages/archive/index` | 19.23% |

四个移动端宽度（375、390、393、430）均完成横向溢出检查；结果均为无横向滚动条。

## 真实业务与回归证据

以下命令均在禁用本地模型和 Ollama 回退的环境下执行：

```powershell
$env:AI_LOCAL_MODEL_ENABLED='false'
$env:OLLAMA_ENABLED='false'
$env:AI_ALLOW_OLLAMA_FALLBACK='false'
```

- `pnpm test:dapi-live`：通过。任务使用 `provider_dapi_deepseek` / `deepseek-v4-flash`，`fallbackUsed=false`。
- `pnpm test:third-stage-archive`、`test:third-stage-decision`、`test:third-stage-future-self`、`test:third-stage-privacy`、`test:third-stage-monthly-report`：均通过，覆盖 UI/API/数据库/重启/刷新持久化及隐私拒绝。
- `pnpm test:reference-fidelity-third-stage`：通过。
- `pnpm test:reference-fidelity-first-stage`、`pnpm test:reference-fidelity-peer-stage`：通过，第一、二阶段未回归。
- `pnpm test:click-all`：通过，前台和后台全量交互清单均为 `PASS`。
- `pnpm test:business-flow`、`pnpm test:cross`：通过；跨端测试确认远端 DAPI 任务已写入真实 `AiJob`。
- `pnpm qa:all`：通过，退出码 `0`。覆盖 lint、typecheck、unit、API、E2E、视觉、诊断、真实浏览器点击、业务流与跨端测试。
- 完整 QA 后重新启动 API、前台和后台服务，并通过应用内浏览器复验：`/pages/me/index` 的清空确认与取消按钮没有被 tabBar 覆盖，点击命中确认按钮本身且页面无横向溢出；`/pages/archive/index` 可切换到旅程归档，底部导航可见且页面无横向溢出。

## 仍需关注

运行环境的 Redis 为 `5.0.14.1`，测试框架提示建议升级至 Redis 6.2+。这次验收没有因该提示失败，所有上述测试均通过；建议在部署前升级 Redis，以消除兼容性告警。

`docs/third-stage-truth-review.json` 已更新为十页均 `DONE`，并设置 `THIRD_STAGE_SELF_SYSTEM_FROZEN=true`。
