# 晚安树洞前台 06-14 真实交互合同

生成时间：2026-07-05

本合同只覆盖前台 06-14，不改变 01-05 已完成页面。合同源文件为 `tests/contracts/front-phase2-phase3-interactions.json`，自动诊断和真实浏览器测试均以该文件为准。

## 页面与路由

| 设计图 | 页面 | 路由 |
| --- | --- | --- |
| 06 | 情绪工具 | `/pages/tool/index` |
| 07 | 情绪拆解 | `/pages/tool/decompose` |
| 08 | 我的 | `/pages/me/index` |
| 09 | 我的日记 | `/pages/diary/index` |
| 10 | 情绪月报 | `/pages/report/month` |
| 11 | 我的回信 | `/pages/letter/list` |
| 12 | 我的收藏 | `/pages/favorite/index` |
| 13 | 隐私设置 | `/pages/settings/privacy` |
| 14 | 帮助与反馈 | `/pages/help/feedback` |

保留兼容路由：`/pages/letter/index`、`/pages/diary/list`、`/pages/favorite/list`、`/pages/feedback/index`。

## 真实交互原则

- 每个可点区域必须是自身可命中的真实 DOM 控件，`elementFromPoint` 命中控件自身或其内部真实子节点。
- 禁止使用设计图整图作为页面主体，禁止透明热区、代理层、覆盖层接管点击。
- 所有按钮必须产生至少一种证据：路由变化、DOM 状态变化、网络请求、持久化数据变化。
- 页面内禁止出现英文测试残留：`Rewrite`、`Rant`、`Heal`、`Sleep`、`Work`、`Future`、`Poster`、`Save`、`Clear data`、`Live backend sync ok`。
- 07 情绪拆解保存必须走 `POST /api/v1/diaries`，不再只调用旧的任务保存接口。

## 后端接口合同

| 场景 | 接口 |
| --- | --- |
| 工具列表 | `GET /api/v1/tools` |
| 工具运行 | `POST /api/v1/tools/run` |
| 情绪拆解 | `POST /api/v1/tools/emotion-decompose` |
| 保存日记 | `POST /api/v1/diaries` |
| 日记列表 | `GET /api/v1/diaries?month=&emotion=&hasLetter=` |
| 导出日记 | `POST /api/v1/diaries/export` |
| 月报 | `GET /api/v1/reports/monthly?month=` |
| 月报建议 | `GET /api/v1/reports/monthly/:month/advice` |
| 月报分享图 | `POST /api/v1/reports/monthly/:month/poster` |
| 回信列表 | `GET /api/v1/letters?status=` |
| 标记已读 | `PATCH /api/v1/letters/:id/read` |
| 点赞回信 | `POST /api/v1/letters/:id/like` |
| 收藏/取消收藏回信 | `POST /api/v1/letters/:id/favorite` / `DELETE /api/v1/letters/:id/favorite` |
| 收藏列表 | `GET /api/v1/favorites?type=` |
| 隐私设置 | `GET /api/v1/settings/privacy` / `PUT /api/v1/settings/privacy` |
| 反馈 | `GET /api/v1/feedback/faqs`、`GET /api/v1/feedback/categories`、`POST /api/v1/feedback` |

## 验收命令

`pnpm qa:front-rest` 必须顺序运行：

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm diagnose:front-rest`
4. `pnpm test:front-phase2-tools`
5. `pnpm test:front-phase3-me`
6. `pnpm test:front-rest-cross-flow`
