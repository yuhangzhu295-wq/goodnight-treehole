# First-stage Reference Fidelity Final

本报告只覆盖第一阶段指定的 11 张 UI 参考图。参考图与实际页面均按原始 `420x786` 尺寸捕获；参考图只用于对照，不作为页面背景。

## Evidence

- 每页产物：`*-reference.png`、`*-actual.png`、`*-side-by-side.png`、`*-difference.png`。
- 截图目录：`artifacts/reference-fidelity/first-stage/`（每个状态四张图，均为最终代码截图）。
- 自动检查：真实 DOM 文案、无横向溢出、截图尺寸、业务状态可达。
- 视觉结论仍以逐张打开 reference、actual、side-by-side、difference 后的人工审查为准，像素差异不是业务通过条件。

| 页面 | Reference | Viewport | Capture | scrollWidth | scrollHeight |
| --- | --- | --- | --- | ---: | ---: |
| tonight | 01_今晚怎么了.png | 420x786 | CAPTURED | 420 | 866 |
| confirm | 36_经历指纹确认_正式版.png | 420x786 | CAPTURED | 420 | 902 |
| temperature | 29_情绪温度计.png | 420x786 | CAPTURED | 420 | 855 |
| intent | 13_你现在最需要什么.png | 420x786 | CAPTURED | 420 | 815 |
| stabilize | 32_我先接住你.png | 420x786 | CAPTURED | 420 | 846 |
| safety | 33_SafetyFlow_正式版.png | 420x786 | CAPTURED | 420 | 996 |
| reality | 16_现实求助卡.png | 420x786 | CAPTURED | 420 | 991 |
| action | 06_今晚只做这一件事.png | 420x786 | CAPTURED | 420 | 888 |
| adaptive | 37_AdaptiveMicroAction.png | 420x786 | CAPTURED | 420 | 1037 |
| notification | 39_提醒与回访.png | 420x786 | CAPTURED | 420 | 894 |
| timeline | 34_Journey时间线_正式版.png | 420x786 | CAPTURED | 420 | 878 |

## Manual Review

| 页面 | 状态 | 复核结论 |
| --- | --- | --- |
| #1 Tonight | PARTIAL | 结构与真实输入、快捷入口、旅程、继续 CTA 已对齐；已接入无文字月夜装饰裁切，和参考图的完整月夜插画仍有差异。 |
| #36 经历确认 | DONE | 三段内容使用自然短句、圆点和细分隔，不显示内部字段；确认、改一处、重新整理仍为真实动作。 |
| #29 情绪温度 | DONE | 1-10 强度、症状、脑内一句和两个真实 CTA 保留；数值重复已压缩，390px 内 CTA 可见。 |
| #13 当前需要 | PARTIAL | 真实八项需要与路由动作保留，网格比例接近参考；仍缺参考图中的完整手绘场景插画。 |
| #32 我先接住你 | PARTIAL | 呼吸、冷静箱、写一句、现实求助均真实可用，布局接近；主视觉仍偏 CSS 场景。 |
| #33 Safety | DONE | 现实求助、12356、120、暂时安全和三步行动均保留，信息层级清晰且无横溢出。 |
| #16 Reality Handoff | DONE | 主 CTA 提前可见，编辑、保存、复制保持真实；联系人改为底部弹层，保存只显示轻状态。 |
| #6 Action | PARTIAL | Hero 去除自绘时间，行动建议仍走真实 AI Job；已接入无文字月夜装饰裁切，和参考图的完整背景插画仍有差异。 |
| #37 Adaptive Action | PARTIAL | 阻碍选择、真实 AI 生成、接受新行动均保留；场景插画仍需后续素材精修。 |
| #39 Notification | DONE | 六类通知保持 GET/PATCH/targetRoute 逻辑，卡片改为独立插画而非单一 SVG 图标，全局 TabBar 保留。 |
| #34 Journey Timeline | PARTIAL | 真实 update kind 和时间线映射未改，关键节点接入轻量插画；与参考图的完整水彩场景仍有差异。 |

## Responsive QA

- 已按 `375x812`、`390x844`、`393x852`、`430x932` 运行 `test:reference-qa-first-stage-shells`、`test:reference-qa-journey` 和 `test:reference-qa-action`。
- Shell / Journey / Action 的四尺寸结果分别见 `docs/first-stage-shell-reference-qa.md`、`docs/journey-reference-qa-report.md`、`docs/action-reference-qa-report.md`；各项均无横向溢出。
- 真实按钮点击与固定 TabBar 遮挡通过 `diagnose:clickability` 和 `test:click-all` 复核。

## Runtime Safety

- 未修改 Prisma Schema、API、AI Provider、DAPI、BullMQ、Peer/Me/Report/Admin 结构。
- 末尾通过 testing cleanup 清理本轮 Journey fixture，避免测试行动和测试决定残留在普通前台。
