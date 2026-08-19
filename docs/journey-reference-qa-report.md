# Journey Reference QA

验收范围：#36 经历确认、#29 情绪温度、#13 当前需要、#32 稳定支持、#34 Journey 时间线。

## Method

- 每张设计参考图均复制到 `artifacts/reference-qa/journey/`，不作为页面背景。
- 截图严格使用 375x812、390x844、393x852、430x932；没有把实际页面拉伸为参考图尺寸。
- 每个视口同时断言 Hero 高度、主区起点和宽度、主 CTA 的 Y 位置、参考图规定的 TabBar 显隐、总滚动高度、主分区数量，以及无横向溢出。
- 业务链路通过真实 UI 创建 Journey、确认、记录温度、选择支持、进入 Action、接受 DAPI 行动、写下后来，再回到真实时间线；末尾从 API 回读强度、`commitment_created` 与 `later` 记录。

## confirm

Reference: 420x786 · artifacts/reference-qa/journey/reference-confirm.png

| viewport | Hero height | main top | main width | CTA y | tabBar y | scroll height | sections |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 375x812 | 162 | 158 | 327 | 596 | 740 | 860 | 3 |
| 390x844 | 162 | 158 | 342 | 596 | 772 | 860 | 3 |
| 393x852 | 162 | 158 | 345 | 596 | 780 | 860 | 3 |
| 430x932 | 162 | 158 | 382 | 579 | 860 | 932 | 3 |

## temperature

Reference: 420x786 · artifacts/reference-qa/journey/reference-temperature.png

| viewport | Hero height | main top | main width | CTA y | tabBar y | scroll height | sections |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 375x812 | 160 | 136 | 347 | 585 | 740 | 812 | 2 |
| 390x844 | 160 | 136 | 362 | 585 | 772 | 844 | 2 |
| 393x852 | 160 | 136 | 365 | 585 | 780 | 852 | 2 |
| 430x932 | 160 | 136 | 402 | 585 | 860 | 932 | 2 |

## intent

Reference: 420x786 · artifacts/reference-qa/journey/reference-intent.png

| viewport | Hero height | main top | main width | CTA y | tabBar y | scroll height | sections |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 375x812 | 173 | 165 | 335 | 328 | 740 | 845 | 8 |
| 390x844 | 173 | 165 | 350 | 328 | 772 | 845 | 8 |
| 393x852 | 173 | 165 | 353 | 316 | 780 | 852 | 8 |
| 430x932 | 173 | 165 | 390 | 316 | 860 | 932 | 8 |

## stabilize

Reference: 420x786 · artifacts/reference-qa/journey/reference-stabilize.png

| viewport | Hero height | main top | main width | CTA y | tabBar y | scroll height | sections |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 375x812 | 176 | 152 | 347 | 260 | 740 | 840 | 3 |
| 390x844 | 176 | 152 | 362 | 260 | 772 | 844 | 3 |
| 393x852 | 176 | 152 | 365 | 260 | 780 | 852 | 3 |
| 430x932 | 176 | 152 | 402 | 260 | 860 | 932 | 3 |

## timeline

Reference: 420x786 · artifacts/reference-qa/journey/reference-timeline.png

| viewport | Hero height | main top | main width | CTA y | tabBar y | scroll height | sections |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 375x812 | 154 | 140 | 347 | 571 | N/A | 812 | 2 |
| 390x844 | 154 | 140 | 362 | 550 | N/A | 844 | 2 |
| 393x852 | 154 | 140 | 365 | 550 | N/A | 852 | 2 |
| 430x932 | 154 | 140 | 402 | 550 | N/A | 932 | 2 |

## Review

- 这五个状态共享同一 Journey ID 与 API 状态机，但每个状态由独立 Screen 组件渲染。
- #36/#29/#13/#32 参考图显示四栏 TabBar；#34 时间线不显示全局 TabBar，因此只有时间线记录为 N/A，底部留白由 Shell 安全区负责。
- 视觉数据用于几何验收，而不是把像素误差当成业务通过依据。
