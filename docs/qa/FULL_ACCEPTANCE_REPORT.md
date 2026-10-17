# 全自动业务验收报告

- 运行 ID：`run-acceptance-20261018-035601`
- 代码版本：`95a0671d824985f36802ce595453651693c8870c`
- 结论：**INCOMPLETE** — 16/17 个流程已执行且全部 PASS，F16（Android 全页面走查）未执行。
- 证据目录：`artifacts/acceptance/run-acceptance-20261018-035601/`（每个流程一个 `evidence.json`，汇总在 `summary.json`）

## 判定方式

每个流程在一个独立租用的 PostgreSQL 数据库上运行，逐步写入证据，每一步都带一个证据层：

| 层 | 含义 |
| --- | --- |
| `UI_EVIDENCE` | 真实设备/浏览器上的界面证据 |
| `API_EVIDENCE` | 接口请求与响应本身 |
| `DATABASE_EVIDENCE` | 直接读 PostgreSQL 得到的行 |
| `SECURITY_EVIDENCE` | 越权、撤销、未认证等负向路径 |
| `PERSISTENCE_EVIDENCE` | 换一个进程或重启之后仍成立 |

`scripts/acceptance/build-summary.mjs` 是门禁，不是报告生成器：流程缺失、任一步 `FAIL`、或流程缺少 manifest 声明的证据层，都会让退出码非零。第一次汇总时它正是这样抓到了 5 个流程缺证据层（F06/F08/F10/F12/F13），补的是真实断言，不是放宽清单。

## 流程结果

| 流程 | 内容 | 证据步数 | 结果 |
| --- | --- | --- | --- |
| F01 | 匿名身份与会话生命周期 | 8 | PASS |
| F02 | 今晚入口创建属于调用者的旅程 | 6 | PASS |
| F03 | 旅程状态机与拒绝路径 | 9 | PASS |
| F04 | 行动承诺：创建、完成、重读、调整 | 6 | PASS |
| F05 | 两个用户之间的同路经历分享 | 9 | PASS |
| F06 | 双向同路同意与 72 小时会话 | 8 | PASS |
| F07 | 隐私撤销真的撤销 | 9 | PASS |
| F08 | 记忆生命周期（含重新同意与删除） | 10 | PASS |
| F09 | 决定保险箱与冷静期 | 8 | PASS |
| F10 | 给未来的信：排期、重启、只送达一次 | 6 | PASS |
| F11 | 日记、回信与收藏的归属 | 6 | PASS |
| F12 | 社区树洞：审核、回应、计数器 | 8 | PASS |
| F13 | 安全支持可达性 | 7 | PASS |
| F14 | 管理台：审核、最小披露、审计 | 6 | PASS |
| F15 | 两个 API 实例通过数据库一致 | 5 | PASS |
| F16 | Android 上每个 C 端页面可打开、可响应、可持久化 | — | **NOT_RUN** |
| F17 | 重启与恢复 | 5 | PASS |

## 本轮验收中发现并修复的缺陷

这些不是"测试写法问题"，是验收流程在真实路径上暴露出来的产品缺陷，均已修复并有回归测试：

1. **日记与回信的 6 条越权路由**（F11）。`PATCH /letters/:id/read`、`POST /letters/:id/like`、`POST /letters/:id/regenerate`、`POST /letters/:id/poster`、`POST /share-image`、`POST /letters/:id/save-to-diary`、`DELETE /diaries/:id` 都只按 id 查找、不看调用者。其中 `regenerate` 在 id 不存在时还会回退到 `letters[0]`，即另一个用户的信。现在全部按所有者解析并返回 404。
2. **`DELETE /diaries/:id` 从不落盘**（F11）。返回 200 之后重启，日记会回来。现在响应前写库。
3. **`DELETE /posts/:id` 任何人可删**（F12）。没有作者校验。现在只有作者可删，管理员走审核路由。
4. **审计列表看不到审计行**（F14）。单条敏感记录读取把 `AuditLog` 直接写进 PostgreSQL，而 `GET /admin/v1/audit-logs` 读的是内存副本，所以"谁看过这条私密记录"要等下一次重启才可见。现在路由以表为准，并合并尚未落盘的内存行。
5. **验收证据门禁自身太宽松**（F05）。第一次运行出现过 9 步里 2 步 `FAIL`、而测试全绿的情况：`actual` 里多了一个诊断字段导致比较不等。`flush()` 现在先写文件再抛错，并有一个单元自测证明抛出与不抛出两条路径。

## 观测到但未在本轮修复的问题

- **`WORKER-RELOAD-FLUSH-LOCK`**：投递后的 `reloadRuntimeState()` 会执行一次全库 legacy flush。用 `pg_stat_activity` 抓到的锁链是：一个事务持有 `LifeJourney ... FOR UPDATE` 并处于 idle in transaction，worker 的 `UserNotification` 插入等待该事务，另一个 `INSERT INTO "User"` 又在等 worker，5 秒事务预算到期后 job 被记为失败并重试（投递本身已提交）。这属于 Batch 4 要退役的那层 flush，已记入 `MASTER_TASK_QUEUE.json`，不作为本流程的通过依据。
- **`/api/health` 是静态存活探针**，不检查数据库。环境自检由 `scripts/dev/stack-probe.mjs` 做真实查询承担；产品健康检查是否要改成就绪探针，需要单独决定。

## 未执行项

**F16 — Android 全页面走查**：需要专用 AVD、真实 APK 安装、前台校验与逐页截图，本轮没有执行。在它完成之前，`summary.json` 的总体结论保持 `INCOMPLETE`，不得写成 PASS。

## 复现

```bash
RUN=run-acceptance-$(date +%Y%m%d-%H%M%S)
ACCEPTANCE_RUN_ID=$RUN npx tsx scripts/test-runner.ts tests/acceptance
node scripts/acceptance/build-summary.mjs --run $RUN
# 全流程（含 F16）都必须在场时才加 --require-all
node scripts/acceptance/build-summary.mjs --run $RUN --require-all
```
