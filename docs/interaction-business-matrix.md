# Interaction / Business Matrix

| Page | Control | API | Database/runtime outcome | Cross-end result |
|---|---|---|---|---|
| 写下心情 | 添加图片 | `POST /media/upload` | MediaAsset + real file | preview, diary/admin media |
| 写下心情 | 发布 PRIVATE | `POST /moods` | Mood, Diary, warm_letter job | diary only; square absent |
| 写下心情 | 发布 PUBLIC | `POST /moods` | Mood, Post pending, public_ai_reply job | admin content then square after approve |
| 广场/详情 | 抱抱、收藏、举报 | post mutation APIs | Post/Favorite counters | fresh reads reflect count |
| 树洞详情 | 真人回应 | `POST /posts/:id/replies` | Reply | guarded by PUBLIC + privacy + global config |
| 今日回信 | 换风格 | `POST /letters/:id/regenerate` | warm_letter job/Letter | poll then refreshed letter |
| 情绪工具 | 提交 | `POST /ai/tasks` | task-specific AIJob | poll task result |
| 情绪拆解 | 开始拆解 | `POST /ai/tasks` | emotion_analysis structured result | structured card |
| 我的日记 | 打开附件 | `GET /diaries/:id` | MediaAsset lookup | real image link/thumbnail |
| 情绪月报 | 加载/建议 | monthly report APIs | monthly_report job | poll then summary/advice |
| 隐私设置 | 真人回应开关 | `PATCH /settings/privacy` | privacySettings | reply guard changes |
| 后台树洞内容 | 审核/隐藏/恢复 | admin moderation API | Post.reviewStatus + audit | front square changes |
| 后台 AI 路由 | 保存路由 | `PATCH /ai/routes/:style` | aiRoutes routeVersion | next job uses new provider/model |
| 后台 AI 任务 | 重试/兜底 | admin jobs APIs | new queued AIJob | status/result visible |
| 后台反馈/用户/FAQ/配置 | mutation controls | admin APIs | RuntimeState + audit where applicable | refreshed admin view |
