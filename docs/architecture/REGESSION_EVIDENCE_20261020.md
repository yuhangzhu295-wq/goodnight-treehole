# 全量回归证据（HEAD `de862ba`，2026-10-20）

每一个数字都是这一轮跑出来的，不是从旧报告抄的。

| 层 | 命令 | 结果 |
| --- | --- | --- |
| unit | `npx vitest run tests/unit` | **45/45**（8 个文件） |
| api | `npx tsx scripts/test-runner.ts vitest run tests/api` | **2/2** |
| business | `node scripts/run-suite-segmented.mjs tests/business --segment 6` | **50/50**，`{PASS: 50}` |
| e2e | `node scripts/run-suite-segmented.mjs tests/e2e --segment 8` | **12/12**，`{PASS: 12}` |
| SELF_DUAL_WRITER | `pnpm audit:self-dual-writer` | exit 0 |
| route consent 轴 | `pnpm audit:route-consent` | exit 0 |

`node scripts/run-suite-segmented.mjs` 每个文件独立 lease 一个库、串行跑、跑完 DROP。它会把"段内失败、单独跑通过"的文件标成
`TRANSIENT` 并让整个命令退出非零；这一轮没有触发过，`{PASS: 50}` 和 `{PASS: 12}` 里没有 TRANSIENT。

## 这一轮里新增/改动过、且这轮重跑过的东西

- `tests/unit/media-attachment-delete.spec.ts`（新建）— 草稿删除的附件守卫：mood 附件、diary 附件、
  工单截图三条路径各拒绝一次，作者能删自己的、不能删别人的。含一个"工单存在但引用别的资产"的负例。
- `tests/business/privacy-revocation-safety.spec.ts`（+3 case）— AI/记忆两个 consent 的撤销边界。
  `allowAiMemoryUse` 关掉后 AI 上下文空、作者自己的读还在；`allowLongTermMemory` 关掉后不能新建、
  已存的还能读（设计规定这个 flag 只管保存）。**反向证明**：去掉 AI consent 谓词，第一条 case 失败。
- `tests/business/batch3-self-multi-instance.spec.ts`（+1 case）— 两个实例投递同一封未来信，
  独立客户端读终态。断言里有"恰好一方 `skipped`"，因为通知 id 是确定性的、`skipDuplicates` 会让
  "写了两遍"看起来和"只写一遍"一样。**反向证明**：去掉 claim 的状态谓词，该 case 失败。
- `scripts/audit-route-consent-coverage.mjs`（新建）— consent 轴从代码派生：170 条 C 端路由里 15 条
  走到 `privacyAllows`，其余按"为什么没有门禁"分类，不留成疑似缺口。

## 未覆盖 / 阻塞

- **19 页 C 端 UI 的人工视觉判定没有做完。** 机器可判的四项（路由匹配、无错误元素、无探针字面量、
  正文长度）19/19 通过，记录在 `docs/design-v2/UI_V2_R4_CAPTURE_VERIFICATION.md`；但 PASS/FAIL 需要能读图的
  审查者，审查通道（chatgpt.com 上游）在写这份文档时不可达。这是**未完成**，不是通过。
- **LetterToday 浮条没有实测。** 它只在生成动作后才渲染，抓取时 `statusText` 为空，所以"是否压住按钮"
  这一条没有量到。
- 外部阻塞照旧：无 DAPI secret（`DAPI_VERIFIED=false`）、无实体 Android（`PHYSICAL_ANDROID_VERIFIED=false`）、
  无 Mac（`IOS_SOURCE_VERIFIED=true` / `IOS_NATIVE_VERIFIED=false`）。
