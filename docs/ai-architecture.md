# AI 架构

更新时间：2026-08-07

## 当前调用链

前台业务请求 -> 创建异步 `AIJob` -> 按 `AIStyleRoute` 选择 provider -> DAPI 主 provider -> 远程 OpenAI 备用 provider -> 安全文案模板 -> PostgreSQL -> 前台轮询与后台监控。

当前策略禁止 Ollama 和所有本地模型参与运行或测试。运行时会拒绝 `127.0.0.1`、`localhost`、`::1` 的 AI provider 地址；后台也不能启用本地 provider 或把风格路由切换到本地 provider。

## 当前 provider

| 角色 | Provider ID | 地址 | 状态 |
| --- | --- | --- | --- |
| 主 provider | `provider_dapi_deepseek` | `https://api.deepseek.com` | API Key 存在时启用 |
| 远程备用 | `provider_openai_remote` | `https://api.openai.com/v1` | API Key 存在时启用 |
| 最终兜底 | `provider_safe_template` | 内置安全模板 | 仅主备远程调用失败后使用 |

所有 `warm`、`rational`、`light`、`clear`、`poetic` 路由均以 DAPI 为主 provider。`localModelFirst` 固定为 `false`，修改为 `true` 会返回 400。

## Job 契约

每次真实 AI 调用必须记录 `jobId`、`userId`、`contentId`、`taskType`、`style`、`providerId`、`modelName`、`status`、`promptVersion`、`promptSummary`、`result`、`structuredResult`、`durationMs`、`retryCount`、`fallbackUsed`、`errorMessage`、`traceJson`、`createdAt`、`completedAt`。

高风险文本进入风险升级流程，不做医疗诊断，也不以固定前端文案冒充 AI 结果。

## 历史数据

数据库可能保留策略切换前的 Ollama provider 和 `AIJob` 记录用于审计。它们不是当前可执行配置：本地 provider 均为 `enabled=false`，本地同步端点固定拒绝请求，当前路由不会引用它们。
