# 晚安树洞前台 01-05 第一轮真实交互修复报告

生成时间：2026-07-04T19:39:30Z

## 修复范围

本轮只覆盖前台 01-05：

- 01-广场：`/pages/square/index`
- 02-写下心情：`/pages/mood/create`
- 03-树洞详情：`/pages/post/detail?id=:id`
- 04-树洞详情回复抽屉：`/pages/post/detail?id=:id&sheet=reply`
- 05-今日回信：`/pages/letter/index`

未扩散到前台 06-14，未重做后台页面。

## 主要修复

- 将 01-05 的中文按钮、卡片、textarea、select、bottom sheet、tabbar 操作落成真实 DOM 控件。
- 广场筛选改为真实中文 emotion 参数：`委屈`、`焦虑`、`失眠`、`恋爱`、`工作`、`全部`。
- 写心情页接入真实 `POST /api/v1/moods`、图片资源创建接口和发布后跳转。
- 详情页接入真实详情、回应列表、抱抱、收藏、更多菜单和回复抽屉。
- 回复抽屉保持在详情页同一路由状态内，支持 `sheet=reply` 直达打开。
- 今日回信页接入今日回信读取、风格切换、重新生成、保存到日记、分享图片和建议按钮。
- `/api/v1/reply-presets` 补齐本轮要求的 5 条中文快捷回复。
- 修复 first5 诊断脚本，加入构建标记、禁用词/热区扫描、elementFromPoint 命中、表单值变化和 64 控件点击验证。

## 禁止项检查

- 未使用 `design_refs/front/01-05` 整图作为页面主体或背景。
- 未使用透明热区、代理点击层或测试覆盖层。
- `apps/mp/src` 扫描未发现：`interaction-layer`、`hotspot`、`proxy-button`、`click-layer`、`test-layer`。
- first5 页面未出现可见英文测试词：`Rewrite`、`Rant`、`Heal`、`Sleep`、`Work`、`Future`、`Poster`、`Save`、`Clear data`、`Live backend sync ok`。

## 验证结果

`pnpm qa:first5` 已通过：

- `pnpm lint`
- `pnpm typecheck`
- `pnpm diagnose:first5`
- `pnpm test:front-first5-real-user`
- `pnpm test:front-first5-business-flow`

诊断结果：

- Runtime：PASS
- Overlay：PASS
- Routes：PASS
- API：PASS
- Clickability：64 / 64 PASS

真实点击结果：

- Front first5 real user：6 / 6 PASS
- Front first5 business flow：5 / 5 PASS

## 证据路径

- 诊断总报告：`docs/first5-current-diagnosis.md`
- 交互合同：`docs/front-first5-interaction-contract.md`
- 机器可读合同：`tests/contracts/front-first5-interactions.json`
- 真实用户点击报告：`artifacts/test-report/front-first5-real-user.md`
- 业务流报告：`artifacts/test-report/front-first5-business-flow.md`
- 截图目录：`artifacts/screenshots/first5/before`、`artifacts/screenshots/first5/after`
- Trace 目录：`artifacts/traces/first5`

## 当前仍需说明

- 公开发布的新树洞沿用现有后端审核规则，创建后状态为 `pending_review`，业务流已通过后台接口验证数据存在。
- 本轮未处理前台 06-14 和后台 01-10。
