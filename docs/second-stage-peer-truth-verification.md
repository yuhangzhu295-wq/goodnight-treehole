# 第二阶段同路人匿名互助闭环独立验真

执行时间：2026-08-20。基线：8fb2d83b072d12ae88d80154d74328f679d2ad96。最新总验收完成于 11:28（Asia/Shanghai），真实网关于 11:29 重新启动并通过健康检查。

## 结论

- 真实业务、安全、持久化和 DAPI 验真：PASS。
- 参考图视觉审计：7 页均为 PARTIAL。
- SECOND_STAGE_PEER_FROZEN=false。本轮没有把视觉差异写成完成，也没有使用冻结或完成型提交。

## 本轮修复

- 同路经历、请求、等待、边界确认、会话和毕业页全部保留真实 API、路由与按钮事件；不使用整页参考图或透明热区。
- 修复隐私投影：C 端不再返回内部匹配分、信任分、指纹相似度或原始用户 ID；仅返回当前用户所需的匿名匹配和会话字段。
- 修复所有者校验：经历修改、旅程同路列表和会话操作均按调用用户授权；第三用户不能查看、关闭、举报、拉黑或发送消息。
- 扩展 PII 拦截与脱敏：手机号、邮箱、微信/WeChat、字母账号、纯数字 QQ、身份证和具体地址均被服务端拒绝或隐藏。
- 修复 DAPI 的 peer_response_assist 结构化结果解析。真实作业记录为 provider_dapi_deepseek / deepseek-v4-flash，fallbackUsed=false。
- 修复完整快照持久化的 Prisma 交互事务超时：把显式快照写入的等待/事务窗口延长到 10/30 秒，浏览器夹具清理不再在五秒默认窗口内中断。
- 修复全页路由同步加载导致的真实浏览器资源耗尽：页面改为按路由动态加载，反复刷新和全量按钮审计不再出现空白根节点或 `ERR_INSUFFICIENT_RESOURCES`。
- 修复“今日回信”读接口的重复排队和风格重生成竞争：只在缺少内容时自动建任务，显式重生成以当前 AiJob 作为唯一回填源；C 端有真实错误态与重试入口。
- 修复 peer 页面 display:grid 在内容较少时拉伸按钮的布局问题；所有页面在 375、390、393、430 宽度通过横向溢出检查。
- 把详情、会话、毕业三个路由接入既有底部导航白名单，并为页面正文增加底部安全区；审计脚本同时验证导航可见且命中点属于导航本身。
- 使用局部夜景、长椅素材，不渲染整张参考页。移除夜景局部素材右侧白边。

## 双用户真实闭环

浏览器以两个持久化匿名用户执行：

1. 双方在真实隐私设置中开启匿名匹配。
2. 用户 A 创建经历，管理员审核发布；用户 B 创建旅程并获取服务端推荐。
3. 用户 B 在详情页填写并递出匿名请求；用户 A 在“我的请求”接受。
4. 用户 A 确认边界，真实 PeerConversation 创建，双方发送三条消息。
5. DAPI 草稿整理创建异步 AiJob，完成后只回填草稿，未自动发送。
6. 用户 A 结束会话，提交反馈并选择留下后来；新经历写入 pending_review。
7. 数据库回读确认会话 closed、messageCount=3、consentAcceptedAt、反馈、通知和待审核经历均已持久化。

本次浏览器数据库证据：[database-evidence.json](../artifacts/peer-stage-truth-audit/database-evidence.json)。

## 已执行验证

| 命令 | 结果 | 覆盖 |
| --- | --- | --- |
| pnpm lint | PASS | 静态检查 |
| pnpm typecheck | PASS | API、C 端、后台和共享类型 |
| pnpm test:peer-stage-business | PASS | 完整闭环与数据库持久化 |
| pnpm test:peer-stage-security | PASS | 越权、PII、内部字段投影 |
| pnpm test:peer-stage-two-user | PASS | 双用户请求、接受、会话、结束 |
| pnpm test:peer-stage-expiry | PASS | 72 小时到期、关闭和通知 |
| pnpm test:dapi-live | PASS | DAPI 真实调用、模型和任务记录 |
| pnpm test:reference-fidelity-peer-stage | PASS | 7 个真实页面、真实点击、420x786 参考对照、4 种窄屏尺寸、无横向溢出、导航命中 |
| pnpm test:click-all | PASS | C 端与后台全部已登记控件的真实点击、路由或数据变化 |
| pnpm test:business-flow | PASS | 主要用户业务流与持久化 |
| pnpm test:cross | PASS | DAPI 异步作业和前后台共享数据源 |
| pnpm qa:all | PASS | lint、typecheck、unit、API、E2E、视觉捕获、诊断、真实浏览器点击、全量点击和跨端流 |

Redis 在本地测试环境提示版本 5.0.14.1 低于推荐的 6.2.0；这不是测试失败，也没有被忽略。

`pnpm qa:all` 使用隔离测试服务并在结束时清理端口；这会停止先前用于人工访问的开发网关。验收结束后已重新执行 `pnpm dev`，并在 `http://127.0.0.1:3000/api/health`、`http://127.0.0.1:5173/pages/square/index` 和 `http://127.0.0.1:5174/login` 分别取得 HTTP 200。DAPI 实测报告在 [dapi-live-report.json](../artifacts/test-report/dapi-live-report.json)，该次作业 `job_c93f2bde71` 为 `succeeded`，provider/model 为 `provider_dapi_deepseek` / `deepseek-v4-flash`，且 `fallbackUsed=false`。

## 参考图审计

| 页面 | 业务验真 | 视觉状态 | 主要剩余差异 |
| --- | --- | --- | --- |
| 02 同路推荐 | PASS | PARTIAL | 动态推荐数量、夜景比例、卡片密度 |
| 05 匿名经历详情 | PASS | PARTIAL | 头图、行动卡、时间线比例 |
| 28 我的请求 | PASS | PARTIAL | 多请求进展态、夜景插画层级 |
| 31 匹配等待 | PASS | PARTIAL | 等待插画和辅助行动层级 |
| 21 会话前确认 | PASS | PARTIAL | 头像插画和夜景艺术细节 |
| 04 匿名同路会话 | PASS | PARTIAL | 气泡、输入区纹理与纵向节奏 |
| 40 毕业分享 | PASS | PARTIAL | 参考阶段统计和分享预览层级 |

每页的参考、实际、并排、差异和四种尺寸截图在 [peer-stage-truth-audit](../artifacts/peer-stage-truth-audit/)；浏览器抓取明细在 [browser-capture.md](../artifacts/peer-stage-truth-audit/browser-capture.md)。

## 未达标项与后续

功能和安全闭环没有阻塞项。视觉上仍需用来源目录里的局部插画继续精修夜景过渡、头像和卡片纹理，并为真实数据的 1 条与多条状态分别做参考一致的密度规则。在这些差异消除前，第二阶段不能标记为视觉完成或冻结。
