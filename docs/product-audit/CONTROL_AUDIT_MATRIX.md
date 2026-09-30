# CONTROL AUDIT MATRIX

Static discovery found 940 interactive bindings across both front ends.

Runtime evidence (`artifacts/post-recovery/control-coverage.json`, real Android APK):
717 controls found on the 54 routes, 717 visible, 358 pressed with a real tap, 52 destructive controls skipped by policy, 193 without a data-testid.

Status vocabulary follows section 129 of the task: REAL / LOCAL_UI_ONLY_BY_DESIGN / BROKEN / FAKE / BLOCKED.
A static binding is `STATIC_ONLY` when it has no runtime counterpart in the sweep (for example an admin-only control, or an element without a stable selector). `STATIC_ONLY` is not a pass.

## Runtime control status (real Android APK, by data-testid)

| Route | testid | Control | Result | Status |
| --- | --- | --- | --- | --- |
| /pages/tonight/index | `notification-bell` | 提醒与回访 | changed | REAL |
| /pages/tonight/index | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/tonight/index | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/tonight/index | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/tonight/index | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peers/index | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peers/index | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peers/index | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peers/index | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/action/index | `primary-action-card` | 今晚的约定 查看这段旅程 先完成一个五分钟的小动作 先给这件事命名，再选一个五分 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/action/index | `action-followup-strip` | 10月1日 18:23，我会回来问你，后来怎么样了。 | changed | REAL |
| /pages/action/index | `action-shortcut-cooldown` | 先别发出去 允许自己缓一缓 | changed | REAL |
| /pages/action/index | `action-shortcut-decision` | 一个重要决定 理清思路再说 | changed | REAL |
| /pages/action/index | `action-shortcut-handoff` | 找现实中的人 连接，获得支持 | changed | REAL |
| /pages/action/index | `action-shortcut-future` | 留给未来的我 写一封给未来的信 | changed | REAL |
| /pages/action/index | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/action/index | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/action/index | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/action/index | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/journey/detail | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/journey/detail | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/journey/detail | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/journey/detail | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/detail | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/detail | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/detail | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/detail | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/requests | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/requests | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/requests | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/requests | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/wait | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/wait | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/wait | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/wait | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/consent | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/consent | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/consent | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/consent | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/conversation | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/conversation | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/conversation | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/conversation | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/graduate | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/graduate | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/graduate | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/peer/graduate | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/reality-handoff/index | `reality-support-card` | 现实求助卡 1 你想告诉谁？ 朋友 家人 伴侣 室友 同事 其他 2 你希望 T | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/reality-handoff/index | `handoff-save` | 生成并保存求助卡 | changed | REAL |
| /pages/reality-handoff/index | `handoff-copy` | 复制这张求助卡 | skipped: not actionable | LOCAL_UI_ONLY_BY_DESIGN (hidden/disabled) |
| /pages/safety/index | `safety-support` | 晚安树洞 现在先优先保护你自己 如果你现在有强烈的自伤冲动，先不要一个人扛。 请 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/safety/index | `safety-handoff` | 发求助卡给信任的人 让他们知道你现在需要支持 | changed | REAL |
| /pages/safety/index | `safety-emergency` | 联系当地紧急支持 中国大陆可拨打 12356 心理援助热线 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/safety/index | `safety-stay` | 我暂时安全，继续留在这里 先做一轮稳定支持，再慢慢看接下来的事 | changed | REAL |
| /pages/notifications/index | `notification-notification_follow_up_c19ea0589f` | 昨天那件事，后来怎么样了？ 不用写得完整，告诉我现在发生了什么就好。 9月30日 | changed | REAL |
| /pages/notifications/index | `notification-notification_follow_up_28d8aa740c` | 清醒时候的你，留了一句话 这是过去的你留给现在的。 9月29日 06:02 | changed | REAL |
| /pages/notifications/index | `notification-notification_follow_up_5e357c3eee` | 清醒时候的你，留了一句话 这是过去的你留给现在的。 9月29日 05:55 | changed | REAL |
| /pages/notifications/index | `notification-notification_follow_up_30b5f25f74` | 清醒时候的你，留了一句话 这是过去的你留给现在的。 9月29日 05:54 | changed | REAL |
| /pages/notifications/index | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/notifications/index | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/notifications/index | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/notifications/index | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/future-self/index | `future-self-save` | ✦ 把这封话留给未来 | skipped: not actionable | LOCAL_UI_ONLY_BY_DESIGN (hidden/disabled) |
| /pages/future-self/index | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/future-self/index | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/future-self/index | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/future-self/index | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/recovery/index | `recovery-save` | 保存今天的记录 | changed | REAL |
| /pages/recovery/index | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/recovery/index | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/recovery/index | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/recovery/index | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/support-plan/index | `support-plan-safety` |  | changed | REAL |
| /pages/support-plan/index | `support-plan-save` | 保存我的低谷预案 ✦ | changed | REAL |
| /pages/support-plan/index | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/support-plan/index | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/support-plan/index | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/support-plan/index | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/stable-self/index | `stable-self-save` | 保存这张提醒卡 ✦ | changed | REAL |
| /pages/memory/index | `memory-create-open` | 保存一条我确认的记忆 ✦ | changed | REAL |
| /pages/square/index | `filter-weiqu` | ♧ 委屈 | changed | REAL |
| /pages/square/index | `filter-jiaolv` | ☁ 焦虑 | changed | REAL |
| /pages/square/index | `filter-shimian` | ☾ 失眠 | changed | REAL |
| /pages/square/index | `filter-lianai` | ♡ 恋爱 | changed | REAL |
| /pages/square/index | `filter-gongzuo` | ▣ 工作 | changed | REAL |
| /pages/square/index | `filter-all` | ▦ 全部 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/square/index | `post-card-first` | ... ▣ 匿名树洞 工作 · 2 小时前 工作消息一直弹出来，我有点喘不过气， | changed | REAL |
| /pages/square/index | `post-more-first` | 更多 | changed | REAL |
| /pages/square/index | `btn-square-hug-first` | ♡ 抱抱 28 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/square/index | `btn-square-reply-first` | ☺ 回应 1 | changed | REAL |
| /pages/square/index | `post-card-post_seed_lianai` | ♡ 匿名树洞 恋爱 · 2 小时前 很想念一个人，又担心自己的在意太多了。 想被 | changed | REAL |
| /pages/square/index | `post-card-post_seed_weiqu` | 🥺 匿名树洞 委屈 · 2 小时前 今天被一句话刺了一下，心里有点委屈，但我想 | changed | REAL |
| /pages/square/index | `post-card-post_1` | ☁ 匿名树洞 焦虑 · 2 小时前 明天要汇报，我又开始担心自己讲不好。 想被理 | changed | REAL |
| /pages/square/index | `post-card-post_2` | 🌙 匿名树洞 失眠 · 2 小时前 凌晨两点还是睡不着，脑子一直在转。 想被理 | changed | REAL |
| /pages/square/index | `btn-write-mood` | ✎ 写心情 | changed | REAL |
| /pages/square/index | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/square/index | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/square/index | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/square/index | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/mood/create | `front-mood-back` | 返回 | changed | REAL |
| /pages/mood/create | `input-mood-content` | 此刻的你，想说些什么呢？ 开心的、难过的、烦恼的，都可以告诉树洞哦～ | skipped: text field | REAL (input, not clickable) |
| /pages/mood/create | `mood-emotion-nanguo` | 😢 难过 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/mood/create | `mood-emotion-jiaolv` | 🌧️ 焦虑 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/mood/create | `mood-emotion-weiqu` | 🥺 委屈 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/mood/create | `mood-emotion-shengqi` | 😤 生气 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/mood/create | `mood-emotion-gudu` | 🌙 孤独 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/mood/create | `mood-emotion-shimian` | 🛏️ 失眠 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/mood/create | `mood-visibility-private` | ◐ 仅自己可见 只进入我的日记与情绪月报 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/mood/create | `mood-visibility-public` | ♡ 匿名发布到广场 审核后可获得 AI 与真人回应 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/mood/create | `mood-style-warm` | 选择暖心陪伴回应风格 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/mood/create | `mood-style-rational` | 选择理性分析回应风格 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/mood/create | `mood-style-light` | 选择轻松一下回应风格 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/mood/create | `mood-style-poetic` | 选择诗意治愈回应风格 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/mood/create | `mood-style-clear` | 选择清醒提醒回应风格 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/mood/create | `input-mood-images` |  | skipped: not actionable | LOCAL_UI_ONLY_BY_DESIGN (hidden/disabled) |
| /pages/mood/create | `mood-image-grid` | ＋ 添加图片 ＋ 添加图片 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/mood/create | `btn-add-image` | ＋ 添加图片 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/mood/create | `btn-add-image-secondary` | ＋ 添加图片 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/mood/create | `btn-submit-mood` | 发布心情 | changed | REAL |
| /pages/post/create | `front-mood-back` | 返回 | changed | REAL |
| /pages/post/create | `input-mood-content` | 此刻的你，想说些什么呢？ 开心的、难过的、烦恼的，都可以告诉树洞哦～ | skipped: text field | REAL (input, not clickable) |
| /pages/post/create | `mood-emotion-nanguo` | 😢 难过 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/create | `mood-emotion-jiaolv` | 🌧️ 焦虑 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/create | `mood-emotion-weiqu` | 🥺 委屈 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/create | `mood-emotion-shengqi` | 😤 生气 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/create | `mood-emotion-gudu` | 🌙 孤独 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/create | `mood-emotion-shimian` | 🛏️ 失眠 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/create | `mood-visibility-private` | ◐ 仅自己可见 只进入我的日记与情绪月报 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/create | `mood-visibility-public` | ♡ 匿名发布到广场 审核后可获得 AI 与真人回应 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/create | `mood-style-warm` | 选择暖心陪伴回应风格 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/create | `mood-style-rational` | 选择理性分析回应风格 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/create | `mood-style-light` | 选择轻松一下回应风格 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/create | `mood-style-poetic` | 选择诗意治愈回应风格 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/create | `mood-style-clear` | 选择清醒提醒回应风格 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/post/create | `input-mood-images` |  | skipped: not actionable | LOCAL_UI_ONLY_BY_DESIGN (hidden/disabled) |
| /pages/post/create | `mood-image-grid` | ＋ 添加图片 ＋ 添加图片 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/create | `btn-add-image` | ＋ 添加图片 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/create | `btn-add-image-secondary` | ＋ 添加图片 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/create | `btn-submit-mood` | 发布心情 | changed | REAL |
| /pages/post/detail | `front-post-back` | 返回 | changed | REAL |
| /pages/post/detail | `btn-open-more` | 更多 | changed | REAL |
| /pages/post/detail | `detail-reply-count` | 已收到 2 条温柔回应 › | changed | REAL |
| /pages/post/detail | `detail-style-warm` | ♡ 暖心陪伴 | changed | REAL |
| /pages/post/detail | `detail-style-rational` | ▥ 理性分析 | changed | REAL |
| /pages/post/detail | `detail-style-light` | ☺ 轻松一下 | changed | REAL |
| /pages/post/detail | `detail-style-clear` | ♢ 清醒提醒 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/post/detail | `detail-style-poetic` | ♧ 诗意治愈 | changed | REAL |
| /pages/post/detail | `btn-hug` | ♡ 抱抱 20 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/detail | `btn-open-reply` | ☻ 回应 2 | changed | REAL |
| /pages/post/detail | `reply-like-first` | ♡ 0 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/detail | `quick-hug-0` | 抱抱你 | changed | REAL |
| /pages/post/detail | `quick-hug-1` | 我懂 | changed | REAL |
| /pages/post/detail | `quick-hug-2` | 加油 | changed | REAL |
| /pages/post/detail | `quick-hug-3` | 陪着你 | changed | REAL |
| /pages/post/detail | `quick-hug-4` | 会好起来的 | changed | REAL |
| /pages/post/detail | `reply-entry` | 写下你的回应... | changed | REAL |
| /pages/post/detail | `btn-hug-dock` | ♡ 抱抱 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/post/detail | `btn-favorite` | ☆ 已收藏 | changed | REAL |
| /pages/letter/index | `letter-back` | 返回 | changed | REAL |
| /pages/letter/index | `btn-letter-warm` | ♡ 温柔 | changed | REAL |
| /pages/letter/index | `btn-letter-rational` | ▥ 理性 | changed | REAL |
| /pages/letter/index | `btn-letter-light` | ☺ 轻松 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/letter/index | `btn-letter-poetic` | ♧ 文艺 | changed | REAL |
| /pages/letter/index | `btn-letter-regenerate` | ↻ 换一种风格 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/letter/index | `btn-letter-save` | ▣ 已保存 | changed | REAL |
| /pages/letter/index | `btn-letter-poster` | ⇧ 分享图片 | changed | REAL |
| /pages/letter/index | `letter-advice-water` | ♨ 把此刻写成一句话 | changed | REAL |
| /pages/letter/index | `letter-advice-rest` | ◷ 只做一个小动作 | changed | REAL |
| /pages/letter/index | `letter-advice-sleep` | ☾ 给身体一点缓冲 | changed | REAL |
| /pages/letter/index | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/letter/index | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/letter/index | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/letter/index | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/letter/today | `letter-back` | 返回 | changed | REAL |
| /pages/letter/today | `btn-letter-warm` | ♡ 温柔 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/letter/today | `btn-letter-rational` | ▥ 理性 | changed | REAL |
| /pages/letter/today | `btn-letter-light` | ☺ 轻松 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/letter/today | `btn-letter-poetic` | ♧ 文艺 | changed | REAL |
| /pages/letter/today | `btn-letter-regenerate` | ↻ 换一种风格 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/letter/today | `btn-letter-save` | ▣ 已保存 | changed | REAL |
| /pages/letter/today | `btn-letter-poster` | ⇧ 分享图片 | changed | REAL |
| /pages/letter/today | `letter-advice-water` | ♨ 把此刻写成一句话 | changed | REAL |
| /pages/letter/today | `letter-advice-rest` | ◷ 只做一个小动作 | changed | REAL |
| /pages/letter/today | `letter-advice-sleep` | ☾ 给身体一点缓冲 | changed | REAL |
| /pages/letter/today | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/letter/today | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/letter/today | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/letter/today | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/reply/today | `letter-back` | 返回 | changed | REAL |
| /pages/reply/today | `btn-letter-warm` | ♡ 温柔 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/reply/today | `btn-letter-rational` | ▥ 理性 | changed | REAL |
| /pages/reply/today | `btn-letter-light` | ☺ 轻松 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/reply/today | `btn-letter-poetic` | ♧ 文艺 | changed | REAL |
| /pages/reply/today | `btn-letter-regenerate` | ↻ 换一种风格 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/reply/today | `btn-letter-save` | ▣ 已保存 | changed | REAL |
| /pages/reply/today | `btn-letter-poster` | ⇧ 分享图片 | changed | REAL |
| /pages/reply/today | `letter-advice-water` | ♨ 把此刻写成一句话 | changed | REAL |
| /pages/reply/today | `letter-advice-rest` | ◷ 只做一个小动作 | changed | REAL |
| /pages/reply/today | `letter-advice-sleep` | ☾ 给身体一点缓冲 | changed | REAL |
| /pages/reply/today | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/reply/today | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/reply/today | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/reply/today | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/tool/index | `tool-letter` | 去试试 | changed | REAL |
| /pages/tool/index | `tool-decompose` | ⌕ 情绪拆解 拆解情绪根源，看清真实感受 | changed | REAL |
| /pages/tool/index | `tool-rewrite` | ✎ 负面改写 把消极想法换个温柔说法 | changed | REAL |
| /pages/tool/index | `tool-rant` | ◌ 发疯文案 把想说的话痛快表达 | changed | REAL |
| /pages/tool/index | `tool-healing-quote` | ♡ 治愈短句 一句温柔的话，托平你的心情 | changed | REAL |
| /pages/tool/index | `tool-sleep-comfort` | ☾ 失眠安慰 陪你度过夜晚，温柔入眠 | changed | REAL |
| /pages/tool/index | `tool-work-support` | ▣ 工作破防 职场情绪急救，给你力量支撑 | changed | REAL |
| /pages/tool/index | `tool-future-letter` | ✉ 写给未来的自己 写一封信，给未来的你 | changed | REAL |
| /pages/tool/index | `tool-report` | ▥ 情绪月报 回顾情绪变化，看见成长轨迹 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/tool/index | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/tool/index | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/tool/index | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/tool/index | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/tool/decompose | `front-tool-back` | ‹ | changed | REAL |
| /pages/tool/decompose | `input-decompose` | 比如：今天被一句话影响了很久，我不知道自己为什么这么难过…… | skipped: text field | REAL (input, not clickable) |
| /pages/tool/decompose | `btn-decompose-run` | 开始拆解 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/tool/breakdown | `front-tool-back` | ‹ | changed | REAL |
| /pages/tool/breakdown | `input-decompose` | 比如：今天被一句话影响了很久，我不知道自己为什么这么难过…… | skipped: text field | REAL (input, not clickable) |
| /pages/tool/breakdown | `btn-decompose-run` | 开始拆解 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/tool/run | `front-tool-run-back` | ‹ | changed | REAL |
| /pages/tool/run | `input-tool-run` |  | skipped: text field | REAL (input, not clickable) |
| /pages/tool/run | `btn-tool-run-submit` | 帮我换一种说法 | changed | REAL |
| /pages/tool/run | `tool-run-result-card` | 更温和但不虚假的表达 原始表达：今天的心情有点乱，我想换一种方式说出来。 负面改 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/tool/run | `btn-tool-run-save` | 保存到日记 | changed | REAL |
| /pages/tool/run | `btn-tool-run-copy` | 复制结果 | changed | REAL |
| /pages/tool/run | `btn-tool-run-close` | 收起结果 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/tool/rewrite | `front-tool-run-back` | ‹ | changed | REAL |
| /pages/tool/rewrite | `input-tool-run` |  | skipped: text field | REAL (input, not clickable) |
| /pages/tool/rewrite | `btn-tool-run-submit` | 帮我换一种说法 | changed | REAL |
| /pages/tool/rewrite | `tool-run-result-card` | 更温和但不虚假的表达 原始表达：今天的心情有点乱，我想换一种方式说出来。 负面改 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/tool/rewrite | `btn-tool-run-save` | 保存到日记 | changed | REAL |
| /pages/tool/rewrite | `btn-tool-run-copy` | 复制结果 | changed | REAL |
| /pages/tool/rewrite | `btn-tool-run-close` | 收起结果 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/tool/rant | `front-tool-run-back` | ‹ | changed | REAL |
| /pages/tool/rant | `input-tool-run` |  | skipped: text field | REAL (input, not clickable) |
| /pages/tool/rant | `btn-tool-run-submit` | 帮我释放一下 | changed | REAL |
| /pages/tool/rant | `tool-run-result-card` | 生成结果 发疯文案：今天这件“今天的心情有点乱，我想换一种方式说出来。”真的够烦 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/tool/rant | `btn-tool-run-save` | 保存到日记 | changed | REAL |
| /pages/tool/rant | `btn-tool-run-copy` | 复制结果 | changed | REAL |
| /pages/tool/rant | `btn-tool-run-close` | 收起结果 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/tool/heal | `front-tool-run-back` | ‹ | changed | REAL |
| /pages/tool/heal | `input-tool-run` |  | skipped: text field | REAL (input, not clickable) |
| /pages/tool/heal | `btn-tool-run-submit` | 生成一句话 | changed | REAL |
| /pages/tool/heal | `tool-run-result-card` | 生成结果 治愈短句：就算“今天的心情有点乱，我想换一种方式说出来。”让你很累，你 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/tool/heal | `btn-tool-run-save` | 保存到日记 | changed | REAL |
| /pages/tool/heal | `btn-tool-run-copy` | 复制结果 | changed | REAL |
| /pages/tool/heal | `btn-tool-run-close` | 收起结果 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/tool/sleep | `front-tool-run-back` | ‹ | changed | REAL |
| /pages/tool/sleep | `input-tool-run` |  | skipped: text field | REAL (input, not clickable) |
| /pages/tool/sleep | `btn-tool-run-submit` | 陪我缓一缓 | changed | REAL |
| /pages/tool/sleep | `tool-run-result-card` | 生成结果 失眠安慰：如果“今天的心情有点乱，我想换一种方式说出来。”还在脑子里转 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/tool/sleep | `btn-tool-run-save` | 保存到日记 | changed | REAL |
| /pages/tool/sleep | `btn-tool-run-copy` | 复制结果 | changed | REAL |
| /pages/tool/sleep | `btn-tool-run-close` | 收起结果 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/tool/work | `front-tool-run-back` | ‹ | changed | REAL |
| /pages/tool/work | `input-tool-run` |  | skipped: text field | REAL (input, not clickable) |
| /pages/tool/work | `btn-tool-run-submit` | 帮我梳理 | changed | REAL |
| /pages/tool/work | `tool-run-result-card` | 生成结果 工作支撑：面对“今天的心情有点乱，我想换一种方式说出来。”，先把评价、 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/tool/work | `btn-tool-run-save` | 保存到日记 | changed | REAL |
| /pages/tool/work | `btn-tool-run-copy` | 复制结果 | changed | REAL |
| /pages/tool/work | `btn-tool-run-close` | 收起结果 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/tool/future | `front-tool-run-back` | ‹ | changed | REAL |
| /pages/tool/future | `input-tool-run` |  | skipped: text field | REAL (input, not clickable) |
| /pages/tool/future | `btn-tool-run-submit` | 帮我整理成一封信 | changed | REAL |
| /pages/tool/future | `tool-run-result-card` | 生成结果 保存到日记 复制结果 收起结果 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/tool/future | `future-letter-editor` |  | skipped: text field | REAL (input, not clickable) |
| /pages/tool/future | `btn-tool-run-save` | 保存到日记 | changed | REAL |
| /pages/tool/future | `btn-tool-run-copy` | 复制结果 | changed | REAL |
| /pages/tool/future | `btn-tool-run-close` | 收起结果 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/me/index | `me-current-journey` | ⌁ 正在经历 其他里正在整理的一件事 其他 · acting 主观强度变化 5  | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/me/index | `entry-current-journey` | 继续看看 | changed | REAL |
| /pages/me/index | `me-support-status` | ✦ 我的现实支持 低谷预案还没有准备，之后可以慢慢补上。 | changed | REAL |
| /pages/me/index | `entry-recovery` | ◒ 生活恢复 已经留下 1 次生活记录 › | changed | REAL |
| /pages/me/index | `entry-support-plan` | ✦ 我的低谷预案 提前留下真正有用的支持方式 › | changed | REAL |
| /pages/me/index | `entry-stable-self` | ⌁ 清醒时候的我 只和自己状态稳定时的样子比较 › | changed | REAL |
| /pages/me/index | `entry-memory` | ◉ AI 记得什么 查看、编辑或停止系统使用有限记忆 › | changed | REAL |
| /pages/me/index | `entry-future-self` | ◇ 写给未来的我 有 3 封话留给以后 › | changed | REAL |
| /pages/me/index | `entry-decision` | ▣ 决定保险箱 让重要决定先安静一会儿 › | changed | REAL |
| /pages/me/index | `entry-diary` | ▤ 日记与回信 过去写下的内容 › | changed | REAL |
| /pages/me/index | `entry-letter-list` | ✉ 我的回信 看看曾经收到的温柔回应 › | changed | REAL |
| /pages/me/index | `entry-favorite` | ♡ 我的收藏 保存下来、想再读一次的话 › | changed | REAL |
| /pages/me/index | `entry-report` | ▥ 情绪月报 从真实记录里回看这个月 › | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/me/index | `entry-journey-archive` | ⌁ 旅程归档 回看已经走过的过程 › | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/me/index | `entry-privacy` | ▧ 隐私与数据 决定什么可以被记住和使用 › | changed | REAL |
| /pages/me/index | `entry-feedback` | ? 帮助与反馈 遇到问题时告诉我们 › | changed | REAL |
| /pages/me/index | `btn-clear-data` | 清理我的记录 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/me/index | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/me/index | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/me/index | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/me/index | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/me/profile | `front-profile-back` | ‹ | changed | REAL |
| /pages/diary/index | `front-diary-back` | ‹ | changed | REAL |
| /pages/diary/index | `filter-diary-month` | 2026-09 ⌄ | changed | REAL |
| /pages/diary/index | `btn-diary-filter` | 筛选 | changed | REAL |
| /pages/diary/index | `diary-card-first` | ✦ 09 / 30 焦虑 写给未来：未来的你会记得，此刻关于“今天的心情有点乱， | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/index | `diary-card-diary_1790793367850` | ✦ 09 / 30 工作 工作支撑：面对“今天的心情有点乱，我想换一种方式说出来 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/index | `diary-card-diary_1790793356894` | ✦ 09 / 30 失眠 失眠安慰：如果“今天的心情有点乱，我想换一种方式说出来 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/index | `diary-card-diary_1790793345885` | ✦ 09 / 30 委屈 治愈短句：就算“今天的心情有点乱，我想换一种方式说出来 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/index | `diary-card-diary_1790793334877` | ✦ 09 / 30 委屈 发疯文案：今天这件“今天的心情有点乱，我想换一种方式说 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/index | `diary-card-diary_1790793323896` | ✦ 09 / 30 焦虑 负面改写：把“今天的心情有点乱，我想换一种方式说出来。 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/index | `diary-card-diary_1790793312903` | ✦ 09 / 30 焦虑 负面改写：把“今天的心情有点乱，我想换一种方式说出来。 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/index | `diary-card-diary_1790793267546` | ✦ 09 / 30 委屈 轻松一点：关于“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/index | `diary-letter-diary_1790793267546` | ✉ 已有回信 | changed | REAL |
| /pages/diary/index | `diary-card-diary_1790793245343` | ✦ 09 / 30 委屈 轻松一点：关于“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/index | `diary-letter-diary_1790793245343` | ✉ 已有回信 | changed | REAL |
| /pages/diary/index | `diary-card-diary_1790793223185` | ✦ 09 / 30 委屈 轻松一点：关于“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/index | `diary-letter-diary_1790793223185` | ✉ 已有回信 | changed | REAL |
| /pages/diary/index | `diary-card-diary_1790747142986` | ✦ 09 / 30 焦虑 负面改写：把“今天的心情有点乱，我想换一种方式说出来。 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/index | `diary-card-diary_1790747090587` | ✦ 09 / 30 委屈 诗意疗愈：你把“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/index | `diary-letter-diary_1790747090587` | ✉ 已有回信 | changed | REAL |
| /pages/diary/index | `diary-card-diary_1790747065463` | ✦ 09 / 30 委屈 诗意疗愈：你把“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/index | `diary-letter-diary_1790747065463` | ✉ 已有回信 | changed | REAL |
| /pages/diary/index | `diary-card-diary_1790747038944` | ✦ 09 / 30 委屈 诗意疗愈：你把“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/index | `diary-letter-diary_1790747038944` | ✉ 已有回信 | changed | REAL |
| /pages/diary/index | `diary-card-diary_1` | ✦ 09 / 29 焦虑 今天练习了汇报开场，虽然还是紧张，但已经比早上稳一点。 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/index | `diary-letter-diary_1` | ✉ 已有回信 | changed | REAL |
| /pages/diary/index | `btn-new-diary` | ✎ 写新日记 | changed | REAL |
| /pages/diary/index | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/diary/index | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/diary/index | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/diary/index | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/diary/list | `front-diary-back` | ‹ | changed | REAL |
| /pages/diary/list | `filter-diary-month` | 2026-09 ⌄ | changed | REAL |
| /pages/diary/list | `btn-diary-filter` | 筛选 | changed | REAL |
| /pages/diary/list | `diary-card-first` | ✦ 09 / 30 焦虑 写给未来：未来的你会记得，此刻关于“今天的心情有点乱， | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/list | `diary-card-diary_1790793367850` | ✦ 09 / 30 工作 工作支撑：面对“今天的心情有点乱，我想换一种方式说出来 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/list | `diary-card-diary_1790793356894` | ✦ 09 / 30 失眠 失眠安慰：如果“今天的心情有点乱，我想换一种方式说出来 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/list | `diary-card-diary_1790793345885` | ✦ 09 / 30 委屈 治愈短句：就算“今天的心情有点乱，我想换一种方式说出来 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/list | `diary-card-diary_1790793334877` | ✦ 09 / 30 委屈 发疯文案：今天这件“今天的心情有点乱，我想换一种方式说 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/list | `diary-card-diary_1790793323896` | ✦ 09 / 30 焦虑 负面改写：把“今天的心情有点乱，我想换一种方式说出来。 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/list | `diary-card-diary_1790793312903` | ✦ 09 / 30 焦虑 负面改写：把“今天的心情有点乱，我想换一种方式说出来。 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/list | `diary-card-diary_1790793267546` | ✦ 09 / 30 委屈 轻松一点：关于“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/list | `diary-letter-diary_1790793267546` | ✉ 已有回信 | changed | REAL |
| /pages/diary/list | `diary-card-diary_1790793245343` | ✦ 09 / 30 委屈 轻松一点：关于“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/list | `diary-letter-diary_1790793245343` | ✉ 已有回信 | changed | REAL |
| /pages/diary/list | `diary-card-diary_1790793223185` | ✦ 09 / 30 委屈 轻松一点：关于“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/list | `diary-letter-diary_1790793223185` | ✉ 已有回信 | changed | REAL |
| /pages/diary/list | `diary-card-diary_1790747142986` | ✦ 09 / 30 焦虑 负面改写：把“今天的心情有点乱，我想换一种方式说出来。 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/list | `diary-card-diary_1790747090587` | ✦ 09 / 30 委屈 诗意疗愈：你把“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/list | `diary-letter-diary_1790747090587` | ✉ 已有回信 | changed | REAL |
| /pages/diary/list | `diary-card-diary_1790747065463` | ✦ 09 / 30 委屈 诗意疗愈：你把“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/list | `diary-letter-diary_1790747065463` | ✉ 已有回信 | changed | REAL |
| /pages/diary/list | `diary-card-diary_1790747038944` | ✦ 09 / 30 委屈 诗意疗愈：你把“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/list | `diary-letter-diary_1790747038944` | ✉ 已有回信 | changed | REAL |
| /pages/diary/list | `diary-card-diary_1` | ✦ 09 / 29 焦虑 今天练习了汇报开场，虽然还是紧张，但已经比早上稳一点。 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/diary/list | `diary-letter-diary_1` | ✉ 已有回信 | changed | REAL |
| /pages/diary/list | `btn-new-diary` | ✎ 写新日记 | changed | REAL |
| /pages/diary/list | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/diary/list | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/diary/list | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/diary/list | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/me/diaries | `front-diary-back` | ‹ | changed | REAL |
| /pages/me/diaries | `filter-diary-month` | 2026-09 ⌄ | changed | REAL |
| /pages/me/diaries | `btn-diary-filter` | 筛选 | changed | REAL |
| /pages/me/diaries | `diary-card-first` | ✦ 09 / 30 焦虑 写给未来：未来的你会记得，此刻关于“今天的心情有点乱， | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/me/diaries | `diary-card-diary_1790793367850` | ✦ 09 / 30 工作 工作支撑：面对“今天的心情有点乱，我想换一种方式说出来 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/me/diaries | `diary-card-diary_1790793356894` | ✦ 09 / 30 失眠 失眠安慰：如果“今天的心情有点乱，我想换一种方式说出来 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/me/diaries | `diary-card-diary_1790793345885` | ✦ 09 / 30 委屈 治愈短句：就算“今天的心情有点乱，我想换一种方式说出来 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/me/diaries | `diary-card-diary_1790793334877` | ✦ 09 / 30 委屈 发疯文案：今天这件“今天的心情有点乱，我想换一种方式说 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/me/diaries | `diary-card-diary_1790793323896` | ✦ 09 / 30 焦虑 负面改写：把“今天的心情有点乱，我想换一种方式说出来。 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/me/diaries | `diary-card-diary_1790793312903` | ✦ 09 / 30 焦虑 负面改写：把“今天的心情有点乱，我想换一种方式说出来。 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/me/diaries | `diary-card-diary_1790793267546` | ✦ 09 / 30 委屈 轻松一点：关于“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/me/diaries | `diary-letter-diary_1790793267546` | ✉ 已有回信 | changed | REAL |
| /pages/me/diaries | `diary-card-diary_1790793245343` | ✦ 09 / 30 委屈 轻松一点：关于“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/me/diaries | `diary-letter-diary_1790793245343` | ✉ 已有回信 | changed | REAL |
| /pages/me/diaries | `diary-card-diary_1790793223185` | ✦ 09 / 30 委屈 轻松一点：关于“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/me/diaries | `diary-letter-diary_1790793223185` | ✉ 已有回信 | changed | REAL |
| /pages/me/diaries | `diary-card-diary_1790747142986` | ✦ 09 / 30 焦虑 负面改写：把“今天的心情有点乱，我想换一种方式说出来。 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/me/diaries | `diary-card-diary_1790747090587` | ✦ 09 / 30 委屈 诗意疗愈：你把“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/me/diaries | `diary-letter-diary_1790747090587` | ✉ 已有回信 | changed | REAL |
| /pages/me/diaries | `diary-card-diary_1790747065463` | ✦ 09 / 30 委屈 诗意疗愈：你把“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/me/diaries | `diary-letter-diary_1790747065463` | ✉ 已有回信 | changed | REAL |
| /pages/me/diaries | `diary-card-diary_1790747038944` | ✦ 09 / 30 委屈 诗意疗愈：你把“明天要汇报，我又开始担心自己讲不好。” | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/me/diaries | `diary-letter-diary_1790747038944` | ✉ 已有回信 | changed | REAL |
| /pages/me/diaries | `diary-card-diary_1` | ✦ 09 / 29 焦虑 今天练习了汇报开场，虽然还是紧张，但已经比早上稳一点。 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/me/diaries | `diary-letter-diary_1` | ✉ 已有回信 | changed | REAL |
| /pages/me/diaries | `btn-new-diary` | ✎ 写新日记 | changed | REAL |
| /pages/me/diaries | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/me/diaries | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/me/diaries | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/me/diaries | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/diary/detail | `front-diary-detail-back` | ‹ | changed | REAL |
| /pages/report/month | `front-report-back` | 返回 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/report/month | `filter-report-month` | 2026 年 9 月 ⌄ | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/report/month | `report-trend-chart` | 09/1 09/10 09/20 09/30 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/report/month | `btn-report-poster` | ▧ 生成分享图 | skipped: not actionable | LOCAL_UI_ONLY_BY_DESIGN (hidden/disabled) |
| /pages/report/month | `btn-report-advice` | ♧ 查看温柔建议 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/report/month | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/report/month | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/report/month | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/report/month | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/me/month-report | `front-report-back` | 返回 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/me/month-report | `filter-report-month` | 2026 年 9 月 ⌄ | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/me/month-report | `report-trend-chart` | 09/1 09/10 09/20 09/30 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/me/month-report | `btn-report-poster` | ▧ 生成分享图 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/me/month-report | `btn-report-advice` | ♧ 查看温柔建议 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/me/month-report | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/me/month-report | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/me/month-report | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/me/month-report | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/letter/list | `front-letter-list-back` | 返回 | changed | REAL |
| /pages/letter/list | `filter-letter-all` | 全部 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/letter/list | `filter-letter-unread` | 未读 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/letter/list | `filter-letter-fav` | 已收藏 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/letter/list | `letter-card-first` | 轻松一点 09/29 05:25 来自一则真实心情记录 给今晚的你 轻松一点：关 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/letter/list | `btn-letter-like-first` | ♡ 1 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/letter/list | `btn-letter-list-fav` | ☆ 已收藏 | changed | REAL |
| /pages/letter/list | `btn-letter-read-full-first` | 查看全文 › | changed | REAL |
| /pages/letter/list | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/letter/list | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/letter/list | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/letter/list | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/letter/detail | `front-letter-detail-back` | ‹ | changed | REAL |
| /pages/letter/detail | `btn-letter-detail-fav` | 收藏回信 | changed | REAL |
| /pages/letter/detail | `btn-letter-detail-save` | 查看今日回信 | changed | REAL |
| /pages/archive/index | `archive-tab-diary` | 私密日记 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-tab-post` | 公开树洞 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-tab-letter` | 树洞回信 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-tab-journey` | ⌁ 旅程归档 0 段 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-diary-first` | ▤ 写给未来：未来的你会记得，此刻关于“今天的心情有点乱，我想换一种方式说出来。 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-diary-diary_1790793367850` | ▤ 工作支撑：面对“今天的心情有点乱，我想换一种方式说出来。”，先把评价、任务和 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-diary-diary_1790793356894` | ▤ 失眠安慰：如果“今天的心情有点乱，我想换一种方式说出来。”还在脑子里转，先告 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-diary-diary_1790793345885` | ▤ 治愈短句：就算“今天的心情有点乱，我想换一种方式说出来。”让你很累，你也仍然 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-diary-diary_1790793334877` | ▤ 发疯文案：今天这件“今天的心情有点乱，我想换一种方式说出来。”真的够烦，也够 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-diary-diary_1790793323896` | ▤ 负面改写：把“今天的心情有点乱，我想换一种方式说出来。”换成更照顾自己的说法 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-diary-diary_1790793312903` | ▤ 负面改写：把“今天的心情有点乱，我想换一种方式说出来。”换成更照顾自己的说法 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-diary-diary_1790793267546` | ▤ 轻松一点：关于“明天要汇报，我又开始担心自己讲不好。”，先把脑内音量调低一点 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-diary-diary_1790793245343` | ▤ 轻松一点：关于“明天要汇报，我又开始担心自己讲不好。”，先把脑内音量调低一点 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-diary-diary_1790793223185` | ▤ 轻松一点：关于“明天要汇报，我又开始担心自己讲不好。”，先把脑内音量调低一点 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-diary-diary_1790747142986` | ▤ 负面改写：把“今天的心情有点乱，我想换一种方式说出来。”换成更照顾自己的说法 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-diary-diary_1790747090587` | ▤ 诗意疗愈：你把“明天要汇报，我又开始担心自己讲不好。”放进树洞里，它就不必再 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-diary-diary_1790747065463` | ▤ 诗意疗愈：你把“明天要汇报，我又开始担心自己讲不好。”放进树洞里，它就不必再 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-diary-diary_1790747038944` | ▤ 诗意疗愈：你把“明天要汇报，我又开始担心自己讲不好。”放进树洞里，它就不必再 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-diary-diary_1` | ▤ 今天练习了汇报开场，虽然还是紧张，但已经比早上稳一点。 焦虑 09/29 0 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-scope-all` | 全部 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-scope-week` | 本周 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-scope-month` | 本月 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `archive-filter-reset` | 重置时间筛选 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/archive/index | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/archive/index | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/archive/index | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/archive/index | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/favorite/index | `front-favorite-back` | 返回 | changed | REAL |
| /pages/favorite/index | `filter-fav-letter` | ✉ 回信 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/favorite/index | `filter-fav-post` | ♧ 树洞 | changed | REAL |
| /pages/favorite/index | `filter-fav-diary` | ▤ 日记 | changed | REAL |
| /pages/favorite/index | `favorite-card-first` | 来自 晚安树洞 给今晚的你 轻松一点：关于“明天要汇报，我又开始担心自己讲不好。 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/favorite/index | `btn-favorite-remove` | ☆ 已收藏 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/favorite/index | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/favorite/index | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/favorite/index | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/favorite/index | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/favorite/list | `front-favorite-back` | 返回 | changed | REAL |
| /pages/favorite/list | `filter-fav-letter` | ✉ 回信 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/favorite/list | `filter-fav-post` | ♧ 树洞 | changed | REAL |
| /pages/favorite/list | `filter-fav-diary` | ▤ 日记 | changed | REAL |
| /pages/favorite/list | `favorite-card-first` | 来自 晚安树洞 给今晚的你 轻松一点：关于“明天要汇报，我又开始担心自己讲不好。 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/favorite/list | `btn-favorite-remove` | ☆ 已收藏 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/favorite/list | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/favorite/list | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/favorite/list | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/favorite/list | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/settings/privacy | `front-privacy-back` | 返回上一页 | changed | REAL |
| /pages/settings/privacy | `toggle-privacy-private` | 默认仅自己可见 写下的情绪默认只对自己可见 | changed | REAL |
| /pages/settings/privacy | `toggle-privacy-human` | 允许接收真人回应 开启后，其他用户可以给你的情绪留下回应 | changed | REAL |
| /pages/settings/privacy | `toggle-privacy-anonymous` | 匿名发布到广场 发布到广场时隐藏昵称和头像 | changed | REAL |
| /pages/settings/privacy | `toggle-privacy-peer` | 允许同路匹配 根据相似经历，为你寻找走过来的人 | changed | REAL |
| /pages/settings/privacy | `toggle-privacy-anonymous-stats` | 允许匿名经历统计 帮助生成更真实的同路洞察 | changed | REAL |
| /pages/settings/privacy | `toggle-privacy-long-memory` | 允许 AI 记住长期信息 只记住你明确同意保留的内容 | changed | REAL |
| /pages/settings/privacy | `toggle-privacy-journey-analysis` | 允许生成长期旅程分析 用来生成更完整的成长回顾 | changed | REAL |
| /pages/settings/privacy | `toggle-privacy-report-share` | 允许生成月报分享图 开启后可把本月真实记录生成分享图片 | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/settings/privacy | `toggle-privacy-recovery-data` | 保存生活恢复记录 帮助你看到生活有没有慢慢回来 | changed | REAL |
| /pages/settings/privacy | `btn-clear-cache` | 清空本地缓存 › | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/settings/privacy | `btn-export-diaries` | 导出我的日记 › | changed | REAL |
| /pages/settings/privacy | `btn-data-explain` | 账号与数据说明 › | changed | REAL |
| /pages/settings/privacy | `btn-delete-my-data` | 删除我的数据 › | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/settings/privacy | `toggle-privacy-ai-memory-use` |  | changed | REAL |
| /pages/settings/privacy | `toggle-privacy-experience-share` |  | changed | REAL |
| /pages/settings/privacy | `toggle-privacy-future-notifications` |  | changed | REAL |
| /pages/settings/privacy | `toggle-privacy-journey-archive` |  | skipped: destructive control | BLOCKED (destructive, policy) |
| /pages/settings/privacy | `toggle-privacy-export` |  | changed | REAL |
| /pages/settings/privacy | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/settings/privacy | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/settings/privacy | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/settings/privacy | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/settings/data-policy | `front-data-policy-back` | ‹ | changed | REAL |
| /pages/help/feedback | `front-feedback-back` | 返回上一页 | changed | REAL |
| /pages/help/feedback | `faq-item-first` | ? 树洞内容会公开我的身份吗？ › | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/help/feedback | `faq-item-2` | ? AI 回信是心理诊断吗？ › | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/help/feedback | `btn-faq-all` | ❧ 查看全部问题 › | changed | REAL |
| /pages/help/feedback | `input-feedback-content` | 写下你的问题或建议…… | skipped: text field | REAL (input, not clickable) |
| /pages/help/feedback | `input-feedback-upload` | 选择反馈截图 | skipped: not actionable | LOCAL_UI_ONLY_BY_DESIGN (hidden/disabled) |
| /pages/help/feedback | `btn-feedback-upload` | ＋ 上传截图 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/help/feedback | `btn-feedback-upload-2` | ＋ 上传截图 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/help/feedback | `btn-feedback-submit` | 提交反馈 | changed | REAL |
| /pages/help/feedback | `btn-support-more` | 了解更多 | changed | REAL |
| /pages/help/feedback | `feedback-ticket-history` | 我的反馈 1 条 待处理 2026-09-29 05:25 希望月报可以导出图片 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/help/feedback | `feedback-ticket-ticket_1` | 待处理 2026-09-29 05:25 希望月报可以导出图片。 我们正在认真查 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/help/feedback | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/help/feedback | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/help/feedback | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/help/feedback | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/help/faqs | `front-faqs-back` | 返回帮助与反馈 | changed | REAL |
| /pages/help/faqs | `faq-full-1` | ? 树洞内容会公开我的身份吗？ › | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/help/faqs | `faq-full-2` | ? AI 回信是心理诊断吗？ › | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/feedback/index | `front-feedback-back` | 返回上一页 | changed | REAL |
| /pages/feedback/index | `faq-item-first` | ? 树洞内容会公开我的身份吗？ › | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/feedback/index | `faq-item-2` | ? AI 回信是心理诊断吗？ › | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/feedback/index | `btn-faq-all` | ❧ 查看全部问题 › | changed | REAL |
| /pages/feedback/index | `input-feedback-content` | 写下你的问题或建议…… | skipped: text field | REAL (input, not clickable) |
| /pages/feedback/index | `input-feedback-upload` | 选择反馈截图 | skipped: not actionable | LOCAL_UI_ONLY_BY_DESIGN (hidden/disabled) |
| /pages/feedback/index | `btn-feedback-upload` | ＋ 上传截图 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/feedback/index | `btn-feedback-upload-2` | ＋ 上传截图 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/feedback/index | `btn-feedback-submit` | 提交反馈 | changed | REAL |
| /pages/feedback/index | `btn-support-more` | 了解更多 | changed | REAL |
| /pages/feedback/index | `feedback-ticket-history` | 我的反馈 1 条 待处理 2026-09-29 05:25 希望月报可以导出图片 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/feedback/index | `feedback-ticket-ticket_1` | 待处理 2026-09-29 05:25 希望月报可以导出图片。 我们正在认真查 | no observable change | LOCAL_UI_ONLY_BY_DESIGN |
| /pages/feedback/index | `tab-square` | 今晚 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/feedback/index | `tab-letter` | 同路 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/feedback/index | `tab-tool` | 行动 | skipped: link (covered by the route walk) | REAL (route covered by walk) |
| /pages/feedback/index | `tab-me` | 我的 | skipped: link (covered by the route walk) | REAL (route covered by walk) |

Runtime rows with a stable selector: 524.

## Static bindings (source-level, not individually exercised)

| # | Surface | View | Kind | Handler | Line | Status |
| ---: | --- | --- | --- | --- | ---: | --- |
| 1 | mp | ActionCenter.vue | click | `completionSheetOpen = false` | 342 | STATIC_ONLY |
| 2 | mp | ActionCenter.vue | click | `completionSheetOpen = false` | 345 | STATIC_ONLY |
| 3 | mp | ActionCenter.vue | click | `completeAction` | 349 | STATIC_ONLY |
| 4 | mp | ActionCenter.vue | click | `closeShortcutSheet` | 353 | STATIC_ONLY |
| 5 | mp | ActionCenter.vue | click | `closeShortcutSheet` | 356 | STATIC_ONLY |
| 6 | mp | ActionCenter.vue | click | `saveCooldown` | 361 | STATIC_ONLY |
| 7 | mp | ActionCenter.vue | click | `saveDecision` | 367 | STATIC_ONLY |
| 8 | mp | ActionCenter.vue | routerpush | `'/pages/tonight/index'` | 94 | STATIC_ONLY |
| 9 | mp | ActionCenter.vue | routerpush | ``/pages/reality-handoff/index${currentJourney.value?.id ? `?journeyId=${currentJourney.val` | 244 | STATIC_ONLY |
| 10 | mp | ActionCenter.vue | routerpush | ``/pages/future-self/index${currentJourney.value?.id ? `?journeyId=${currentJourney.value.i` | 248 | STATIC_ONLY |
| 11 | mp | ActionCenter.vue | routerpush | ``/pages/journey/detail?id=${currentJourney?.id}`` | 329 | STATIC_ONLY |
| 12 | mp | ActionCenter.vue | routerpush | `'/pages/tonight/index'` | 330 | STATIC_ONLY |
| 13 | mp | ActionCenter.vue | routerpush | `'/pages/notifications/index'` | 336 | STATIC_ONLY |
| 14 | mp | ActionCenter.vue | testid | `action-complete-submit` | 349 | STATIC_ONLY |
| 15 | mp | Archive.vue | click | `selectTab(tab.key)` | 205 | STATIC_ONLY |
| 16 | mp | Archive.vue | click | `selectTab('journey')` | 211 | STATIC_ONLY |
| 17 | mp | Archive.vue | click | `openDiary(item)` | 220 | STATIC_ONLY |
| 18 | mp | Archive.vue | click | `openLetter(item)` | 224 | STATIC_ONLY |
| 19 | mp | Archive.vue | click | `openPost(item)` | 232 | STATIC_ONLY |
| 20 | mp | Archive.vue | click | `openLetter(item)` | 243 | STATIC_ONLY |
| 21 | mp | Archive.vue | click | `openJourney(item)` | 254 | STATIC_ONLY |
| 22 | mp | Archive.vue | click | `openActions(item)` | 258 | STATIC_ONLY |
| 23 | mp | Archive.vue | click | `scope = item[0]` | 264 | STATIC_ONLY |
| 24 | mp | Archive.vue | click | `scope = 'all'` | 265 | STATIC_ONLY |
| 25 | mp | Archive.vue | click | `selectedJourney = undefined` | 272 | STATIC_ONLY |
| 26 | mp | Archive.vue | click | `openActions(selectedJourney)` | 276 | STATIC_ONLY |
| 27 | mp | Archive.vue | click | `restoreJourney` | 285 | STATIC_ONLY |
| 28 | mp | Archive.vue | click | `exportJourney` | 286 | STATIC_ONLY |
| 29 | mp | Archive.vue | click | `confirmDelete = true` | 287 | STATIC_ONLY |
| 30 | mp | Archive.vue | click | `actionJourney = undefined` | 288 | STATIC_ONLY |
| 31 | mp | Archive.vue | click | `confirmDelete = false` | 296 | STATIC_ONLY |
| 32 | mp | Archive.vue | click | `deleteJourney` | 296 | STATIC_ONLY |
| 33 | mp | Archive.vue | routerpush | ``/pages/diary/detail?id=${encodeURIComponent(item.id` | 99 | STATIC_ONLY |
| 34 | mp | Archive.vue | routerpush | ``/pages/post/detail?id=${encodeURIComponent(item.id` | 103 | STATIC_ONLY |
| 35 | mp | Archive.vue | routerpush | ``/pages/letter/detail?id=${encodeURIComponent(item.id` | 107 | STATIC_ONLY |
| 36 | mp | Archive.vue | routerpush | ``/pages/journey/detail?id=${encodeURIComponent(journeyId` | 135 | STATIC_ONLY |
| 37 | mp | Archive.vue | role-button | `tab` | 203 | STATIC_ONLY |
| 38 | mp | Archive.vue | testid | ``archive-tab-${tab.key}`` | 201 | STATIC_ONLY |
| 39 | mp | Archive.vue | testid | `archive-tab-journey` | 211 | STATIC_ONLY |
| 40 | mp | Archive.vue | testid | `index === 0 ? 'archive-diary-first' : `archive-diary-${item.id}`` | 220 | STATIC_ONLY |
| 41 | mp | Archive.vue | testid | `index === 0 ? 'archive-diary-letter-first' : undefined` | 224 | STATIC_ONLY |
| 42 | mp | Archive.vue | testid | `index === 0 ? 'archive-post-first' : `archive-post-${item.id}`` | 232 | STATIC_ONLY |
| 43 | mp | Archive.vue | testid | `index === 0 ? 'archive-letter-first' : `archive-letter-${item.id}`` | 243 | STATIC_ONLY |
| 44 | mp | Archive.vue | testid | `index === 0 ? 'archive-journey-first' : `archive-journey-${item.journey.id}`` | 254 | STATIC_ONLY |
| 45 | mp | Archive.vue | testid | `index === 0 ? 'archive-journey-actions-first' : undefined` | 258 | STATIC_ONLY |
| 46 | mp | Archive.vue | testid | ``archive-scope-${item[0]}`` | 264 | STATIC_ONLY |
| 47 | mp | Archive.vue | testid | `archive-filter-reset` | 265 | STATIC_ONLY |
| 48 | mp | Archive.vue | testid | `archive-detail-sheet` | 269 | STATIC_ONLY |
| 49 | mp | Archive.vue | testid | `archive-detail-close` | 272 | STATIC_ONLY |
| 50 | mp | Archive.vue | testid | `archive-detail-actions` | 276 | STATIC_ONLY |
| 51 | mp | Archive.vue | testid | `archive-actions-sheet` | 280 | STATIC_ONLY |
| 52 | mp | Archive.vue | testid | `archive-restore` | 285 | STATIC_ONLY |
| 53 | mp | Archive.vue | testid | `archive-export` | 286 | STATIC_ONLY |
| 54 | mp | Archive.vue | testid | `archive-delete-start` | 287 | STATIC_ONLY |
| 55 | mp | Archive.vue | testid | `archive-delete-confirm` | 292 | STATIC_ONLY |
| 56 | mp | Archive.vue | testid | `archive-delete-cancel` | 296 | STATIC_ONLY |
| 57 | mp | Archive.vue | testid | `archive-delete-confirm` | 296 | STATIC_ONLY |
| 58 | mp | DataPolicy.vue | click | `router.back()` | 10 | STATIC_ONLY |
| 59 | mp | DataPolicy.vue | testid | `front-data-policy-back` | 10 | STATIC_ONLY |
| 60 | mp | DecisionVault.vue | click | `router.back()` | 176 | STATIC_ONLY |
| 61 | mp | DecisionVault.vue | click | `draft.question = draft.question ? `${draft.question}\n我能先做的更小一步是：` : '我能先做的更小一步是：'` | 220 | STATIC_ONLY |
| 62 | mp | DecisionVault.vue | click | `decide(item)` | 245 | STATIC_ONLY |
| 63 | mp | DecisionVault.vue | click | `archive(item)` | 251 | STATIC_ONLY |
| 64 | mp | DecisionVault.vue | click | `resumeDraft(item)` | 253 | STATIC_ONLY |
| 65 | mp | DecisionVault.vue | submit | `saveForLater` | 187 | STATIC_ONLY |
| 66 | mp | DiaryDetail.vue | click | `router.back()` | 21 | STATIC_ONLY |
| 67 | mp | DiaryDetail.vue | testid | `front-diary-detail-back` | 21 | STATIC_ONLY |
| 68 | mp | DiaryList.vue | click | `router.back()` | 78 | STATIC_ONLY |
| 69 | mp | DiaryList.vue | click | `monthOpen = true` | 89 | STATIC_ONLY |
| 70 | mp | DiaryList.vue | click | `filterOpen = true` | 94 | STATIC_ONLY |
| 71 | mp | DiaryList.vue | click | `openDiary(diary)` | 107 | STATIC_ONLY |
| 72 | mp | DiaryList.vue | click | `openLetter(diary)` | 130 | STATIC_ONLY |
| 73 | mp | DiaryList.vue | click | `router.push('/pages/mood/create')` | 149 | STATIC_ONLY |
| 74 | mp | DiaryList.vue | click | `selectMonth(value)` | 157 | STATIC_ONLY |
| 75 | mp | DiaryList.vue | click | `emotion = ''` | 166 | STATIC_ONLY |
| 76 | mp | DiaryList.vue | click | `emotion = '焦虑'` | 167 | STATIC_ONLY |
| 77 | mp | DiaryList.vue | click | `emotion = '委屈'` | 168 | STATIC_ONLY |
| 78 | mp | DiaryList.vue | click | `emotion = '失眠'` | 169 | STATIC_ONLY |
| 79 | mp | DiaryList.vue | click | `hasLetter = ''` | 172 | STATIC_ONLY |
| 80 | mp | DiaryList.vue | click | `hasLetter = 'true'` | 173 | STATIC_ONLY |
| 81 | mp | DiaryList.vue | click | `hasLetter = 'false'` | 174 | STATIC_ONLY |
| 82 | mp | DiaryList.vue | click | `resetFilter` | 177 | STATIC_ONLY |
| 83 | mp | DiaryList.vue | click | `confirmFilter` | 178 | STATIC_ONLY |
| 84 | mp | DiaryList.vue | routerpush | ``/pages/diary/detail?id=${encodeURIComponent(diary.id` | 49 | STATIC_ONLY |
| 85 | mp | DiaryList.vue | routerpush | ``/pages/letter/detail?id=${encodeURIComponent(diary.letterId` | 53 | STATIC_ONLY |
| 86 | mp | DiaryList.vue | routerpush | `'/pages/letter/today'` | 54 | STATIC_ONLY |
| 87 | mp | DiaryList.vue | routerpush | `'/pages/mood/create'` | 149 | STATIC_ONLY |
| 88 | mp | DiaryList.vue | testid | `front-diary-back` | 78 | STATIC_ONLY |
| 89 | mp | DiaryList.vue | testid | `filter-diary-month` | 89 | STATIC_ONLY |
| 90 | mp | DiaryList.vue | testid | `btn-diary-filter` | 94 | STATIC_ONLY |
| 91 | mp | DiaryList.vue | testid | `index === 0 ? 'diary-card-first' : `diary-card-${diary.id}`` | 105 | STATIC_ONLY |
| 92 | mp | DiaryList.vue | testid | `index === 0 ? 'diary-letter-first' : `diary-letter-${diary.id}`` | 129 | STATIC_ONLY |
| 93 | mp | DiaryList.vue | testid | `diary-empty-state` | 140 | STATIC_ONLY |
| 94 | mp | DiaryList.vue | testid | `btn-new-diary` | 149 | STATIC_ONLY |
| 95 | mp | DiaryList.vue | testid | ``diary-month-${value}`` | 157 | STATIC_ONLY |
| 96 | mp | DiaryList.vue | testid | `filter-diary-emotion-all` | 166 | STATIC_ONLY |
| 97 | mp | DiaryList.vue | testid | `filter-diary-emotion-jiaolv` | 167 | STATIC_ONLY |
| 98 | mp | DiaryList.vue | testid | `filter-diary-emotion-weiqu` | 168 | STATIC_ONLY |
| 99 | mp | DiaryList.vue | testid | `filter-diary-emotion-shimian` | 169 | STATIC_ONLY |
| 100 | mp | DiaryList.vue | testid | `filter-diary-letter-all` | 172 | STATIC_ONLY |
| 101 | mp | DiaryList.vue | testid | `filter-diary-letter-true` | 173 | STATIC_ONLY |
| 102 | mp | DiaryList.vue | testid | `filter-diary-letter-false` | 174 | STATIC_ONLY |
| 103 | mp | DiaryList.vue | testid | `btn-diary-filter-reset` | 177 | STATIC_ONLY |
| 104 | mp | DiaryList.vue | testid | `btn-diary-filter-confirm` | 178 | STATIC_ONLY |
| 105 | mp | FavoriteList.vue | click | `router.back()` | 50 | STATIC_ONLY |
| 106 | mp | FavoriteList.vue | click | `load('letter')` | 55 | STATIC_ONLY |
| 107 | mp | FavoriteList.vue | click | `load('post')` | 56 | STATIC_ONLY |
| 108 | mp | FavoriteList.vue | click | `load('diary')` | 57 | STATIC_ONLY |
| 109 | mp | FavoriteList.vue | click | `openItem(item)` | 66 | STATIC_ONLY |
| 110 | mp | FavoriteList.vue | click | `removeFavorite(item)` | 79 | STATIC_ONLY |
| 111 | mp | FavoriteList.vue | routerpush | ``/pages/post/detail?id=${encodeURIComponent(item.targetId` | 34 | STATIC_ONLY |
| 112 | mp | FavoriteList.vue | routerpush | ``/pages/letter/detail?id=${encodeURIComponent(item.targetId` | 35 | STATIC_ONLY |
| 113 | mp | FavoriteList.vue | routerpush | ``/pages/diary/detail?id=${encodeURIComponent(item.targetId` | 36 | STATIC_ONLY |
| 114 | mp | FavoriteList.vue | testid | `front-favorite-back` | 50 | STATIC_ONLY |
| 115 | mp | FavoriteList.vue | testid | `filter-fav-letter` | 55 | STATIC_ONLY |
| 116 | mp | FavoriteList.vue | testid | `filter-fav-post` | 56 | STATIC_ONLY |
| 117 | mp | FavoriteList.vue | testid | `filter-fav-diary` | 57 | STATIC_ONLY |
| 118 | mp | FavoriteList.vue | testid | `index === 0 ? 'favorite-card-first' : `favorite-card-${item.id}`` | 64 | STATIC_ONLY |
| 119 | mp | FavoriteList.vue | testid | `index === 0 ? 'btn-favorite-remove' : `btn-favorite-remove-${item.id}`` | 77 | STATIC_ONLY |
| 120 | mp | FeedbackHelp.vue | click | `router.back()` | 146 | STATIC_ONLY |
| 121 | mp | FeedbackHelp.vue | click | `openedFaq = openedFaq === faq.id ? '' : faq.id` | 165 | STATIC_ONLY |
| 122 | mp | FeedbackHelp.vue | click | `router.push('/pages/help/faqs')` | 174 | STATIC_ONLY |
| 123 | mp | FeedbackHelp.vue | click | `categoryPickerOpen = true` | 181 | STATIC_ONLY |
| 124 | mp | FeedbackHelp.vue | click | `removeAsset(slot - 1)` | 203 | STATIC_ONLY |
| 125 | mp | FeedbackHelp.vue | click | `chooseUploadSlot(slot - 1)` | 211 | STATIC_ONLY |
| 126 | mp | FeedbackHelp.vue | click | `categoryPickerOpen = false` | 235 | STATIC_ONLY |
| 127 | mp | FeedbackHelp.vue | click | `support = true` | 247 | STATIC_ONLY |
| 128 | mp | FeedbackHelp.vue | click | `support = false` | 266 | STATIC_ONLY |
| 129 | mp | FeedbackHelp.vue | submit | `submit` | 177 | STATIC_ONLY |
| 130 | mp | FeedbackHelp.vue | change | `chooseFile` | 197 | STATIC_ONLY |
| 131 | mp | FeedbackHelp.vue | routerpush | `'/pages/help/faqs'` | 174 | STATIC_ONLY |
| 132 | mp | FeedbackHelp.vue | testid | `front-feedback-back` | 146 | STATIC_ONLY |
| 133 | mp | FeedbackHelp.vue | testid | `index === 0 ? 'faq-item-first' : `faq-item-${index + 1}`` | 163 | STATIC_ONLY |
| 134 | mp | FeedbackHelp.vue | testid | `btn-faq-all` | 174 | STATIC_ONLY |
| 135 | mp | FeedbackHelp.vue | testid | `input-feedback-content` | 188 | STATIC_ONLY |
| 136 | mp | FeedbackHelp.vue | testid | `input-feedback-upload` | 197 | STATIC_ONLY |
| 137 | mp | FeedbackHelp.vue | testid | `slot === 1 ? 'btn-feedback-upload' : 'btn-feedback-upload-2'` | 207 | STATIC_ONLY |
| 138 | mp | FeedbackHelp.vue | testid | `feedback-upload-preview` | 218 | STATIC_ONLY |
| 139 | mp | FeedbackHelp.vue | testid | `btn-feedback-submit` | 220 | STATIC_ONLY |
| 140 | mp | FeedbackHelp.vue | testid | `select-feedback-category` | 230 | STATIC_ONLY |
| 141 | mp | FeedbackHelp.vue | testid | `btn-support-more` | 247 | STATIC_ONLY |
| 142 | mp | FeedbackHelp.vue | testid | `feedback-ticket-history` | 250 | STATIC_ONLY |
| 143 | mp | FeedbackHelp.vue | testid | ``feedback-ticket-${ticket.id}`` | 252 | STATIC_ONLY |
| 144 | mp | FeedbackHelp.vue | testid | `feedback-ticket-reply` | 255 | STATIC_ONLY |
| 145 | mp | FeedbackHelp.vue | testid | `support-panel` | 261 | STATIC_ONLY |
| 146 | mp | FeedbackHelp.vue | testid | `btn-support-close` | 266 | STATIC_ONLY |
| 147 | mp | FutureSelf.vue | click | `router.back()` | 156 | STATIC_ONLY |
| 148 | mp | FutureSelf.vue | click | `changePreset('tomorrow')` | 182 | STATIC_ONLY |
| 149 | mp | FutureSelf.vue | click | `changePreset('week')` | 183 | STATIC_ONLY |
| 150 | mp | FutureSelf.vue | click | `changePreset('month')` | 184 | STATIC_ONLY |
| 151 | mp | FutureSelf.vue | click | `changePreset('custom')` | 185 | STATIC_ONLY |
| 152 | mp | FutureSelf.vue | submit | `save` | 165 | STATIC_ONLY |
| 153 | mp | FutureSelf.vue | testid | `future-self-save` | 213 | STATIC_ONLY |
| 154 | mp | HelpFaqs.vue | click | `router.back()` | 31 | STATIC_ONLY |
| 155 | mp | HelpFaqs.vue | click | `opened = opened === faq.id ? '' : faq.id` | 40 | STATIC_ONLY |
| 156 | mp | HelpFaqs.vue | testid | `front-faqs-back` | 31 | STATIC_ONLY |
| 157 | mp | HelpFaqs.vue | testid | ``faq-full-${index + 1}`` | 39 | STATIC_ONLY |
| 158 | mp | JourneyDetail.vue | click | `requestArchive` | 146 | STATIC_ONLY |
| 159 | mp | JourneyDetail.vue | click | `archiveConfirmationOpen = false` | 154 | STATIC_ONLY |
| 160 | mp | JourneyDetail.vue | click | `archiveJourney` | 155 | STATIC_ONLY |
| 161 | mp | JourneyDetail.vue | routerpush | ``/pages/safety/index?journeyId=${detail.value.journey.id}`` | 98 | STATIC_ONLY |
| 162 | mp | JourneyDetail.vue | routerpush | ``/pages/journey/detail?id=${detail.value.journey.id}&mode=stabilize`` | 99 | STATIC_ONLY |
| 163 | mp | JourneyDetail.vue | routerpush | `target.includes('?'` | 101 | STATIC_ONLY |
| 164 | mp | JourneyDetail.vue | routerpush | `'/pages/archive/index'` | 123 | STATIC_ONLY |
| 165 | mp | JourneyDetail.vue | routerpush | ``/pages/action/index?journeyId=${detail.journey.id}`` | 145 | STATIC_ONLY |
| 166 | mp | JourneyDetail.vue | testid | `journey-archive-start` | 146 | STATIC_ONLY |
| 167 | mp | JourneyDetail.vue | testid | `journey-archive-confirm` | 149 | STATIC_ONLY |
| 168 | mp | JourneyDetail.vue | testid | `journey-archive-confirm-action` | 155 | STATIC_ONLY |
| 169 | mp | LetterDetail.vue | click | `router.back()` | 30 | STATIC_ONLY |
| 170 | mp | LetterDetail.vue | click | `favorite` | 41 | STATIC_ONLY |
| 171 | mp | LetterDetail.vue | click | `router.push('/pages/letter/today')` | 42 | STATIC_ONLY |
| 172 | mp | LetterDetail.vue | routerpush | `'/pages/letter/today'` | 42 | STATIC_ONLY |
| 173 | mp | LetterDetail.vue | testid | `front-letter-detail-back` | 30 | STATIC_ONLY |
| 174 | mp | LetterDetail.vue | testid | `btn-letter-detail-fav` | 41 | STATIC_ONLY |
| 175 | mp | LetterDetail.vue | testid | `btn-letter-detail-save` | 42 | STATIC_ONLY |
| 176 | mp | LetterList.vue | click | `router.back()` | 56 | STATIC_ONLY |
| 177 | mp | LetterList.vue | click | `load('all')` | 61 | STATIC_ONLY |
| 178 | mp | LetterList.vue | click | `load('unread')` | 62 | STATIC_ONLY |
| 179 | mp | LetterList.vue | click | `load('favorited')` | 63 | STATIC_ONLY |
| 180 | mp | LetterList.vue | click | `likeLetter(letter)` | 85 | STATIC_ONLY |
| 181 | mp | LetterList.vue | click | `favoriteLetter(letter)` | 91 | STATIC_ONLY |
| 182 | mp | LetterList.vue | click | `readFull(letter)` | 97 | STATIC_ONLY |
| 183 | mp | LetterList.vue | click | `router.push('/pages/mood/create')` | 109 | STATIC_ONLY |
| 184 | mp | LetterList.vue | routerpush | ``/pages/letter/detail?id=${encodeURIComponent(letter.id` | 36 | STATIC_ONLY |
| 185 | mp | LetterList.vue | routerpush | `'/pages/mood/create'` | 109 | STATIC_ONLY |
| 186 | mp | LetterList.vue | testid | `front-letter-list-back` | 56 | STATIC_ONLY |
| 187 | mp | LetterList.vue | testid | `filter-letter-all` | 61 | STATIC_ONLY |
| 188 | mp | LetterList.vue | testid | `filter-letter-unread` | 62 | STATIC_ONLY |
| 189 | mp | LetterList.vue | testid | `filter-letter-fav` | 63 | STATIC_ONLY |
| 190 | mp | LetterList.vue | testid | `index === 0 ? 'letter-card-first' : `letter-card-${letter.id}`` | 70 | STATIC_ONLY |
| 191 | mp | LetterList.vue | testid | `index === 0 ? 'btn-letter-like-first' : `btn-letter-like-${letter.id}`` | 84 | STATIC_ONLY |
| 192 | mp | LetterList.vue | testid | `index === 0 ? 'btn-letter-list-fav' : `btn-letter-list-fav-${letter.id}`` | 90 | STATIC_ONLY |
| 193 | mp | LetterList.vue | testid | `index === 0 ? 'btn-letter-read-full-first' : `btn-letter-read-full-${letter.id}`` | 96 | STATIC_ONLY |
| 194 | mp | LetterToday.vue | click | `safeBack` | 161 | STATIC_ONLY |
| 195 | mp | LetterToday.vue | click | `regenerate(item.key)` | 189 | STATIC_ONLY |
| 196 | mp | LetterToday.vue | click | `regenerate()` | 206 | STATIC_ONLY |
| 197 | mp | LetterToday.vue | click | `saveToDiary` | 210 | STATIC_ONLY |
| 198 | mp | LetterToday.vue | click | `makeShareImage` | 214 | STATIC_ONLY |
| 199 | mp | LetterToday.vue | click | `chooseAdvice(item.key)` | 228 | STATIC_ONLY |
| 200 | mp | LetterToday.vue | click | `shareOpen = false` | 239 | STATIC_ONLY |
| 201 | mp | LetterToday.vue | click | `shareOpen = false` | 241 | STATIC_ONLY |
| 202 | mp | LetterToday.vue | click | `shareOpen = false` | 249 | STATIC_ONLY |
| 203 | mp | LetterToday.vue | click | `load` | 258 | STATIC_ONLY |
| 204 | mp | LetterToday.vue | routerpush | `'/pages/square/index'` | 65 | STATIC_ONLY |
| 205 | mp | LetterToday.vue | testid | `letter-back` | 161 | STATIC_ONLY |
| 206 | mp | LetterToday.vue | testid | `item.testId` | 186 | STATIC_ONLY |
| 207 | mp | LetterToday.vue | testid | `btn-letter-regenerate` | 206 | STATIC_ONLY |
| 208 | mp | LetterToday.vue | testid | `btn-letter-save` | 210 | STATIC_ONLY |
| 209 | mp | LetterToday.vue | testid | `btn-letter-poster` | 214 | STATIC_ONLY |
| 210 | mp | LetterToday.vue | testid | `item.testId` | 226 | STATIC_ONLY |
| 211 | mp | LetterToday.vue | testid | `letter-share-close` | 241 | STATIC_ONLY |
| 212 | mp | LetterToday.vue | testid | `letter-retry` | 258 | STATIC_ONLY |
| 213 | mp | Me.vue | click | `router.push(`/pages/journey/detail?id=${currentJourney.journey.id}`)` | 169 | STATIC_ONLY |
| 214 | mp | Me.vue | click | `router.push('/pages/tonight/index')` | 178 | STATIC_ONLY |
| 215 | mp | Me.vue | click | `router.push('/pages/support-plan/index')` | 191 | STATIC_ONLY |
| 216 | mp | Me.vue | click | `router.push(entry.route)` | 200 | STATIC_ONLY |
| 217 | mp | Me.vue | click | `router.push(entry.route)` | 212 | STATIC_ONLY |
| 218 | mp | Me.vue | click | `clearConfirmOpen = true` | 220 | STATIC_ONLY |
| 219 | mp | Me.vue | click | `clearConfirmOpen = false` | 227 | STATIC_ONLY |
| 220 | mp | Me.vue | click | `clearMyData` | 228 | STATIC_ONLY |
| 221 | mp | Me.vue | routerpush | ``/pages/journey/detail?id=${currentJourney.journey.id}`` | 169 | STATIC_ONLY |
| 222 | mp | Me.vue | routerpush | `'/pages/tonight/index'` | 178 | STATIC_ONLY |
| 223 | mp | Me.vue | routerpush | `'/pages/support-plan/index'` | 191 | STATIC_ONLY |
| 224 | mp | Me.vue | routerpush | `entry.route` | 200 | STATIC_ONLY |
| 225 | mp | Me.vue | routerpush | `entry.route` | 212 | STATIC_ONLY |
| 226 | mp | Me.vue | testid | `me-current-journey` | 156 | STATIC_ONLY |
| 227 | mp | Me.vue | testid | `entry-current-journey` | 168 | STATIC_ONLY |
| 228 | mp | Me.vue | testid | `me-current-journey-empty` | 174 | STATIC_ONLY |
| 229 | mp | Me.vue | testid | `entry-start-journey` | 178 | STATIC_ONLY |
| 230 | mp | Me.vue | testid | `me-support-status` | 191 | STATIC_ONLY |
| 231 | mp | Me.vue | testid | `entry.testId` | 199 | STATIC_ONLY |
| 232 | mp | Me.vue | testid | `entry.testId` | 211 | STATIC_ONLY |
| 233 | mp | Me.vue | testid | `btn-clear-data` | 220 | STATIC_ONLY |
| 234 | mp | Me.vue | testid | `clear-confirm-panel` | 221 | STATIC_ONLY |
| 235 | mp | Me.vue | testid | `btn-clear-cancel` | 227 | STATIC_ONLY |
| 236 | mp | Me.vue | testid | `btn-clear-confirm` | 228 | STATIC_ONLY |
| 237 | mp | MemoryCenter.vue | click | `router.back()` | 139 | STATIC_ONLY |
| 238 | mp | MemoryCenter.vue | click | `router.push('/pages/settings/privacy')` | 150 | STATIC_ONLY |
| 239 | mp | MemoryCenter.vue | click | `notice = `最近由 ${item.usages?.[0]?.taskType} 使用，任务 ${item.usages?.[0]?.jobId}`` | 166 | STATIC_ONLY |
| 240 | mp | MemoryCenter.vue | click | `beginEdit(item)` | 171 | STATIC_ONLY |
| 241 | mp | MemoryCenter.vue | click | `remove(item)` | 175 | STATIC_ONLY |
| 242 | mp | MemoryCenter.vue | click | `update(item, { status: 'disabled' }, '这条记忆已禁止未来使用。')` | 178 | STATIC_ONLY |
| 243 | mp | MemoryCenter.vue | click | `update(item, { status: 'active' }, '这条记忆已恢复使用。')` | 184 | STATIC_ONLY |
| 244 | mp | MemoryCenter.vue | click | `update(item, { status: 'expired' }, '这条记忆已立即到期。')` | 190 | STATIC_ONLY |
| 245 | mp | MemoryCenter.vue | click | `editingId = ''` | 213 | STATIC_ONLY |
| 246 | mp | MemoryCenter.vue | click | `composerOpen = false` | 235 | STATIC_ONLY |
| 247 | mp | MemoryCenter.vue | click | `composerOpen = true` | 241 | STATIC_ONLY |
| 248 | mp | MemoryCenter.vue | submit | `update(item, { ...editDraft }, '这条记忆已经更新。')` | 198 | STATIC_ONLY |
| 249 | mp | MemoryCenter.vue | submit | `createMemory` | 220 | STATIC_ONLY |
| 250 | mp | MemoryCenter.vue | routerpush | `'/pages/settings/privacy'` | 150 | STATIC_ONLY |
| 251 | mp | MemoryCenter.vue | testid | `memory-privacy-off` | 147 | STATIC_ONLY |
| 252 | mp | MemoryCenter.vue | testid | `memory-create-save` | 235 | STATIC_ONLY |
| 253 | mp | MemoryCenter.vue | testid | `memory-create-open` | 240 | STATIC_ONLY |
| 254 | mp | MeProfile.vue | click | `router.back()` | 19 | STATIC_ONLY |
| 255 | mp | MeProfile.vue | testid | `front-profile-back` | 19 | STATIC_ONLY |
| 256 | mp | MoodCreate.vue | click | `safeBack` | 140 | STATIC_ONLY |
| 257 | mp | MoodCreate.vue | click | `form.emotion = item.value` | 154 | STATIC_ONLY |
| 258 | mp | MoodCreate.vue | click | `form.visibility = 'PRIVATE'` | 163 | STATIC_ONLY |
| 259 | mp | MoodCreate.vue | click | `form.visibility = 'PUBLIC'` | 166 | STATIC_ONLY |
| 260 | mp | MoodCreate.vue | click | `form.replyStyle = item.value` | 184 | STATIC_ONLY |
| 261 | mp | MoodCreate.vue | click | `removeImage(asset)` | 199 | STATIC_ONLY |
| 262 | mp | MoodCreate.vue | click | `openFilePicker` | 201 | STATIC_ONLY |
| 263 | mp | MoodCreate.vue | click | `submit` | 208 | STATIC_ONLY |
| 264 | mp | MoodCreate.vue | change | `chooseImages` | 194 | STATIC_ONLY |
| 265 | mp | MoodCreate.vue | routerpush | `'/pages/square/index'` | 47 | STATIC_ONLY |
| 266 | mp | MoodCreate.vue | routerpush | ``/pages/post/detail?id=${res.post.id}`` | 126 | STATIC_ONLY |
| 267 | mp | MoodCreate.vue | routerpush | `'/pages/diary/index'` | 127 | STATIC_ONLY |
| 268 | mp | MoodCreate.vue | testid | `front-mood-back` | 140 | STATIC_ONLY |
| 269 | mp | MoodCreate.vue | testid | `input-mood-content` | 147 | STATIC_ONLY |
| 270 | mp | MoodCreate.vue | testid | `item.testId` | 154 | STATIC_ONLY |
| 271 | mp | MoodCreate.vue | testid | `mood-visibility-private` | 163 | STATIC_ONLY |
| 272 | mp | MoodCreate.vue | testid | `mood-visibility-public` | 166 | STATIC_ONLY |
| 273 | mp | MoodCreate.vue | testid | `item.testId` | 179 | STATIC_ONLY |
| 274 | mp | MoodCreate.vue | testid | `input-mood-images` | 194 | STATIC_ONLY |
| 275 | mp | MoodCreate.vue | testid | `mood-image-grid` | 195 | STATIC_ONLY |
| 276 | mp | MoodCreate.vue | testid | `mood-image-preview` | 196 | STATIC_ONLY |
| 277 | mp | MoodCreate.vue | testid | `slot === 1 ? 'btn-add-image' : 'btn-add-image-secondary'` | 201 | STATIC_ONLY |
| 278 | mp | MoodCreate.vue | testid | `btn-submit-mood` | 208 | STATIC_ONLY |
| 279 | mp | NotificationCenter.vue | click | `tab = 'all'` | 35 | STATIC_ONLY |
| 280 | mp | NotificationCenter.vue | click | `tab = 'unread'` | 35 | STATIC_ONLY |
| 281 | mp | NotificationCenter.vue | click | `open(item)` | 37 | STATIC_ONLY |
| 282 | mp | NotificationCenter.vue | routerpush | `item.targetRoute` | 27 | STATIC_ONLY |
| 283 | mp | NotificationCenter.vue | role-button | `tab` | 35 | STATIC_ONLY |
| 284 | mp | NotificationCenter.vue | role-button | `tab` | 35 | STATIC_ONLY |
| 285 | mp | NotificationCenter.vue | testid | ``notification-${item.id}`` | 37 | STATIC_ONLY |
| 286 | mp | PeerConsent.vue | click | `router.back()` | 15 | STATIC_ONLY |
| 287 | mp | PeerConsent.vue | click | `consent` | 17 | STATIC_ONLY |
| 288 | mp | PeerConsent.vue | click | `router.push('/pages/peer/requests')` | 17 | STATIC_ONLY |
| 289 | mp | PeerConsent.vue | routerpush | `'/pages/peer/requests'` | 17 | STATIC_ONLY |
| 290 | mp | PeerConversation.vue | click | `router.back()` | 22 | STATIC_ONLY |
| 291 | mp | PeerConversation.vue | click | `closeConfirmOpen = true` | 22 | STATIC_ONLY |
| 292 | mp | PeerConversation.vue | click | `safetyOpen = true` | 22 | STATIC_ONLY |
| 293 | mp | PeerConversation.vue | click | `router.push('/pages/peers/index')` | 24 | STATIC_ONLY |
| 294 | mp | PeerConversation.vue | click | `assist` | 28 | STATIC_ONLY |
| 295 | mp | PeerConversation.vue | click | `send` | 28 | STATIC_ONLY |
| 296 | mp | PeerConversation.vue | click | `router.push(`/pages/peer/graduate?matchId=${encodeURIComponent(matchId)}`)` | 29 | STATIC_ONLY |
| 297 | mp | PeerConversation.vue | click | `closeConfirmOpen = false` | 31 | STATIC_ONLY |
| 298 | mp | PeerConversation.vue | click | `closeConversation` | 31 | STATIC_ONLY |
| 299 | mp | PeerConversation.vue | click | `safetyOpen = false` | 32 | STATIC_ONLY |
| 300 | mp | PeerConversation.vue | click | `report` | 32 | STATIC_ONLY |
| 301 | mp | PeerConversation.vue | click | `block` | 32 | STATIC_ONLY |
| 302 | mp | PeerConversation.vue | routerpush | `'/pages/peers/index'` | 24 | STATIC_ONLY |
| 303 | mp | PeerConversation.vue | routerpush | ``/pages/peer/graduate?matchId=${encodeURIComponent(matchId` | 29 | STATIC_ONLY |
| 304 | mp | PeerExperienceDetail.vue | click | `router.back()` | 40 | STATIC_ONLY |
| 305 | mp | PeerExperienceDetail.vue | click | `requestOpen = true` | 47 | STATIC_ONLY |
| 306 | mp | PeerExperienceDetail.vue | click | `requestOpen = false` | 48 | STATIC_ONLY |
| 307 | mp | PeerExperienceDetail.vue | click | `requestConversation` | 48 | STATIC_ONLY |
| 308 | mp | PeerExperienceDetail.vue | routerpush | ``/pages/peer/wait?matchId=${encodeURIComponent(matchId.value` | 31 | STATIC_ONLY |
| 309 | mp | PeerGraduation.vue | click | `feedback = option.value` | 23 | STATIC_ONLY |
| 310 | mp | PeerGraduation.vue | click | `noteOpen = !noteOpen` | 23 | STATIC_ONLY |
| 311 | mp | PeerGraduation.vue | click | `save(true)` | 23 | STATIC_ONLY |
| 312 | mp | PeerGraduation.vue | click | `save(false)` | 23 | STATIC_ONLY |
| 313 | mp | PeerGraduation.vue | click | `router.push('/pages/peers/index')` | 23 | STATIC_ONLY |
| 314 | mp | PeerGraduation.vue | routerpush | `'/pages/peers/index'` | 23 | STATIC_ONLY |
| 315 | mp | PeerMatchWaiting.vue | click | `back` | 16 | STATIC_ONLY |
| 316 | mp | PeerMatchWaiting.vue | click | `load` | 17 | STATIC_ONLY |
| 317 | mp | PeerMatchWaiting.vue | click | `back` | 17 | STATIC_ONLY |
| 318 | mp | PeerMatchWaiting.vue | routerpush | `'/pages/peers/index'` | 10 | STATIC_ONLY |
| 319 | mp | PeerNetwork.vue | click | `router.push('/pages/peer/requests')` | 54 | STATIC_ONLY |
| 320 | mp | PeerNetwork.vue | click | `enable` | 62 | STATIC_ONLY |
| 321 | mp | PeerNetwork.vue | click | `router.push('/pages/privacy/index')` | 63 | STATIC_ONLY |
| 322 | mp | PeerNetwork.vue | click | `load` | 68 | STATIC_ONLY |
| 323 | mp | PeerNetwork.vue | click | `openExperience(primaryMatch)` | 74 | STATIC_ONLY |
| 324 | mp | PeerNetwork.vue | click | `openExperience(match)` | 79 | STATIC_ONLY |
| 325 | mp | PeerNetwork.vue | click | `openPublished(experience)` | 84 | STATIC_ONLY |
| 326 | mp | PeerNetwork.vue | routerpush | ``/pages/peer/wait?matchId=${encodeURIComponent(match.id` | 37 | STATIC_ONLY |
| 327 | mp | PeerNetwork.vue | routerpush | ``/pages/peer/detail?id=${encodeURIComponent(experienceId` | 39 | STATIC_ONLY |
| 328 | mp | PeerNetwork.vue | routerpush | ``/pages/peer/detail?id=${encodeURIComponent(experience.id` | 42 | STATIC_ONLY |
| 329 | mp | PeerNetwork.vue | routerpush | `'/pages/peer/requests'` | 54 | STATIC_ONLY |
| 330 | mp | PeerNetwork.vue | routerpush | `'/pages/privacy/index'` | 63 | STATIC_ONLY |
| 331 | mp | PeerRequests.vue | click | `router.push('/pages/peers/index')` | 24 | STATIC_ONLY |
| 332 | mp | PeerRequests.vue | click | `respond(item, 'connected')` | 27 | STATIC_ONLY |
| 333 | mp | PeerRequests.vue | click | `respond(item, 'declined')` | 27 | STATIC_ONLY |
| 334 | mp | PeerRequests.vue | click | `respond(item, 'blocked')` | 27 | STATIC_ONLY |
| 335 | mp | PeerRequests.vue | click | `openConsent(item)` | 29 | STATIC_ONLY |
| 336 | mp | PeerRequests.vue | routerpush | ``/pages/peer/consent?matchId=${encodeURIComponent(item.id` | 16 | STATIC_ONLY |
| 337 | mp | PeerRequests.vue | routerpush | ``/pages/peer/consent?matchId=${encodeURIComponent(item.id` | 17 | STATIC_ONLY |
| 338 | mp | PeerRequests.vue | routerpush | `'/pages/peers/index'` | 24 | STATIC_ONLY |
| 339 | mp | PostDetail.vue | click | `safeBack` | 183 | STATIC_ONLY |
| 340 | mp | PostDetail.vue | click | `showMore = true` | 192 | STATIC_ONLY |
| 341 | mp | PostDetail.vue | click | `openReplySheet()` | 201 | STATIC_ONLY |
| 342 | mp | PostDetail.vue | click | `openReplySheet(item.label)` | 209 | STATIC_ONLY |
| 343 | mp | PostDetail.vue | click | `hug` | 216 | STATIC_ONLY |
| 344 | mp | PostDetail.vue | click | `openReplySheet()` | 217 | STATIC_ONLY |
| 345 | mp | PostDetail.vue | click | `likeReply(reply)` | 233 | STATIC_ONLY |
| 346 | mp | PostDetail.vue | click | `likeReply(reply)` | 237 | STATIC_ONLY |
| 347 | mp | PostDetail.vue | click | `openReplySheet(item)` | 250 | STATIC_ONLY |
| 348 | mp | PostDetail.vue | click | `openReplySheet()` | 258 | STATIC_ONLY |
| 349 | mp | PostDetail.vue | click | `hug` | 259 | STATIC_ONLY |
| 350 | mp | PostDetail.vue | click | `favorite` | 260 | STATIC_ONLY |
| 351 | mp | PostDetail.vue | click | `closeReplySheet` | 266 | STATIC_ONLY |
| 352 | mp | PostDetail.vue | click | `usePreset(index)` | 290 | STATIC_ONLY |
| 353 | mp | PostDetail.vue | click | `closeReplySheet` | 307 | STATIC_ONLY |
| 354 | mp | PostDetail.vue | click | `submitReply` | 308 | STATIC_ONLY |
| 355 | mp | PostDetail.vue | click | `showMore = false` | 313 | STATIC_ONLY |
| 356 | mp | PostDetail.vue | click | `copyPost` | 316 | STATIC_ONLY |
| 357 | mp | PostDetail.vue | click | `reportPost` | 317 | STATIC_ONLY |
| 358 | mp | PostDetail.vue | click | `blockPost` | 318 | STATIC_ONLY |
| 359 | mp | PostDetail.vue | click | `showMore = false` | 319 | STATIC_ONLY |
| 360 | mp | PostDetail.vue | routerpush | `'/pages/square/index'` | 57 | STATIC_ONLY |
| 361 | mp | PostDetail.vue | testid | `front-post-back` | 183 | STATIC_ONLY |
| 362 | mp | PostDetail.vue | testid | `btn-open-more` | 192 | STATIC_ONLY |
| 363 | mp | PostDetail.vue | testid | `detail-reply-count` | 201 | STATIC_ONLY |
| 364 | mp | PostDetail.vue | testid | `item.testId` | 206 | STATIC_ONLY |
| 365 | mp | PostDetail.vue | testid | `btn-hug` | 216 | STATIC_ONLY |
| 366 | mp | PostDetail.vue | testid | `btn-open-reply` | 217 | STATIC_ONLY |
| 367 | mp | PostDetail.vue | testid | `reply-like-first` | 231 | STATIC_ONLY |
| 368 | mp | PostDetail.vue | testid | `index === 0 ? 'quick-hug-0' : `quick-hug-${index}`` | 247 | STATIC_ONLY |
| 369 | mp | PostDetail.vue | testid | `reply-entry` | 258 | STATIC_ONLY |
| 370 | mp | PostDetail.vue | testid | `btn-hug-dock` | 259 | STATIC_ONLY |
| 371 | mp | PostDetail.vue | testid | `btn-favorite` | 260 | STATIC_ONLY |
| 372 | mp | PostDetail.vue | testid | `input-reply-content` | 276 | STATIC_ONLY |
| 373 | mp | PostDetail.vue | testid | ``reply-preset-${index}`` | 288 | STATIC_ONLY |
| 374 | mp | PostDetail.vue | testid | `toggle-reply-anonymous` | 297 | STATIC_ONLY |
| 375 | mp | PostDetail.vue | testid | `select-reply-visibility` | 301 | STATIC_ONLY |
| 376 | mp | PostDetail.vue | testid | `btn-close-reply` | 307 | STATIC_ONLY |
| 377 | mp | PostDetail.vue | testid | `btn-submit-reply` | 308 | STATIC_ONLY |
| 378 | mp | PostDetail.vue | testid | `detail-menu-copy` | 316 | STATIC_ONLY |
| 379 | mp | PostDetail.vue | testid | `detail-menu-report` | 317 | STATIC_ONLY |
| 380 | mp | PostDetail.vue | testid | `detail-menu-block` | 318 | STATIC_ONLY |
| 381 | mp | PostDetail.vue | testid | `detail-menu-cancel` | 319 | STATIC_ONLY |
| 382 | mp | PrivacySettings.vue | click | `router.back()` | 166 | STATIC_ONLY |
| 383 | mp | PrivacySettings.vue | click | `save({ defaultVisibility: setting.defaultVisibility === 'PRIVATE' ? 'PUBLIC' : 'PRIVATE' }` | 192 | STATIC_ONLY |
| 384 | mp | PrivacySettings.vue | click | `save({ allowHumanReplies: !setting.allowHumanReplies })` | 205 | STATIC_ONLY |
| 385 | mp | PrivacySettings.vue | click | `save({ allowAnonymousPublic: !setting.allowAnonymousPublic })` | 218 | STATIC_ONLY |
| 386 | mp | PrivacySettings.vue | click | `save({ allowPeerMatching: !setting.allowPeerMatching })` | 231 | STATIC_ONLY |
| 387 | mp | PrivacySettings.vue | click | `save({ allowAnonymousExperienceStats: !setting.allowAnonymousExperienceStats })` | 244 | STATIC_ONLY |
| 388 | mp | PrivacySettings.vue | click | `save({ allowLongTermMemory: !setting.allowLongTermMemory })` | 257 | STATIC_ONLY |
| 389 | mp | PrivacySettings.vue | click | `save({ allowJourneyLongTermAnalysis: !setting.allowJourneyLongTermAnalysis })` | 270 | STATIC_ONLY |
| 390 | mp | PrivacySettings.vue | click | `save({ allowMonthlyReportShare: !setting.allowMonthlyReportShare })` | 283 | STATIC_ONLY |
| 391 | mp | PrivacySettings.vue | click | `save({ allowRecoveryData: !setting.allowRecoveryData })` | 296 | STATIC_ONLY |
| 392 | mp | PrivacySettings.vue | click | `clearCache` | 305 | STATIC_ONLY |
| 393 | mp | PrivacySettings.vue | click | `exportDiaries` | 312 | STATIC_ONLY |
| 394 | mp | PrivacySettings.vue | click | `explain = true` | 323 | STATIC_ONLY |
| 395 | mp | PrivacySettings.vue | click | `deleteConfirm = true` | 329 | STATIC_ONLY |
| 396 | mp | PrivacySettings.vue | click | `save({ allowAiMemoryUse: !setting.allowAiMemoryUse })` | 339 | STATIC_ONLY |
| 397 | mp | PrivacySettings.vue | click | `save({ allowAnonymousExperienceShare: !setting.allowAnonymousExperienceShare })` | 342 | STATIC_ONLY |
| 398 | mp | PrivacySettings.vue | click | `save({ allowFutureSelfNotifications: !setting.allowFutureSelfNotifications })` | 345 | STATIC_ONLY |
| 399 | mp | PrivacySettings.vue | click | `save({ allowJourneyArchiveRetention: !setting.allowJourneyArchiveRetention })` | 348 | STATIC_ONLY |
| 400 | mp | PrivacySettings.vue | click | `save({ allowDataExport: !setting.allowDataExport })` | 351 | STATIC_ONLY |
| 401 | mp | PrivacySettings.vue | click | `router.push('/pages/settings/data-policy')` | 366 | STATIC_ONLY |
| 402 | mp | PrivacySettings.vue | click | `explain = false` | 367 | STATIC_ONLY |
| 403 | mp | PrivacySettings.vue | click | `deleteConfirm = false` | 378 | STATIC_ONLY |
| 404 | mp | PrivacySettings.vue | click | `deleteMyData` | 379 | STATIC_ONLY |
| 405 | mp | PrivacySettings.vue | click | `load` | 387 | STATIC_ONLY |
| 406 | mp | PrivacySettings.vue | routerpush | `'/pages/settings/data-policy'` | 366 | STATIC_ONLY |
| 407 | mp | PrivacySettings.vue | testid | `front-privacy-back` | 166 | STATIC_ONLY |
| 408 | mp | PrivacySettings.vue | testid | `toggle-privacy-private` | 188 | STATIC_ONLY |
| 409 | mp | PrivacySettings.vue | testid | `toggle-privacy-human` | 201 | STATIC_ONLY |
| 410 | mp | PrivacySettings.vue | testid | `toggle-privacy-anonymous` | 214 | STATIC_ONLY |
| 411 | mp | PrivacySettings.vue | testid | `toggle-privacy-peer` | 227 | STATIC_ONLY |
| 412 | mp | PrivacySettings.vue | testid | `toggle-privacy-anonymous-stats` | 240 | STATIC_ONLY |
| 413 | mp | PrivacySettings.vue | testid | `toggle-privacy-long-memory` | 253 | STATIC_ONLY |
| 414 | mp | PrivacySettings.vue | testid | `toggle-privacy-journey-analysis` | 266 | STATIC_ONLY |
| 415 | mp | PrivacySettings.vue | testid | `toggle-privacy-report-share` | 279 | STATIC_ONLY |
| 416 | mp | PrivacySettings.vue | testid | `toggle-privacy-recovery-data` | 292 | STATIC_ONLY |
| 417 | mp | PrivacySettings.vue | testid | `btn-clear-cache` | 305 | STATIC_ONLY |
| 418 | mp | PrivacySettings.vue | testid | `btn-export-diaries` | 312 | STATIC_ONLY |
| 419 | mp | PrivacySettings.vue | testid | `btn-data-explain` | 323 | STATIC_ONLY |
| 420 | mp | PrivacySettings.vue | testid | `btn-delete-my-data` | 329 | STATIC_ONLY |
| 421 | mp | PrivacySettings.vue | testid | `toggle-privacy-ai-memory-use` | 339 | STATIC_ONLY |
| 422 | mp | PrivacySettings.vue | testid | `toggle-privacy-experience-share` | 342 | STATIC_ONLY |
| 423 | mp | PrivacySettings.vue | testid | `toggle-privacy-future-notifications` | 345 | STATIC_ONLY |
| 424 | mp | PrivacySettings.vue | testid | `toggle-privacy-journey-archive` | 348 | STATIC_ONLY |
| 425 | mp | PrivacySettings.vue | testid | `toggle-privacy-export` | 351 | STATIC_ONLY |
| 426 | mp | PrivacySettings.vue | testid | `privacy-explain-panel` | 360 | STATIC_ONLY |
| 427 | mp | PrivacySettings.vue | testid | `btn-data-policy-route` | 366 | STATIC_ONLY |
| 428 | mp | PrivacySettings.vue | testid | `btn-data-explain-close` | 367 | STATIC_ONLY |
| 429 | mp | PrivacySettings.vue | testid | `privacy-delete-panel` | 372 | STATIC_ONLY |
| 430 | mp | PrivacySettings.vue | testid | `btn-delete-my-data-confirm` | 379 | STATIC_ONLY |
| 431 | mp | RealityHandoff.vue | click | `router.back()` | 59 | STATIC_ONLY |
| 432 | mp | RealityHandoff.vue | click | `selectRecipient(item)` | 60 | STATIC_ONLY |
| 433 | mp | RealityHandoff.vue | click | `selectNeed(item)` | 60 | STATIC_ONLY |
| 434 | mp | RealityHandoff.vue | click | `saveCard` | 60 | STATIC_ONLY |
| 435 | mp | RealityHandoff.vue | click | `copyCard` | 60 | STATIC_ONLY |
| 436 | mp | RealityHandoff.vue | click | `editing = !editing` | 60 | STATIC_ONLY |
| 437 | mp | RealityHandoff.vue | click | `contactSheet = true` | 62 | STATIC_ONLY |
| 438 | mp | RealityHandoff.vue | click | `contactSheet = false` | 63 | STATIC_ONLY |
| 439 | mp | RealityHandoff.vue | click | `contactSheet = false` | 63 | STATIC_ONLY |
| 440 | mp | RealityHandoff.vue | click | `saveContact` | 63 | STATIC_ONLY |
| 441 | mp | RealityHandoff.vue | testid | `reality-support-card` | 60 | STATIC_ONLY |
| 442 | mp | RealityHandoff.vue | testid | `handoff-save` | 60 | STATIC_ONLY |
| 443 | mp | RealityHandoff.vue | testid | `handoff-copy` | 60 | STATIC_ONLY |
| 444 | mp | RealityHandoff.vue | testid | `trusted-contacts-sheet` | 63 | STATIC_ONLY |
| 445 | mp | Recovery.vue | click | `router.push('/pages/settings/privacy')` | 129 | STATIC_ONLY |
| 446 | mp | Recovery.vue | click | `save` | 155 | STATIC_ONLY |
| 447 | mp | Recovery.vue | routerpush | `'/pages/settings/privacy'` | 129 | STATIC_ONLY |
| 448 | mp | Recovery.vue | testid | `recovery-privacy-gate` | 126 | STATIC_ONLY |
| 449 | mp | Recovery.vue | testid | `recovery-save` | 155 | STATIC_ONLY |
| 450 | mp | ReportMonth.vue | click | `router.back()` | 195 | STATIC_ONLY |
| 451 | mp | ReportMonth.vue | click | `monthOpen = true` | 198 | STATIC_ONLY |
| 452 | mp | ReportMonth.vue | click | `makeShareImage` | 257 | STATIC_ONLY |
| 453 | mp | ReportMonth.vue | click | `loadAdvice` | 258 | STATIC_ONLY |
| 454 | mp | ReportMonth.vue | click | `selectMonth(value)` | 264 | STATIC_ONLY |
| 455 | mp | ReportMonth.vue | click | `poster = undefined` | 273 | STATIC_ONLY |
| 456 | mp | ReportMonth.vue | click | `saveShareImage` | 274 | STATIC_ONLY |
| 457 | mp | ReportMonth.vue | click | `advice = undefined` | 285 | STATIC_ONLY |
| 458 | mp | ReportMonth.vue | testid | `front-report-back` | 195 | STATIC_ONLY |
| 459 | mp | ReportMonth.vue | testid | `filter-report-month` | 198 | STATIC_ONLY |
| 460 | mp | ReportMonth.vue | testid | `report-trend-chart` | 235 | STATIC_ONLY |
| 461 | mp | ReportMonth.vue | testid | `btn-report-poster` | 257 | STATIC_ONLY |
| 462 | mp | ReportMonth.vue | testid | `btn-report-advice` | 258 | STATIC_ONLY |
| 463 | mp | ReportMonth.vue | testid | ``report-month-${value}`` | 264 | STATIC_ONLY |
| 464 | mp | ReportMonth.vue | testid | `btn-report-poster-close` | 273 | STATIC_ONLY |
| 465 | mp | ReportMonth.vue | testid | `btn-report-poster-save` | 274 | STATIC_ONLY |
| 466 | mp | ReportMonth.vue | testid | `report-advice-panel` | 279 | STATIC_ONLY |
| 467 | mp | ReportMonth.vue | testid | `btn-report-advice-close` | 285 | STATIC_ONLY |
| 468 | mp | SafetySupport.vue | click | `router.back()` | 53 | STATIC_ONLY |
| 469 | mp | SafetySupport.vue | click | `router.push(`/pages/reality-handoff/index${journeyId ? `?journeyId=${journeyId}` : ''}`)` | 65 | STATIC_ONLY |
| 470 | mp | SafetySupport.vue | click | `stayHere` | 74 | STATIC_ONLY |
| 471 | mp | SafetySupport.vue | click | `router.push('/pages/support-plan/index')` | 107 | STATIC_ONLY |
| 472 | mp | SafetySupport.vue | routerpush | `'/pages/tonight/index'` | 34 | STATIC_ONLY |
| 473 | mp | SafetySupport.vue | routerpush | ``/pages/journey/detail?id=${journeyId.value}&mode=stabilize`` | 41 | STATIC_ONLY |
| 474 | mp | SafetySupport.vue | routerpush | ``/pages/reality-handoff/index${journeyId ? `?journeyId=${journeyId}` : ''}`` | 65 | STATIC_ONLY |
| 475 | mp | SafetySupport.vue | routerpush | `'/pages/support-plan/index'` | 107 | STATIC_ONLY |
| 476 | mp | SafetySupport.vue | tel | `12356` | 70 | STATIC_ONLY |
| 477 | mp | SafetySupport.vue | tel | `120` | 72 | STATIC_ONLY |
| 478 | mp | SafetySupport.vue | testid | `safety-support` | 51 | STATIC_ONLY |
| 479 | mp | SafetySupport.vue | testid | `safety-handoff` | 64 | STATIC_ONLY |
| 480 | mp | SafetySupport.vue | testid | `safety-emergency` | 70 | STATIC_ONLY |
| 481 | mp | SafetySupport.vue | testid | `safety-stay` | 74 | STATIC_ONLY |
| 482 | mp | SafetySupport.vue | testid | `safety-saved-support-plan` | 105 | STATIC_ONLY |
| 483 | mp | Square.vue | click | `selectFilter(item.key)` | 134 | STATIC_ONLY |
| 484 | mp | Square.vue | click | `router.push('/pages/post/create')` | 144 | STATIC_ONLY |
| 485 | mp | Square.vue | click | `openPost(post)` | 152 | STATIC_ONLY |
| 486 | mp | Square.vue | click | `openMore(post)` | 159 | STATIC_ONLY |
| 487 | mp | Square.vue | click | `hugPost(post)` | 182 | STATIC_ONLY |
| 488 | mp | Square.vue | click | `hugPost(post)` | 189 | STATIC_ONLY |
| 489 | mp | Square.vue | click | `replyPost(post)` | 197 | STATIC_ONLY |
| 490 | mp | Square.vue | click | `replyPost(post)` | 204 | STATIC_ONLY |
| 491 | mp | Square.vue | click | `router.push('/pages/post/create')` | 211 | STATIC_ONLY |
| 492 | mp | Square.vue | click | `menuPost = null` | 218 | STATIC_ONLY |
| 493 | mp | Square.vue | click | `copyPost` | 221 | STATIC_ONLY |
| 494 | mp | Square.vue | click | `reportPost` | 222 | STATIC_ONLY |
| 495 | mp | Square.vue | click | `hidePost` | 223 | STATIC_ONLY |
| 496 | mp | Square.vue | click | `menuPost = null` | 224 | STATIC_ONLY |
| 497 | mp | Square.vue | routerpush | ``/pages/post/detail?id=${post.id}`` | 62 | STATIC_ONLY |
| 498 | mp | Square.vue | routerpush | ``/pages/post/detail?id=${post.id}&sheet=reply`` | 73 | STATIC_ONLY |
| 499 | mp | Square.vue | routerpush | `'/pages/post/create'` | 144 | STATIC_ONLY |
| 500 | mp | Square.vue | routerpush | `'/pages/post/create'` | 211 | STATIC_ONLY |
| 501 | mp | Square.vue | testid | `item.testId` | 131 | STATIC_ONLY |
| 502 | mp | Square.vue | testid | `btn-empty-write-mood` | 144 | STATIC_ONLY |
| 503 | mp | Square.vue | testid | `index === 0 ? 'post-card-first' : `post-card-${post.id}`` | 151 | STATIC_ONLY |
| 504 | mp | Square.vue | testid | `post-more-first` | 157 | STATIC_ONLY |
| 505 | mp | Square.vue | testid | `btn-square-hug-first` | 180 | STATIC_ONLY |
| 506 | mp | Square.vue | testid | `btn-square-reply-first` | 195 | STATIC_ONLY |
| 507 | mp | Square.vue | testid | `btn-write-mood` | 211 | STATIC_ONLY |
| 508 | mp | Square.vue | testid | `square-menu-copy` | 221 | STATIC_ONLY |
| 509 | mp | Square.vue | testid | `square-menu-report` | 222 | STATIC_ONLY |
| 510 | mp | Square.vue | testid | `square-menu-hide` | 223 | STATIC_ONLY |
| 511 | mp | Square.vue | testid | `square-menu-cancel` | 224 | STATIC_ONLY |
| 512 | mp | StableSelf.vue | click | `router.back()` | 140 | STATIC_ONLY |
| 513 | mp | StableSelf.vue | click | `toggle('stabilityAnchors', item)` | 169 | STATIC_ONLY |
| 514 | mp | StableSelf.vue | click | `toggle('stabilityAnchors', item)` | 174 | STATIC_ONLY |
| 515 | mp | StableSelf.vue | click | `editingKey = 'stabilityAnchors'` | 177 | STATIC_ONLY |
| 516 | mp | StableSelf.vue | click | `add('stabilityAnchors')` | 187 | STATIC_ONLY |
| 517 | mp | StableSelf.vue | click | `toggle('contactPeople', contact.nickname)` | 201 | STATIC_ONLY |
| 518 | mp | StableSelf.vue | click | `toggle('contactPeople', item)` | 211 | STATIC_ONLY |
| 519 | mp | StableSelf.vue | click | `editingKey = 'contactPeople'` | 212 | STATIC_ONLY |
| 520 | mp | StableSelf.vue | click | `add('contactPeople')` | 222 | STATIC_ONLY |
| 521 | mp | StableSelf.vue | click | `toggle('usualLikes', item)` | 233 | STATIC_ONLY |
| 522 | mp | StableSelf.vue | click | `toggle('recoverySigns', item)` | 247 | STATIC_ONLY |
| 523 | mp | StableSelf.vue | submit | `save` | 146 | STATIC_ONLY |
| 524 | mp | StableSelf.vue | testid | `stable-self-save` | 266 | STATIC_ONLY |
| 525 | mp | SupportPlan.vue | click | `toggle(section.key, choice)` | 173 | STATIC_ONLY |
| 526 | mp | SupportPlan.vue | click | `toggle('safePeople', contact.nickname)` | 182 | STATIC_ONLY |
| 527 | mp | SupportPlan.vue | click | `toggle(section.key, choice)` | 194 | STATIC_ONLY |
| 528 | mp | SupportPlan.vue | click | `editingKey = section.key` | 195 | STATIC_ONLY |
| 529 | mp | SupportPlan.vue | click | `addCustom(section.key)` | 206 | STATIC_ONLY |
| 530 | mp | SupportPlan.vue | click | `addCustom('places')` | 218 | STATIC_ONLY |
| 531 | mp | SupportPlan.vue | click | `toggle('places', item)` | 221 | STATIC_ONLY |
| 532 | mp | SupportPlan.vue | click | `addCustom('smallActions')` | 232 | STATIC_ONLY |
| 533 | mp | SupportPlan.vue | click | `toggle('smallActions', item)` | 235 | STATIC_ONLY |
| 534 | mp | SupportPlan.vue | click | `router.push('/pages/safety/index')` | 255 | STATIC_ONLY |
| 535 | mp | SupportPlan.vue | submit | `save` | 158 | STATIC_ONLY |
| 536 | mp | SupportPlan.vue | routerpush | `'/pages/safety/index'` | 255 | STATIC_ONLY |
| 537 | mp | SupportPlan.vue | testid | `support-plan-safety` | 253 | STATIC_ONLY |
| 538 | mp | SupportPlan.vue | testid | `support-plan-save` | 262 | STATIC_ONLY |
| 539 | mp | TonightHome.vue | click | `router.push('/pages/notifications/index')` | 65 | STATIC_ONLY |
| 540 | mp | TonightHome.vue | click | `chooseShortcut(item)` | 75 | STATIC_ONLY |
| 541 | mp | TonightHome.vue | click | `router.push(`/pages/journey/detail?id=${home.journey?.id}`)` | 76 | STATIC_ONLY |
| 542 | mp | TonightHome.vue | click | `createJourney` | 78 | STATIC_ONLY |
| 543 | mp | TonightHome.vue | click | `relationSheet = false` | 80 | STATIC_ONLY |
| 544 | mp | TonightHome.vue | click | `relationSheet = false` | 80 | STATIC_ONLY |
| 545 | mp | TonightHome.vue | click | `chooseRelation(scene)` | 80 | STATIC_ONLY |
| 546 | mp | TonightHome.vue | click | `chooseRelation('其他')` | 80 | STATIC_ONLY |
| 547 | mp | TonightHome.vue | routerpush | ``/pages/safety/index?journeyId=${response.journey.id}`` | 54 | STATIC_ONLY |
| 548 | mp | TonightHome.vue | routerpush | ``/pages/journey/detail?id=${response.journey.id}&analysisJob=${response.job.id}`` | 55 | STATIC_ONLY |
| 549 | mp | TonightHome.vue | routerpush | `'/pages/notifications/index'` | 65 | STATIC_ONLY |
| 550 | mp | TonightHome.vue | routerpush | ``/pages/journey/detail?id=${home.journey?.id}`` | 76 | STATIC_ONLY |
| 551 | mp | TonightHome.vue | testid | `notification-bell` | 65 | STATIC_ONLY |
| 552 | mp | TonightHome.vue | testid | `tonight-entry` | 71 | STATIC_ONLY |
| 553 | mp | TonightHome.vue | testid | `tonight-input` | 72 | STATIC_ONLY |
| 554 | mp | TonightHome.vue | testid | `tonight-continue` | 78 | STATIC_ONLY |
| 555 | mp | TonightHome.vue | testid | `relation-sheet` | 80 | STATIC_ONLY |
| 556 | mp | ToolDecompose.vue | click | `router.back()` | 95 | STATIC_ONLY |
| 557 | mp | ToolDecompose.vue | click | `run` | 97 | STATIC_ONLY |
| 558 | mp | ToolDecompose.vue | click | `run` | 108 | STATIC_ONLY |
| 559 | mp | ToolDecompose.vue | click | `save` | 109 | STATIC_ONLY |
| 560 | mp | ToolDecompose.vue | click | `copyResult` | 110 | STATIC_ONLY |
| 561 | mp | ToolDecompose.vue | testid | `front-tool-back` | 95 | STATIC_ONLY |
| 562 | mp | ToolDecompose.vue | testid | `input-decompose` | 97 | STATIC_ONLY |
| 563 | mp | ToolDecompose.vue | testid | `btn-decompose-run` | 97 | STATIC_ONLY |
| 564 | mp | ToolDecompose.vue | testid | `decompose-result-card` | 98 | STATIC_ONLY |
| 565 | mp | ToolDecompose.vue | testid | `btn-decompose-again` | 108 | STATIC_ONLY |
| 566 | mp | ToolDecompose.vue | testid | `btn-decompose-save` | 109 | STATIC_ONLY |
| 567 | mp | ToolDecompose.vue | testid | `btn-decompose-copy` | 110 | STATIC_ONLY |
| 568 | mp | ToolIndex.vue | click | `router.push('/pages/letter/today')` | 73 | STATIC_ONLY |
| 569 | mp | ToolIndex.vue | click | `openTool(card)` | 86 | STATIC_ONLY |
| 570 | mp | ToolIndex.vue | routerpush | ``/pages/tool/run?type=${canonicalType}`` | 38 | STATIC_ONLY |
| 571 | mp | ToolIndex.vue | routerpush | `card.route` | 42 | STATIC_ONLY |
| 572 | mp | ToolIndex.vue | routerpush | ``/pages/tool/run?type=${card.type}`` | 45 | STATIC_ONLY |
| 573 | mp | ToolIndex.vue | routerpush | `'/pages/letter/today'` | 73 | STATIC_ONLY |
| 574 | mp | ToolIndex.vue | testid | `tool-letter` | 73 | STATIC_ONLY |
| 575 | mp | ToolIndex.vue | testid | `card.testId` | 85 | STATIC_ONLY |
| 576 | mp | ToolRun.vue | click | `router.back()` | 100 | STATIC_ONLY |
| 577 | mp | ToolRun.vue | click | `runTool` | 104 | STATIC_ONLY |
| 578 | mp | ToolRun.vue | click | `saveResult` | 112 | STATIC_ONLY |
| 579 | mp | ToolRun.vue | click | `copyResult` | 112 | STATIC_ONLY |
| 580 | mp | ToolRun.vue | click | `result = ''` | 112 | STATIC_ONLY |
| 581 | mp | ToolRun.vue | testid | `front-tool-run-back` | 100 | STATIC_ONLY |
| 582 | mp | ToolRun.vue | testid | `input-tool-run` | 103 | STATIC_ONLY |
| 583 | mp | ToolRun.vue | testid | `btn-tool-run-submit` | 104 | STATIC_ONLY |
| 584 | mp | ToolRun.vue | testid | `tool-run-result-card` | 107 | STATIC_ONLY |
| 585 | mp | ToolRun.vue | testid | `future-letter-editor` | 110 | STATIC_ONLY |
| 586 | mp | ToolRun.vue | testid | `btn-tool-run-save` | 112 | STATIC_ONLY |
| 587 | mp | ToolRun.vue | testid | `btn-tool-run-copy` | 112 | STATIC_ONLY |
| 588 | mp | ToolRun.vue | testid | `btn-tool-run-close` | 112 | STATIC_ONLY |
| 589 | admin | AIJobsPage.vue | click | `resetFilters` | 305 | STATIC_ONLY |
| 590 | admin | AIJobsPage.vue | click | `load` | 305 | STATIC_ONLY |
| 591 | admin | AIJobsPage.vue | click | `open(job)` | 322 | STATIC_ONLY |
| 592 | admin | AIJobsPage.vue | click | `open(job)` | 330 | STATIC_ONLY |
| 593 | admin | AIJobsPage.vue | click | `runAction(job)` | 330 | STATIC_ONLY |
| 594 | admin | AIJobsPage.vue | click | `changePage(page - 1)` | 336 | STATIC_ONLY |
| 595 | admin | AIJobsPage.vue | click | `changePage(page + 1)` | 336 | STATIC_ONLY |
| 596 | admin | AIJobsPage.vue | click | `closeDetail` | 340 | STATIC_ONLY |
| 597 | admin | AIJobsPage.vue | click | `act('已提交重试任务', () => adminApi.post(`/api/admin/v1/ai/jobs/${selected.id}/retry`))` | 344 | STATIC_ONLY |
| 598 | admin | AIJobsPage.vue | testid | `admin-ai-jobs-refresh` | 305 | STATIC_ONLY |
| 599 | admin | AIJobsPage.vue | testid | `index === 0 ? 'jobs-row-first' : `jobs-row-${index}`` | 322 | STATIC_ONLY |
| 600 | admin | AIJobsPage.vue | testid | `admin-ai-job-detail` | 339 | STATIC_ONLY |
| 601 | admin | AIProvidersPage.vue | click | `load` | 232 | STATIC_ONLY |
| 602 | admin | AIProvidersPage.vue | click | `load` | 256 | STATIC_ONLY |
| 603 | admin | AIProvidersPage.vue | click | `select(item)` | 284 | STATIC_ONLY |
| 604 | admin | AIProvidersPage.vue | click | `test(item)` | 300 | STATIC_ONLY |
| 605 | admin | AIProvidersPage.vue | click | `toggle(item)` | 308 | STATIC_ONLY |
| 606 | admin | AIProvidersPage.vue | click | `changePage(page - 1)` | 321 | STATIC_ONLY |
| 607 | admin | AIProvidersPage.vue | click | `changePage(page + 1)` | 323 | STATIC_ONLY |
| 608 | admin | AIProvidersPage.vue | click | `resetSelected` | 368 | STATIC_ONLY |
| 609 | admin | AIProvidersPage.vue | click | `saveSelected` | 369 | STATIC_ONLY |
| 610 | admin | AIProvidersPage.vue | testid | `admin-provider-refresh` | 256 | STATIC_ONLY |
| 611 | admin | AIProvidersPage.vue | testid | `item.id === 'provider_dapi_deepseek' ? 'admin-provider-row-dapi' : (index === 0 ? 'admin-p` | 282 | STATIC_ONLY |
| 612 | admin | AIProvidersPage.vue | testid | `'admin-provider-test-' + item.id` | 298 | STATIC_ONLY |
| 613 | admin | AIProvidersPage.vue | testid | `'admin-provider-toggle-' + item.id` | 306 | STATIC_ONLY |
| 614 | admin | AIProvidersPage.vue | testid | `admin-provider-name-input` | 351 | STATIC_ONLY |
| 615 | admin | AIProvidersPage.vue | testid | `admin-provider-edit` | 369 | STATIC_ONLY |
| 616 | admin | AIRoutesPage.vue | click | `load` | 222 | STATIC_ONLY |
| 617 | admin | AIRoutesPage.vue | click | `open(route)` | 290 | STATIC_ONLY |
| 618 | admin | AIRoutesPage.vue | click | `open(route)` | 349 | STATIC_ONLY |
| 619 | admin | AIRoutesPage.vue | click | `test(route)` | 358 | STATIC_ONLY |
| 620 | admin | AIRoutesPage.vue | click | `selected = undefined` | 377 | STATIC_ONLY |
| 621 | admin | AIRoutesPage.vue | click | `selected = undefined` | 384 | STATIC_ONLY |
| 622 | admin | AIRoutesPage.vue | click | `save` | 424 | STATIC_ONLY |
| 623 | admin | AIRoutesPage.vue | click | `test()` | 427 | STATIC_ONLY |
| 624 | admin | AIRoutesPage.vue | testid | ``admin-route-card-${route.style}`` | 289 | STATIC_ONLY |
| 625 | admin | AIRoutesPage.vue | testid | ``admin-route-edit-${route.style}`` | 348 | STATIC_ONLY |
| 626 | admin | AIRoutesPage.vue | testid | ``admin-route-test-${route.style}`` | 357 | STATIC_ONLY |
| 627 | admin | AIRoutesPage.vue | testid | `admin-route-save` | 424 | STATIC_ONLY |
| 628 | admin | AIRoutesPage.vue | testid | `admin-route-test` | 427 | STATIC_ONLY |
| 629 | admin | AuditLogsPage.vue | click | `load` | 39 | STATIC_ONLY |
| 630 | admin | AuditLogsPage.vue | click | `open(item)` | 44 | STATIC_ONLY |
| 631 | admin | AuditLogsPage.vue | click | `detailOpen = false` | 49 | STATIC_ONLY |
| 632 | admin | AuditLogsPage.vue | click | `detailOpen = false` | 49 | STATIC_ONLY |
| 633 | admin | AuditLogsPage.vue | testid | `admin-audit-refresh` | 39 | STATIC_ONLY |
| 634 | admin | ConfigPage.vue | click | `reset` | 263 | STATIC_ONLY |
| 635 | admin | ConfigPage.vue | click | `save` | 264 | STATIC_ONLY |
| 636 | admin | ConfigPage.vue | testid | `'admin-config-field-' + key` | 218 | STATIC_ONLY |
| 637 | admin | ConfigPage.vue | testid | `'admin-config-field-' + key` | 226 | STATIC_ONLY |
| 638 | admin | ConfigPage.vue | testid | `'admin-config-field-' + key` | 236 | STATIC_ONLY |
| 639 | admin | ConfigPage.vue | testid | `'admin-config-field-' + key` | 247 | STATIC_ONLY |
| 640 | admin | ConfigPage.vue | testid | `admin-config-reset` | 263 | STATIC_ONLY |
| 641 | admin | ConfigPage.vue | testid | `admin-config-save` | 264 | STATIC_ONLY |
| 642 | admin | Dashboard.vue | click | `router.push('/experience/journeys')` | 126 | STATIC_ONLY |
| 643 | admin | Dashboard.vue | click | `router.push('/experience/actions')` | 127 | STATIC_ONLY |
| 644 | admin | Dashboard.vue | click | `router.push('/experience/checkins')` | 128 | STATIC_ONLY |
| 645 | admin | Dashboard.vue | click | `router.push('/experience/peers')` | 129 | STATIC_ONLY |
| 646 | admin | Dashboard.vue | click | `router.push('/safety/events')` | 130 | STATIC_ONLY |
| 647 | admin | Dashboard.vue | click | `router.push('/experience/follow-ups')` | 131 | STATIC_ONLY |
| 648 | admin | Dashboard.vue | click | `router.push('/experience/peer-conversations')` | 132 | STATIC_ONLY |
| 649 | admin | Dashboard.vue | click | `router.push('/experience/notifications')` | 133 | STATIC_ONLY |
| 650 | admin | Dashboard.vue | click | `router.push('/posts')` | 187 | STATIC_ONLY |
| 651 | admin | Dashboard.vue | click | `router.push('/ai/jobs')` | 195 | STATIC_ONLY |
| 652 | admin | Dashboard.vue | click | `load` | 208 | STATIC_ONLY |
| 653 | admin | Dashboard.vue | click | `router.push('/posts')` | 210 | STATIC_ONLY |
| 654 | admin | Dashboard.vue | click | `router.push('/ai/providers')` | 211 | STATIC_ONLY |
| 655 | admin | Dashboard.vue | click | `router.push('/ops/feedback')` | 212 | STATIC_ONLY |
| 656 | admin | Dashboard.vue | routerpush | `'/experience/journeys'` | 126 | STATIC_ONLY |
| 657 | admin | Dashboard.vue | routerpush | `'/experience/actions'` | 127 | STATIC_ONLY |
| 658 | admin | Dashboard.vue | routerpush | `'/experience/checkins'` | 128 | STATIC_ONLY |
| 659 | admin | Dashboard.vue | routerpush | `'/experience/peers'` | 129 | STATIC_ONLY |
| 660 | admin | Dashboard.vue | routerpush | `'/safety/events'` | 130 | STATIC_ONLY |
| 661 | admin | Dashboard.vue | routerpush | `'/experience/follow-ups'` | 131 | STATIC_ONLY |
| 662 | admin | Dashboard.vue | routerpush | `'/experience/peer-conversations'` | 132 | STATIC_ONLY |
| 663 | admin | Dashboard.vue | routerpush | `'/experience/notifications'` | 133 | STATIC_ONLY |
| 664 | admin | Dashboard.vue | routerpush | `'/posts'` | 187 | STATIC_ONLY |
| 665 | admin | Dashboard.vue | routerpush | `'/ai/jobs'` | 195 | STATIC_ONLY |
| 666 | admin | Dashboard.vue | routerpush | `'/posts'` | 210 | STATIC_ONLY |
| 667 | admin | Dashboard.vue | routerpush | `'/ai/providers'` | 211 | STATIC_ONLY |
| 668 | admin | Dashboard.vue | routerpush | `'/ops/feedback'` | 212 | STATIC_ONLY |
| 669 | admin | Dashboard.vue | testid | `admin-dashboard-trend` | 143 | STATIC_ONLY |
| 670 | admin | Dashboard.vue | testid | `admin-dashboard-emotions` | 160 | STATIC_ONLY |
| 671 | admin | Dashboard.vue | testid | `admin-dashboard-open-posts` | 187 | STATIC_ONLY |
| 672 | admin | Dashboard.vue | testid | `admin-dashboard-open-jobs` | 195 | STATIC_ONLY |
| 673 | admin | Dashboard.vue | testid | `admin-dashboard-refresh` | 208 | STATIC_ONLY |
| 674 | admin | Dashboard.vue | testid | `admin-shortcut-posts` | 210 | STATIC_ONLY |
| 675 | admin | Dashboard.vue | testid | `admin-shortcut-ai` | 211 | STATIC_ONLY |
| 676 | admin | Dashboard.vue | testid | `admin-shortcut-feedback` | 212 | STATIC_ONLY |
| 677 | admin | Dashboard.vue | testid | `admin-ai-monitor` | 220 | STATIC_ONLY |
| 678 | admin | FaqPage.vue | click | `add` | 136 | STATIC_ONLY |
| 679 | admin | FaqPage.vue | click | `openEdit(item)` | 142 | STATIC_ONLY |
| 680 | admin | FaqPage.vue | click | `move(item, -1)` | 142 | STATIC_ONLY |
| 681 | admin | FaqPage.vue | click | `move(item, 1)` | 142 | STATIC_ONLY |
| 682 | admin | FaqPage.vue | click | `toggle(item)` | 142 | STATIC_ONLY |
| 683 | admin | FaqPage.vue | click | `deleting = item` | 142 | STATIC_ONLY |
| 684 | admin | FaqPage.vue | click | `editing = null` | 147 | STATIC_ONLY |
| 685 | admin | FaqPage.vue | click | `editing = null` | 147 | STATIC_ONLY |
| 686 | admin | FaqPage.vue | click | `saveEdit` | 147 | STATIC_ONLY |
| 687 | admin | FaqPage.vue | click | `editing = null` | 147 | STATIC_ONLY |
| 688 | admin | FaqPage.vue | click | `deleting = null` | 148 | STATIC_ONLY |
| 689 | admin | FaqPage.vue | click | `remove` | 148 | STATIC_ONLY |
| 690 | admin | FaqPage.vue | click | `deleting = null` | 148 | STATIC_ONLY |
| 691 | admin | FaqPage.vue | testid | `admin-faq-question` | 134 | STATIC_ONLY |
| 692 | admin | FaqPage.vue | testid | `admin-faq-answer` | 135 | STATIC_ONLY |
| 693 | admin | FaqPage.vue | testid | `admin-faq-add` | 136 | STATIC_ONLY |
| 694 | admin | FaqPage.vue | testid | `admin-faq-save` | 147 | STATIC_ONLY |
| 695 | admin | FaqPage.vue | testid | `admin-faq-delete-confirm` | 148 | STATIC_ONLY |
| 696 | admin | FeedbackCategoriesPage.vue | click | `add` | 122 | STATIC_ONLY |
| 697 | admin | FeedbackCategoriesPage.vue | click | `openEdit(item)` | 126 | STATIC_ONLY |
| 698 | admin | FeedbackCategoriesPage.vue | click | `move(item, -1)` | 126 | STATIC_ONLY |
| 699 | admin | FeedbackCategoriesPage.vue | click | `move(item, 1)` | 126 | STATIC_ONLY |
| 700 | admin | FeedbackCategoriesPage.vue | click | `toggle(item)` | 126 | STATIC_ONLY |
| 701 | admin | FeedbackCategoriesPage.vue | click | `deleting = item` | 126 | STATIC_ONLY |
| 702 | admin | FeedbackCategoriesPage.vue | click | `editing = null` | 131 | STATIC_ONLY |
| 703 | admin | FeedbackCategoriesPage.vue | click | `editing = null` | 131 | STATIC_ONLY |
| 704 | admin | FeedbackCategoriesPage.vue | click | `saveEdit` | 131 | STATIC_ONLY |
| 705 | admin | FeedbackCategoriesPage.vue | click | `editing = null` | 131 | STATIC_ONLY |
| 706 | admin | FeedbackCategoriesPage.vue | click | `deleting = null` | 132 | STATIC_ONLY |
| 707 | admin | FeedbackCategoriesPage.vue | click | `remove` | 132 | STATIC_ONLY |
| 708 | admin | FeedbackCategoriesPage.vue | click | `deleting = null` | 132 | STATIC_ONLY |
| 709 | admin | FeedbackCategoriesPage.vue | testid | `admin-category-name` | 122 | STATIC_ONLY |
| 710 | admin | FeedbackCategoriesPage.vue | testid | `admin-category-add` | 122 | STATIC_ONLY |
| 711 | admin | FeedbackCategoriesPage.vue | testid | `admin-category-save` | 131 | STATIC_ONLY |
| 712 | admin | FeedbackCategoriesPage.vue | testid | `admin-category-delete-confirm` | 132 | STATIC_ONLY |
| 713 | admin | FeedbackTicketsPage.vue | click | `filter = 'open'` | 157 | STATIC_ONLY |
| 714 | admin | FeedbackTicketsPage.vue | click | `load` | 163 | STATIC_ONLY |
| 715 | admin | FeedbackTicketsPage.vue | click | `openDetail(ticket)` | 165 | STATIC_ONLY |
| 716 | admin | FeedbackTicketsPage.vue | click | `openDetail(ticket)` | 165 | STATIC_ONLY |
| 717 | admin | FeedbackTicketsPage.vue | click | `openReply(ticket)` | 165 | STATIC_ONLY |
| 718 | admin | FeedbackTicketsPage.vue | click | `resolveTicket(ticket)` | 165 | STATIC_ONLY |
| 719 | admin | FeedbackTicketsPage.vue | click | `goToPage(currentPage - 1)` | 165 | STATIC_ONLY |
| 720 | admin | FeedbackTicketsPage.vue | click | `goToPage(page)` | 165 | STATIC_ONLY |
| 721 | admin | FeedbackTicketsPage.vue | click | `goToPage(currentPage + 1)` | 165 | STATIC_ONLY |
| 722 | admin | FeedbackTicketsPage.vue | click | `detailOpen = false` | 166 | STATIC_ONLY |
| 723 | admin | FeedbackTicketsPage.vue | click | `detailOpen = false` | 166 | STATIC_ONLY |
| 724 | admin | FeedbackTicketsPage.vue | click | `setStatus('resolved')` | 166 | STATIC_ONLY |
| 725 | admin | FeedbackTicketsPage.vue | click | `replyTicket` | 166 | STATIC_ONLY |
| 726 | admin | FeedbackTicketsPage.vue | click | `setStatus('processing')` | 166 | STATIC_ONLY |
| 727 | admin | FeedbackTicketsPage.vue | click | `setStatus('closed')` | 166 | STATIC_ONLY |
| 728 | admin | FeedbackTicketsPage.vue | click | `confirmation = null` | 166 | STATIC_ONLY |
| 729 | admin | FeedbackTicketsPage.vue | click | `confirmation.run().then(() => confirmation = null)` | 166 | STATIC_ONLY |
| 730 | admin | FeedbackTicketsPage.vue | change | `applyPreset` | 166 | STATIC_ONLY |
| 731 | admin | FeedbackTicketsPage.vue | testid | `admin-feedback-search` | 162 | STATIC_ONLY |
| 732 | admin | FeedbackTicketsPage.vue | testid | `index === 0 ? 'tickets-row-first' : `tickets-row-${index}`` | 165 | STATIC_ONLY |
| 733 | admin | FeedbackTicketsPage.vue | testid | `admin-detail-drawer` | 166 | STATIC_ONLY |
| 734 | admin | FeedbackTicketsPage.vue | testid | `admin-detail-close` | 166 | STATIC_ONLY |
| 735 | admin | FeedbackTicketsPage.vue | testid | `admin-ticket-resolve` | 166 | STATIC_ONLY |
| 736 | admin | FeedbackTicketsPage.vue | testid | `admin-ticket-reply` | 166 | STATIC_ONLY |
| 737 | admin | FeedbackTicketsPage.vue | testid | `admin-ticket-processing` | 166 | STATIC_ONLY |
| 738 | admin | FeedbackTicketsPage.vue | testid | `admin-ticket-close` | 166 | STATIC_ONLY |
| 739 | admin | Layout.vue | click | `sidebarCollapsed = !sidebarCollapsed` | 108 | STATIC_ONLY |
| 740 | admin | Layout.vue | submit | `searchWorkspace` | 183 | STATIC_ONLY |
| 741 | admin | Layout.vue | routerlink | `/dashboard` | 92 | STATIC_ONLY |
| 742 | admin | Layout.vue | routerlink | `item.path` | 115 | STATIC_ONLY |
| 743 | admin | Layout.vue | routerlink | `item.path` | 137 | STATIC_ONLY |
| 744 | admin | Layout.vue | routerpush | `{ path: '/posts', query: { q: query } }` | 84 | STATIC_ONLY |
| 745 | admin | Layout.vue | testid | `admin-sidebar-toggle` | 105 | STATIC_ONLY |
| 746 | admin | Layout.vue | testid | `navTestIds[item.path]` | 121 | STATIC_ONLY |
| 747 | admin | Layout.vue | testid | `navTestIds[item.path]` | 143 | STATIC_ONLY |
| 748 | admin | Login.vue | click | `forgotPassword` | 132 | STATIC_ONLY |
| 749 | admin | Login.vue | submit | `login` | 90 | STATIC_ONLY |
| 750 | admin | Login.vue | routerpush | `'/dashboard'` | 32 | STATIC_ONLY |
| 751 | admin | Login.vue | testid | `admin-login-username` | 109 | STATIC_ONLY |
| 752 | admin | Login.vue | testid | `admin-login-password` | 116 | STATIC_ONLY |
| 753 | admin | Login.vue | testid | `admin-login-captcha` | 124 | STATIC_ONLY |
| 754 | admin | Login.vue | testid | `admin-forgot-password` | 132 | STATIC_ONLY |
| 755 | admin | Login.vue | testid | `admin-login-submit` | 135 | STATIC_ONLY |
| 756 | admin | PostsPage.vue | click | `filter = 'pending_review'` | 175 | STATIC_ONLY |
| 757 | admin | PostsPage.vue | click | `load` | 191 | STATIC_ONLY |
| 758 | admin | PostsPage.vue | click | `hideSelected` | 191 | STATIC_ONLY |
| 759 | admin | PostsPage.vue | click | `openDetail(post)` | 199 | STATIC_ONLY |
| 760 | admin | PostsPage.vue | click | `openDetail(post)` | 208 | STATIC_ONLY |
| 761 | admin | PostsPage.vue | click | `restorePost(post)` | 208 | STATIC_ONLY |
| 762 | admin | PostsPage.vue | click | `hidePost(post)` | 208 | STATIC_ONLY |
| 763 | admin | PostsPage.vue | click | `changePage(page - 1)` | 216 | STATIC_ONLY |
| 764 | admin | PostsPage.vue | click | `changePage(page + 1)` | 218 | STATIC_ONLY |
| 765 | admin | PostsPage.vue | click | `detailOpen = false` | 224 | STATIC_ONLY |
| 766 | admin | PostsPage.vue | click | `detailOpen = false` | 226 | STATIC_ONLY |
| 767 | admin | PostsPage.vue | click | `review('approve')` | 230 | STATIC_ONLY |
| 768 | admin | PostsPage.vue | click | `review('reject')` | 230 | STATIC_ONLY |
| 769 | admin | PostsPage.vue | click | `review('hide')` | 230 | STATIC_ONLY |
| 770 | admin | PostsPage.vue | click | `restore` | 230 | STATIC_ONLY |
| 771 | admin | PostsPage.vue | click | `review('risk')` | 230 | STATIC_ONLY |
| 772 | admin | PostsPage.vue | click | `regenerate` | 230 | STATIC_ONLY |
| 773 | admin | PostsPage.vue | click | `confirmation = null` | 236 | STATIC_ONLY |
| 774 | admin | PostsPage.vue | click | `confirmation = null` | 236 | STATIC_ONLY |
| 775 | admin | PostsPage.vue | click | `confirmation.run().then(() => confirmation = null)` | 236 | STATIC_ONLY |
| 776 | admin | PostsPage.vue | change | `toggleAll(($event.target as HTMLInputElement).checked)` | 197 | STATIC_ONLY |
| 777 | admin | PostsPage.vue | change | `toggleSelection(post.id, ($event.target as HTMLInputElement).checked)` | 200 | STATIC_ONLY |
| 778 | admin | PostsPage.vue | testid | `admin-post-search` | 190 | STATIC_ONLY |
| 779 | admin | PostsPage.vue | testid | `index === 0 ? 'posts-row-first' : `posts-row-${index}`` | 199 | STATIC_ONLY |
| 780 | admin | PostsPage.vue | testid | `admin-detail-drawer` | 225 | STATIC_ONLY |
| 781 | admin | PostsPage.vue | testid | `admin-detail-close` | 226 | STATIC_ONLY |
| 782 | admin | PostsPage.vue | testid | `admin-post-media` | 229 | STATIC_ONLY |
| 783 | admin | PostsPage.vue | testid | `admin-post-approve` | 230 | STATIC_ONLY |
| 784 | admin | PostsPage.vue | testid | `admin-post-reject` | 230 | STATIC_ONLY |
| 785 | admin | PostsPage.vue | testid | `admin-post-more` | 230 | STATIC_ONLY |
| 786 | admin | PostsPage.vue | testid | `admin-post-hide` | 230 | STATIC_ONLY |
| 787 | admin | PostsPage.vue | testid | `admin-post-restore` | 230 | STATIC_ONLY |
| 788 | admin | PostsPage.vue | testid | `admin-post-risk` | 230 | STATIC_ONLY |
| 789 | admin | PostsPage.vue | testid | `admin-post-ai-reply` | 230 | STATIC_ONLY |
| 790 | admin | PostsPage.vue | testid | `admin-confirm-action` | 236 | STATIC_ONLY |
| 791 | admin | RepliesPage.vue | click | `setQueue('pending_review')` | 176 | STATIC_ONLY |
| 792 | admin | RepliesPage.vue | click | `setQueue('all')` | 182 | STATIC_ONLY |
| 793 | admin | RepliesPage.vue | click | `setQueue('all', 'USER')` | 185 | STATIC_ONLY |
| 794 | admin | RepliesPage.vue | click | `setQueue('all', 'AI')` | 188 | STATIC_ONLY |
| 795 | admin | RepliesPage.vue | click | `setQueue('pending_review')` | 191 | STATIC_ONLY |
| 796 | admin | RepliesPage.vue | click | `setQueue('blocked')` | 194 | STATIC_ONLY |
| 797 | admin | RepliesPage.vue | click | `load` | 213 | STATIC_ONLY |
| 798 | admin | RepliesPage.vue | click | `openDetail(reply)` | 238 | STATIC_ONLY |
| 799 | admin | RepliesPage.vue | click | `openDetail(reply)` | 246 | STATIC_ONLY |
| 800 | admin | RepliesPage.vue | click | `changePage(page - 1)` | 256 | STATIC_ONLY |
| 801 | admin | RepliesPage.vue | click | `changePage(page + 1)` | 258 | STATIC_ONLY |
| 802 | admin | RepliesPage.vue | click | `!isWideWorkspace && (detailOpen = false)` | 264 | STATIC_ONLY |
| 803 | admin | RepliesPage.vue | click | `detailOpen = false` | 271 | STATIC_ONLY |
| 804 | admin | RepliesPage.vue | click | `review('approve')` | 296 | STATIC_ONLY |
| 805 | admin | RepliesPage.vue | click | `saveContent` | 297 | STATIC_ONLY |
| 806 | admin | RepliesPage.vue | click | `review('block')` | 298 | STATIC_ONLY |
| 807 | admin | RepliesPage.vue | click | `confirmation = null` | 305 | STATIC_ONLY |
| 808 | admin | RepliesPage.vue | click | `confirmation.run().then(() => confirmation = null)` | 306 | STATIC_ONLY |
| 809 | admin | RepliesPage.vue | testid | `admin-reply-search` | 202 | STATIC_ONLY |
| 810 | admin | RepliesPage.vue | testid | `index === 0 ? 'replies-row-first' : `replies-row-${index}`` | 236 | STATIC_ONLY |
| 811 | admin | RepliesPage.vue | testid | `admin-detail-drawer` | 265 | STATIC_ONLY |
| 812 | admin | RepliesPage.vue | testid | `admin-detail-close` | 271 | STATIC_ONLY |
| 813 | admin | RepliesPage.vue | testid | `admin-reply-approve` | 296 | STATIC_ONLY |
| 814 | admin | RepliesPage.vue | testid | `admin-reply-edit-approve` | 297 | STATIC_ONLY |
| 815 | admin | RepliesPage.vue | testid | `admin-reply-block` | 298 | STATIC_ONLY |
| 816 | admin | RepliesPage.vue | testid | `admin-confirm-action` | 306 | STATIC_ONLY |
| 817 | admin | ReplyPresetsPage.vue | click | `add` | 132 | STATIC_ONLY |
| 818 | admin | ReplyPresetsPage.vue | click | `openEdit(item)` | 141 | STATIC_ONLY |
| 819 | admin | ReplyPresetsPage.vue | click | `move(item, -1)` | 141 | STATIC_ONLY |
| 820 | admin | ReplyPresetsPage.vue | click | `move(item, 1)` | 141 | STATIC_ONLY |
| 821 | admin | ReplyPresetsPage.vue | click | `toggle(item)` | 141 | STATIC_ONLY |
| 822 | admin | ReplyPresetsPage.vue | click | `deleting = item` | 141 | STATIC_ONLY |
| 823 | admin | ReplyPresetsPage.vue | click | `editing = null` | 147 | STATIC_ONLY |
| 824 | admin | ReplyPresetsPage.vue | click | `editing = null` | 147 | STATIC_ONLY |
| 825 | admin | ReplyPresetsPage.vue | click | `saveEdit` | 147 | STATIC_ONLY |
| 826 | admin | ReplyPresetsPage.vue | click | `editing = null` | 147 | STATIC_ONLY |
| 827 | admin | ReplyPresetsPage.vue | click | `deleting = null` | 148 | STATIC_ONLY |
| 828 | admin | ReplyPresetsPage.vue | click | `remove` | 148 | STATIC_ONLY |
| 829 | admin | ReplyPresetsPage.vue | click | `deleting = null` | 148 | STATIC_ONLY |
| 830 | admin | ReplyPresetsPage.vue | testid | `admin-preset-text` | 130 | STATIC_ONLY |
| 831 | admin | ReplyPresetsPage.vue | testid | `admin-preset-add` | 132 | STATIC_ONLY |
| 832 | admin | ReplyPresetsPage.vue | testid | `admin-preset-save` | 147 | STATIC_ONLY |
| 833 | admin | ReplyPresetsPage.vue | testid | `admin-preset-delete-confirm` | 148 | STATIC_ONLY |
| 834 | admin | TablePage.vue | click | `load` | 813 | STATIC_ONLY |
| 835 | admin | TablePage.vue | click | `setUserStatus('banned')` | 844 | STATIC_ONLY |
| 836 | admin | TablePage.vue | click | `setUserStatus('limited')` | 845 | STATIC_ONLY |
| 837 | admin | TablePage.vue | click | `setUserStatus('normal')` | 846 | STATIC_ONLY |
| 838 | admin | TablePage.vue | click | `saveUserNote` | 847 | STATIC_ONLY |
| 839 | admin | TablePage.vue | click | `exportUsers` | 848 | STATIC_ONLY |
| 840 | admin | TablePage.vue | click | `reviewPost('approve')` | 852 | STATIC_ONLY |
| 841 | admin | TablePage.vue | click | `reviewPost('reject')` | 853 | STATIC_ONLY |
| 842 | admin | TablePage.vue | click | `reviewPost('hide')` | 854 | STATIC_ONLY |
| 843 | admin | TablePage.vue | click | `restorePost` | 855 | STATIC_ONLY |
| 844 | admin | TablePage.vue | click | `reviewPost('risk')` | 856 | STATIC_ONLY |
| 845 | admin | TablePage.vue | click | `regeneratePostReplies` | 857 | STATIC_ONLY |
| 846 | admin | TablePage.vue | click | `reviewReply('approve')` | 861 | STATIC_ONLY |
| 847 | admin | TablePage.vue | click | `reviewReply('block')` | 862 | STATIC_ONLY |
| 848 | admin | TablePage.vue | click | `saveReplyContent` | 863 | STATIC_ONLY |
| 849 | admin | TablePage.vue | click | `addProvider` | 867 | STATIC_ONLY |
| 850 | admin | TablePage.vue | click | `saveProvider` | 868 | STATIC_ONLY |
| 851 | admin | TablePage.vue | click | `toggleProvider` | 869 | STATIC_ONLY |
| 852 | admin | TablePage.vue | click | `testProvider` | 870 | STATIC_ONLY |
| 853 | admin | TablePage.vue | click | `saveRoute` | 874 | STATIC_ONLY |
| 854 | admin | TablePage.vue | click | `testRoute` | 875 | STATIC_ONLY |
| 855 | admin | TablePage.vue | click | `retryJob` | 879 | STATIC_ONLY |
| 856 | admin | TablePage.vue | click | `fallbackJob` | 880 | STATIC_ONLY |
| 857 | admin | TablePage.vue | click | `replyTicket` | 884 | STATIC_ONLY |
| 858 | admin | TablePage.vue | click | `setTicketStatus('processing')` | 885 | STATIC_ONLY |
| 859 | admin | TablePage.vue | click | `setTicketStatus('resolved')` | 886 | STATIC_ONLY |
| 860 | admin | TablePage.vue | click | `setTicketStatus('closed')` | 887 | STATIC_ONLY |
| 861 | admin | TablePage.vue | click | `saveConfig` | 891 | STATIC_ONLY |
| 862 | admin | TablePage.vue | click | `resetConfig` | 892 | STATIC_ONLY |
| 863 | admin | TablePage.vue | click | `addFaq` | 896 | STATIC_ONLY |
| 864 | admin | TablePage.vue | click | `addPreset` | 900 | STATIC_ONLY |
| 865 | admin | TablePage.vue | click | `addCategory` | 904 | STATIC_ONLY |
| 866 | admin | TablePage.vue | click | `reviewPeerExperience('published')` | 908 | STATIC_ONLY |
| 867 | admin | TablePage.vue | click | `reviewPeerExperience('hidden')` | 909 | STATIC_ONLY |
| 868 | admin | TablePage.vue | click | `reviewPeerExperience('rejected')` | 910 | STATIC_ONLY |
| 869 | admin | TablePage.vue | click | `selectRow(row)` | 930 | STATIC_ONLY |
| 870 | admin | TablePage.vue | click | `closeDetail` | 947 | STATIC_ONLY |
| 871 | admin | TablePage.vue | click | `closeDetail` | 951 | STATIC_ONLY |
| 872 | admin | TablePage.vue | testid | `resource === 'users' ? 'admin-user-search' : resource === 'posts' ? 'admin-post-search' : ` | 802 | STATIC_ONLY |
| 873 | admin | TablePage.vue | testid | `admin-user-status-filter` | 806 | STATIC_ONLY |
| 874 | admin | TablePage.vue | testid | `admin-action-input` | 811 | STATIC_ONLY |
| 875 | admin | TablePage.vue | testid | `admin-audit-refresh` | 813 | STATIC_ONLY |
| 876 | admin | TablePage.vue | testid | `admin-user-ban` | 844 | STATIC_ONLY |
| 877 | admin | TablePage.vue | testid | `admin-user-mute` | 845 | STATIC_ONLY |
| 878 | admin | TablePage.vue | testid | `admin-user-restore` | 846 | STATIC_ONLY |
| 879 | admin | TablePage.vue | testid | `admin-user-note` | 847 | STATIC_ONLY |
| 880 | admin | TablePage.vue | testid | `admin-user-export` | 848 | STATIC_ONLY |
| 881 | admin | TablePage.vue | testid | `admin-post-approve` | 852 | STATIC_ONLY |
| 882 | admin | TablePage.vue | testid | `admin-post-reject` | 853 | STATIC_ONLY |
| 883 | admin | TablePage.vue | testid | `admin-post-hide` | 854 | STATIC_ONLY |
| 884 | admin | TablePage.vue | testid | `admin-post-restore` | 855 | STATIC_ONLY |
| 885 | admin | TablePage.vue | testid | `admin-post-risk` | 856 | STATIC_ONLY |
| 886 | admin | TablePage.vue | testid | `admin-post-ai-reply` | 857 | STATIC_ONLY |
| 887 | admin | TablePage.vue | testid | `admin-reply-approve` | 861 | STATIC_ONLY |
| 888 | admin | TablePage.vue | testid | `admin-reply-block` | 862 | STATIC_ONLY |
| 889 | admin | TablePage.vue | testid | `admin-reply-edit-approve` | 863 | STATIC_ONLY |
| 890 | admin | TablePage.vue | testid | `admin-provider-add` | 867 | STATIC_ONLY |
| 891 | admin | TablePage.vue | testid | `admin-provider-edit` | 868 | STATIC_ONLY |
| 892 | admin | TablePage.vue | testid | `admin-provider-toggle` | 869 | STATIC_ONLY |
| 893 | admin | TablePage.vue | testid | `admin-provider-test` | 870 | STATIC_ONLY |
| 894 | admin | TablePage.vue | testid | `admin-route-save` | 874 | STATIC_ONLY |
| 895 | admin | TablePage.vue | testid | `admin-route-test` | 875 | STATIC_ONLY |
| 896 | admin | TablePage.vue | testid | `admin-job-retry` | 879 | STATIC_ONLY |
| 897 | admin | TablePage.vue | testid | `admin-job-fallback` | 880 | STATIC_ONLY |
| 898 | admin | TablePage.vue | testid | `admin-ticket-reply` | 884 | STATIC_ONLY |
| 899 | admin | TablePage.vue | testid | `admin-ticket-processing` | 885 | STATIC_ONLY |
| 900 | admin | TablePage.vue | testid | `admin-ticket-resolve` | 886 | STATIC_ONLY |
| 901 | admin | TablePage.vue | testid | `admin-ticket-close` | 887 | STATIC_ONLY |
| 902 | admin | TablePage.vue | testid | `admin-config-save` | 891 | STATIC_ONLY |
| 903 | admin | TablePage.vue | testid | `admin-config-reset` | 892 | STATIC_ONLY |
| 904 | admin | TablePage.vue | testid | `admin-faq-add` | 896 | STATIC_ONLY |
| 905 | admin | TablePage.vue | testid | `admin-preset-add` | 900 | STATIC_ONLY |
| 906 | admin | TablePage.vue | testid | `admin-category-add` | 904 | STATIC_ONLY |
| 907 | admin | TablePage.vue | testid | `admin-peer-publish` | 908 | STATIC_ONLY |
| 908 | admin | TablePage.vue | testid | `admin-peer-hide` | 909 | STATIC_ONLY |
| 909 | admin | TablePage.vue | testid | `admin-peer-reject` | 910 | STATIC_ONLY |
| 910 | admin | TablePage.vue | testid | `index === 0 ? `${resource}-row-first` : index === items.length - 1 ? `${resource}-row-last` | 926 | STATIC_ONLY |
| 911 | admin | TablePage.vue | testid | `admin-detail-drawer` | 948 | STATIC_ONLY |
| 912 | admin | TablePage.vue | testid | `admin-detail-close` | 951 | STATIC_ONLY |
| 913 | admin | TablePage.vue | testid | `admin-post-media` | 965 | STATIC_ONLY |
| 914 | admin | UsersPage.vue | click | `load` | 131 | STATIC_ONLY |
| 915 | admin | UsersPage.vue | click | `exportUsers` | 132 | STATIC_ONLY |
| 916 | admin | UsersPage.vue | click | `openDetail(user)` | 148 | STATIC_ONLY |
| 917 | admin | UsersPage.vue | click | `openDetail(user)` | 153 | STATIC_ONLY |
| 918 | admin | UsersPage.vue | click | `!isWideWorkspace && (detailOpen = false)` | 160 | STATIC_ONLY |
| 919 | admin | UsersPage.vue | click | `detailOpen = false` | 162 | STATIC_ONLY |
| 920 | admin | UsersPage.vue | click | `saveNote` | 165 | STATIC_ONLY |
| 921 | admin | UsersPage.vue | click | `requestStatus('banned')` | 165 | STATIC_ONLY |
| 922 | admin | UsersPage.vue | click | `requestStatus('limited')` | 165 | STATIC_ONLY |
| 923 | admin | UsersPage.vue | click | `requestStatus('normal')` | 165 | STATIC_ONLY |
| 924 | admin | UsersPage.vue | click | `confirmation = null` | 166 | STATIC_ONLY |
| 925 | admin | UsersPage.vue | click | `confirmation.run().then(() => confirmation = null)` | 166 | STATIC_ONLY |
| 926 | admin | UsersPage.vue | testid | `admin-user-search` | 129 | STATIC_ONLY |
| 927 | admin | UsersPage.vue | testid | `admin-user-status-filter` | 130 | STATIC_ONLY |
| 928 | admin | UsersPage.vue | testid | `admin-user-refresh` | 131 | STATIC_ONLY |
| 929 | admin | UsersPage.vue | testid | `admin-user-export` | 132 | STATIC_ONLY |
| 930 | admin | UsersPage.vue | testid | `index === 0 ? 'users-row-first' : `users-row-${index}`` | 148 | STATIC_ONLY |
| 931 | admin | UsersPage.vue | testid | `admin-detail-drawer` | 161 | STATIC_ONLY |
| 932 | admin | UsersPage.vue | testid | `admin-detail-close` | 162 | STATIC_ONLY |
| 933 | admin | UsersPage.vue | testid | `admin-user-note` | 165 | STATIC_ONLY |
| 934 | admin | UsersPage.vue | testid | `admin-user-ban` | 165 | STATIC_ONLY |
| 935 | admin | UsersPage.vue | testid | `admin-user-more` | 165 | STATIC_ONLY |
| 936 | admin | UsersPage.vue | testid | `admin-user-mute` | 165 | STATIC_ONLY |
| 937 | admin | UsersPage.vue | testid | `admin-user-restore` | 165 | STATIC_ONLY |
| 938 | admin | UsersPage.vue | testid | `admin-confirm-action` | 166 | STATIC_ONLY |
| 939 | admin | UsersPage.vue | testid | `admin-user-export` | 239 | STATIC_ONLY |
| 940 | admin | UsersPage.vue | testid | `admin-user-export` | 379 | STATIC_ONLY |
