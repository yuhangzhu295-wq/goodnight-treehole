# Action Reference QA

当前只验收 #6「今晚，只做这一件事」与 #37「没做到也没关系」。

## Source

reference-recommendation.png ← #6；reference-adaptive.png ← #37。

## Semantic And Layout Assertions

- 推荐态包含标题、真实推荐行动标题和「我愿意试试」。
- Adaptive 态包含标题、阻碍选项、真实 DAPI 生成的缩小行动和「试试这个更小一步」。
- 375x812、390x844、393x852、430x932 均无横向溢出。
- 测试页面未出现浏览器回归词、direct-check 或 fixture 文本。

## Recommendation Comparisons

| viewport | actual | side-by-side | difference | mismatch ratio | scroll height |
| --- | --- | --- | --- | ---: | ---: |
| 375x812 | actual-recommendation-375x812.png | side-by-side-recommendation-375x812.png | difference-recommendation-375x812.png | 0.1199 | 848 |
| 390x844 | actual-recommendation-390x844.png | side-by-side-recommendation-390x844.png | difference-recommendation-390x844.png | 0.1488 | 848 |
| 393x852 | actual-recommendation-393x852.png | side-by-side-recommendation-393x852.png | difference-recommendation-393x852.png | 0.1428 | 920 |
| 430x932 | actual-recommendation-430x932.png | side-by-side-recommendation-430x932.png | difference-recommendation-430x932.png | 0.1069 | 932 |

## Adaptive Comparisons

| viewport | actual | side-by-side | difference | mismatch ratio | scroll height |
| --- | --- | --- | --- | ---: | ---: |
| 375x812 | actual-adaptive-375x812.png | side-by-side-adaptive-375x812.png | difference-adaptive-375x812.png | 0.207 | 926 |
| 390x844 | actual-adaptive-390x844.png | side-by-side-adaptive-390x844.png | difference-adaptive-390x844.png | 0.1813 | 932 |
| 393x852 | actual-adaptive-393x852.png | side-by-side-adaptive-393x852.png | difference-adaptive-393x852.png | 0.2602 | 1051 |
| 430x932 | actual-adaptive-430x932.png | side-by-side-adaptive-430x932.png | difference-adaptive-430x932.png | 0.159 | 1037 |

## Review

- 区域顺序：Hero → 主行动纸张 → 跟进条/阻碍选择 → 辅助入口/缩小行动 → 固定导航。
- 主 CTA：推荐态在主纸张末端；Adaptive CTA 在缩小行动卡之后。
- 视觉差异比对仅作区域审查依据，不将像素比例当作业务通过条件。
