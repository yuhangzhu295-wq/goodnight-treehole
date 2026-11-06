# API / DB / ADMIN MAP

Total endpoints: 264

| Method | Path | Controller | Source line |
| --- | --- | --- | ---: |
| GET | `/api/health` | HealthController | 166 |
| GET | `/api/v1/posts` | PublicController | 186 |
| GET | `/api/v1/debug/fingerprint` | PublicController | 192 |
| GET | `/api/v1/config` | PublicController | 197 |
| GET | `/api/v1/tonight` | PublicController | 205 |
| GET | `/api/v1/journeys` | PublicController | 210 |
| GET | `/api/v1/archive/journeys` | PublicController | 219 |
| GET | `/api/v1/archive/journeys/:id` | PublicController | 224 |
| POST | `/api/v1/archive/journeys/:id/export` | PublicController | 229 |
| POST | `/api/v1/archive/journeys/:id/restore` | PublicController | 234 |
| DELETE | `/api/v1/archive/journeys/:id` | PublicController | 239 |
| POST | `/api/v1/journeys` | PublicController | 249 |
| POST | `/api/v1/testing/cleanup-browser-fixtures` | PublicController | 270 |
| GET | `/api/v1/journeys/:id` | PublicController | 286 |
| GET | `/api/v1/journeys/:id/fingerprint` | PublicController | 291 |
| PATCH | `/api/v1/journeys/:id/intent` | PublicController | 296 |
| PATCH | `/api/v1/journeys/:id` | PublicController | 302 |
| PATCH | `/api/v1/journeys/:id/situation` | PublicController | 316 |
| POST | `/api/v1/journeys/:id/snapshots` | PublicController | 342 |
| POST | `/api/v1/journeys/:id/situation/reanalyze` | PublicController | 368 |
| POST | `/api/v1/journeys/:id/safety/acknowledge` | PublicController | 373 |
| POST | `/api/v1/journeys/:id/updates` | PublicController | 378 |
| POST | `/api/v1/journeys/:id/action-plan` | PublicController | 386 |
| POST | `/api/v1/journeys/:id/actions` | PublicController | 391 |
| GET | `/api/v1/journeys/:id/actions` | PublicController | 399 |
| GET | `/api/v1/journeys/:id/timeline` | PublicController | 404 |
| PATCH | `/api/v1/journeys/:id/status` | PublicController | 409 |
| POST | `/api/v1/journeys/:id/graduate` | PublicController | 414 |
| POST | `/api/v1/journeys/:id/graduation-consent` | PublicController | 419 |
| POST | `/api/v1/actions/:id/checkin` | PublicController | 426 |
| POST | `/api/v1/actions/:id/checkins` | PublicController | 442 |
| GET | `/api/v1/peers` | PublicController | 458 |
| POST | `/api/v1/peer-experiences` | PublicController | 463 |
| POST | `/api/v1/journeys/:id/peer-matches` | PublicController | 480 |
| GET | `/api/v1/journeys/:id/peers` | PublicController | 485 |
| PATCH | `/api/v1/peer-matches/:id` | PublicController | 490 |
| POST | `/api/v1/peer-matches/:id/respond` | PublicController | 504 |
| POST | `/api/v1/peer-matches/:id/consent` | PublicController | 513 |
| GET | `/api/v1/peer-requests` | PublicController | 518 |
| PATCH | `/api/v1/peer-experiences/:id` | PublicController | 523 |
| GET | `/api/v1/peer-experiences/:id` | PublicController | 540 |
| POST | `/api/v1/actions/:id/adaptive-plan` | PublicController | 545 |
| POST | `/api/v1/actions/:id/adapt` | PublicController | 550 |
| POST | `/api/v1/decisions` | PublicController | 558 |
| GET | `/api/v1/decisions` | PublicController | 563 |
| PATCH | `/api/v1/decisions/:id` | PublicController | 568 |
| POST | `/api/v1/cooldowns` | PublicController | 584 |
| GET | `/api/v1/cooldown` | PublicController | 589 |
| POST | `/api/v1/handoffs` | PublicController | 594 |
| POST | `/api/v1/handoffs/:id/share` | PublicController | 599 |
| GET | `/api/v1/handoffs` | PublicController | 604 |
| POST | `/api/v1/trusted-contacts` | PublicController | 609 |
| GET | `/api/v1/trusted-contacts` | PublicController | 614 |
| POST | `/api/v1/future-messages` | PublicController | 619 |
| GET | `/api/v1/future-messages` | PublicController | 624 |
| POST | `/api/v1/support-plans` | PublicController | 629 |
| GET | `/api/v1/me/support-plan` | PublicController | 637 |
| PUT | `/api/v1/me/support-plan` | PublicController | 642 |
| GET | `/api/v1/me/stable-self` | PublicController | 650 |
| PUT | `/api/v1/me/stable-self` | PublicController | 655 |
| GET | `/api/v1/me/recovery` | PublicController | 663 |
| POST | `/api/v1/me/recovery` | PublicController | 668 |
| GET | `/api/v1/notifications` | PublicController | 676 |
| PATCH | `/api/v1/notifications/:id/read` | PublicController | 682 |
| GET | `/api/v1/peer-conversations` | PublicController | 687 |
| POST | `/api/v1/peer-conversations/:matchId/messages` | PublicController | 692 |
| POST | `/api/v1/peer-conversations/:matchId/assist` | PublicController | 701 |
| POST | `/api/v1/peer-conversations/:matchId/close` | PublicController | 710 |
| POST | `/api/v1/peer-conversations/:matchId/report` | PublicController | 715 |
| POST | `/api/v1/peer-conversations/:matchId/block` | PublicController | 724 |
| POST | `/api/v1/peer-conversations/:matchId/feedback` | PublicController | 729 |
| GET | `/api/v1/memory` | PublicController | 738 |
| GET | `/api/v1/me/memories` | PublicController | 743 |
| POST | `/api/v1/memory` | PublicController | 759 |
| PATCH | `/api/v1/me/memories/:id` | PublicController | 775 |
| DELETE | `/api/v1/memory/:id` | PublicController | 784 |
| DELETE | `/api/v1/me/memories/:id` | PublicController | 789 |
| GET | `/api/v1/posts/:id` | PublicController | 794 |
| POST | `/api/v1/posts/:id/hug` | PublicController | 799 |
| DELETE | `/api/v1/posts/:id/hug` | PublicController | 808 |
| POST | `/api/v1/posts/:id/hugs` | PublicController | 817 |
| POST | `/api/v1/posts/:id/favorite` | PublicController | 822 |
| DELETE | `/api/v1/posts/:id/favorite` | PublicController | 830 |
| POST | `/api/v1/posts/:id/report` | PublicController | 838 |
| POST | `/api/v1/posts/:id/hide` | PublicController | 847 |
| DELETE | `/api/v1/posts/:id` | PublicController | 853 |
| POST | `/api/v1/posts` | PublicController | 862 |
| POST | `/api/v1/moods` | PublicController | 887 |
| POST | `/api/v1/moods/:id/queue-ai-replies` | PublicController | 911 |
| GET | `/api/v1/posts/:id/replies` | PublicController | 949 |
| GET | `/api/v1/reply-presets` | PublicController | 954 |
| POST | `/api/v1/posts/:id/replies` | PublicController | 973 |
| POST | `/api/v1/replies/:id/like` | PublicController | 980 |
| POST | `/api/v1/ai/generate` | PublicController | 985 |
| POST | `/api/v1/ai/tasks` | PublicController | 994 |
| GET | `/api/v1/ai/tasks/latest` | PublicController | 1003 |
| GET | `/api/v1/ai/tasks/:id` | PublicController | 1020 |
| GET | `/api/v1/letters/today` | PublicController | 1030 |
| GET | `/api/v1/letters` | PublicController | 1055 |
| GET | `/api/v1/letters/:id` | PublicController | 1065 |
| PATCH | `/api/v1/letters/:id/read` | PublicController | 1071 |
| POST | `/api/v1/letters/:id/like` | PublicController | 1080 |
| POST | `/api/v1/letters/:id/regenerate` | PublicController | 1089 |
| POST | `/api/v1/letters/generate` | PublicController | 1134 |
| POST | `/api/v1/letters/:id/poster` | PublicController | 1148 |
| POST | `/api/v1/share-image` | PublicController | 1156 |
| POST | `/api/v1/letters/:id/save-to-diary` | PublicController | 1168 |
| POST | `/api/v1/letters/:id/favorite` | PublicController | 1186 |
| DELETE | `/api/v1/letters/:id/favorite` | PublicController | 1196 |
| GET | `/api/v1/tools` | PublicController | 1206 |
| POST | `/api/v1/tools/emotion-decompose` | PublicController | 1222 |
| POST | `/api/v1/ai/tools/breakdown` | PublicController | 1234 |
| POST | `/api/v1/tools/decompose` | PublicController | 1247 |
| POST | `/api/v1/tools/run` | PublicController | 1252 |
| POST | `/api/v1/tools/rewrite` | PublicController | 1277 |
| POST | `/api/v1/tools/rant` | PublicController | 1282 |
| POST | `/api/v1/tools/heal` | PublicController | 1287 |
| POST | `/api/v1/tools/sleep` | PublicController | 1292 |
| POST | `/api/v1/tools/work` | PublicController | 1297 |
| POST | `/api/v1/tools/future` | PublicController | 1302 |
| POST | `/api/v1/tools/emotion-decompose/:taskId/save` | PublicController | 1307 |
| GET | `/api/v1/me/profile` | PublicController | 1328 |
| GET | `/api/v1/me/stats` | PublicController | 1333 |
| GET | `/api/v1/me/growth-card` | PublicController | 1349 |
| DELETE | `/api/v1/me/data` | PublicController | 1354 |
| POST | `/api/v1/diaries` | PublicController | 1364 |
| POST | `/api/v1/diaries/export` | PublicController | 1393 |
| GET | `/api/v1/exports/:assetId/download` | PublicController | 1398 |
| GET | `/api/v1/diaries` | PublicController | 1457 |
| GET | `/api/v1/diaries/months` | PublicController | 1468 |
| GET | `/api/v1/me/diaries` | PublicController | 1480 |
| GET | `/api/v1/me/diaries/months` | PublicController | 1489 |
| POST | `/api/v1/me/diaries` | PublicController | 1494 |
| GET | `/api/v1/diaries/:id` | PublicController | 1509 |
| DELETE | `/api/v1/diaries/:id` | PublicController | 1516 |
| GET | `/api/v1/favorites` | PublicController | 1522 |
| GET | `/api/v1/me/favorites` | PublicController | 1552 |
| GET | `/api/v1/me/letters` | PublicController | 1557 |
| DELETE | `/api/v1/favorites/:id` | PublicController | 1562 |
| GET | `/api/v1/reports/monthly` | PublicController | 1569 |
| GET | `/api/v1/reports/monthly/months` | PublicController | 1574 |
| GET | `/api/v1/report/month` | PublicController | 1579 |
| GET | `/api/v1/me/month-report` | PublicController | 1584 |
| GET | `/api/v1/reports/monthly/:month/advice` | PublicController | 1589 |
| POST | `/api/v1/reports/monthly/:month/poster` | PublicController | 1594 |
| POST | `/api/v1/report/share-image` | PublicController | 1599 |
| GET | `/api/v1/settings/privacy` | PublicController | 1604 |
| GET | `/api/v1/me/privacy` | PublicController | 1610 |
| GET | `/api/v1/privacy-settings` | PublicController | 1615 |
| PUT | `/api/v1/settings/privacy` | PublicController | 1620 |
| PATCH | `/api/v1/settings/privacy` | PublicController | 1654 |
| PATCH | `/api/v1/me/privacy` | PublicController | 1659 |
| PATCH | `/api/v1/privacy-settings` | PublicController | 1664 |
| GET | `/api/v1/feedback/categories` | PublicController | 1669 |
| GET | `/api/v1/feedback/faqs` | PublicController | 1676 |
| POST | `/api/v1/feedback` | PublicController | 1689 |
| GET | `/api/v1/feedback` | PublicController | 1704 |
| POST | `/api/v1/media/upload` | PublicController | 1713 |
| DELETE | `/api/v1/media/:id` | PublicController | 1722 |
| POST | `/api/v1/upload` | PublicController | 1729 |
| POST | `/api/v1/uploads` | PublicController | 1734 |
| POST | `/api/v1/export/diaries` | PublicController | 1739 |
| POST | `/api/v1/share/image` | PublicController | 1744 |
| POST | `/api/v1/assets/complete` | PublicController | 1749 |
| POST | `/api/admin/v1/auth/login` | AdminController | 1856 |
| POST | `/api/admin/v1/login` | AdminController | 1863 |
| POST | `/api/admin/v1/auth/logout` | AdminController | 1868 |
| GET | `/api/admin/v1/auth/me` | AdminController | 1873 |
| GET | `/api/admin/v1/me` | AdminController | 1878 |
| GET | `/api/admin/v1/dashboard/overview` | AdminController | 1884 |
| GET | `/api/admin/v1/dashboard` | AdminController | 1889 |
| GET | `/api/admin/v1/dashboard/summary` | AdminController | 1894 |
| GET | `/api/admin/v1/dashboard/activity` | AdminController | 1907 |
| GET | `/api/admin/v1/dashboard/emotion-distribution` | AdminController | 1912 |
| GET | `/api/admin/v1/journeys` | AdminController | 1917 |
| GET | `/api/admin/v1/actions` | AdminController | 1935 |
| GET | `/api/admin/v1/checkins` | AdminController | 1950 |
| GET | `/api/admin/v1/peer-experiences` | AdminController | 1965 |
| PATCH | `/api/admin/v1/peer-experiences/:id/review` | AdminController | 1977 |
| GET | `/api/admin/v1/peer-matches` | AdminController | 1993 |
| GET | `/api/admin/v1/follow-ups` | AdminController | 2005 |
| GET | `/api/admin/v1/notifications` | AdminController | 2017 |
| GET | `/api/admin/v1/peer-conversations` | AdminController | 2029 |
| GET | `/api/admin/v1/safety/events` | AdminController | 2046 |
| GET | `/api/admin/v1/support/plans` | AdminController | 2056 |
| GET | `/api/admin/v1/memory` | AdminController | 2066 |
| GET | `/api/admin/v1/dashboard/ai-summary` | AdminController | 2080 |
| GET | `/api/admin/v1/users` | AdminController | 2085 |
| GET | `/api/admin/v1/users/:id` | AdminController | 2102 |
| PATCH | `/api/admin/v1/users/:id/status` | AdminController | 2106 |
| POST | `/api/admin/v1/users/:id/note` | AdminController | 2122 |
| GET | `/api/admin/v1/users/export` | AdminController | 2138 |
| PATCH | `/api/admin/v1/users/:id/tags` | AdminController | 2148 |
| POST | `/api/admin/v1/users/:id/tags` | AdminController | 2153 |
| DELETE | `/api/admin/v1/users/:id/data` | AdminController | 2158 |
| GET | `/api/admin/v1/posts` | AdminController | 2167 |
| GET | `/api/admin/v1/posts/:id` | AdminController | 2191 |
| PATCH | `/api/admin/v1/posts/:id/moderation` | AdminController | 2195 |
| PATCH | `/api/admin/v1/posts/:id/review` | AdminController | 2206 |
| PATCH | `/api/admin/v1/posts/:id/approve` | AdminController | 2224 |
| PATCH | `/api/admin/v1/posts/:id/reject` | AdminController | 2229 |
| PATCH | `/api/admin/v1/posts/:id/block` | AdminController | 2234 |
| PATCH | `/api/admin/v1/posts/:id/visibility` | AdminController | 2238 |
| PATCH | `/api/admin/v1/posts/:id/risk` | AdminController | 2257 |
| POST | `/api/admin/v1/posts/:id/regenerate-replies` | AdminController | 2262 |
| DELETE | `/api/admin/v1/posts/:id` | AdminController | 2296 |
| GET | `/api/admin/v1/replies` | AdminController | 2304 |
| GET | `/api/admin/v1/replies/:id` | AdminController | 2325 |
| PATCH | `/api/admin/v1/replies/:id/moderation` | AdminController | 2329 |
| PATCH | `/api/admin/v1/replies/:id/review` | AdminController | 2340 |
| PATCH | `/api/admin/v1/replies/:id/content` | AdminController | 2353 |
| PATCH | `/api/admin/v1/replies/:id/approve` | AdminController | 2358 |
| PATCH | `/api/admin/v1/replies/:id/block` | AdminController | 2367 |
| PATCH | `/api/admin/v1/replies/:id/edit` | AdminController | 2372 |
| GET | `/api/admin/v1/ai/providers` | AdminController | 2377 |
| POST | `/api/admin/v1/ai/providers` | AdminController | 2389 |
| PUT | `/api/admin/v1/ai/providers/:id` | AdminController | 2417 |
| PATCH | `/api/admin/v1/ai/providers/:id` | AdminController | 2435 |
| POST | `/api/admin/v1/ai/providers/:id/test` | AdminController | 2443 |
| GET | `/api/admin/v1/ai/ollama/status` | AdminController | 2457 |
| POST | `/api/admin/v1/ai/ollama/sync-models` | AdminController | 2462 |
| DELETE | `/api/admin/v1/ai/providers/:id` | AdminController | 2468 |
| GET | `/api/admin/v1/ai/routes` | AdminController | 2480 |
| PUT | `/api/admin/v1/ai/routes/:style` | AdminController | 2484 |
| PATCH | `/api/admin/v1/ai/routes/:style` | AdminController | 2514 |
| POST | `/api/admin/v1/ai/routes/:style/test` | AdminController | 2523 |
| GET | `/api/admin/v1/ai/jobs` | AdminController | 2547 |
| GET | `/api/admin/v1/ai/jobs/:id` | AdminController | 2551 |
| POST | `/api/admin/v1/ai/jobs/:id/retry` | AdminController | 2555 |
| POST | `/api/admin/v1/ai/jobs/:id/fallback` | AdminController | 2574 |
| GET | `/api/admin/v1/feedback/tickets` | AdminController | 2579 |
| GET | `/api/admin/v1/feedback/summary` | AdminController | 2603 |
| GET | `/api/admin/v1/feedback` | AdminController | 2644 |
| GET | `/api/admin/v1/feedback/tickets/:id` | AdminController | 2653 |
| GET | `/api/admin/v1/feedback/:id` | AdminController | 2658 |
| POST | `/api/admin/v1/feedback/tickets/:id/reply` | AdminController | 2663 |
| PATCH | `/api/admin/v1/feedback/:id/reply` | AdminController | 2670 |
| POST | `/api/admin/v1/feedback/:id/reply` | AdminController | 2679 |
| PATCH | `/api/admin/v1/feedback/tickets/:id/status` | AdminController | 2688 |
| PATCH | `/api/admin/v1/feedback/:id/status` | AdminController | 2699 |
| PATCH | `/api/admin/v1/feedback/:id/resolve` | AdminController | 2708 |
| GET | `/api/admin/v1/faqs` | AdminController | 2713 |
| POST | `/api/admin/v1/faqs` | AdminController | 2717 |
| PUT | `/api/admin/v1/faqs/:id` | AdminController | 2737 |
| PATCH | `/api/admin/v1/faqs/:id` | AdminController | 2759 |
| DELETE | `/api/admin/v1/faqs/:id` | AdminController | 2767 |
| GET | `/api/admin/v1/reply-presets` | AdminController | 2778 |
| POST | `/api/admin/v1/reply-presets` | AdminController | 2782 |
| PUT | `/api/admin/v1/reply-presets/:id` | AdminController | 2801 |
| PATCH | `/api/admin/v1/reply-presets/:id` | AdminController | 2821 |
| DELETE | `/api/admin/v1/reply-presets/:id` | AdminController | 2829 |
| GET | `/api/admin/v1/feedback-categories` | AdminController | 2840 |
| POST | `/api/admin/v1/feedback-categories` | AdminController | 2848 |
| PUT | `/api/admin/v1/feedback-categories/:id` | AdminController | 2860 |
| PATCH | `/api/admin/v1/feedback-categories/:id` | AdminController | 2880 |
| DELETE | `/api/admin/v1/feedback-categories/:id` | AdminController | 2888 |
| GET | `/api/admin/v1/system/settings` | AdminController | 2912 |
| GET | `/api/admin/v1/settings` | AdminController | 2924 |
| GET | `/api/admin/v1/config` | AdminController | 2929 |
| PUT | `/api/admin/v1/system/settings` | AdminController | 2934 |
| PATCH | `/api/admin/v1/settings` | AdminController | 2965 |
| PATCH | `/api/admin/v1/config` | AdminController | 2970 |
| POST | `/api/admin/v1/config/reset` | AdminController | 2976 |
| GET | `/api/admin/v1/audit-logs` | AdminController | 2981 |

## DB models

| Model |
| --- |
| User |
| AdminUser |
| AdminRole |
| PrivacySetting |
| SystemSetting |
| Mood |
| Post |
| Reply |
| Letter |
| Diary |
| LifeJourney |
| SituationSnapshot |
| JourneyUpdate |
| ActionCommitment |
| OutcomeCheckin |
| PeerExperience |
| PeerMatch |
| PeerReputation |
| DecisionRecord |
| CooldownItem |
| RealityHandoff |
| TrustedContact |
| MessageToFutureSelf |
| PersonalSupportPlan |
| StableSelfProfile |
| MemoryItem |
| RecoverySnapshot |
| SafetyEvent |
| AgentDecisionLog |
| FollowUpJob |
| UserNotification |
| PeerConversation |
| PeerMessage |
| Favorite |
| MonthlyReport |
| ReportAdvice |
| MediaAsset |
| MoodAttachment |
| DiaryAttachment |
| RuntimeState |
| FeedbackTicket |
| FeedbackCategory |
| FaqItem |
| ReplyPreset |
| HugAction |
| HiddenPost |
| AIProvider |
| AIStyleRoute |
| AIJob |
| ModerationLog |
| AuditLog |
