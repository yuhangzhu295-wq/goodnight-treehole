# API 业务矩阵

更新时间：2026-08-07

| 业务 | 用户 API | 管理 API | 持久化结果 |
| --- | --- | --- | --- |
| 情绪发布 | `POST /api/v1/moods`, `/posts` | `/posts/:id/approve|reject|block` | Mood/Post/ModerationLog |
| 抱抱收藏 | `/posts/:id/hug`, `/favorite` | `/posts`, `/users/:id` | HugAction/Favorite/计数 |
| 真人回应 | `/posts/:id/replies` | `/replies/:id/moderation|content` | Reply/ModerationLog |
| 今日回信 | `/letters/*` | `/ai/jobs`, `/ai/routes` | Letter/AIJob/Diary |
| 情绪工具 | `/ai/tasks`, `/tools/*` | `/ai/jobs/:id` | AIJob/structuredResult |
| 月报 | `/reports/monthly*` | Dashboard AI/内容统计 | 数据库聚合/分享 MediaAsset |
| 上传 | `/media/upload`, `/media/:id` | 反馈附件读取 | MediaAsset + 文件存储 |
| 反馈 | `/feedback` | `/feedback/tickets/:id/reply|status` | FeedbackTicket |
| 隐私/配置 | `/settings/privacy` | `/system/settings` | PrivacySetting/SystemSetting |
| Ollama | 间接经 AI 任务 | `/ai/ollama/status|sync-models` | AIProvider/AIStyleRoute/AIJob |

API 契约测试不是只断言 200：会检查审核前后可见性、FAQ 权限、任务终态、数据库回读与跨端结果。
