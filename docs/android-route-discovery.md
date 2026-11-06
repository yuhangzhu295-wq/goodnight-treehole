# Android Route Discovery and Page Coverage

Run 2026-09-29 against the installed APK on the Pixel 7 API 34 emulator. This is the
route-coverage half of the native verification; the tap-driven business flow lives in
`docs/android-native-verification.md`.

Reproduce with:

```bash
adb forward tcp:9333 localabstract:webview_devtools_remote:$(adb shell pidof com.goodnight.treehole)
node scripts/recovery/android-route-walk.mjs
```

## Method

`scripts/recovery/android-route-walk.mjs` parses the route table straight out of
`apps/mp/src/router.ts` so the manifest cannot drift from the source, then walks every
route inside the running Android WebView over the DevTools protocol. For each route it
records whether the page rendered, how many controls of each kind it exposes, and every
console error and failed network request seen while it loaded.

Routes are reached with `Page.navigate`, which is a real navigation of the real app inside
the real WebView. That is deliberately different from the tap-driven flows elsewhere,
which use genuine `adb shell input tap` events - this script is about coverage, not about
proving a user gesture.

Output: `artifacts/recovery/android-route-manifest.json`.

## Result

**54 of 54 routes rendered, with 0 console errors.**

| Control kind | Total across all routes | Routes exposing at least one |
| --- | ---: | ---: |
| button | 350 | 54 |
| link (`a[href]`) | 131 | 33 |
| tab | 133 | 32 |
| input | 23 | 9 |
| textarea | 20 | 18 |
| switch | 1 | 1 |
| modal | 0 | 0 |
| sheet | 0 | 0 |

424 `data-testid` hooks were found across the walk.

Modal and sheet counts are zero because every sheet in the app (reply sheet, relation
sheet, end-confirm, request panel) is conditionally rendered behind a user action, so none
is present on first paint. That is the expected result, not a gap.

The four tab routes are `/pages/tonight/index`, `/pages/peers/index`, `/pages/action/index`
and `/pages/me/index`, matching the tab bar the app renders.

Richest pages by visible control count: `/pages/support-plan/index` (26),
`/pages/settings/privacy` (23), `/pages/square/index` (22), `/pages/post/detail` (20),
`/pages/me/index` (20), `/pages/mood/create` (19).

## Routes that reported a failed request, and why it is correct

Four routes issued a request that returned 403:

| Route | Request |
| --- | --- |
| `/pages/future-self/index` | `GET /api/v1/me/recovery` |
| `/pages/recovery/index` | `GET /api/v1/me/recovery`, `GET /api/v1/me/stable-self` |
| `/pages/stable-self/index` | `GET /api/v1/me/stable-self` |
| `/pages/me/index` | `GET /api/v1/me/recovery` |

This is the third-stage privacy gate working, not a defect. Both endpoints are guarded by
`privacyAllows(userId, 'allowRecoveryData', ...)` in `apps/api/src/store.service.ts`, and
the default is `allowRecoveryData: false`. Verified directly:

```
privacy allowRecoveryData=false  -> GET /api/v1/me/recovery      403
                                    GET /api/v1/me/stable-self   403
PATCH /api/v1/me/privacy {allowRecoveryData:true}
privacy allowRecoveryData=true   -> GET /api/v1/me/recovery      200
                                    GET /api/v1/me/stable-self   200
```

The consent was turned back off afterwards, so the environment is as it was found.

The client handles the refusal properly: `/pages/recovery/index` renders

```
今天，生活回来一点了吗？ / 我们只看生活有没有慢慢回来，不评价你。
先由你决定要不要保存
请先在隐私设置中允许查看恢复记录   [去隐私设置]
```

- a real consent prompt with a route to the privacy settings, and no console error.

## Pages with little text

Several routes render under 40 characters. All of them are legitimate:

| Route | Rendered |
| --- | --- |
| `/pages/tool/sleep` | `失眠安慰 / 把夜里的念头慢慢放轻。/ 陪我缓一缓` - a real tool page with deliberately short copy |
| `/pages/diary/detail` | `日记详情 / 没有找到这篇日记 / 它可能已经被清空或删除。` - correct guard state, the route needs an id |
| `/pages/peer/detail` | `匿名经历详情 / 没有找到要查看的经历` - same |
| `/pages/me/profile` | `个人资料 / 芽 / 晚安旅人 / 树洞 0427 / 账号状态：正常` - real profile |

## The Capacitor safe-area console error is benign

Launching the app logs three times:

```
E Capacitor/Console: Msg: Error injecting safe area CSS: TypeError: Cannot read properties of null (reading 'style')
```

The message comes from `@capacitor/android` 8.5.0
(`capacitor/src/main/java/com/getcapacitor/plugin/SystemBars.java`), whose injected script
does:

```js
try {
  document.documentElement.style.setProperty("--safe-area-inset-top", "..px");
  ...
} catch(e) { console.error('Error injecting safe area CSS:', e); }
```

It throws when the insets callback fires before the document element exists, and Capacitor
catches and logs it. Capacitor re-injects on later inset changes, so the values do get set
once the DOM is up.

It has no effect on this app because **the app never reads those variables**: 21 files use
the WebView-native `env(safe-area-inset-*)` and there is not a single
`var(--safe-area-inset-*)` reference in `apps/mp/src`. The rendering confirms it - the
status bar overlays the WebView and content clears the gesture bar in every screenshot.

Recorded as an upstream race with no impact, so it is not mistaken for a defect later.

## One layout finding, left for the visual task

`pnpm test:reference-qa-first-stage-shells` fails on:

```
notifications 430x932 main content detached from hero
```

Measured at 430x932 on `/pages/notifications/index`:

| Element | Top | Height |
| --- | ---: | ---: |
| `.notification-hero` | 0 | 245 |
| `.notice-tabs` | 255 | 114 |
| `.notice-list` | 381 | 419 |

The assertion allows `mainTop <= heroHeight + 130 = 375`; the list starts at 381, six
pixels over. The page itself is fine - no horizontal overflow, three notice cards render,
and the hero is inside its own 120-245 contract - so this is the tab strip's 114px height
pushing the list past a threshold that is six pixels too tight.

Re-measured with zero unread notifications and the numbers were byte-identical, so it is a
stable structural fact and not content-dependent.

Not fixed. The brief defers visual/reference convergence to a separate task and forbids
redesigning UI during recovery, so this is reported rather than changed.

## Not covered by this walk

- Tap-driven journeys through the deeper flows (only the Stage 1 entry has been driven
  with real taps so far).
- Offline/online behaviour. The emulator was in use by another session during this run, and
  toggling its network would have disrupted that work, so it was deliberately left alone.
- Anything requiring funded remote AI.
