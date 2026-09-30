# Post-Recovery Full Business Matrix

Generated 2026-09-30T06:30:17.931792+00:00 from the device run on the Pixel 7 API 34 emulator.

Every row is measured on the installed APK, not inferred from the web build. The `Android`
column is the route rendering inside the app with its controls enumerated; `Controls` is
visible controls / controls actually clicked in the safe-click pass. API, DB, Admin and
Persistence are only marked where a flow was actually driven end to end - a blank cell means
not verified in this round, not a pass.

- Routes discovered from `apps/mp/src/router.ts`: **54**
- Routes rendered on the device: **54 / 54**
- Controls enumerated: **600**, all visible
- Controls clicked: **289**; destructive controls deliberately not pressed: **33**
- Console errors across all routes: **0**

## Route matrix

| Route | Tab | Android render | Controls (visible/clicked) | Console errors | Result |
| --- | :---: | --- | --- | ---: | --- |
| `/pages/tonight/index` | yes | rendered | 15/6 | 0 | PASS |
| `/pages/peers/index` | yes | rendered | 8/2 | 0 | PASS |
| `/pages/action/index` | yes | rendered | 10/6 | 0 | PASS |
| `/pages/journey/detail` |  | rendered | 5/1 | 0 | PASS |
| `/pages/peer/detail` |  | rendered | 5/1 | 0 | PASS |
| `/pages/peer/requests` |  | rendered | 6/2 | 0 | PASS |
| `/pages/peer/wait` |  | rendered | 7/2 | 0 | PASS |
| `/pages/peer/consent` |  | rendered | 8/1 | 0 | PASS |
| `/pages/peer/conversation` |  | rendered | 8/1 | 0 | PASS |
| `/pages/peer/graduate` |  | rendered | 11/4 | 0 | PASS |
| `/pages/reality-handoff/index` |  | rendered | 18/7 | 0 | PASS |
| `/pages/safety/index` |  | rendered | 7/4 | 0 | PASS |
| `/pages/notifications/index` |  | rendered | 9/3 | 0 | PASS |
| `/pages/future-self/index` |  | rendered | 15/3 | 0 | PASS |
| `/pages/recovery/index` |  | rendered | 6/1 | 0 | PASS |
| `/pages/support-plan/index` |  | rendered | 26/7 | 0 | PASS |
| `/pages/stable-self/index` |  | rendered | 15/4 | 0 | PASS |
| `/pages/memory/index` |  | rendered | 3/1 | 0 | PASS |
| `/pages/decision/index` |  | rendered | 10/1 | 0 | PASS |
| `/pages/square/index` |  | rendered | 27/15 | 0 | PASS |
| `/pages/mood/create` |  | rendered | 20/17 | 0 | PASS |
| `/pages/post/create` |  | rendered | 20/17 | 0 | PASS |
| `/pages/post/detail` |  | rendered | 20/6 | 0 | PASS |
| `/pages/letter/index` |  | rendered | 15/11 | 0 | PASS |
| `/pages/letter/today` |  | rendered | 15/11 | 0 | PASS |
| `/pages/reply/today` |  | rendered | 15/11 | 0 | PASS |
| `/pages/tool/index` |  | rendered | 13/8 | 0 | PASS |
| `/pages/tool/decompose` |  | rendered | 3/2 | 0 | PASS |
| `/pages/tool/breakdown` |  | rendered | 3/2 | 0 | PASS |
| `/pages/tool/run` |  | rendered | 3/2 | 0 | PASS |
| `/pages/tool/rewrite` |  | rendered | 7/5 | 0 | PASS |
| `/pages/tool/rant` |  | rendered | 3/2 | 0 | PASS |
| `/pages/tool/heal` |  | rendered | 3/2 | 0 | PASS |
| `/pages/tool/sleep` |  | rendered | 3/2 | 0 | PASS |
| `/pages/tool/work` |  | rendered | 3/2 | 0 | PASS |
| `/pages/tool/future` |  | rendered | 3/2 | 0 | PASS |
| `/pages/me/index` | yes | rendered | 21/14 | 0 | PASS |
| `/pages/me/profile` |  | rendered | 1/1 | 0 | PASS |
| `/pages/diary/index` |  | rendered | 22/13 | 0 | PASS |
| `/pages/diary/list` |  | rendered | 22/13 | 0 | PASS |
| `/pages/me/diaries` |  | rendered | 22/13 | 0 | PASS |
| `/pages/diary/detail` |  | rendered | 1/1 | 0 | PASS |
| `/pages/report/month` |  | rendered | 9/0 | 0 | PASS |
| `/pages/me/month-report` |  | rendered | 9/0 | 0 | PASS |
| `/pages/letter/list` |  | rendered | 12/8 | 0 | PASS |
| `/pages/letter/detail` |  | rendered | 3/3 | 0 | PASS |
| `/pages/archive/index` |  | rendered | 21/0 | 0 | PASS |
| `/pages/favorite/index` |  | rendered | 11/5 | 0 | PASS |
| `/pages/favorite/list` |  | rendered | 11/5 | 0 | PASS |
| `/pages/settings/privacy` |  | rendered | 23/15 | 0 | PASS |
| `/pages/settings/data-policy` |  | rendered | 1/1 | 0 | PASS |
| `/pages/help/feedback` |  | rendered | 19/10 | 0 | PASS |
| `/pages/help/faqs` |  | rendered | 5/3 | 0 | PASS |
| `/pages/feedback/index` |  | rendered | 19/10 | 0 | PASS |

## End-to-end flows actually driven this round

These are the flows where the full chain was exercised, so the extra columns are filled in.
Everything was driven on the device with real taps, except the admin step, which is the web
console as the task requires.

| Flow | Android | API | DB | Refresh | Admin | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Stage 1: Tonight -> create Journey | real taps + IME | `POST /api/v1/journeys` 201 | `LifeJourney` row `journey_7d70ee166a` | route reloaded and rendered | dashboard `total` matches the DB count | PASS |
| Stage 1: confirm situation fingerprint | tap `fingerprint-accurate` | `PATCH` journey | `stage` moved `clarifying` -> `acting` | detail page re-rendered | same row visible | PASS |
| Stage 1: request + accept action plan | taps `action-request-plan`, `action-accept-plan` | action plan endpoints | `ActionCommitment` `action_dda975e9a0`, status `active` | action tab rendered it | dashboard `actions` count | PASS |
| Stage 1: create Journey (repeat-tap guard) | 4 rapid taps on the CTA | one request only | `LifeJourney` 3 -> 4, exactly one row | - | - | PASS |
| Privacy gate refusal | `/pages/recovery/index` renders the consent prompt | `GET /api/v1/me/recovery` 403 | - | - | - | PASS (correct refusal) |
| Privacy gate grant | same page after consent | same call 200 | - | - | - | PASS |
| Offline / online / slow | shell renders, `Failed to fetch` shown, recovers | requests fail then succeed | - | - | - | PASS |
| Back navigation | real in-app clicks build history, BACK walks it | - | - | - | - | PASS (after ISSUE-ANDROID-001) |

## Route coverage detail

All 54 routes render inside the app with zero console errors. Four routes return 403 from
`/api/v1/me/recovery` or `/api/v1/me/stable-self`, which is the third-stage privacy gate
working correctly - the server refuses without `allowRecoveryData`, and the pages render a
consent prompt rather than an error. Verified by toggling the consent: 403 -> 200 -> 403.

`modal` and `sheet` counts are zero on first paint because every sheet in the app is
conditionally rendered behind a user action; the sheet states are exercised in the back
navigation and business flow checks instead.

## What is not verified here

- **Stage 2 and Stage 3 Android business closure.** The task gates these on DAPI being
  restored, and it is not (`BLOCKED_DAPI_BALANCE`). The peer-assist and monthly-report
  paths in particular assert real funded remote AI output. See
  `docs/post-recovery-final-verification.md`.
- **Physical Android.** No device attached.
- The remaining keyboard routes (memory, decision, future self) could not be measured
  reliably because another session was driving the same emulator.
