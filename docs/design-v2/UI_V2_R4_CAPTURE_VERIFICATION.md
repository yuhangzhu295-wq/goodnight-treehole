# R4 19 页截图：机器可判轴的核验记录

`scripts/capture-ui-v2-pages.mjs` 把 UI V2 队列里此前没有截图的 19 页在真机（emulator-5554）上走过一遍，
每页记录前置条件、路由是否匹配、正文长度、是否渲染出错误元素。

## 前置条件（每次跑之前都校验，不满足就拒绝出图）

- 身份存在：WebView 里 `goodnight-identity-credential` 有值；
- API 可达：`http://127.0.0.1:3000/api/v1/feedback/faqs` 返回 200。

这一条是本文件存在的理由：R3 那批"空白页/发灰页"的假缺陷，就是因为这两个条件不成立时出的图被当成了
PASS/FAIL 的依据。

## 机器可判结果（19/19）

| 轴 | 结果 |
| --- | --- |
| 路由匹配（`location.pathname` 等于请求路由） | 19/19 |
| 渲染出错误元素（`[role=alert]`、`.error-note` 等非空） | 0 |
| 出现探针字面量（`device-owner` / `reply-gate` / `probe-`） | 0 |
| 正文过短（< 25 字） | 0 |

历史快照：第一版探测用正则 `失败|错误|请稍后` 扫全文，把 ReportMonth 的正文「没有把未完成当成失败」
判成错误态；改为只查错误元素后该页 PASS。 detectors that match product copy produce false findings.

## 用像素/几何实测的两个问题

前两轮审查里 눈-visible 的缺陷已修，其中两个只能靠量来确认，不能靠截图里的印象：

**tab bar 改纯白后，长列表末尾是否被永久遮住。**

- PrivacySettings：滚到底（`scrollBottomGap = 0` 证明确实到底），最后一个内容块占 410..727，
  tab bar 在 766..830，**重叠 0px**。
- FeedbackHelp：最后内容 626..727，tab bar 784..838，**重叠 0px**。

**LetterToday 的浮条是否压住操作区。**

- `.floating-status` 由 `v-if="statusText"` 控制；本次抓取时 `statusText` 为空，所以浮条没有渲染，
  `overlapPx` 无法测量。也就是说：这一条**未测**，因为只有真的触发生成动作才会出现浮条。
  测到的是按钮行本身在 602..636，浮条现在的位置是 `calc(100px + safe-area)`，约在 1069..1130 区间，
  静态看不会压住按钮行，但没有实测过触发后的状态。

## 仍未闭环的

- 上述 LetterToday 浮条需要触发一次生成才能量到，属未测项。
- 19 页的视觉判定 PASS/FAIL 需要能读图的审查者。最后一次派出的审查通道返回网络错误
  （`chatgpt.com` 上游不可达），本文件只覆盖机器可判的四个轴 + 两个几何问题。
- `R4_*.png` 与 `R4_capture-report.json` 在 `artifacts/ui-v2/android/`，被 .gitignore 排除；
  证据在本机，不在仓库里。
