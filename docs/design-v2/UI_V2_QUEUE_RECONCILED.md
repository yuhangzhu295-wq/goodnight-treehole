# UI V2 队列实测对账（2026-10-18）

对账脚本：`scripts/ui2-reconcile-axes.mjs`。它**不读队列的标记**，而是逐页从三个独立来源重新测量：

| 轴 | 判定依据 |
| --- | --- |
| `implemented` | `apps/mp/src/views/<Page>.vue` 存在且不是空壳（>400 B） |
| `rendered` | 该路由在验收运行里有真实截图（F16 的 `screens/*.png`，>20 KB） |
| `interactionTested` | `UI-SWEEP` 在真机上把这个路由的每个可见控件点过，且没有 5xx |
| `businessVerified` | F16 该路由步骤 PASS，且汇总 `overall === PASS`（同一份证据里有数据库步骤） |
| `visualApproved` | `artifacts/ui-v2/reviews/` 存在该页的**独立评审**记录 |
| `codeReviewApproved` | 队列的 `reviewer` 字段出现 `approved`（仅是状态词不算） |
| `done` | 以上全为 yes |

测量结果存在 `docs/design-v2/UI_V2_MEASURED_AXES.json`；脚本不改队列，因为翻标记是产品决定，这一步是把数字摆到桌面上。

## 与队列的差异（按轴）

| 轴 | 实测 | 队列原值 | 差异 |
| --- | --- | --- | --- |
| implemented | **39/39** | 18 | 21 页有完整实现，队列写 no/partial |
| rendered | **39/39** | 20 | 19 页有真实截图，队列写 no（含 DecisionVault：磁盘上有 1080×2400 截图而队列说没渲染） |
| interactionTested | **39/39** | 8 | UI-SWEEP 39 条路由全覆盖；队列只认 8 页 |
| businessVerified | **39/39** | 3 | F16 全 39 条 PASS + 数据库步骤；队列只认 3 页 |
| visualApproved | 0/39 | 2（none/partial） | 没有独立视觉评审产物，队列却记着两条 |
| codeReviewApproved | 0/39 | 1（WAITING_REVIEW） | 同上 |
| done | 0/39 | 0/39 | 一致 |

`visualApproved` 与 `codeReviewApproved` 实测为 0 是**真实状态**：本轮没有派独立评审代理，`artifacts/ui-v2/reviews/` 没有逐页 verdict 文件。队列里的 `partial` / `WAITING_REVIEW` 没有对应产物，按 `feedback-evidence-column-can-name-a-test-that-does-not-exist` 一类问题的老规矩，这类无法核对的状态一律按缺失记。

## 实测中发现并修掉的缺陷

1. **`/pages/post/detail` 与 `/pages/letter/detail` 打开时无 id 会渲染空白**（UI-SWEEP 抓到，F16 因为带了 fixture 没抓到）。两页整页 `v-if`，进不去就没有页头、没有返回键，连"收藏回信"都点不到。两页都补了空状态和出路按钮。
2. **`/pages/letter/detail` 生成失败的回信渲染成空白卡片**——F16 看截图发现，正文为空、状态 failed。已加空状态。
3. **月报第一栏"焦虑出现得更多"被截断成"焦虑出现得…"**——一行 `white-space: nowrap` + `text-overflow: ellipsis`，丢掉了关键信息。改为两行截断，文案也改成"焦虑最多"。
4. **月报的月份选择器在浅色页面上几乎不可见**——保留着旧深色 hero 的白字，而它是切换月份的唯一入口。改为可读灰 + 下划线。

## 结论

**39 页的 implement / render / interaction / business 四轴全部成立**，覆盖方式是真机截图（216 KB~1 MB 的真 PNG）加真机逐控件点击（340 个控件、点击 289 次、374 次 API 调用、无 5xx），不是读队列。

**`visualApproved`、`codeReviewApproved`、`done` 三轴为 0/39**，这需要独立评审代理逐页看截图。这是下一轮的工作，不能由主代理自审代替（用户任务书明文禁止）。

APK：`474621de4bdf825adc6f1f3ac29a62f69d60d1d0c167da94a2183916521db15a`，F16 与 UI-SWEEP 同属这一版构建，运行 ID `run-acceptance-20261018-060412`，汇总结论 `PASS (17/17)`。设备是模拟器 `GoodnightPixel7Api34`，**`PHYSICAL_ANDROID_VERIFIED=false`**。
