# Front Rest Current Diagnosis

Generated: 2026-08-07T14:23:18.933Z

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
  "generatedAt": "2026-08-07T14:22:01.519Z",
  "checks": [
    {
      "name": "api health",
      "ok": true,
      "evidence": {
        "gitCommitSha": "unknown",
        "buildTime": "2026-08-07T14:22:02.834Z",
        "processStartTime": "2026-08-07T14:22:02.834Z",
        "runtimeInstanceId": "api-7760"
      }
    },
    {
      "name": "front 5173 reachable",
      "ok": true,
      "evidence": "http://127.0.0.1:5173/pages/tool/index"
    },
    {
      "name": "front rest build marker",
      "ok": true,
      "evidence": {
        "scope": "front-first5",
        "frontRest": "front-rest",
        "builtAt": "2026-08-07T14:22:04.649Z",
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

# Front Rest Overlay Diagnosis

Generated: 2026-08-07T14:22:06.646Z
Findings: 0

| Result | File | Line | Type | Evidence |
| --- | --- | --- | --- | --- |
| PASS | - | - | no design image shell, proxy layer, or visible test term found | - |


## Routes

# Front Rest Route Diagnosis

Generated: 2026-08-07T14:22:06.842Z

| Result | Route | Evidence |
| --- | --- | --- |
| PASS | /pages/tool/index | registered in apps/mp/src/router.ts |
| PASS | /pages/tool/decompose | registered in apps/mp/src/router.ts |
| PASS | /pages/tool/run | registered in apps/mp/src/router.ts |
| PASS | /pages/me/index | registered in apps/mp/src/router.ts |
| PASS | /pages/diary/index | registered in apps/mp/src/router.ts |
| PASS | /pages/diary/list | registered in apps/mp/src/router.ts |
| PASS | /pages/report/month | registered in apps/mp/src/router.ts |
| PASS | /pages/letter/today | registered in apps/mp/src/router.ts |
| PASS | /pages/letter/index | registered in apps/mp/src/router.ts |
| PASS | /pages/letter/list | registered in apps/mp/src/router.ts |
| PASS | /pages/letter/detail | registered in apps/mp/src/router.ts |
| PASS | /pages/favorite/index | registered in apps/mp/src/router.ts |
| PASS | /pages/favorite/list | registered in apps/mp/src/router.ts |
| PASS | /pages/settings/privacy | registered in apps/mp/src/router.ts |
| PASS | /pages/settings/data-policy | registered in apps/mp/src/router.ts |
| PASS | /pages/help/feedback | registered in apps/mp/src/router.ts |
| PASS | /pages/feedback/index | registered in apps/mp/src/router.ts |
| PASS | /pages/help/faqs | registered in apps/mp/src/router.ts |
| PASS | tabbar keeps first5-compatible routes | bottom tabbar must keep existing first5 entrypoints |


## API

# Front Rest API Diagnosis

Generated: 2026-08-07T14:22:07.042Z

| Result | API | Evidence |
| --- | --- | --- |
| PASS | GET /api/v1/tools | controller route exists |
| PASS | POST /api/v1/tools/run | controller route exists |
| PASS | POST /api/v1/tools/emotion-decompose | controller route exists |
| PASS | POST /api/v1/diaries | controller route exists |
| PASS | POST /api/v1/diaries/export | controller route exists |
| PASS | GET /api/v1/diaries | controller route exists |
| PASS | GET /api/v1/reports/monthly | controller route exists |
| PASS | GET /api/v1/reports/monthly/:month/advice | controller route exists |
| PASS | POST /api/v1/reports/monthly/:month/poster | controller route exists |
| PASS | GET /api/v1/letters?status= | controller route exists |
| PASS | PATCH /api/v1/letters/:id/read | controller route exists |
| PASS | POST /api/v1/letters/:id/like | controller route exists |
| PASS | DELETE /api/v1/letters/:id/favorite | controller route exists |
| PASS | GET /api/v1/favorites?type= | controller route exists |
| PASS | PUT /api/v1/settings/privacy | controller route exists |
| PASS | GET /api/v1/feedback/faqs | controller route exists |
| PASS | POST /api/v1/feedback | controller route exists |


## Clickability

# Front Rest Clickability Diagnosis

Generated: 2026-08-07T14:23:18.885Z
Total: 30
Passed: 30
Failed: 0

| Result | Page | Text | Selector | Hit | API | Signal | URL/Error |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PASS | 06-情绪工具 | 去试试 | tool-letter | BUTTON->tool-letter |  | url+dom | http://127.0.0.1:5173/pages/letter/today |
| PASS | 06-情绪工具 | 情绪拆解 | tool-decompose | SMALL->tool-decompose |  | url+dom | http://127.0.0.1:5173/pages/tool/decompose |
| PASS | 06-情绪工具 | 情绪月报 | tool-report | SMALL->tool-report |  | url+dom | http://127.0.0.1:5173/pages/report/month |
| PASS | 06-情绪工具 | 负面改写 | tool-rewrite | SMALL->tool-rewrite |  | url+dom | http://127.0.0.1:5173/pages/tool/run?type=negative_rewrite |
| PASS | 06-情绪工具 | 发疯文案 | tool-rant | SMALL->tool-rant |  | url+dom | http://127.0.0.1:5173/pages/tool/run?type=rant |
| PASS | 06-情绪工具 | 治愈短句 | tool-healing-quote | SMALL->tool-healing-quote |  | url+dom | http://127.0.0.1:5173/pages/tool/run?type=healing_phrase |
| PASS | 06-情绪工具 | 失眠安慰 | tool-sleep-comfort | SMALL->tool-sleep-comfort |  | url+dom | http://127.0.0.1:5173/pages/tool/run?type=sleep_comfort |
| PASS | 06-情绪工具 | 工作破防 | tool-work-support | SMALL->tool-work-support |  | url+dom | http://127.0.0.1:5173/pages/tool/run?type=work_support |
| PASS | 06-情绪工具 | 写给未来的自己 | tool-future-letter | STRONG->tool-future-letter |  | url+dom | http://127.0.0.1:5173/pages/tool/run?type=future_letter |
| PASS | 07-情绪拆解 | 开始拆解 | btn-decompose-run | BUTTON->btn-decompose-run | POST /api/v1/ai/tasks | dom+network | http://127.0.0.1:5173/pages/tool/decompose |
| PASS | 07-情绪拆解 | 保存到日记 | btn-decompose-save | BUTTON->btn-decompose-save | POST /api/v1/diaries | dom+network | http://127.0.0.1:5173/pages/tool/decompose |
| PASS | 08-我的 | 我的日记 | entry-diary | STRONG->entry-diary |  | url+dom | http://127.0.0.1:5173/pages/diary/index |
| PASS | 08-我的 | 我的回信 | entry-letter-list | STRONG->entry-letter-list |  | url+dom | http://127.0.0.1:5173/pages/letter/list |
| PASS | 08-我的 | 我的收藏 | entry-favorite | STRONG->entry-favorite |  | url+dom | http://127.0.0.1:5173/pages/favorite/index |
| PASS | 08-我的 | 帮助与反馈 | entry-feedback | STRONG->entry-feedback | GET /api/v1/feedback/faqs | url+dom+network | http://127.0.0.1:5173/pages/help/feedback |
| PASS | 09-我的日记 | 筛选 | btn-diary-filter-confirm | BUTTON->btn-diary-filter-confirm | GET /api/v1/diaries?month=:month&emotion=焦虑&hasLetter=true | dom+network | http://127.0.0.1:5173/pages/diary/index |
| PASS | 09-我的日记 | 写新的日记 | btn-new-diary | BUTTON->btn-new-diary |  | url+dom | http://127.0.0.1:5173/pages/mood/create |
| PASS | 10-情绪月报 | 生成分享图 | btn-report-poster | BUTTON->btn-report-poster | POST /api/v1/reports/monthly/:month/poster | dom+network | http://127.0.0.1:5173/pages/report/month |
| PASS | 10-情绪月报 | 查看建议 | btn-report-advice | BUTTON->btn-report-advice | GET /api/v1/reports/monthly/:month/advice | dom+network | http://127.0.0.1:5173/pages/report/month |
| PASS | 11-我的回信 | 未读 | filter-letter-unread | BUTTON->filter-letter-unread | GET /api/v1/letters?status=unread | dom+network | http://127.0.0.1:5173/pages/letter/list |
| PASS | 11-我的回信 | 查看全文 | btn-letter-read-full-first | BUTTON->btn-letter-read-full-first | PATCH /api/v1/letters/:id/read | url+dom+network | http://127.0.0.1:5173/pages/letter/detail?id=letter_today |
| PASS | 11-我的回信 | 喜欢 | btn-letter-like-first | BUTTON->btn-letter-like-first | POST /api/v1/letters/:id/like | dom+network | http://127.0.0.1:5173/pages/letter/list |
| PASS | 12-我的收藏 | 树洞 | filter-fav-post | SPAN->filter-fav-post | GET /api/v1/favorites?type=post | dom+network | http://127.0.0.1:5173/pages/favorite/index |
| PASS | 12-我的收藏 | 取消收藏 | btn-favorite-remove | SPAN->btn-favorite-remove | DELETE /api/v1/favorites/:id | dom+network | http://127.0.0.1:5173/pages/favorite/index |
| PASS | 13-隐私设置 | 默认私密 | toggle-privacy-private | STRONG->toggle-privacy-private | PUT /api/v1/settings/privacy | dom+network | http://127.0.0.1:5173/pages/settings/privacy |
| PASS | 13-隐私设置 | 导出我的日记 | btn-export-diaries | STRONG->btn-export-diaries | POST /api/v1/diaries/export | dom+network | http://127.0.0.1:5173/pages/settings/privacy |
| PASS | 14-帮助与反馈 | 查看全部 FAQ | btn-faq-all | BUTTON->btn-faq-all |  | url+dom | http://127.0.0.1:5173/pages/help/faqs |
| PASS | 14-帮助与反馈 | 上传截图 | btn-feedback-upload | SPAN->btn-feedback-upload | POST /api/v1/media/upload | dom+network | http://127.0.0.1:5173/pages/help/feedback |
| PASS | 14-帮助与反馈 | 提交反馈 | btn-feedback-submit | BUTTON->btn-feedback-submit | POST /api/v1/feedback | dom+network | http://127.0.0.1:5173/pages/help/feedback |
| PASS | 08-我的 | 清空记录 | btn-clear-confirm | BUTTON->btn-clear-confirm | DELETE /api/v1/me/data | dom+network | http://127.0.0.1:5173/pages/me/index |

