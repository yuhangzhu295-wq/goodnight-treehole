# DAPI-only AI 策略与验收

验收时间：2026-08-07

## 策略

- 当前项目和自动测试禁止调用 Ollama、LM Studio、CLI Proxy 或其他本地模型。
- DAPI 主 provider 为 `provider_dapi_deepseek`，地址为 `https://api.deepseek.com`。
- 远程备用 provider 为 `provider_openai_remote`；本地 provider 即使存在历史记录也不能启用。
- AI provider 地址必须使用远程 HTTPS，所有回环地址在运行时被拒绝。
- 每次业务生成必须创建真实异步 `AIJob`，并持久化 provider、模型、状态、结果和执行轨迹。

## 本轮真实证据

### 命令行 DAPI 验收

- 干净重启后的 API 实例：`api-35308`
- 作业：`job_af2e650fc5`
- Provider：`provider_dapi_deepseek`
- 服务端实际模型：`deepseek-v4-flash`
- 状态：`succeeded`
- 回退：`false`
- Provider 探测耗时：1284ms
- 业务作业耗时：2142ms
- 结果和终端轨迹：已持久化

### 浏览器业务验收

- 页面：`/pages/tool/run?type=sleep-comfort`
- 唯一输入标记：`DAPI重启回归-1786118217644`
- 作业：`job_83f7d241d0`
- Provider：`provider_dapi_deepseek`
- 服务端实际模型：`deepseek-v4-flash`
- 状态：`succeeded`
- 回退：`false`
- 数据库结果长度：135
- 页面刷新前已显示动态生成结果，数据库已记录同一输入摘要和输出。
- API 干净重启后重新打开页面，前台通过 `/api/v1/ai/tasks/latest` 恢复数据库中的最新输入和结果，证明结果不依赖前端内存或热更新状态。

## 本轮可靠性修复

- DAPI 请求超时现在覆盖 `fetch`、响应头和完整 JSON 响应体解析；远端只返回响应头但响应体停滞时会被真实中止，不会让 `AIJob` 永久停留在 `running`。
- 新增响应体停滞回归用例，验证 AbortController 在 JSON 解析完成前始终有效。
- 工具页会读取当前用户、当前任务类型的最新成功 `AIJob`，刷新或 API 重启后仍显示持久化结果。

## 回归结果

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm lint -- --max-warnings=0` | PASS |
| `pnpm test:api` | PASS，2 tests |
| `pnpm test:e2e` | PASS，12 tests |
| `pnpm test:unit` | PASS，7 tests |
| `pnpm test:ai-routing` | PASS，5 tests |
| `pnpm exec vitest run tests/business/ai-provider-policy.spec.ts` | PASS，5 tests |
| `pnpm test:dapi-live` | PASS，真实远程调用 |
| `pnpm test:cross` | PASS，3 tests，含数据库持久化、前台最新结果接口和本地策略拒绝 |

## 数据库策略状态

- DAPI：启用。
- OpenAI 远程备用：启用。
- 历史 Ollama provider：全部禁用。
- CLI Proxy：禁用。
- 旧本地 provider：禁用。
- 历史 Ollama `AIJob` 保留用于审计，不代表当前策略仍可调用本地模型。

完整机器可读证据见 `artifacts/test-report/dapi-live-report.json`，其中不包含 API Key 或授权令牌。
