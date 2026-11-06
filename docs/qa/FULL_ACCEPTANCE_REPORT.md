# 全自动业务验收报告

- 运行 ID：`run-acceptance-20261018-035601`
- 代码版本（业务验收部分）：`95a0671d824985f36802ce595453651693c8870c`
- 结论：**PASS** — 17/17 个流程全部通过，共 158 步证据。
- 证据目录：`artifacts/acceptance/run-acceptance-20261018-035601/`（每个流程一个 `evidence.json`，汇总在 `summary.json`）
- 设备说明：F16 在 Android 模拟器（`GoodnightPixel7Api34`，`com.goodnight.treehole`）上执行。**`PHYSICAL_ANDROID_VERIFIED=false`**，模拟器不得当作真机。

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
| F16 | Android 上 39 个 C 端页面打开、响应、落库 | 41 | PASS（模拟器） |
| F17 | 重启与恢复 | 5 | PASS |

### F16 是怎么跑的

`scripts/acceptance/android-page-pass.mjs` 通过 WebView 的 DevTools 协议逐页导航：

- 从 `apps/mp/src/router.ts` 解析出每个组件的首个路径，共 39 个页面；
- 每次导航前检查前台包名，被别的应用抢走前台时该页记为 FAIL，而不是拍一张别人的画面；
- 判定：路由确实到达、正文非空、没有错误横幅、没有把 `undefined` 漏到界面、该页的 API 调用没有 5xx；
- 每页截图保存到 `F16/screens/`；
- 数据库步骤读取应用自己持久化的身份（Capacitor Preferences），再查 `User` 与相关表，确认写入是真实行；
- 本次 APK SHA-256：`f936891aba108613acc6d8222ab5af32cba13ddf1a576fa2c86c461f215d2fa5`。

## 本轮验收中发现并修复的缺陷

这些不是"测试写法问题"，是验收流程在真实路径上暴露出来的产品缺陷，均已修复并有回归测试：

1. **日记与回信的 6 条越权路由**（F11）。`PATCH /letters/:id/read`、`POST /letters/:id/like`、`POST /letters/:id/regenerate`、`POST /letters/:id/poster`、`POST /share-image`、`POST /letters/:id/save-to-diary`、`DELETE /diaries/:id` 都只按 id 查找、不看调用者。其中 `regenerate` 在 id 不存在时还会回退到 `letters[0]`，即另一个用户的信。现在全部按所有者解析并返回 404。
2. **`DELETE /diaries/:id` 从不落盘**（F11）。返回 200 之后重启，日记会回来。现在响应前写库。
3. **`DELETE /posts/:id` 任何人可删**（F12）。没有作者校验。现在只有作者可删，管理员走审核路由。
4. **审计列表看不到审计行**（F14）。单条敏感记录读取把 `AuditLog` 直接写进 PostgreSQL，而 `GET /admin/v1/audit-logs` 读的是内存副本，所以"谁看过这条私密记录"要等下一次重启才可见。现在路由以表为准，并合并尚未落盘的内存行。
5. **验收证据门禁自身太宽松**（F05）。第一次运行出现过 9 步里 2 步 `FAIL`、而测试全绿的情况：`actual` 里多了一个诊断字段导致比较不等。`flush()` 现在先写文件再抛错，并有一个单元自测证明抛出与不抛出两条路径。
6. **生成失败的回信渲染成空白卡片**（F16 看截图发现）。回信详情只有标题和署名，正文为空；数据库里 `content` 为空、`generationStatus=failed`。现在显示"这封回信还没有生成出来"并指向换风格重试。`LetterToday` 同样补了空状态。
7. **月报第一栏被截断**（F16 看截图发现）。"焦虑出现得更多"在 1/3 宽的一行里被省略成"焦虑出现得…"，丢掉关键信息；现在文案改为"焦虑最多"，并允许用户行动标题折两行。
8. **月报的月份选择器不可见**（F16 看截图发现）。按钮还保留着旧深色 hero 的白字颜色，在浅色页面上几乎看不见，而它是切换月份的唯一入口。现在改为可读的灰色并加下划线。

## 观测到但未在本轮修复的问题

- **`WORKER-RELOAD-FLUSH-LOCK`**：投递后的 `reloadRuntimeState()` 会执行一次全库 legacy flush。用 `pg_stat_activity` 抓到的锁链是：一个事务持有 `LifeJourney ... FOR UPDATE` 并处于 idle in transaction，worker 的 `UserNotification` 插入等待该事务，另一个 `INSERT INTO "User"` 又在等 worker，5 秒事务预算到期后 job 被记为失败并重试（投递本身已提交）。这属于 Batch 4 要退役的那层 flush，已记入 `MASTER_TASK_QUEUE.json`。
- **`/api/health` 是静态存活探针**，不检查数据库。环境自检由 `scripts/dev/stack-probe.mjs` 做真实查询承担；产品健康检查是否要改成就绪探针，需要单独决定。

## 复现

```bash
RUN=run-acceptance-$(date +%Y%m%d-%H%M%S)
ACCEPTANCE_RUN_ID=$RUN npx tsx scripts/test-runner.ts tests/acceptance
MSYS_NO_PATHCONV=1 APK_SHA256=$(sha256sum apps/mp/android/app/build/outputs/apk/debug/app-debug.apk | cut -d' ' -f1) \
  node scripts/acceptance/android-page-pass.mjs --run $RUN
node scripts/acceptance/build-summary.mjs --run $RUN --require-all
```
