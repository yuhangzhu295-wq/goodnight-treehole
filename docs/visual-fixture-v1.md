# 视觉 Fixture v1

`visual-v1` 是晚安树洞视觉验收的独立、合成且可重复的运行环境。它不是生产数据的副本，也不允许把 fixture 行写入正常运行库。

| 范围 | 固定位置 / 端口 |
| --- | --- |
| 版本化 seed 与媒体源 | `fixtures/visual/v1/` |
| PostgreSQL 数据目录 | `artifacts/visual-fixtures/v1/runtime/postgres/` |
| fixture 数据库 | `127.0.0.1:55433/goodnight_treehole_visual_v1` |
| API / 前台 / 后台 | `3001` / `5175` / `5176` |
| AI endpoint | fixture-only stub `11435` |
| fixture 上传目录 | `artifacts/visual-fixtures/v1/runtime/uploads/` |
| 每次视觉证据 | `artifacts/visual-fixtures/v1/runs/<runId>/` |

## 使用

```powershell
pnpm visual:fixture:bootstrap
pnpm visual:fixture:start
pnpm visual:fixture:verify
pnpm visual:fixture:run
pnpm visual:fixture:stop
```

`bootstrap` 仅在 55433 上执行 schema reset 和 seed；它拒绝 55432、非 fixture 数据库名、正常 `data/uploads` 目录、错误的版本/运行时身份。`start` 在启动前重新建立确定性基线，并只记录/停止自己启动的 API、前台、后台和 AI stub 进程。

## 安全证明

- API 在 fixture 模式下要求 `VISUAL_FIXTURE_MODE=1`、`VISUAL_FIXTURE_VERSION=v1`、实例标记 `visual-fixture-v1`、55433 fixture URL 与独立上传路径；任一项不匹配即退出。
- `RuntimeState` 保存 fixture 标记；验证器检查 manifest、关系数量、引用记录、AI 全部终态、媒体哈希和标记一致。
- bootstrap 在写入前记录正常 `data/uploads` 的只读摘要；每次 verify 都要求其摘要不变。验证器明确不连接或修改正常 PostgreSQL。
- 浏览器视觉运行器在 fixture strict 模式下只接受 3001 API 身份；任何对 3000 的浏览器 API 请求直接失败。
- `final-responsive-visual.ts` 默认仍写原有 `artifacts/` 目录。只有明确指定 fixture manifest 与独立 artifact root 时才写入 fixture run 目录。

seed checksum 固化在 [manifest.json](../fixtures/visual/v1/manifest.json)，每次 seed/verify 都重新计算。不要手工修改 `artifacts/visual-fixtures/v1/runtime` 来伪造通过；修改数据时更新版本化 seed、manifest checksum，并重新 bootstrap。
