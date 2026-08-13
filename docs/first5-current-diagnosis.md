# First5 Current Diagnosis

Generated: 2026-07-07T10:04:20.082Z

| Step | Result | Status |
| --- | --- | --- |
| runtime | PASS | 0 |
| overlay | PASS | 0 |
| routes | PASS | 0 |
| api | PASS | 0 |
| clickability | PASS | 0 |

## Runtime

```json
{
  "generatedAt": "2026-07-07T10:02:47.738Z",
  "checks": [
    {
      "name": "api health",
      "ok": true,
      "evidence": {
        "gitCommitSha": "unknown",
        "buildTime": "2026-07-07T10:02:48.635Z",
        "processStartTime": "2026-07-07T10:02:48.635Z",
        "runtimeInstanceId": "api-34764"
      }
    },
    {
      "name": "front 5173 reachable",
      "ok": true,
      "evidence": "http://127.0.0.1:5173/pages/square/index"
    },
    {
      "name": "front build marker",
      "ok": true,
      "evidence": {
        "scope": "front-first5",
        "frontRest": "front-rest",
        "builtAt": "2026-07-07T10:02:49.724Z",
        "routes": [
          "01-square",
          "02-mood-create",
          "03-post-detail",
          "04-reply-sheet",
          "05-letter-today",
          "06-tool-index",
          "07-tool-decompose",
          "08-me",
          "09-diary-index",
          "10-report-month",
          "11-letter-list",
          "12-favorite-index",
          "13-privacy-settings",
          "14-help-feedback"
        ]
      }
    },
    {
      "name": "admin 5174 reachable",
      "ok": true,
      "evidence": "http://127.0.0.1:5174/login"
    }
  ]
}
```

## Overlay

# First5 Overlay Diagnosis

Generated: 2026-07-07T10:02:50.822Z
Findings: 0

| Result | File | Line | Type | Evidence |
| --- | --- | --- | --- | --- |
| PASS | - | - | no design image shell, proxy layer, or visible test term found | - |


## Routes

# First5 Route Diagnosis

Generated: 2026-07-07T10:02:50.975Z

| Result | Route | Evidence |
| --- | --- | --- |
| PASS | /pages/square/index | registered in apps/mp/src/router.ts |
| PASS | /pages/mood/create | registered in apps/mp/src/router.ts |
| PASS | /pages/post/detail | registered in apps/mp/src/router.ts |
| PASS | /pages/letter/index | registered in apps/mp/src/router.ts |
| PASS | tabbar letter | tab-letter points to current letter route |


## API

# First5 API Diagnosis

Generated: 2026-07-07T10:02:51.126Z

| Result | API | Evidence |
| --- | --- | --- |
| PASS | GET /api/v1/posts | controller route exists |
| PASS | GET /api/v1/posts/:id | controller route exists |
| PASS | POST /api/v1/posts/:id/hug | controller route exists |
| PASS | POST /api/v1/posts/:id/favorite | controller route exists |
| PASS | POST /api/v1/moods | controller route exists |
| PASS | GET /api/v1/posts/:id/replies | controller route exists |
| PASS | GET /api/v1/reply-presets | controller route exists |
| PASS | POST /api/v1/posts/:id/replies | controller route exists |
| PASS | GET /api/v1/letters/today | controller route exists |
| PASS | POST /api/v1/letters/:id/regenerate | controller route exists |
| PASS | POST /api/v1/letters/:id/save-to-diary | controller route exists |
| PASS | POST /api/v1/letters/:id/poster | controller route exists |
| PASS | POST /api/v1/assets/complete | controller route exists |


## Clickability

# First5 Clickability Diagnosis

Generated: 2026-07-07T10:04:20.031Z
Total: 64
Passed: 64
Failed: 0

| Result | Page | Text | Selector | Hit | API | Signal | URL/Error |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PASS | 01-square | 委屈 | filter-weiqu | SPAN->filter-weiqu | GET /api/v1/posts?emotion=委屈 | dom+network | http://127.0.0.1:5173/pages/square/index |
| PASS | 01-square | 焦虑 | filter-jiaolv | SPAN->filter-jiaolv | GET /api/v1/posts?emotion=焦虑 | dom+network | http://127.0.0.1:5173/pages/square/index |
| PASS | 01-square | 失眠 | filter-shimian | SPAN->filter-shimian | GET /api/v1/posts?emotion=失眠 | dom+network | http://127.0.0.1:5173/pages/square/index |
| PASS | 01-square | 恋爱 | filter-lianai | SPAN->filter-lianai | GET /api/v1/posts?emotion=恋爱 | dom+network | http://127.0.0.1:5173/pages/square/index |
| PASS | 01-square | 工作 | filter-gongzuo | SPAN->filter-gongzuo | GET /api/v1/posts?emotion=工作 | dom+network | http://127.0.0.1:5173/pages/square/index |
| PASS | 01-square | 全部 | filter-all | SPAN->filter-all | GET /api/v1/posts | network | http://127.0.0.1:5173/pages/square/index |
| PASS | 01-square | 写心情 | btn-write-mood | SPAN->btn-write-mood |  | url+dom | http://127.0.0.1:5173/pages/mood/create |
| PASS | 01-square | 匿名树洞 | post-card-first | P->post-card-first | GET /api/v1/posts/:id | url+dom+network | http://127.0.0.1:5173/pages/post/detail?id=post_1 |
| PASS | 01-square | 更多 | post-more-first | BUTTON->post-more-first |  | dom | http://127.0.0.1:5173/pages/square/index |
| PASS | 01-square | 抱抱 | btn-square-hug-first | BUTTON->btn-square-hug-first | POST /api/v1/posts/:id/hug | dom+network+store | http://127.0.0.1:5173/pages/square/index |
| PASS | 01-square | 回应 | btn-square-reply-first | BUTTON->btn-square-reply-first | GET /api/v1/reply-presets | url+dom+network | http://127.0.0.1:5173/pages/post/detail?id=post_1&sheet=reply |
| PASS | 01-square | 广场 | tab-square | SPAN->tab-square |  | url+dom | http://127.0.0.1:5173/pages/square/index |
| PASS | 01-square | 回信 | tab-letter | SPAN->tab-letter | GET /api/v1/letters/today | url+dom+network | http://127.0.0.1:5173/pages/letter/index |
| PASS | 01-square | 工具 | tab-tool | SPAN->tab-tool | GET /api/v1/tools | url+dom+network | http://127.0.0.1:5173/pages/tool/index |
| PASS | 01-square | 我的 | tab-me | SPAN->tab-me | GET /api/v1/me/profile | url+dom+network | http://127.0.0.1:5173/pages/me/index |
| PASS | 02-mood-create | 返回 | front-mood-back | BUTTON->front-mood-back |  | url+dom | http://127.0.0.1:5173/pages/square/index |
| PASS | 02-mood-create | 此刻的你，想说些什么呢？ | input-mood-content | TEXTAREA->input-mood-content |  | dom | http://127.0.0.1:5173/pages/mood/create |
| PASS | 02-mood-create | 难过 | mood-emotion-nanguo | SPAN->mood-emotion-nanguo |  | dom | http://127.0.0.1:5173/pages/mood/create |
| PASS | 02-mood-create | 焦虑 | mood-emotion-jiaolv | SPAN->mood-emotion-jiaolv |  | dom | http://127.0.0.1:5173/pages/mood/create |
| PASS | 02-mood-create | 委屈 | mood-emotion-weiqu | SPAN->mood-emotion-weiqu |  | dom | http://127.0.0.1:5173/pages/mood/create |
| PASS | 02-mood-create | 生气 | mood-emotion-shengqi | SPAN->mood-emotion-shengqi |  | dom | http://127.0.0.1:5173/pages/mood/create |
| PASS | 02-mood-create | 孤独 | mood-emotion-gudu | SPAN->mood-emotion-gudu |  | dom | http://127.0.0.1:5173/pages/mood/create |
| PASS | 02-mood-create | 失眠 | mood-emotion-shimian | SPAN->mood-emotion-shimian |  | dom | http://127.0.0.1:5173/pages/mood/create |
| PASS | 02-mood-create | 仅自己可见 | mood-visibility-private | BUTTON->mood-visibility-private |  | dom | http://127.0.0.1:5173/pages/mood/create |
| PASS | 02-mood-create | 匿名发布到广场 | mood-visibility-public | BUTTON->mood-visibility-public |  | dom | http://127.0.0.1:5173/pages/mood/create |
| PASS | 02-mood-create | 暖心陪伴 | mood-style-warm | SPAN->mood-style-warm |  | dom | http://127.0.0.1:5173/pages/mood/create |
| PASS | 02-mood-create | 理性分析 | mood-style-rational | SPAN->mood-style-rational |  | dom | http://127.0.0.1:5173/pages/mood/create |
| PASS | 02-mood-create | 轻松一下 | mood-style-light | SPAN->mood-style-light |  | dom | http://127.0.0.1:5173/pages/mood/create |
| PASS | 02-mood-create | 诗意治愈 | mood-style-poetic | SPAN->mood-style-poetic |  | dom | http://127.0.0.1:5173/pages/mood/create |
| PASS | 02-mood-create | 清醒提醒 | mood-style-clear | SPAN->mood-style-clear |  | dom | http://127.0.0.1:5173/pages/mood/create |
| PASS | 02-mood-create | 添加图片 | btn-add-image | SPAN->btn-add-image | POST /api/v1/assets/complete | dom+network+store | http://127.0.0.1:5173/pages/mood/create |
| PASS | 02-mood-create | 发布心情 | btn-submit-mood | BUTTON->btn-submit-mood | POST /api/v1/moods | url+dom+network+store | http://127.0.0.1:5173/pages/post/detail?id=post_12a7fa6e49 |
| PASS | 03-post-detail | 返回 | front-post-back | BUTTON->front-post-back |  | url+dom | http://127.0.0.1:5173/pages/square/index |
| PASS | 03-post-detail | 更多 | btn-open-more | BUTTON->btn-open-more |  | dom | http://127.0.0.1:5173/pages/post/detail?id=post_1 |
| PASS | 03-post-detail | 暖心陪伴 | detail-style-warm | SPAN->detail-style-warm | GET /api/v1/reply-presets | url+dom+network | http://127.0.0.1:5173/pages/post/detail?id=post_1&sheet=reply |
| PASS | 03-post-detail | 理性分析 | detail-style-rational | SPAN->detail-style-rational | GET /api/v1/reply-presets | url+dom+network | http://127.0.0.1:5173/pages/post/detail?id=post_1&sheet=reply |
| PASS | 03-post-detail | 轻松一下 | detail-style-light | SPAN->detail-style-light | GET /api/v1/reply-presets | url+dom+network | http://127.0.0.1:5173/pages/post/detail?id=post_1&sheet=reply |
| PASS | 03-post-detail | 清醒提醒 | detail-style-clear | SPAN->detail-style-clear | GET /api/v1/reply-presets | url+dom+network | http://127.0.0.1:5173/pages/post/detail?id=post_1&sheet=reply |
| PASS | 03-post-detail | 诗意治愈 | detail-style-poetic | SPAN->detail-style-poetic | GET /api/v1/reply-presets | url+dom+network | http://127.0.0.1:5173/pages/post/detail?id=post_1&sheet=reply |
| PASS | 03-post-detail | 抱抱 | btn-hug | BUTTON->btn-hug | POST /api/v1/posts/:id/hug | dom+network+store | http://127.0.0.1:5173/pages/post/detail?id=post_1 |
| PASS | 03-post-detail | 回应 | btn-open-reply | BUTTON->btn-open-reply | GET /api/v1/reply-presets | url+dom+network | http://127.0.0.1:5173/pages/post/detail?id=post_1&sheet=reply |
| PASS | 03-post-detail | 温柔回应点赞 | reply-like-first | BUTTON->reply-like-first |  | dom | http://127.0.0.1:5173/pages/post/detail?id=post_1 |
| PASS | 03-post-detail | 抱抱你 | quick-hug-0 | BUTTON->quick-hug-0 | GET /api/v1/reply-presets | url+dom+network | http://127.0.0.1:5173/pages/post/detail?id=post_1&sheet=reply |
| PASS | 03-post-detail | 写下你的回应 | reply-entry | BUTTON->reply-entry | GET /api/v1/reply-presets | url+dom+network | http://127.0.0.1:5173/pages/post/detail?id=post_1&sheet=reply |
| PASS | 03-post-detail | 收藏 | btn-favorite | BUTTON->btn-favorite | POST /api/v1/posts/:id/favorite | dom+network+store | http://127.0.0.1:5173/pages/post/detail?id=post_1 |
| PASS | 04-reply-sheet | 把你的温柔写在这里 | input-reply-content | TEXTAREA->input-reply-content |  | dom | http://127.0.0.1:5173/pages/post/detail?id=post_1&sheet=reply |
| PASS | 04-reply-sheet | 抱抱你 | reply-preset-0 | BUTTON->reply-preset-0 |  | dom | http://127.0.0.1:5173/pages/post/detail?id=post_1&sheet=reply |
| PASS | 04-reply-sheet | 我懂你的感受 | reply-preset-1 | BUTTON->reply-preset-1 |  | dom | http://127.0.0.1:5173/pages/post/detail?id=post_1&sheet=reply |
| PASS | 04-reply-sheet | 会好起来的 | reply-preset-2 | BUTTON->reply-preset-2 |  | dom | http://127.0.0.1:5173/pages/post/detail?id=post_1&sheet=reply |
| PASS | 04-reply-sheet | 今晚早点休息 | reply-preset-3 | BUTTON->reply-preset-3 |  | dom | http://127.0.0.1:5173/pages/post/detail?id=post_1&sheet=reply |
| PASS | 04-reply-sheet | 你已经很棒了 | reply-preset-4 | BUTTON->reply-preset-4 |  | dom | http://127.0.0.1:5173/pages/post/detail?id=post_1&sheet=reply |
| PASS | 04-reply-sheet | 匿名回复 | toggle-reply-anonymous | INPUT->toggle-reply-anonymous |  | dom | http://127.0.0.1:5173/pages/post/detail?id=post_1&sheet=reply |
| PASS | 04-reply-sheet | 可见范围 | select-reply-visibility | SELECT->select-reply-visibility |  | dom | http://127.0.0.1:5173/pages/post/detail?id=post_1&sheet=reply |
| PASS | 04-reply-sheet | 取消 | btn-close-reply | BUTTON->btn-close-reply |  | url+dom | http://127.0.0.1:5173/pages/post/detail?id=post_1 |
| PASS | 04-reply-sheet | 发布回应 | btn-submit-reply | BUTTON->btn-submit-reply | POST /api/v1/posts/:id/replies | url+dom+network+store | http://127.0.0.1:5173/pages/post/detail?id=post_1 |
| PASS | 05-letter-today | 返回 | letter-back | BUTTON->letter-back |  | url+dom | http://127.0.0.1:5173/pages/square/index |
| PASS | 05-letter-today | 温柔 | btn-letter-warm | SPAN->btn-letter-warm | POST /api/v1/letters/:id/regenerate | dom+network+store | http://127.0.0.1:5173/pages/letter/index |
| PASS | 05-letter-today | 理性 | btn-letter-rational | SPAN->btn-letter-rational | POST /api/v1/letters/:id/regenerate | dom+network+store | http://127.0.0.1:5173/pages/letter/index |
| PASS | 05-letter-today | 轻松 | btn-letter-light | SPAN->btn-letter-light | POST /api/v1/letters/:id/regenerate | dom+network+store | http://127.0.0.1:5173/pages/letter/index |
| PASS | 05-letter-today | 文艺 | btn-letter-poetic | SPAN->btn-letter-poetic | POST /api/v1/letters/:id/regenerate | dom+network+store | http://127.0.0.1:5173/pages/letter/index |
| PASS | 05-letter-today | 换一种风格 | btn-letter-regenerate | SPAN->btn-letter-regenerate | POST /api/v1/letters/:id/regenerate | dom+network+store | http://127.0.0.1:5173/pages/letter/index |
| PASS | 05-letter-today | 保存到日记 | btn-letter-save | SPAN->btn-letter-save | POST /api/v1/letters/:id/save-to-diary | dom+network+store | http://127.0.0.1:5173/pages/letter/index |
| PASS | 05-letter-today | 分享图片 | btn-letter-poster | SPAN->btn-letter-poster | POST /api/v1/letters/:id/poster | dom+network | http://127.0.0.1:5173/pages/letter/index |
| PASS | 05-letter-today | 喝点热水 | letter-advice-water | SPAN->letter-advice-water |  | dom | http://127.0.0.1:5173/pages/letter/index |

