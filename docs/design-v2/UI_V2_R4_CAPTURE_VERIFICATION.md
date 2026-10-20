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

首次抓取时 `statusText` 为空、浮条未渲染，所以这一条一开始是未测。后来在设备上真的点了一次
「换一种风格」触发生成，量到：

- 修复前：浮条 692..738，操作行 693..727，**重叠 34px**，把「换一种风格 / 保存 / 分享图片」整行盖住。
- 修复后（`bottom: 150px + safe-area`）：浮条 642..688，操作行 693..727，**重叠 0px**；
  与回信卡片的重叠也是 0px。

原来那个 100px 的偏移是估的，改成分实测就是这个原因。

## 仍未闭环的

- **19 页的视觉判定 PASS/FAIL 需要能读图的审查者。** 派出的审查通道（`chatgpt.com` 上游）持续返回
  网络错误，本文件只覆盖机器可判的四个轴 + 两个几何问题。这是未完成，不是通过。
- `R4_*.png` 与 `R4_capture-report.json` 在 `artifacts/ui-v2/android/`，被 .gitignore 排除；
  证据在本机，不在仓库里。
