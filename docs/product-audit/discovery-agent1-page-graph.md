# Agent-1 — MP page graph discovery

Scope: `apps/mp` only. Read-only run; no file under `apps/`, `packages/`, `prisma/` or
`tests/` was modified. Every claim below is a static fact from the working tree at
`codex/post-recovery-validation` / HEAD `158c298`, or is explicitly marked UNCONFIRMED.

Method: `apps/mp/src/router.ts` was parsed for route records and lazy component
imports; the whole `apps/mp/src` tree (`*.vue`, `*.ts`) was then scanned for every
`'/pages/...'` string literal, `router.push`/`router.replace`, `router.back()`,
`<RouterLink to=...>`, `window.location`, `window.history`, and `<a href>`. Route
targets were also cross-checked against the API-side `targetRoute` values that
`NotificationCenter` executes, because those are real in-app navigations that do not
appear in the front-end source.

Helper used (kept in the scratch tree, not in the repo): `work/agent1/route-refs.cjs`,
`work/agent1/check-links.cjs`.

## 1. Route inventory completeness check

`apps/mp/src/router.ts` declares **55** route records and **39** lazy component
imports; `artifacts/product-audit/mp-routes.json` declares `totalRoutes: 55` and
`totalUniqueViews: 39`.

| Check | Result |
| --- | --- |
| Route paths in `router.ts` | 55 (`router.ts:52-106`) |
| Route paths in `mp-routes.json` | 55 |
| Paths in `router.ts` missing from the JSON | **none** |
| Paths in the JSON not in `router.ts` | **none** |
| Lazy imports declared | 39 |
| Component consts declared but never mounted | **none** |
| Distinct components mounted | 39 |

**Verdict: the inventory is complete.** Every route and every view in
`apps/mp/src/router.ts` is present in `artifacts/product-audit/mp-routes.json`, and
the JSON contains nothing extra. The two files agree on route count (55), unique view
count (39), the 4 tab routes, and the alias groups.

### 1a. Routes referenced in source that are **not** routes (dead links)

The scanner found one navigation target that has no matching route record:

| Target | Referenced from | Effect |
| --- | --- | --- |
| `/pages/privacy/index` | `apps/mp/src/views/PeerNetwork.vue:63` (`看看隐私边界` button) | No route matches. vue-router logs a "No match found" warning and the view does not change. The intended target is almost certainly `/pages/settings/privacy`. |

All other `/pages/...` literals that are not full routes are deliberate
`startsWith` prefixes in `apps/mp/src/App.vue:43-66` (used only for active-tab
highlighting), not navigations.

## 2. Per-view page graph (39 views)

Legend for the last column:

* **REACHABLE_FROM_UI** — at least one in-app control or navigation leads here from a
  view the user can actually open.
* **DIRECT_ONLY** — the route exists and the view mounts, but no reachable in-app
  control leads to it; only typing the URL opens it.

`ENTRY` cites the control and the view it lives in. `EXIT` cites where the page's own
job ends. `router.back()` means the page only offers history back, so its successor is
whatever the user came from.

| # | View | Routes that mount it | ENTRY (control → view, file:line) | EXIT / next step | Reachability |
| ---: | --- | --- | --- | --- | --- |
| 1 | `ActionCenter.vue` | `/pages/action/index` | Bottom tab "行动" `App.vue:97-106` (`to="/pages/action/index"` at `App.vue:99`); `JourneyDetail.vue:145` `@action`; API `targetRoute` `/pages/action/index?section=follow-up` (`apps/api/src/follow-up-worker.service.ts:73`) opened by `NotificationCenter.vue:27` | `ActionCenter.vue:329` journey detail, `:330`/`:94` tonight, `:244` reality-handoff, `:248` future-self, `:336` notifications | REACHABLE_FROM_UI |
| 2 | `Archive.vue` | `/pages/archive/index` | `Me.vue:88` (`entry-journey-archive`); `JourneyDetail.vue:123` (after `archiveJourney()`) | `Archive.vue:99` diary detail, `:103` post detail, `:107` letter detail, `:135` journey detail | REACHABLE_FROM_UI |
| 3 | `DataPolicy.vue` | `/pages/settings/data-policy` | `PrivacySettings.vue:366` (`btn-data-policy-route`) | `DataPolicy.vue:10` `router.back()` | REACHABLE_FROM_UI |
| 4 | `DecisionVault.vue` | `/pages/decision/index` | `Me.vue:74` (`entry-decision`); API `targetRoute` `/pages/decision/index?id=...` (`follow-up-worker.service.ts:71`) via `NotificationCenter.vue:27` | `DecisionVault.vue:176` `router.back()`; no forward push | REACHABLE_FROM_UI |
| 5 | `DiaryDetail.vue` | `/pages/diary/detail` | `DiaryList.vue:49`; `Archive.vue:99`; `FavoriteList.vue:36` | `DiaryDetail.vue:21` `router.back()` | REACHABLE_FROM_UI |
| 6 | `DiaryList.vue` | `/pages/diary/index`, `/pages/diary/list`, `/pages/me/diaries` | `Me.vue:79` (`entry-diary` → `/pages/diary/index`); `MoodCreate.vue:127` (after private publish) | `DiaryList.vue:49` diary detail, `:53` letter detail, `:54` letter today, `:149` mood create | REACHABLE_FROM_UI |
| 7 | `FavoriteList.vue` | `/pages/favorite/index`, `/pages/favorite/list` | `Me.vue:81` (`entry-favorite` → `/pages/favorite/index`) | `FavoriteList.vue:34` post detail, `:35` letter detail, `:36` diary detail | REACHABLE_FROM_UI |
| 8 | `FeedbackHelp.vue` | `/pages/help/feedback`, `/pages/feedback/index` | `Me.vue:102` (`entry-feedback` → `/pages/help/feedback`) | `FeedbackHelp.vue:174` → `/pages/help/faqs`; `:146` `router.back()` | REACHABLE_FROM_UI |
| 9 | `FutureSelf.vue` | `/pages/future-self/index` | `Me.vue:67` (`entry-future-self`); `ActionCenter.vue:248` (shortcut `future`); API `targetRoute` `/pages/future-self/index` (`follow-up-worker.service.ts:68`) | `FutureSelf.vue:156` `router.back()` | REACHABLE_FROM_UI |
| 10 | `HelpFaqs.vue` | `/pages/help/faqs` | `FeedbackHelp.vue:174` (`btn-faq-all`) | `HelpFaqs.vue:31` `router.back()` | REACHABLE_FROM_UI |
| 11 | `JourneyDetail.vue` | `/pages/journey/detail` | `TonightHome.vue:55` (after `createJourney()`); `TonightHome.vue:76`; `Me.vue:169`; `ActionCenter.vue:329`; `SafetySupport.vue:41`; `Archive.vue:135`; `StabilizeScreen.vue:38`; self `JourneyDetail.vue:99` | `JourneyDetail.vue:98` safety, `:99` stabilize (self), `:101` intent `targetRoute`, `:123` archive, `:145` action | REACHABLE_FROM_UI |
| 12 | `LetterDetail.vue` | `/pages/letter/detail` | `LetterList.vue:36`; `DiaryList.vue:53`; `Archive.vue:107`; `FavoriteList.vue:35` | `LetterDetail.vue:42` (`btn-letter-detail-save`) → `/pages/letter/today`; `:30` back | REACHABLE_FROM_UI |
| 13 | `LetterList.vue` | `/pages/letter/list` | `Me.vue:80` (`entry-letter-list`) | `LetterList.vue:36` letter detail; `:109` mood create | REACHABLE_FROM_UI |
| 14 | `LetterToday.vue` | `/pages/letter/index`, `/pages/letter/today`, `/pages/reply/today` | `LetterDetail.vue:42`; `DiaryList.vue:54` (diary without a letter); `ToolIndex.vue:73` (page itself unreachable) | `LetterToday.vue:63-65` `safeBack()` → `/pages/square/index` when there is no history | REACHABLE_FROM_UI |
| 15 | `Me.vue` | `/pages/me/index` | Bottom tab "我的" `App.vue:107` | `Me.vue:39,46,53,60,67,74,79,80,81,82,88,95,102` (menu entries), `:169` journey detail, `:178` tonight, `:191` support-plan | REACHABLE_FROM_UI |
| 16 | `MemoryCenter.vue` | `/pages/memory/index` | `Me.vue:60` (`entry-memory`) | `MemoryCenter.vue:150` → `/pages/settings/privacy`; `:139` back | REACHABLE_FROM_UI |
| 17 | `MeProfile.vue` | `/pages/me/profile` | **none** — no `router.push`, `<RouterLink>`, `href` or `window.location` anywhere in `apps/mp/src` targets this path | `MeProfile.vue:19` `router.back()` | **DIRECT_ONLY / ORPHAN** |
| 18 | `MoodCreate.vue` | `/pages/mood/create`, `/pages/post/create` | `DiaryList.vue:149` (`btn-new-diary` → `/pages/mood/create`); `LetterList.vue:109`; `Square.vue:144` (`btn-empty-write-mood`) and `Square.vue:211` (`btn-write-mood`) → `/pages/post/create` | `MoodCreate.vue:126` post detail; `:127` diary index; `:45-48` `safeBack()` → square | REACHABLE_FROM_UI |
| 19 | `NotificationCenter.vue` | `/pages/notifications/index` | `TonightHome.vue:65` (`notification-bell`); `ActionCenter.vue:336` (`ActionFollowupStrip @open`) | `NotificationCenter.vue:27` `router.push(item.targetRoute)` — destination is API-supplied (tonight / decision / action / future-self / peers) | REACHABLE_FROM_UI |
| 20 | `PeerConsent.vue` | `/pages/peer/consent` | `PeerRequests.vue:16` (after `respond(..., 'connected')`) and `:17` (`openConsent`) | `PeerConsent.vue:9` → `/pages/peer/conversation`; `:17` → `/pages/peer/requests` | REACHABLE_FROM_UI |
| 21 | `PeerConversation.vue` | `/pages/peer/conversation` | `PeerConsent.vue:9`; `PeerMatchWaiting.vue:9` (when status becomes `connected`); API `targetRoute` `/pages/peer/conversation?matchId=...` (`apps/api/src/store.service.ts:4088`) | `PeerConversation.vue:14`/`:16` → `/pages/peer/graduate`; `:24` → `/pages/peers/index`; `:29` → graduate | REACHABLE_FROM_UI |
| 22 | `PeerExperienceDetail.vue` | `/pages/peer/detail` | `PeerNetwork.vue:39` (`openExperience`) and `:42` (`openPublished`) | `PeerExperienceDetail.vue:31` → `/pages/peer/wait`; `:40` back | REACHABLE_FROM_UI |
| 23 | `PeerGraduation.vue` | `/pages/peer/graduate` | `PeerConversation.vue:14`, `:16`, `:29` | `PeerGraduation.vue:23` → `/pages/peers/index` (`先不分享`) | REACHABLE_FROM_UI |
| 24 | `PeerMatchWaiting.vue` | `/pages/peer/wait` | `PeerNetwork.vue:37` (match `requested`/`connected`); `PeerExperienceDetail.vue:31` | `PeerMatchWaiting.vue:9` → conversation when connected; `:10` `back()` → peers | REACHABLE_FROM_UI |
| 25 | `PeerNetwork.vue` | `/pages/peers/index` | Bottom tab "同路" `App.vue:87-96` (`to="/pages/peers/index"` at `App.vue:89`); `PeerConversation.vue:24`; `PeerGraduation.vue:23`; `PeerMatchWaiting.vue:10`; `PeerRequests.vue:24` | `PeerNetwork.vue:37` wait, `:39`/`:42` detail, `:54` requests, `:63` **`/pages/privacy/index` (dead route)** | REACHABLE_FROM_UI |
| 26 | `PeerRequests.vue` | `/pages/peer/requests` | `PeerNetwork.vue:54` (tab "我的请求"); `PeerConsent.vue:17`; API `targetRoute` `/pages/peer/requests?matchId=...` (`store.service.ts:4048`) | `PeerRequests.vue:16`/`:17` → consent; `:24` → peers | REACHABLE_FROM_UI |
| 27 | `PostDetail.vue` | `/pages/post/detail` | `Square.vue:62` (`openPost`), `Square.vue:73` (`replyPost`); `MoodCreate.vue:126`; `Archive.vue:103` (public-post tab); `FavoriteList.vue:34`; API `next: '/pages/post/detail'` (`store.service.ts:4973`) | `PostDetail.vue:124` → square (`blockPost`); `:55-58` `safeBack()`; `:90`/`:97` self-replace | REACHABLE_FROM_UI |
| 28 | `PrivacySettings.vue` | `/pages/settings/privacy` | `Me.vue:95` (`entry-privacy`); `MemoryCenter.vue:150`; `Recovery.vue:129` | `PrivacySettings.vue:366` → data-policy; `:166` `router.back()` | REACHABLE_FROM_UI |
| 29 | `RealityHandoff.vue` | `/pages/reality-handoff/index` | `ActionCenter.vue:244` (shortcut `handoff`); `SafetySupport.vue:65` (`safety-handoff`); `StabilizeScreen.vue:38` | `RealityHandoff.vue:59` `router.back()` | REACHABLE_FROM_UI |
| 30 | `Recovery.vue` | `/pages/recovery/index` | `Me.vue:39` (`entry-recovery`) | `Recovery.vue:129` → `/pages/settings/privacy` (privacy gate) | REACHABLE_FROM_UI |
| 31 | `ReportMonth.vue` | `/pages/report/month`, `/pages/me/month-report` | `Me.vue:82` (`entry-report` → `/pages/me/month-report`); `ToolIndex.vue:19` (→ `/pages/report/month`, page itself unreachable) | `ReportMonth.vue:195` `router.back()` | REACHABLE_FROM_UI |
| 32 | `SafetySupport.vue` | `/pages/safety/index` | `TonightHome.vue:54` (risk detected on journey create); `JourneyDetail.vue:98`; `SupportPlan.vue:255`; API `targetRoute` `/pages/safety/index` (`store.service.ts:2818`, `:2845`) | `SafetySupport.vue:34` tonight, `:41` journey detail, `:65` reality-handoff, `:107` support-plan | REACHABLE_FROM_UI |
| 33 | `Square.vue` | `/pages/square/index` | `PostDetail.vue:124` (`blockPost` → replace); fallbacks `LetterToday.vue:65`, `MoodCreate.vue:47`, `PostDetail.vue:57` when there is no history to go back to | `Square.vue:62`/`:73` post detail; `:144`/`:211` post create | REACHABLE_FROM_UI (only via PostDetail "屏蔽" or a history fallback; **not** on the bottom tab bar) |
| 34 | `StableSelf.vue` | `/pages/stable-self/index` | `Me.vue:53` (`entry-stable-self`) | `StableSelf.vue:140` `router.back()` | REACHABLE_FROM_UI |
| 35 | `SupportPlan.vue` | `/pages/support-plan/index` | `Me.vue:46` (`entry-support-plan`) and `Me.vue:191` (`me-support-status`); `SafetySupport.vue:107` | `SupportPlan.vue:255` → `/pages/safety/index`; back | REACHABLE_FROM_UI |
| 36 | `TonightHome.vue` | `/pages/tonight/index` | Bottom tab "今晚" `App.vue:77-86` (`to="/pages/tonight/index"` at `App.vue:79`); `router.ts:52` `/ ` redirect; `Me.vue:178`; `ActionCenter.vue:94`/`:330`; `SafetySupport.vue:34` | `TonightHome.vue:54` safety, `:55` journey detail, `:65` notifications, `:76` journey detail | REACHABLE_FROM_UI |
| 37 | `ToolDecompose.vue` | `/pages/tool/decompose`, `/pages/tool/breakdown` | `ToolIndex.vue:12` (`card.route`, applied at `ToolIndex.vue:42`) — **`ToolIndex` itself is unreachable** | `ToolDecompose.vue:95` `router.back()` | **DIRECT_ONLY** |
| 38 | `ToolIndex.vue` | `/pages/tool/index` | **none** — no control anywhere in `apps/mp/src` navigates here | `ToolIndex.vue:38`/`:45` tool/run, `:42` `card.route`, `:73` letter today | **DIRECT_ONLY / ORPHAN** |
| 39 | `ToolRun.vue` | `/pages/tool/run`, `/pages/tool/rewrite`, `/pages/tool/rant`, `/pages/tool/heal`, `/pages/tool/sleep`, `/pages/tool/work`, `/pages/tool/future` | `ToolIndex.vue:13-18` (cards) and `:38`/`:45` — **`ToolIndex` itself is unreachable** | `ToolRun.vue:100` `router.back()` | **DIRECT_ONLY** |

## 3. ORPHAN / unreachable views

**Strict orphans — the route exists and mounts, but no in-app control in
`apps/mp/src` navigates to it (2 views):**

| View | Route | Evidence | Consequence |
| --- | --- | --- | --- |
| `ToolIndex.vue` | `/pages/tool/index` | `apps/mp/src/router.ts:79` mounts it; the only other mentions are `App.vue:23` (a `tabbarPaths` string, not a link) and `main.ts:15` (a build-name comment). No `router.push`, `RouterLink` or `href` targets it. | The whole 情绪工具 entry surface (8 tool tiles + "一键生成温柔回信") is unreachable by tapping through the running app. |
| `MeProfile.vue` | `/pages/me/profile` | `apps/mp/src/router.ts:90` mounts it. Grep across the entire repo (excluding `node_modules`, `dist`, native build output) finds no navigation to `/pages/me/profile`; the only other hit is the `GET me/profile` API route in `apps/api/src/controllers.ts:1328`. `Me.vue` shows the hero header but has no profile/avatar button (`Me.vue:150-155`). | The profile page is dead weight: reachable only by typing the URL. |

**Unreachable in practice — an in-app control exists, but that control lives on an
unreachable page (2 views):**

| View | Routes | Inbound control | Why it is still unreachable |
| --- | --- | --- | --- |
| `ToolDecompose.vue` | `/pages/tool/decompose`, `/pages/tool/breakdown` | `ToolIndex.vue:12` → `ToolIndex.vue:42` | The only entry point is `ToolIndex`, which is itself an orphan. |
| `ToolRun.vue` | `/pages/tool/run` + 6 aliases | `ToolIndex.vue:13-18`, `:38`, `:45` | Same reason: `ToolIndex` cannot be opened from the UI. |

Total views that cannot be opened by tapping through the running app: **4**
(`ToolIndex`, `ToolDecompose`, `ToolRun`, `MeProfile`). Two of those (`ToolIndex`,
`MeProfile`) have no inbound control at all; the other two are reachable only through
an orphan.

Two further reachability caveats, both confirmed but not orphans:

* `Square.vue` is in `App.vue:19`'s `tabbarPaths` set and carries `data-testid="tab-square"`
  on the *tonight* link (`App.vue:78`), but the bottom tab bar has no link to
  `/pages/square/index`. Its only inbound navigations are `PostDetail.vue:124`
  (`blockPost`) and the no-history fallbacks in `LetterToday`/`MoodCreate`/`PostDetail`.
  It is reachable, but only along the path
  Me → 日记与回信 (`Me.vue:88`) → Archive → 公开树洞 tab → PostDetail → 屏蔽 → Square.
* `ReportMonth.vue` is reachable only through the `/pages/me/month-report` alias
  (`Me.vue:82`); the canonical `/pages/report/month` path is only pushed from
  `ToolIndex.vue:19`, i.e. from an unreachable page.

## 4. Alias routes that look dead or redundant

Each row is an alias that is mounted but never pushed by any in-app control. "Also
referenced by" lists the only other places the path appears.

| Alias path | Mounts | Also referenced by | Verdict |
| --- | --- | --- | --- |
| `/pages/tool/breakdown` | `ToolDecompose.vue` | `router.ts:81` only | **DEAD** — no push anywhere. |
| `/pages/tool/rewrite` | `ToolRun.vue` | `router.ts:83` only | **DEAD** — `ToolIndex` always pushes `/pages/tool/run?type=...`. |
| `/pages/tool/rant` | `ToolRun.vue` | `router.ts:84` only | **DEAD** |
| `/pages/tool/heal` | `ToolRun.vue` | `router.ts:85` only | **DEAD** |
| `/pages/tool/sleep` | `ToolRun.vue` | `router.ts:86` only | **DEAD** |
| `/pages/tool/work` | `ToolRun.vue` | `router.ts:87` only | **DEAD** |
| `/pages/tool/future` | `ToolRun.vue` | `router.ts:88` only | **DEAD** |
| `/pages/letter/index` | `LetterToday.vue` | `router.ts:76`, `App.vue:20` (`tabbarPaths`) | **REDUNDANT** — every push uses `/pages/letter/today`. |
| `/pages/reply/today` | `LetterToday.vue` | `router.ts:78`, `App.vue:22` (`tabbarPaths`) | **REDUNDANT** — no push; only a tab-bar highlight entry. |
| `/pages/diary/list` | `DiaryList.vue` | `router.ts:92`, `App.vue:26` (`tabbarPaths`) | **REDUNDANT** — `Me.vue:79` and `MoodCreate.vue:127` both push `/pages/diary/index`. |
| `/pages/me/diaries` | `DiaryList.vue` | `router.ts:93`, `App.vue:27` (`tabbarPaths`) | **REDUNDANT** |
| `/pages/favorite/list` | `FavoriteList.vue` | `router.ts:101`, `App.vue:33` (`tabbarPaths`) | **REDUNDANT** — `Me.vue:81` pushes `/pages/favorite/index`. |
| `/pages/feedback/index` | `FeedbackHelp.vue` | `router.ts:106`, `App.vue:36` (`tabbarPaths`), `apps/api/src/store.service.ts:885` (seed ticket `sourcePage`) | **REDUNDANT in the MP UI** — `Me.vue:102` pushes `/pages/help/feedback`. The API still emits the old path as seeded `sourcePage` data. |

Aliases that are **live** (pushed by a real control) and should not be removed:

| Alias path | Pushed from |
| --- | --- |
| `/pages/mood/create` | `DiaryList.vue:149`, `LetterList.vue:109` |
| `/pages/post/create` | `Square.vue:144`, `Square.vue:211` |
| `/pages/letter/today` | `DiaryList.vue:54`, `LetterDetail.vue:42`, `ToolIndex.vue:73` |
| `/pages/tool/decompose` | `ToolIndex.vue:12` (via `ToolIndex.vue:42`) |
| `/pages/tool/run` | `ToolIndex.vue:13-18`, `:38`, `:45` |
| `/pages/me/month-report` | `Me.vue:82` |
| `/pages/diary/index` | `Me.vue:79`, `MoodCreate.vue:127` |
| `/pages/report/month` | `ToolIndex.vue:19` |
| `/pages/settings/data-policy` | `PrivacySettings.vue:366` |
| `/pages/help/feedback` | `Me.vue:102` |
| `/pages/favorite/index` | `Me.vue:81` |

Net: 7 dead alias paths (`/pages/tool/{breakdown,rewrite,rant,heal,sleep,work,future}`)
and 6 redundant-but-harmless alias paths.

## 5. Unconfirmed

* Whether `apps/mp/pages.json` (`pages` + `tabBar` for the uni-app/WeChat-mini-program
  shell) is still part of any shipped build. It lists 13 pages and a 4-item tabBar
  (广场 / 回信 / 工具 / 我的) whose 工具 tab points at `pages/tool/index`. No file under
  `apps/mp` imports or reads `pages.json`; the live app is the vue-router SPA booted by
  `apps/mp/src/main.ts`. **UNCONFIRMED** whether that legacy manifest is deployed
  anywhere. If it were, the tool pages would be reachable there and the orphan finding
  for `ToolIndex` would not hold on that surface.
* Whether `/pages/me/profile` is linked from any *native* shell chrome outside
  `apps/mp/src` (Capacitor config, Android/iOS web assets). Only the compiled bundle in
  `apps/mp/android/app/build/...` and `apps/mp/ios/...` was not fully re-scanned;
  those are build outputs of this same source. **UNCONFIRMED** for the native shells.
* Runtime behaviour of the dead link `/pages/privacy/index` (`PeerNetwork.vue:63`) was
  not exercised in a browser in this read-only phase; the claim that it fails to
  navigate is inferred from the absence of any matching route record. **UNCONFIRMED at
  runtime.**
