# 晚安树洞当前交互审计

生成时间：2026-07-04 22:34

## 结论

当前前台和后台已经从“设计图/热区/透明按钮壳”修复为真实 DOM、真实路由、真实接口联动。

- 前台不再依赖 `ref-shell`、`ref-content`、`hotspot`、`live-layer`。
- 后台不再依赖 `admin-ref-shell`、`admin-ref-content`、透明热区或坐标代理点击。
- 所有可交互项都有可见中文控件、稳定 `data-testid`、对应 API 或明确本地状态变更。
- `04-树洞详情-回复抽屉打开态` 已实现为 `/pages/post/detail?id=...&sheet=reply` 的 bottom sheet 状态，不是独立路由。
- 前台 `/api/v1/*` 与后台 `/api/admin/v1/*` 共享同一份持久化状态。

## 已验证范围

- 前台正式页面：广场、写心情、树洞详情、回复抽屉、今日回信、工具、情绪拆解、我的、日记、我的回信、收藏、情绪月报、隐私设置、帮助反馈。
- 后台正式页面：登录、概览、用户、树洞内容、回信审核、AI 供应商、AI 路由、AI 任务、反馈工单、系统配置。
- 关键联动：前台发布公开树洞后后台审核，前台可见；前台提交回复后后台审核，详情可见；前台反馈后后台解决，前台状态可查。

## 自动化证据

- `artifacts/diagnosis/runtime-fingerprint.json`
- `artifacts/diagnosis/dom-overlay-report.md`
- `artifacts/diagnosis/route-binding-report.json`
- `artifacts/diagnosis/api-binding-report.md`
- `artifacts/diagnosis/clickability-report.md`
- `artifacts/diagnosis/ui-artifact-audit.md`
- `artifacts/test-report/real-user-front.md`
- `artifacts/test-report/real-user-admin.md`
- `artifacts/test-report/real-user-cross-flow.md`
- `artifacts/test-report/click-all-report.md`
- `artifacts/test-report/business-flow-report.md`

## 最终验证结果

- `pnpm qa:all`：通过。
- `pnpm diagnose:clickability`：109 个控件全部通过，`document.elementFromPoint` 命中真实可见控件。
- `pnpm test:click-all`：109/109 通过。
- `pnpm test:business-flow`：10/10 通过。
- `pnpm test:real-browser-front-clicks`：8/8 通过。
- `pnpm test:real-browser-admin-clicks`：6/6 通过。
- `pnpm test:real-browser-cross-flow`：3/3 通过。
