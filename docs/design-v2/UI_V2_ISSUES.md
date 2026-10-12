# UI V2 — Issues

Numbering note: these IDs are namespaced `UI2-*` because the repository already carries a separate
"product audit" `ISSUE-001..027` series referenced from `apps/api` and `apps/admin`. The two series
overlapped at 005 and 007, and a comment in `NotificationCenter.vue` cited the product-audit
ISSUE-010 next to a UI V2 fix. Everything in this file is UI V2 only.

## UI2-001 — Page titles were drawn under the Android status bar (FIXED)

**Severity:** P0 for UI V2 — it affected every page, so no page could pass visual review.
**Found by:** rendering the current build on the emulator, not by reading source.
**Fixed in:** `b1252be`.

### Symptom

On `emulator-5554` (Pixel 7 / API 34) every page header collided with the system clock. On
同路人 the title `同路人` was drawn over `4:31`, and the same overlap was visible on 今晚.

### Two independent causes, both measured

**1. The top inset was never applied.** `styles.scss` used `env(safe-area-inset-bottom)` in a dozen
places and `env(safe-area-inset-top)` in exactly one unrelated file. The later, unscoped
`.phone-shell` rule set the top padding to `0`, overriding the earlier `22px`. The bottom inset
worked, which is why only the top collided.

**2. Adding the CSS inset was not enough — and this is the part worth recording.** With
`StatusBar.overlaysWebView: true` the WebView is laid out under the status bar and is expected to
inset itself with `env(safe-area-inset-top)`. Android WebView does not report that value: it resolves
to `0`.

This was verified rather than assumed. The CSS fix was built, synced, installed and rendered, and the
overlap was **identical** — the change was a no-op. Only then was the config changed.

### Fix

`overlaysWebView: false`, so Android lays the WebView out below the status bar and there is nothing to
correct and no dependence on an inset the platform does not report. The CSS now uses
`env(safe-area-inset-top)` instead of a hardcoded `22px`, which is correct if edge-to-edge is ever
re-enabled — and it is the form the V2 spec asks for, which forbids pinning a fixed top offset.

### Evidence

| File | What it shows |
| --- | --- |
| `artifacts/ui-v2/android/UI2-001_PeerNetwork_before.png` | 同路人 title drawn over the clock |
| `artifacts/ui-v2/android/UI2-001_PeerNetwork_after.png` | Status bar on its own band, title below it |

Build trail: `pnpm --filter @goodnight/mp build` → `cap sync android` → `gradlew assembleDebug` →
`adb install -r` → relaunch → navigate to 同路人 → screenshot. APK SHA and device details are in
`artifacts/ui-v2/android/device.json`.

### Not yet verified

- 360 and 430 px widths, and larger font scales. Only the 390 px baseline and the default font scale
  have been rendered.
- The keyboard-open case (`Tonight_keyboard`, `Chat_keyboard` in the state set).
- A device with a display cutout. The emulator is a Pixel 7 profile without a notch.

## UI2-002 — CLOSED, not a defect (my report was wrong)

**Status:** closed with evidence. Kept as a record of the mistake, not deleted.

I reported that content on 我的 was drawn under the bottom tab bar and that the final rows were
unreachable. **Both halves were wrong.**

The capture I judged was taken at the initial scroll position, so it showed the middle of a scrollable
page. A fixed bottom navigation having content scroll beneath it is normal; it is only a defect if the
last row cannot be scrolled clear.

**Test performed:** opened 我的, swiped to the very bottom, captured
`artifacts/ui-v2/android/R1_Me_scrolled_bottom.png`. The last content — the destructive
`清理我的记录` action, in the danger red — sits fully above the tab bar with clear space beneath the
设置 group (`隐私与数据`, `帮助与反馈`). Nothing is clipped and nothing is unreachable.

The geometry agreed once checked: the tab bar occupies 72px and the active `.phone-shell` rule
provides 88px of bottom padding.

**The mistake, named:** I asserted a P0 from one screenshot without performing the scroll that would
have falsified it — the same error I had just criticised in the implementing agent, and the same error
the project has now made three times. It is recorded here so the pattern is visible rather than
quietly fixed.

## UI2-003 — Seven of eight Round-1 screenshots showed a different application (EVIDENCE INVALID)

**Severity:** P0 for the verification chain — it made three pages look verified when they were not.
**Found by:** the `visual-judge` pass, then confirmed by opening `R1_Me_after.png` myself.

`R1_PeerNetwork_after.png`, `R1_ActionCenter_after.png`, `R1_Me_after.png`,
`R1_TonightHome_keyboard.png`, `R1_TonightHome_topics.png`,
`R1_ActionCenter_completion_sheet.png` and `R1_Me_cleanup_confirm.png` are renders of a **different
app**: a pomodoro/focus app with a rabbit mascot ("Mochi 专注中"), tabs 今天/进行中/已完成, cards
今天的专注/今日计划/任务/分心箱, and a 首页/记录/成长 bottom nav. `com.yuhangzhu295.cozyfocus` is
installed on the same emulator, and it was in the foreground when those captures were taken. Three of
the four pages — and every required interaction state — therefore had **no valid evidence at all**.

`R1_TonightHome_after.png` is genuine (I checked it directly), which is why the failure was not
obvious: one real capture sat beside seven wrong ones.

Corrected by recapturing with the other package force-stopped and the foreground verified via
`dumpsys activity activities` before each capture. `R1_Me_after_RECAPTURED.png` and
`R1_TonightHome_after_RECAPTURED.png` are the first two; **the remaining pages and all four
interaction states still need recapturing**, and until they are, Round 1's Android verification is
incomplete.

The generalisable lesson: a screenshot is only evidence once something confirms *which app* is on
screen. `adb shell dumpsys activity activities | grep topResumedActivity` costs one line and would
have caught this immediately.

**Mechanism, now identified.** The other app does not merely happen to be in the foreground — it takes
it back. Measured: after `am force-stop com.yuhangzhu295.cozyfocus` and a `monkey -p
com.goodnight.treehole` launch, `topResumedActivity` was `com.yuhangzhu295.cozyfocus/.MainActivity`
again. Launching with `am start -n com.goodnight.treehole/.MainActivity` and then verifying put
晚安树洞 on top (pid 3804) and it stayed there.

So the capture procedure is: force-stop the other package, `am start -n` the target, **verify
`topResumedActivity`**, and only then capture. `monkey` alone is not sufficient on this emulator.

## UI2-004 — The 同路 feed shows two visually identical experiences (DATA, not UI)

**Severity:** P1 — the spec forbids it ("不能将同一个经历重复显示成两个独立对象", "不同真实经历必须拥有不同身份和数据"), but the cause is the fixture data, not the rendering.
**Found by:** looking at the recaptured 同路人 render.

The first two cards on 同路人 are identical in identity (匿名同行者), time (5天前留下), title
(我把消息留到第二天再看), domain (关系) and excerpt; they differ only in their action label
(已连接 vs 查看后来记录).

**Checked against the database rather than assumed.** They are two distinct rows:

```
experience_8a3d80c2f0 | user_guest | 我把消息留到第二天再看 | 关系 | graduated | published | 2026-10-06 16:48:32
experience_0e8066823c | user_guest | 我把消息留到第二天再看 | 关系 | graduated | published | 2026-10-06 16:47:24
```

So the UI's id-based dedupe — the thing the implementing agent added and claimed — **works**: two
rows render as two cards, not one row twice. The defect is that the seeded data contains two
near-identical experiences 68 seconds apart, most likely left by an earlier test run.

**Classification:** data quality, not a rendering bug. Closing it by changing the UI would be wrong —
the feed is correctly showing what exists.

**What would fix it:** decide whether the product should collapse near-identical experiences
(same author, domain and title) into one, or whether the fixture data should be cleaned. That is a
product decision, and cleaning the development database is not something to do unilaterally, so this
is recorded rather than fixed.

Related: the visual judge independently described the before-state content as "统一规格的推荐样本"
(uniform recommendation samples), which is the same observation from the visual side.

## UI2-005 — With the keyboard open the primary action floated over the page (FIXED)

**Severity:** P0 — the primary action obscures the content it belongs to, and the spec requires the
main action to be easy to find and not to fight the input.
**Found by:** capturing the keyboard state properly and looking at it.
**Evidence:** `artifacts/ui-v2/android/R1_TonightHome_keyboard_RECAPTURED.png`
(foreground verified `com.goodnight.treehole/.MainActivity`, `mInputShown=true` at capture).

With the soft keyboard open on 今晚:

- the green `继续整理` button is rendered **in the middle of the page**, directly under the heading
  `今天有什么想说的?` and **above** the input field it submits;
- the input card is pushed below the button, so the visual order becomes heading → submit button →
  field, which is backwards;
- the floating tab bar sits over the `最近的记录` row (`继续上次的旅程`), so content is genuinely
  obscured rather than merely scrolled under.

**This contradicts the implementing agent's report**, which stated the button "浮在软键盘上方可见"
as evidence that the keyboard case was handled. It is visible, and it is in the wrong place.

The intent — keep the action reachable above the keyboard — is right; the implementation moved the
button out of the document flow without anchoring it to the keyboard edge, so it landed over the
content.

### Fix, in two parts (both were needed)

**1. The offset was applied twice.** `keyboardWillShow` set `keyboardHeight` to `info.keyboardHeight`,
the raw keyboard height. But Android *resizes* the web view for the keyboard (no `windowSoftInputMode`
is set), so `innerHeight` had already shrunk by that amount and the keyboard occupied no further space
inside the viewport. Offsetting a fixed element by the full height moved it up twice, which is why it
landed mid-page. The offset is now derived from the layout/visual viewport difference, which is zero
in resize mode and the keyboard height in overlay mode — correct either way.

**2. The tab bar hid only after a second attempt.** With the button anchored correctly it sat *behind*
the tab bar, whose labels were drawn over it. Hiding the bar while typing is both the fix and the normal
phone behaviour. The first attempt detected the keyboard from the same viewport difference and never
fired, for the reason above: in resize mode that difference is zero. It now uses the Capacitor
`keyboardWillShow`/`keyboardWillHide` events, which fire in both modes.

### Verified both directions

| State | Evidence | Result |
| --- | --- | --- |
| Keyboard open | `R1_TonightHome_keyboard_FIXED3.png` (`mInputShown=true`) | tab bar hidden, 继续整理 directly above the keyboard, unobstructed |
| Keyboard dismissed | `R1_TonightHome_keyboard_dismissed.png` (`mInputShown=false`) | tab bar restored, action back in place, real data loading |

The earlier captures are kept: `R1_TonightHome_keyboard_RECAPTURED.png` shows the double-offset
defect and `..._FIXED.png` / `..._FIXED2.png` show the intermediate states that were still wrong.

**What would settle it:** with the keyboard open, the action should sit immediately above the keyboard
and below the field, with the page content scrolling between the header and the action; the tab bar
should not overlay content in that state.

## Round 1 interaction states — capture status

| State | Evidence | Result |
| --- | --- | --- |
| 今晚 keyboard open | `R1_TonightHome_keyboard_FIXED3.png` (mInputShown=true) | PASS - bar hidden, action above the keyboard |
| 今晚 keyboard dismissed | `R1_TonightHome_keyboard_dismissed.png` (mInputShown=false) | PASS - bar restored, action back in place |
| 今晚 topic sheet | `R1_TonightHome_topics_FIXED.png` | PASS - six categories, 暂时说不清 checked, mask behind |
| 我的 destructive confirmation | `R1_Me_cleanup_confirm_FIXED.png` | PASS - 确认清理 in the danger red, 暂不清理 neutral, copy states it is irreversible |
| 行动 completion sheet | `R1_ActionCenter_completion_FIXED.png` | PASS - sheet opens on 完成; tapping 保存这次记录 moved the OutcomeCheckin for that action from pending to completed in PostgreSQL |

Every capture above had `topResumedActivity` compared as the complete
`com.goodnight.treehole/.MainActivity` string immediately before the shot. Two captures were
rejected by that check during this round (cozyfocus took the foreground again), and one was
discarded because a swipe from the bottom edge opened Google Lens instead - the guard caught the
first two; the third was captured without the guard on the capture line and deleted on inspection.

## UI2-006 — Garbled text in 最近完成 is test-input corruption, NOT an app defect (CLOSED)

**Severity:** investigated as a possible P0 (an app that corrupts Chinese user text would be
disqualifying for a Chinese-language product). **It is not the app.**

The ActionCenter's 最近完成 row renders `j�K�10����`, and the database shows the same mojibake for that
`OutcomeCheckin.reflection` — the classic pattern of GBK bytes read as UTF-8.

**Tested the app's own path with known-good UTF-8**, writing the request body with Node so no shell
could touch it:

```
sent    : 中文编码验证-1791772517068
returned: 中文编码验证-1791772517068
MATCH   : YES - round-trips correctly
```

The journey was created through `POST /api/v1/journeys` and read back from the API unchanged, so
app → API → PostgreSQL preserves UTF-8 correctly.

**The corruption comes from the test typing tools.** `adb shell input text` and the UI-automation
type action cannot carry non-ASCII reliably — Git Bash also converts a Chinese shell argument to GBK
before `curl` sees it, which I reproduced while building this test. The rows the implementing agent
typed through those tools are therefore stored corrupted.

**Consequences:** not an app defect, so nothing to fix in the product. But the corrupted rows are now
in the development database and show up in the UI, which is misleading during visual review, and the
same tool would corrupt any future text fixture. Recorded so the next round uses an API call with a
file body for text fixtures instead of a typing tool.

Cleanup: the two journeys created while investigating were removed.

## Visual-judge findings on 今晚 — dispositions

The first visual review returned PARTIAL for 今晚 with four points. Three are now resolved or
explained; the fourth is a deliberate judgment.

| Finding | Disposition |
| --- | --- |
| The green CTA nearly abuts the floating bottom nav | **Fixed.** The action sat at `bottom: 60px` while the nav occupies 8px→72px, so the button's lower 12px was behind the bar. Moved to `80px`, which clears the nav's top edge with a gap. Evidence: `R1_TonightHome_spacing_FIXED.png`. |
| The record row renders only its bottom and side borders, so it reads as a half-drawn card | **Explained, no change.** `.list-row` is `border: 0; border-bottom: 1px solid #E8EBEF` inside a `.list-rows` with `border-top` — a flat row with hairline dividers, which is what the V2 spec asks for ("普通业务列表优先分割线"). There is no radius or side border in the scoped CSS and no global rule for `.list-row`. What the review saw is a thin-line artifact at capture scale, not a container. |
| Excessive whitespace between the last record and the CTA | **Deliberate, not a defect.** The page has one record and a pinned action; the gap is the unfilled remainder of the viewport. Collapsing it would mean either stretching the content or floating the action mid-page, and the latter is exactly UI2-005. A short page with a pinned primary action is normal on a phone. It will look different with more records, which is the honest test. |
| No topic chip selected by default (the reference pre-selects 感情) | **Explained.** The topic sheet does have a default: 暂时说不清 carries the checkmark (`R1_TonightHome_topics_FIXED.png`). Pre-selecting 感情 would assert a category the user has not chosen, which is worse than asserting none. |

## UI2-007 — Another project's automation steals the emulator foreground (ENVIRONMENT)

**Severity:** not an app defect, but it invalidated seven screenshots once and cost repeated retries.
**Found by:** reading logcat after a launch kept losing the foreground.

```
ActivityTaskManager: START u0 {flg=0x10000000 cmp=com.yuhangzhu295.cozyfocus/.MainActivity}
  with LAUNCH_SINGLE_TOP from uid 2000 (BAL_ALLOW_PERMISSION)
```

`uid 2000` is the shell user, so this is issued from the **host over adb** — not by the app, and not
by anything on the device. Something on this machine is starting `com.yuhangzhu295.cozyfocus`
roughly every 35 seconds, and `io.appium.settings` is installed, so it is most likely another
project's UI automation running against the same emulator.

`pm disable-user` does not stop it: the package reports `enabled=0` and is still launched.

**Working practice, not a fix:**

1. Launch with `am start -n com.goodnight.treehole/.MainActivity`, then verify the **complete**
   `topResumedActivity` string.
2. Navigate and capture within roughly 20 seconds — inside the window before the other automation
   runs again. A long sleep between launch and capture loses the foreground every time.
3. Keep the foreground check on the capture line itself, so a missed window produces no file rather
   than a wrong-app screenshot.

The proper fix is a dedicated AVD that the other automation does not target, or stopping that
automation while UI V2 runs. Neither is mine to do unilaterally — it belongs to another project.

## UI2-008 — On the closed conversation the primary action was unreachable under the tab bar (FIXED)

**Severity:** P0 for this page — the only action on the state could not be tapped.
**Found by:** rendering `同路 → 已连接` on `emulator-5554` and trying to use it.
**Fixed in:** this change (see below).

### Symptom

`匿名同行会话 / 会话已经结束` rendered correctly, but the footer card's green `留下感受` button sat
**underneath the floating tab bar**, with its label showing faintly through the bar. In the active
state the same band holds the composer (`.composer` is `position: sticky; bottom: 0`), so the
textarea, 帮我整理一下 and 发送 were in the same covered region — you could not have started typing
either. The tab bar only hides once the keyboard opens, and the keyboard only opens if you can tap
the textarea, so there was no way in.

### Why it was not UI2-002

UI2-002 was my own false P0: on the notification list the last row is *scrollable*, so scrolling
reveals it. I checked that first here. This page **does not scroll** — two swipes produced
byte-identical screenshots — so there was no way to bring the button out.

### Proof chain

| Step | Evidence |
|---|---|
| App is foreground | `topResumedActivity` = `com.goodnight.treehole/.MainActivity` (complete string, no truncated-package regex) |
| Route is the conversation | read the capture: `匿名同行会话 / 会话已经结束` |
| Page does not scroll | two `input swipe` up, `cmp` against the previous capture → byte-identical |
| The button does not respond | tap at its centre (539,1928) → byte-identical, no navigation |
| Taps and coordinates do work | control tap on the 我的 tab (916,2216) → navigated to 我的 |
| Geometry explains it | page reserved `24px + safe-area`; the tab bar occupies `10px + safe-area` to `82px + safe-area`; the button spans 24–60px from the bottom, entirely inside the covered band |

### Root cause

`.goodnight-page` globally reserves `padding-bottom: calc(130px + env(safe-area-inset-bottom))` for
the floating tab bar. `.conversation-page` re-declared the **`padding` shorthand** as
`12px 16px calc(24px + ...)`, which silently discarded that reserve, and scoped styles out-specify
the global rule (the scoped attribute selector adds specificity), so the 24px won.

### Fix

Added shared tab-bar geometry tokens to `tokens.scss` — `--gn-tabbar-height`, `--gn-tabbar-gap`,
`--gn-tabbar-reserve` — used them in the effective `.tabbar` rule so the bar and the reserve cannot
drift apart, and set `.conversation-page` to
`padding: 12px 16px calc(var(--gn-tabbar-reserve) + env(safe-area-inset-bottom))`.

### Audit of the same pattern elsewhere

Every other page that overrides the bottom padding uses 96–128px, all clear of the 82px band:
`ActionCenter` 96, `DecisionVault`/`HelpFaqs`/`FeedbackHelp`/`FutureSelf`/`MemoryCenter`/`PeerConsent`/
`PeerExperienceDetail`/`PeerGraduation`/`PeerMatchWaiting`/`PrivacySettings`/`PeerRequests`/
`RealityHandoff`/`StableSelf`/`Recovery`/`SupportPlan` 112, `ReportMonth` 110, `TonightHome` 128,
`Archive` 112. `PeerConversation` at 24 was the lone outlier, so this was a single-page defect
rather than a systemic one.

### Verification

After the fix the button clears the tab bar and tapping it navigates to `同行结束`
(`R2_PeerConversation_after.png`, `R2_PeerConversation_tap_leave.png`). The active-state composer is
covered by the same change but still needs an active conversation to capture — see the queue.

## UI2-009 — A failed read receipt stopped the notification from opening its target (FIXED)

**Severity:** medium — a tap silently did nothing.
**Fixed in:** `2d9fed3`.

`NotificationCenter.open()` marked the notice read and navigated inside one `try` block, so when the
PATCH failed the `router.push` never ran and the tap appeared dead. Navigation and the read receipt
are now separate, and a failed receipt shows a message while the content still opens.


## UI2-010 — The composer was not pinned, and a conversation opened on the oldest message (FIXED)

**Severity:** P0 for this page — you could not type without scrolling to the very end.
**Found by:** opening the active conversation on `emulator-5554`.

### Symptom

Opening an active conversation showed the **beginning** of the history with the composer nowhere on
screen. The composer only appeared after scrolling to the absolute end, and the last message sat
behind the tab bar on the way there.

### Root cause

`.conversation-page` was `min-height: 100vh` with `overflow-x: hidden`. Together those make the page
its own scroll container whose height equals its content, so the body scrolls instead and
`.composer { position: sticky; bottom: 0 }` never engages — a sticky box cannot move inside a
containing block that has no scroll range. The composer therefore sat at the end of the content as
if it were static, and nothing scrolled the list to the newest message because the view had no
scroll logic at all (`ref` count in the file: one, for the conversation object).

### Fix

- `.conversation-page`: `height: 100vh` + `overflow: hidden` — a fixed-height column.
- `.chat-messages`: `flex: 1; min-height: 0; overflow-y: auto` — the list is the scroll container.
- `.composer`: dropped `position: sticky; bottom: 0` for `flex: 0 0 auto`; the column pins it.
- `scrollToLatest()` after load, so the page opens on the newest message.

### Verification

| State | Evidence |
|---|---|
| Opens on the newest message, composer pinned | `R2_PeerConversation_active.png` |
| Soft keyboard: composer above it, tab bar hidden | `R2_PeerConversation_keyboard.png` (also `dumpsys input_method` `mInputShown=true`) |
| Typing: counter and enabled 发送 | `R2_PeerConversation_typed.png` — `20/1000`, 发送 dark |
| Send: message appended, composer cleared | `R2_PeerConversation_sent.png`; server listed 12 messages, last `hello world from adb` |
| Failed send: draft kept, 发送 stays enabled | `R2_PeerConversation_sendfail.png` |
| Network recovery: the retry succeeds | server listed 13 messages, last `offline-send-test` |
| Closed | `R2_PeerConversation_after.png`, `R2_PeerGraduation_after.png` |
| Expired | `R2_PeerConversation_expired.png` — forced by moving `expiresAt` an hour into the past, then restored; the API's own expiry path flipped the status, the composer disappeared and the closed panel appeared |
| Anonymous identity shown | header `匿名同行会话` / `不交换联系方式，不透露真实身份` in every capture |

The fixtures behind these captures come from `scripts/ui2-create-active-conversation.mjs`, which
drives the real flow (privacy gate → experience → admin review → match → request → respond → both
consents) instead of flipping a status column.

## UI2-011 — A network failure printed the platform's English text into the interface (FIXED)

**Severity:** medium — user-visible untranslated text on every page that can fail offline.
**Found by:** cutting `adb reverse` and tapping 发送.

### Symptom

With the API unreachable, the conversation showed **`Failed to fetch`** in red, in the middle of an
otherwise entirely Chinese interface.

### Root cause

57 call sites render `cause?.message`, and the fallback only applies when the message is missing. A
network failure always carries one — the platform's own English ("Failed to fetch" on the Android
WebView, "Load failed" on iOS, "Network request failed" under Capacitor) — so the raw text went
straight to the screen. The two raw-`fetch` helpers (`uploadMedia`, `deleteMedia`) bypassed the
wrapper entirely.

### Fix

`apps/mp/src/friendly-error.ts` — a zero-import leaf mapping those phrasings to
`网络连接不上，请检查网络后重试`, and leaving the API's own Chinese messages untouched. Applied in
`withIdentity` (so every call is covered) and in both raw-fetch helpers.

### Verification

`tests/unit/friendly-error.spec.ts` — 7 cases, including that an API message is passed through and
that a Chinese message merely containing the word 网络 is not rewritten. Reverse-proved: replacing
the test with `false` fails 3 named cases. On device, `R2_PeerConversation_sendfail.png` now reads
网络连接不上，请检查网络后重试 with the draft preserved.

