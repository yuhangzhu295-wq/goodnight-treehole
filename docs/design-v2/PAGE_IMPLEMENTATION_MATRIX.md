# UI V2 — Page implementation matrix

Generated from `V2 完整交付包/页面清单_39.json` (the authoritative manifest) and cross-checked against
`apps/mp/src/views/` and `apps/mp/src/router.ts`. Nothing here is hand-written from memory.

## Source verification

| Check | Value |
| --- | --- |
| Manifest entries | 39 |
| Real views in apps/mp/src/views | 39 |
| Routes declared in router.ts | 55 (16 aliases over 39 views) |
| Manifest views with a matching .vue | 39 / 39 |
| Design images present | 39 / 39 |
| Per-page prompts present | 39 / 39 |
| Views with no manifest entry | none |
| Manifest views with no .vue | none |

Every manifest entry carries `referenceType: static_prototype_not_runtime`: the images are layout
references, not runnable UI, and the README states their sample users and numbers are for layout only
and must not enter real business data.

## Matrix

| # | View | Route | Round | Design | Prompt | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `TonightHome.vue` | `/pages/tonight/index` | 1 | 01_TonightHome.png | yes | PENDING |
| 2 | `PeerNetwork.vue` | `/pages/peers/index` | 1 | 02_PeerNetwork.png | yes | PENDING |
| 3 | `ActionCenter.vue` | `/pages/action/index` | 1 | 03_ActionCenter.png | yes | PENDING |
| 4 | `Me.vue` | `/pages/me/index` | 1 | 04_Me.png | yes | PENDING |
| 5 | `JourneyDetail.vue` | `/pages/journey/detail` | 2 | 05_JourneyDetail.png | yes | PENDING |
| 6 | `PeerExperienceDetail.vue` | `/pages/peer/detail` | 2 | 06_PeerExperienceDetail.png | yes | PENDING |
| 7 | `PeerRequests.vue` | `/pages/peer/requests` | 2 | 07_PeerRequests.png | yes | PENDING |
| 8 | `PeerMatchWaiting.vue` | `/pages/peer/wait` | 2 | 08_PeerMatchWaiting.png | yes | PENDING |
| 9 | `PeerConsent.vue` | `/pages/peer/consent` | 2 | 09_PeerConsent.png | yes | PENDING |
| 10 | `PeerConversation.vue` | `/pages/peer/conversation` | 2 | 10_PeerConversation.png | yes | PENDING |
| 11 | `PeerGraduation.vue` | `/pages/peer/graduate` | 2 | 11_PeerGraduation.png | yes | PENDING |
| 12 | `RealityHandoff.vue` | `/pages/reality-handoff/index` | 2 | 12_RealityHandoff.png | yes | PENDING |
| 13 | `SafetySupport.vue` | `/pages/safety/index` | 2 | 13_SafetySupport.png | yes | PENDING |
| 14 | `NotificationCenter.vue` | `/pages/notifications/index` | 2 | 14_NotificationCenter.png | yes | PENDING |
| 15 | `FutureSelf.vue` | `/pages/future-self/index` | 3 | 15_FutureSelf.png | yes | PENDING |
| 16 | `Recovery.vue` | `/pages/recovery/index` | 3 | 16_Recovery.png | yes | PENDING |
| 17 | `SupportPlan.vue` | `/pages/support-plan/index` | 3 | 17_SupportPlan.png | yes | PENDING |
| 18 | `StableSelf.vue` | `/pages/stable-self/index` | 3 | 18_StableSelf.png | yes | PENDING |
| 19 | `MemoryCenter.vue` | `/pages/memory/index` | 3 | 19_MemoryCenter.png | yes | PENDING |
| 20 | `DecisionVault.vue` | `/pages/decision/index` | 3 | 20_DecisionVault.png | yes | PENDING |
| 21 | `Archive.vue` | `/pages/archive/index` | 3 | 21_Archive.png | yes | PENDING |
| 22 | `Square.vue` | `/pages/square/index` | 4 | 22_Square.png | yes | PENDING |
| 23 | `MoodCreate.vue` | `/pages/mood/create` | 4 | 23_MoodCreate.png | yes | PENDING |
| 24 | `PostDetail.vue` | `/pages/post/detail` | 4 | 24_PostDetail.png | yes | PENDING |
| 25 | `LetterToday.vue` | `/pages/letter/index` | 4 | 25_LetterToday.png | yes | PENDING |
| 26 | `ToolIndex.vue` | `/pages/tool/index` | 4 | 26_ToolIndex.png | yes | PENDING |
| 27 | `ToolDecompose.vue` | `/pages/tool/decompose` | 4 | 27_ToolDecompose.png | yes | PENDING |
| 28 | `ToolRun.vue` | `/pages/tool/run` | 4 | 28_ToolRun.png | yes | PENDING |
| 29 | `MeProfile.vue` | `/pages/me/profile` | 3 | 29_MeProfile.png | yes | PENDING |
| 30 | `DiaryList.vue` | `/pages/diary/index` | 4 | 30_DiaryList.png | yes | PENDING |
| 31 | `DiaryDetail.vue` | `/pages/diary/detail` | 4 | 31_DiaryDetail.png | yes | PENDING |
| 32 | `ReportMonth.vue` | `/pages/report/month` | 3 | 32_ReportMonth.png | yes | PENDING |
| 33 | `LetterList.vue` | `/pages/letter/list` | 4 | 33_LetterList.png | yes | PENDING |
| 34 | `LetterDetail.vue` | `/pages/letter/detail` | 4 | 34_LetterDetail.png | yes | PENDING |
| 35 | `FavoriteList.vue` | `/pages/favorite/index` | 4 | 35_FavoriteList.png | yes | PENDING |
| 36 | `PrivacySettings.vue` | `/pages/settings/privacy` | 3 | 36_PrivacySettings.png | yes | PENDING |
| 37 | `DataPolicy.vue` | `/pages/settings/data-policy` | 3 | 37_DataPolicy.png | yes | PENDING |
| 38 | `FeedbackHelp.vue` | `/pages/help/feedback` | 4 | 38_FeedbackHelp.png | yes | PENDING |
| 39 | `HelpFaqs.vue` | `/pages/help/faqs` | 4 | 39_HelpFaqs.png | yes | PENDING |

## Status legend

- `PENDING` — not started.
- `IN_PROGRESS` — being implemented.
- `RENDERED` — built, installed on the emulator, screenshot captured.
- `VISUAL_PASS` — `visual-judge` returned PASS on the real Android screenshot.
- `CODE_REVIEWED` — `code-reviewer` returned APPROVE on the diff.
- `DONE` — all of the above plus business regression evidence.

## Progress

Only the global layout foundation has been changed so far: the status-bar overlap that affected every
page (see `UI_V2_ISSUES.md`, UI2-001). No page has been redesigned yet, so every row above is
`PENDING` and the round-1 gate has not been reached.
