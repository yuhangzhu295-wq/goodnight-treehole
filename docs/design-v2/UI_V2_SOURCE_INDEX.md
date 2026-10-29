# UI V2 整改 — 项目级资料索引（Batch 0 产出）

本文件是 UI V2 整改的单一事实来源，记录资料位置、页面映射与验收条件。
`docs/design-v2/UI_V2_MASTER_QUEUE.json` 是执行队列（每页的独立状态字段），本文件解释它从哪来。

> 状态口径：**只有每种验收条件都有证据时，一页才允许标 DONE。**
> "改完了" / "构建通过" / "截好图" 单独一项都不算完成。

## 1. 资料来源（已验证存在）

| 资料 | 路径 | 内容 |
| --- | --- | --- |
| V2 原始设计交付包 | `C:\Users\zyu33\Downloads\V2 完整交付包` | 137 个文件：39 张设计图、39 份逐页提示词、45 个可复现 HTML 原型、8 张关键状态图、1 份 DOCX、1 份一次性实施总提示词 |
| V2 设计图目录 | `…\V2 完整交付包\设计图` | `01_TonightHome.png` … `39_HelpFaqs.png`，390×844 CSS px（输出 780×1688） |
| V2 逐页提示词 | `…\V2 完整交付包\逐页提示词` | 39 份 `.md`，每页一份 |
| 关键状态补充图 | `…\V2 完整交付包\关键状态补充` | 键盘顶起、空态、长页共 8 张 |
| HTML 原型 | `…\V2 完整交付包\可复现HTML原型` | 45 个 `.html`，可复现的结构源码（非 Vue 生产代码） |
| 52 张逐页对照审计 | `C:\Users\zyu33\Downloads\审计` | Word 2007+ 文档（11.3 MB，内含 82 张嵌入图）。解出件在 `artifacts/v2-source/audit-docx/` |
| 审计结构化抽取 | `artifacts/v2-source/audit-pages.json` | 52 条记录：路由 / 设计图 / 关系 / 观察 / 建议 / 动态验收 |
| 当前截图 | `artifacts/ui-screenshots/`（本机） | 52 PNG + `report.json`，gitignored |

`README.txt` 明确：**示例用户与数值仅用于排版，禁止写进真实业务**；HTML 是结构原型而非生产代码。

审计报告自陈边界（原文）：结论仅基于单帧截图 + V2 静态设计，**没有运行中的 APK、网络或数据库证据**，
因此它宣布"不存在已证实的 P0 功能漏洞"，而不是宣布无漏洞。所有 P1/P2 都需动态验收。

## 2. 52 张截图 → 39 张设计图 → 真实路由

审计的 `report.json` 顺序 = 本表顺序。9 页是**合法别名**（同一组件的另一条路由），不是重复截图：

<!-- MAP-TABLE-START -->
| 审计 slug | 路由 | V2 设计图 | 关系 | 优先级 |
| --- | --- | --- | --- | --- |
| tonight-home | `/pages/tonight/index` | 01_TonightHome.png | 基本接近 | P2 |
| square | `/pages/square/index` | 22_Square.png | 明显偏离 | P1 |
| peer-network | `/pages/peers/index` | 02_PeerNetwork.png | 部分接近 | P1 |
| peer-requests | `/pages/peer/requests` | 07_PeerRequests.png | 结构偏离 | P1 |
| action-center | `/pages/action/index` | 03_ActionCenter.png | 基本接近 | P2 |
| future-self | `/pages/future-self/index` | 15_FutureSelf.png | 部分接近 | P1 |
| tool-index | `/pages/tool/index` | 26_ToolIndex.png | 明显偏离 | P1 |
| tool-decompose | `/pages/tool/decompose` | 27_ToolDecompose.png | 明显偏离 | P1 |
| tool-rewrite | `/pages/tool/rewrite` | 28_ToolRun.png | 缺少专属设计图 | P1 |
| tool-rant | `/pages/tool/rant` | 28_ToolRun.png | 缺少专属设计图 | P1 |
| tool-heal | `/pages/tool/heal` | 28_ToolRun.png | 缺少专属设计图 | P2 |
| tool-sleep | `/pages/tool/sleep` | 28_ToolRun.png | 缺少专属设计图 | P2 |
| tool-work | `/pages/tool/work` | 28_ToolRun.png | 缺少专属设计图 | P2 |
| tool-breakdown | `/pages/tool/breakdown` | 27_ToolDecompose.png | 合法别名 | P1 |
| tool-future | `/pages/tool/future` | 28_ToolRun.png | 缺少专属设计图 | P2 |
| tool-run | `/pages/tool/run` | 28_ToolRun.png | 合法别名 | P1 |
| recovery | `/pages/recovery/index` | 16_Recovery.png | 状态不可比 | P2 |
| support-plan | `/pages/support-plan/index` | 17_SupportPlan.png | 结构较接近 | P2 |
| stable-self | `/pages/stable-self/index` | 18_StableSelf.png | 结构偏离 | P1 |
| decision-vault | `/pages/decision/index` | 20_DecisionVault.png | 不同业务状态 | P1 |
| memory-center | `/pages/memory/index` | 19_MemoryCenter.png | 状态不可比 | P2 |
| notifications | `/pages/notifications/index` | 14_NotificationCenter.png | 状态不可比 | P2 |
| reality-handoff | `/pages/reality-handoff/index` | 12_RealityHandoff.png | 部分偏离 | P2 |
| safety-support | `/pages/safety/index` | 13_SafetySupport.png | 安全优先问题 | P1 |
| me | `/pages/me/index` | 04_Me.png | 部分接近 | P2 |
| me-profile | `/pages/me/profile` | 29_MeProfile.png | 基本接近 | P2 |
| me-diaries | `/pages/me/diaries` | 30_DiaryList.png | 合法别名且旧风格 | P1 |
| me-month-report | `/pages/me/month-report` | 32_ReportMonth.png | 合法别名且旧风格 | P1 |
| diary-list | `/pages/diary/index` | 30_DiaryList.png | 明显偏离 | P1 |
| letter-list | `/pages/letter/list` | 33_LetterList.png | 明显偏离 | P1 |
| letter-today | `/pages/letter/index` | 25_LetterToday.png | 明显偏离 | P1 |
| letter-today-alias | `/pages/letter/today` | 25_LetterToday.png | 合法别名 | P1 |
| reply-today | `/pages/reply/today` | 25_LetterToday.png | 合法别名 | P1 |
| archive | `/pages/archive/index` | 21_Archive.png | 产品架构冲突 | P1 |
| favorites | `/pages/favorite/index` | 35_FavoriteList.png | 状态不可比且旧风格 | P2 |
| settings-privacy | `/pages/settings/privacy` | 36_PrivacySettings.png | 功能多于设计图 | P2 |
| settings-data-policy | `/pages/settings/data-policy` | 37_DataPolicy.png | 基本接近但旧风格 | P2 |
| help-feedback | `/pages/help/feedback` | 38_FeedbackHelp.png | 功能较全但视觉偏离 | P2 |
| help-faqs | `/pages/help/faqs` | 39_HelpFaqs.png | 状态不可比 | P2 |
| feedback-list | `/pages/feedback/index` | 38_FeedbackHelp.png | 合法别名 | P2 |
| mood-create | `/pages/mood/create` | 23_MoodCreate.png | 明显偏离 | P1 |
| post-create | `/pages/post/create` | 23_MoodCreate.png | 合法别名 | P1 |
| report-month | `/pages/report/month` | 32_ReportMonth.png | 合法别名 | P1 |
| journey-detail | `/pages/journey/detail?id=journey_c89242ebea` | 05_JourneyDetail.png | 流程状态不可比 | P2 |
| diary-detail | `/pages/diary/detail?id=diary_38a365646e` | 31_DiaryDetail.png | 信息不足 | P1 |
| letter-detail | `/pages/letter/detail?id=letter_64c896ddac` | 34_LetterDetail.png | 信息层级不足 | P1 |
| post-detail | `/pages/post/detail?id=post_seed_lianai` | 24_PostDetail.png | 明显偏离 | P1 |
| peer-detail | `/pages/peer/detail?id=experience_1791786688036_5ec472a7` | 06_PeerExperienceDetail.png | 明显偏离 | P1 |
| peer-consent | `/pages/peer/consent?matchId=peer_match_1792524693988_74281976` | 09_PeerConsent.png | 结构偏离 | P1 |
| peer-conversation | `/pages/peer/conversation?matchId=peer_match_1792524693988_74281976` | 10_PeerConversation.png | 部分接近 | P2 |
| peer-wait | `/pages/peer/wait?matchId=peer_match_1792524693988_74281976` | 08_PeerMatchWaiting.png | 重大状态疑点 | P1 |
| peer-graduate | `/pages/peer/graduate?matchId=peer_match_1792524693988_74281976` | 11_PeerGraduation.png | 结构偏离但不能删业务 | P2 |
<!-- MAP-TABLE-END -->

完整 52 行由 `artifacts/v2-source/audit-pages.json` 提供（机器可读），上表的口径与它一致。
9 个合法别名：`tool-breakdown→27_ToolDecompose`、`tool-run→28_ToolRun`、`me-diaries→30_DiaryList`、
`me-month-report→32_ReportMonth`、`letter-today-alias→25_LetterToday`、`reply-today→25_LetterToday`、
`feedback-list→38_FeedbackHelp`、`post-create→23_MoodCreate`、`report-month→32_ReportMonth`。

**没有专属设计图的工具页**（`tool-rewrite`/`rant`/`heal`/`sleep`/`work`）全部指向 `28_ToolRun`，
与"复用统一 ToolRun 框架"的建议一致；`tool-future` 指向 `27_ToolDecompose`。整改目标是统一结构，
不是给每页造一张新设计图。

## 3. 不能盲从审计的 9 处（状态/架构冲突）

按指示「两者冲突时，先核对原始逐页设计要求及产品契约，不允许盲从任一份报告」。以下 9 页审计判为
状态不可比 / 不同业务状态 / 架构冲突 / 重大状态疑点，**不许直接照图覆盖**：

| 页 | 审计判词 | 处理原则 |
| --- | --- | --- |
| `recovery` | 状态不可比 | 设计要求是"低谷预案"，当前是授权门禁；保留门禁，授权后按 V2 结构呈现 |
| `decision-vault` | 不同业务状态 | V2 画的是另一种业务状态；保留冷静期与越权禁止，双视图而非覆盖 |
| `memory-center` | 状态不可比 | 保留"允许 / 过期 / 已停用 / 可重新同意 / 已删除"真实状态 |
| `notifications` | 状态不可比 | 显示真实数量，不填充假数据 |
| `archive` | 产品架构冲突 | 现状与 V2 职责不同；核对路由与数据模型后决定如何合并，不删原功能 |
| `favorites` | 状态不可比且旧风格 | 保留收藏语义，改视觉 |
| `help-faqs` | 状态不可比 | 空列表是合法空态 |
| `journey-detail` | 流程状态不可比 | 当前旅程处于确认阶段，是合法流程状态 |
| `peer-wait` | **重大状态疑点** | 必须核验它是否只是复用了 `peer-conversation` 的视觉组件而显示相同业务状态。这是唯一被标"重大"的疑点 |

## 4. 优先级分布（来自审计原文）

- **P1 = 30 项**：高优先级视觉/结构改造或重要待核验状态。
- **P2 = 22 项**：辅助视觉、布局与合法状态差异。

按族统计 P1：日记/回信/旅程 14、工具 6、同路 4、其他 4、主 Tab 2、设置支持 0。

## 5. 每页验收门槛（一页 DONE 需要全部满足）

1. 路由与职责正确（别名页要证明走的是同一条组件而非错误状态）。
2. 目标设计图匹配（没有专属设计图的页，用统一 ToolRun 结构判）。
3. 主要视觉结构完成；无明显溢出、遮挡、错位、不可达操作。
4. 按钮 / 输入 / 滚动 / 返回 / 弹层 / 导航**真实有效**。
5. 数据来自真实 API、真实本地状态，或**明确的合法空状态**。
6. 隐私与权限状态正确。
7. 有数据 / 无数据 / 加载 / 失败状态经过验证。
8. 定向测试通过 + 相关业务回归通过。
9. 真实截图已采集并与设计图对照。
10. **独立视觉审查通过** + **独立代码审查通过**（开发代理不得自批）。

未满足 9/10 而无法取得独立审核时，状态记为 `WAITING_REVIEW`，不得记为 `REVIEW_APPROVED`。

## 6. 当前已知阻塞（如实标记）

- 无 DAPI secret → AI 生成类任务 `NOT_RUN_NO_SECRET`，不得声称通过。
- 无实体 Android → `PHYSICAL_ANDROID_VERIFIED=false`；模拟器截图可采，但不得冒充真机。
- 无 Mac → `IOS_SOURCE_VERIFIED=true`、`IOS_NATIVE_VERIFIED=false`。
- 模拟器前台被其他项目抢占，会切断 CDP；采集脚本已改为抢不回前台即中止，而不是对着别的 App 拍照。

## 7. Batch 0 基线结论（已核定）

真实代码核对结果（脚本 `scripts/build-view-registry.mjs`，产物 `artifacts/v2-source/view-registry.json`）：

- **真实路由 54 条，独立视图 39 个**——与 39 张设计图一一对应。
- **8 组共用组件**（一条以上路由到达同一组件），全部标记为别名视图。审计列的 9 个别名与此一致，
  并额外发现 3 组审计未列的：`/pages/diary/list`、`/pages/favorite/list`、`/pages/reply/today`。
  共用最多的是 `ToolRun`（7 条路由：run / rewrite / rant / heal / sleep / work / future）。
- `PeerMatchWaiting` 与 `PeerConversation` 在代码里是**两个不同组件**；审计对 `peer-wait` 的
  "重大状态疑点"必须动态核验，不能只靠静态结论，也不许照图覆盖。
- 39 个视图全部有审计捕获；仅 `/pages/diary/list`、`/pages/favorite/list` 两条路由未被审计走到，
  已确认是既有组件的别名路由而非缺失。
- 设计图完整性：39/39 符合 README 规格 780×1688、编号 01–39 无缺口、无空文件。
- 设计图与本 App 截图的布局相关性中位数 0.638（`scripts/verify-design-identity.py`），
  最低的正是审计判 P1"明显偏离"的页（`square`、`diary-list`、`letter-detail`）——同一产品的不同版本，
  不是另一个 App 的图。

分支与工作区：当前分支 `codex/ui-v2-native-redesign` 即 UI V2 专用分支（PR #2 挂载其上、未合并），
开工前工作区干净，无其他代理并发写入，`scripts/backup-*.ps1` 可用。

## 8. 复现方式

```bash
node scripts/read-audit-docx.mjs        # 解出审计 DOCX 文本/表格/图片
node scripts/extract-audit-pages.mjs    # 生成 audit-pages.json（52 条结构化记录）
node scripts/build-view-registry.mjs    # 生成 view-registry.json（39 个唯一视图）
python scripts/verify-design-identity.py # 设计图 vs 截图布局相关性
node scripts/verify-design-package.mjs  # 设计图规格与编号完整性
node scripts/render-source-index.mjs    # 把 52 行映射表渲染回本文档
node scripts/capture-all-ui.mjs         # 重采 52 张当前截图（需模拟器 + CDP）
```

