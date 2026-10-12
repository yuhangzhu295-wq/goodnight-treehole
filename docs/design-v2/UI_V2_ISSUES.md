# UI V2 — Issues

## ISSUE-001 — Page titles were drawn under the Android status bar (FIXED)

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
| `artifacts/ui-v2/android/ISSUE-001_PeerNetwork_before.png` | 同路人 title drawn over the clock |
| `artifacts/ui-v2/android/ISSUE-001_PeerNetwork_after.png` | Status bar on its own band, title below it |

Build trail: `pnpm --filter @goodnight/mp build` → `cap sync android` → `gradlew assembleDebug` →
`adb install -r` → relaunch → navigate to 同路人 → screenshot. APK SHA and device details are in
`artifacts/ui-v2/android/device.json`.

### Not yet verified

- 360 and 430 px widths, and larger font scales. Only the 390 px baseline and the default font scale
  have been rendered.
- The keyboard-open case (`Tonight_keyboard`, `Chat_keyboard` in the state set).
- A device with a display cutout. The emulator is a Pixel 7 profile without a notch.

## ISSUE-002 — CLOSED, not a defect (my report was wrong)

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

## ISSUE-003 — Seven of eight Round-1 screenshots showed a different application (EVIDENCE INVALID)

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

## ISSUE-004 — The 同路 feed shows two visually identical experiences (DATA, not UI)

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

## ISSUE-005 — With the keyboard open the primary action floated over the page (FIXED)

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

## ISSUE-006 — Garbled text in 最近完成 is test-input corruption, NOT an app defect (CLOSED)

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
