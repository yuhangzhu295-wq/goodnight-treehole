# Journey Reference QA

验收范围：#36 经历确认、#29 情绪温度、#13 当前需要、#32 稳定支持、#34 Journey 时间线。

## Method

- 每张设计参考图均复制到 `artifacts/reference-qa/journey/`，不作为页面背景。
- 截图严格使用 375x812、390x844、393x852、430x932；没有把实际页面拉伸为参考图尺寸。
- 每个视口同时断言 Hero 高度、主区起点和宽度、主 CTA 的 Y 位置、TabBar Y（本 Journey 流程为 N/A）、总滚动高度、主分区数量，以及无横向溢出。
- 业务链路通过真实 UI 创建 Journey、确认、记录温度、选择支持、进入 Action、接受 DAPI 行动、写下后来，再回到真实时间线；末尾从 API 回读强度、`commitment_created` 与 `later` 记录。

## confirm

Reference: 420x786 · artifacts/reference-qa/journey/reference-confirm.png

| viewport | Hero height | main top | main width | CTA y | tabBar y | scroll height | sections |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 375x812 | 176 | 152 | 347 | 500 | 740 | 812 | 3 |
| 390x844 | 176 | 152 | 362 | 500 | 772 | 844 | 3 |
| 393x852 | 176 | 152 | 365 | 500 | 780 | 852 | 3 |
| 430x932 | 176 | 152 | 402 | 500 | 860 | 932 | 3 |

## temperature

Reference: 420x786 · artifacts/reference-qa/journey/reference-temperature.png

| viewport | Hero height | main top | main width | CTA y | tabBar y | scroll height | sections |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 375x812 | 176 | 152 | 347 | 606 | 740 | 841 | 2 |
| 390x844 | 176 | 152 | 362 | 595 | 772 | 844 | 2 |
| 393x852 | 176 | 152 | 365 | 595 | 780 | 852 | 2 |
| 430x932 | 176 | 152 | 402 | 595 | 860 | 932 | 2 |

## intent

Reference: 420x786 · artifacts/reference-qa/journey/reference-intent.png

| viewport | Hero height | main top | main width | CTA y | tabBar y | scroll height | sections |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 375x812 | 177 | 153 | 347 | 316 | 740 | 833 | 8 |
| 390x844 | 177 | 153 | 362 | 304 | 772 | 844 | 8 |
| 393x852 | 177 | 153 | 365 | 304 | 780 | 852 | 8 |
| 430x932 | 177 | 153 | 402 | 304 | 860 | 932 | 8 |

## stabilize

Reference: 420x786 · artifacts/reference-qa/journey/reference-stabilize.png

| viewport | Hero height | main top | main width | CTA y | tabBar y | scroll height | sections |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 375x812 | 176 | 152 | 347 | 260 | 740 | 812 | 3 |
| 390x844 | 176 | 152 | 362 | 260 | 772 | 844 | 3 |
| 393x852 | 176 | 152 | 365 | 260 | 780 | 852 | 3 |
| 430x932 | 176 | 152 | 402 | 260 | 860 | 932 | 3 |

## timeline

Reference: 420x786 · artifacts/reference-qa/journey/reference-timeline.png

| viewport | Hero height | main top | main width | CTA y | tabBar y | scroll height | sections |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 375x812 | 176 | 152 | 347 | 639 | 740 | 920 | 2 |
| 390x844 | 176 | 152 | 362 | 623 | 772 | 904 | 2 |
| 393x852 | 176 | 152 | 365 | 623 | 780 | 904 | 2 |
| 430x932 | 176 | 152 | 402 | 600 | 860 | 932 | 2 |

## Review

- 这五个状态共享同一 Journey ID 与 API 状态机，但每个状态由独立 Screen 组件渲染。
- Journey 是沉浸式流程页，当前不渲染全局 TabBar，因此 TabBar Y 记录为 N/A；底部留白由 Shell 安全区负责。
- 视觉数据用于几何验收，而不是把像素误差当成业务通过依据。
