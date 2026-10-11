# UI V2 — Progress

**Branch:** `codex/ui-v2-native-redesign` (from `26bd75a`)
**Last updated:** after the safe-area fix `b1252be`

## Status at a glance

| Flag | Value | Evidence |
| --- | --- | --- |
| `UI_V2_DESIGN_READ` | **true** | Word spec extracted, 28,009 chars / 643 paragraphs, read in full |
| `UI_V2_ASSETS_VERIFIED` | **true** | 39 designs + 7 state images + 39 prompts + 46 HTML prototypes + manifest; 39/39 designs and prompts present |
| `ROUTER_VIEWS_DISCOVERED` | **39** | 39 `.vue` in `apps/mp/src/views`, 55 routes (39 pages + 16 aliases); all 39 manifest views match a real file |
| `PAGES_IMPLEMENTED` | **0 / 39** | not started |
| `PAGES_ANDROID_REVIEWED` | **0 / 39** | not started |
| `PAGES_VISUAL_PASS` | **0 / 39** | not started |
| `INTERACTION_STATES_IMPLEMENTED` | **0 / 7** | not started |
| `SAFE_AREA_VERIFIED` | **partial** | fixed and verified at 390 px on the Pixel 7 profile; 360/430 px, font scale and cutout devices not yet rendered |
| `PRIMARY_ACTIONS_VERIFIED` | **false** | not started |
| `FAKE_BUTTON_COUNT` | **not measured** | requires the per-page operation audit (`UI-V2-G6`) |
| `FAKE_FUNCTION_COUNT` | **not measured** | same |
| `BUSINESS_REGRESSION_PASS` | **false** | not started |
| `ANDROID_APK_BUILD_PASS` | **true** | debug APK builds and installs; the app authenticates and renders live data |
| `ANDROID_E2E_PASS` | **false** | one page visited by hand; no systematic run |
| `ADMIN_SYNC_VERIFIED` | **false** | not started |
| `SECURITY_REGRESSION_PASS` | **false** | not started |
| `UI_V2_FINAL_GATE` | **not run** | |

## What is actually done

1. **Read the design spec.** `C:/Users/zyu33/Downloads/UI V2 完整设计与修改方案 (2).docx` — the whole
   document, including the per-page sections. Design tokens are taken from it (主色 `#275F56`, 危险
   `#BD4545`, 主文本 `#242A32`, tap target ≥48×48dp, real SVG icons rather than Unicode glyphs).
2. **Verified the assets and the mapping.** 39 design images, 7 state images, 39 per-page prompts,
   46 HTML prototypes, and a manifest that pins each page's route, round and design sha256. All 39
   manifest views correspond to a real `.vue`; there are no orphan views.
3. **Isolated the work.** Branch `codex/ui-v2-native-redesign` from `26bd75a`. Backup bundle
   `goodnight-treehole-ui-v2-prechange-20261012-002913.bundle`, verified as a complete history.
4. **Fixed the one global defect that blocked every page.** ISSUE-001, the status-bar overlap, fixed
   in `b1252be` and verified on device with before/after screenshots.
5. **Got the app running on the emulator against live data** — this is what made the defect visible
   and is the harness every page will be judged in.

## What is not done

**No page has been redesigned.** All 39 are `PENDING`. The four rounds, the 7 interaction states, the
per-page operation audit, the Android click-through, and the business/security regression are all
untouched.

The round-1 gate has not been reached, so `UI_V2_FINAL_GATE` cannot be run and must not be claimed.

## Round sizes (from the manifest)

| Round | Pages | Contents |
| --- | --- | --- |
| 1 | 4 | TonightHome, PeerNetwork, ActionCenter, Me |
| 2 | 10 | Journey, peer request/consent/conversation/wait/graduate, Safety, RealityHandoff, Notification |
| 3 | 11 | Recovery, SupportPlan, StableSelf, MemoryCenter, DecisionVault, FutureSelf, Privacy, DataPolicy, ReportMonth, Archive |
| 4 | 14 | Square, Mood, PostDetail, Diary×2, Letter×3, Favorite, Tools×3, MeProfile, Feedback, Help |

## Harness notes (so the next round does not rediscover them)

- The dev API must run with `DATABASE_URL` pointing at `127.0.0.1`, and the WSL2 Postgres container
  stops when the VM idles — it needs a keepalive or the API returns 500 on every request.
- The APK is built with `VITE_API_BASE_URL=http://127.0.0.1:3000`, and on an emulator `127.0.0.1` is
  the emulator itself. `adb reverse tcp:3000 tcp:3000` bridges it, and must be re-set after any
  emulator restart.
- The Vite dev servers bind to `[::1]`, so use `http://localhost:5173`, not `127.0.0.1`.
- `cap sync android` must run after every web build, and the Gradle entries it generates for a new
  Capacitor plugin have to be committed or the native build silently omits the plugin.
