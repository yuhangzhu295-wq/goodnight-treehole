# 用户业务流

更新时间：2026-08-07

| 流程 | 写入 | 后续结果 | 当前证据 |
| --- | --- | --- | --- |
| 私密心情 | Mood + Diary + MediaAsset | 不进广场、创建 AIJob、日记/回信/月报读取 | API/业务流与真实上传测试 |
| 匿名树洞 | Mood + Post | pending 审核，后台通过后广场可见 | 跨端 Playwright |
| 抱抱/收藏 | HugAction/Favorite + 计数 | 刷新保持，后台读取同一计数 | 业务流测试 |
| 真人回应 | Reply(pending_review) | 后台通过后详情显示 | 跨端 Playwright |
| 今日回信 | Letter + AIJob | 风格切换重新生成，保存日记、分享图 | 用户端真实点击与 AI 路由测试 |
| 情绪拆解 | AIJob.structuredResult | 合法四字段 JSON，可保存 Diary.toolResult | AI routing + business flow |
| 其他情绪工具 | AIJob | 每个 taskType 独立，结果可复制/保存 | 前台 30/30 点击与浏览器真实生成 |
| 月报 | PostgreSQL 聚合 + AI 总结 | 数值来自记录，AI 只写观察与建议 | API 与月报页面测试 |
| 反馈 | FeedbackTicket + MediaAsset | 后台回复/解决，前台状态可查 | 跨端业务流 |

真实浏览器新增证据：输入“浏览器真实回归…”后，`work_support` 创建 `job_30bdc56c05`，由 qwen2.5 成功生成，耗时 1275ms，未走 fallback。
