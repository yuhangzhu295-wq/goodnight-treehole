# 设计参考与页面清单

本清单是恢复后的 Phase 1 基线。设计图只用于实现比对和经提取的局部资产溯源，不得作为整页背景或透明热点底图。

## 前台

| 参考 | 路由 | 状态 |
| --- | --- | --- |
| `01-square.png` | `/pages/square/index` | 有实现与视觉 manifest |
| `02-mood-create.png` | `/pages/mood/create` | 有实现与视觉 manifest |
| `03-post-detail.png` | `/pages/post/detail?id=post_1` | 有实现与视觉 manifest |
| `04-post-detail-reply-sheet.png` | `/pages/post/detail?id=post_1&sheet=reply` | 有实现与视觉 manifest |
| `05-letter-today.png` | `/pages/letter/index` | 有实现与视觉 manifest |
| `06-tool-index.png` | `/pages/tool/index` | 有实现与视觉 manifest |
| `07-tool-decompose.png` | `/pages/tool/decompose` | 有实现与视觉 manifest |
| `08-me.png` | `/pages/me/index` | 有实现与视觉 manifest |
| `09-diary-list.png` | `/pages/diary/index` | 有实现与视觉 manifest |
| `10-report-month.png` | `/pages/report/month` | 有实现与视觉 manifest |
| `11-letter-list.png` | `/pages/letter/list` | 有实现与视觉 manifest |
| `12-favorite-list.png` | `/pages/favorite/index` | 有实现与视觉 manifest |
| `13-privacy-settings.png` | `/pages/settings/privacy` | 有实现与视觉 manifest |
| `14-feedback-help.png` | `/pages/help/feedback` | 有实现与视觉 manifest |

前台机器可读映射：`scripts/visual/front-pages.ts`。

## 管理后台

| 参考 | 路由 | 状态 |
| --- | --- | --- |
| `01-admin-login.png` | `/login` | 有实现 |
| `02-admin-dashboard.png` | `/dashboard` | 有实现 |
| `03-admin-user-list.png` | `/users` | 有实现 |
| `04-admin-post-content.png` | `/posts` | 有实现 |
| `05-admin-reply-moderation.png` | `/replies/moderation` | 有实现 |
| `06-admin-ai-provider-center.png` | `/ai/providers` | 有实现 |
| `07-admin-ai-style-routing.png` | `/ai/routes` | 有实现 |
| `08-admin-ai-job-log.png` | `/ai/jobs` | 有实现 |
| `09-admin-feedback-ticket.png` | `/ops/feedback` | 有实现 |
| `10-admin-system-settings.png` | `/ops/config` | 有实现 |

`/ops/faqs`、`/ops/reply-presets`、`/ops/feedback-categories` 和 `/audit-logs` 是功能扩展页，当前没有供应的单独设计参考；它们不能被计入十页视觉比对的通过数。

## 可重复审计

运行 `pnpm audit:design-references` 会验证：

- 前台 14 张、后台 10 张参考图及前台 14 条视觉映射齐全；
- 前台映射路由和十个供应的后台设计路由都可在应用路由配置中找到；
- 前后台源代码（`.vue`、`.ts`、`.scss`）不直接引用 `design_refs/`；
- README 不再宣称整张设计图背景/点击层方案；
- 审计结果写入 `artifacts/resume/phase1-design-reference-audit.json`。
