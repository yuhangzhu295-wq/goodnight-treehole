# Test Suite Findings After Recovery

Every suite in this repository was run against the restored environment on 2026-09-29.
This document covers the failures whose cause is **not** the AI account balance, so the
owner can decide what to do about them.

None of these was introduced by the recovery. Each is a mismatch between a test's
expectation and the code at commit `17a7ee1933ee75c3cf547738bfbe0b2b09fec05e`, and each was
reproduced by reading the code, not inferred.

Only one of them was fixed, and that fix produced a real artifact rather than relaxing an
assertion (`tests/visual/front-layout.spec.ts`; see `docs/disaster-recovery-final.md`
section 6). The rest are left exactly as they are.

## 1. `tests/visual/admin-layout.spec.ts` - expects filenames that do not exist

**Fails with:** `artifacts/screenshots/admin/login.png: expected false to be true`

The spec asserts these ten files exist:

```
login.png  dashboard.png  users.png  posts.png  replies-moderation.png
ai-providers.png  ai-routes.png  ai-jobs.png  ops-feedback.png  ops-config.png
```

Every admin capture script in this codebase names its output `<page>-<width>.png` instead,
for example `01-admin-login-1366.png` and `02-admin-dashboard-1440.png`. `admin-pages.ts`
defines only `id`, `name`, `route` and `design` - there is no short-name field that could
produce `login.png`. `compare-admin-designs.ts` reads the same `<name>-<width>.png` form.

So the spec's expected names exist nowhere in the repository. Fixing it means either
renaming the capture output (which would break the comparison script) or rewriting the
spec's assertions; both are owner decisions, so neither was taken.

## 2. `tests/business/goodnight-2-incremental.spec.ts` - misses one privacy flag

**Fails with:** `expected 201 "Created", got 403 "Forbidden"` on
`POST /api/v1/peer-experiences`

The test grants four privacy flags:

```js
.send({ allowPeerMatching: true, allowAnonymousExperienceStats: true,
        allowRecoveryData: true, allowLongTermMemory: true })
```

but publishing a peer experience is gated by a fifth,
`allowAnonymousExperienceShare` (`apps/api/src/store.service.ts:3541`):

```js
this.privacyAllows(journey.userId, 'allowAnonymousExperienceShare', '请先在隐私设置中允许匿名经验分享');
```

The test file never mentions that flag, so the request is refused every time. The 403 is
the privacy gate behaving correctly; the test is simply not granting the consent it needs.
The second failing case in the same file fails for the same reason.

## 3. `scripts/business-flow-01-02.ts` - expects an emotion the UI does not render

**Fails with:** `locator.click: Timeout 30000ms exceeded` waiting for
`getByTestId('mood-emotion-gongzuo')`, then a cascade in the AI-log check.

`apps/mp/src/views/MoodCreate.vue` declares seven emotions:

```js
const emotions = [
  { value: '难过', ... }, { value: '焦虑', ... }, { value: '委屈', ... },
  { value: '生气', ... }, { value: '孤独', ... }, { value: '失眠', ... },
  { value: '工作', label: '工作', face: '💼', testId: 'mood-emotion-gongzuo' },   // 7th
];
```

but the template renders only the first six:

```html
<button v-for="item in emotions.slice(0, 6)" ...>
```

Measured on the live page at `/pages/mood/create`, the rendered controls are exactly
`nanguo, jiaolv, weiqu, shengqi, gudu, shimian`. `mood-emotion-gongzuo` is never in the
DOM, so no click can ever succeed.

Either the `slice(0, 6)` is intentional and the seventh entry is dead data, or the slice is
stale and 工作 was meant to be shown. Rendering it would add a seventh chip to a six-chip
grid, which is a visual decision against the design reference, so it was not changed. The
same testid is referenced by several other flow scripts, so they are affected too.

## 4. `scripts/audit-front-navigation-layout.ts` - expects the pre-third-stage tabs

**Fails with:** 6 of 20 rows FAIL, for example
`05-今日回信/点击 tab-letter`, `06-情绪工具/点击 tab-tool`.

Every failure is the same shape: the audit clicks a control and expects a route the app no
longer navigates to.

| Audit expects | The app actually goes to |
| --- | --- |
| `tab-letter` -> `/pages/letter/index` | `/pages/peers/index` |
| `tab-tool` -> `/pages/tool/index` | `/pages/action/index` |
| `tool-decompose` -> `/pages/tool/breakdown` | `/pages/tool/decompose` |
| `tool-rewrite` -> `/pages/tool/rewrite` | `/pages/tool/run?type=negative_rewrite` |
| `tool-report` -> `/pages/me/month-report` | `/pages/report/month` |

The audit's control names are `tab-letter` and `tab-tool`, but the current tab bar is
今晚 / 同路 / 行动 / 我的, so this audit predates the tab rework. The route mismatches are
aliases: `apps/mp/src/router.ts` registers both `/pages/tool/decompose` and
`/pages/tool/breakdown` against the same component, and the app navigates to the first.

Note that the audit's own health evidence for these pages shows `hasError: false` and
`overflow: 0` throughout, so the pages themselves are healthy; only the route expectations
are stale.

The script writes to `docs/front-navigation-layout-audit-2026-07-09.md`, overwriting that
dated report. The July report was restored rather than overwritten, and the current result
is recorded here instead.

## 5. `test:reference-qa-first-stage-shells` - a six-pixel layout overage

**Fails with:** `notifications 430x932 main content detached from hero`

Measured on `/pages/notifications/index` at 430x932:

| Element | Top | Height |
| --- | ---: | ---: |
| `.notification-hero` | 0 | 245 |
| `.notice-tabs` | 255 | 114 |
| `.notice-list` | 381 | 419 |

The assertion allows `mainTop <= heroHeight + 130 = 375`; the list starts at 381. The page
is otherwise healthy - no horizontal overflow, three cards render, the hero is inside its
own 120-245 contract - so this is the 114px tab strip pushing the list six pixels past a
threshold. Re-measured with zero unread notifications, the numbers were identical, so it is
structural rather than content-dependent.

Left alone: the brief defers visual convergence to a separate task and forbids UI
redesign during recovery.

## 6. `scripts/problem02-ai-dynamic-report.ts` - waits for a retired endpoint

**Fails with:** `page.waitForResponse: Timeout 10000ms exceeded while waiting for event "response"`

The script fills `input-decompose`, clicks `btn-decompose-run`, and waits for a POST to
`/api/v1/tools/emotion-decompose`. Driven by hand against the live page, the click works
perfectly and the front end now uses the asynchronous job API instead:

```
click btn-decompose-run
  -> POST /api/v1/ai/tasks
  -> GET  /api/v1/ai/tasks/job_87c7555cc3   (polled until terminal)
```

and the result card renders the full decomposition (触发事件 / 核心情绪 / 真实需要 /
可以先做的一件小事). So the control is fine; the script is waiting for a path the UI no
longer calls.

## 7. `scripts/problem01-layout-click-report.ts` - 8 of 9 rows fail while the page looks healthy

**Fails with:** 8 of 9 checks FAIL, 1 PASS (`console has no blocking errors`).

Every failing row's own evidence shows the page behaving correctly:

```
overflowX: 0            badButtons: []        forbiddenLayers: []
visibleEnglishArtifacts: []                   hitTag: "SPAN", clickable: true
```

and each click does the right thing - the correct chip becomes `active: true` and the
route updates to `/pages/square/index?mood=aggrieved`, `?mood=anxious`, `?mood=insomnia`,
`?mood=love`, `?mood=work`, and back to `/pages/square/index` for 全部.

What the evidence does show is `rowGapFromHero: 0` and `cardGapFromRow: 0`: the hero, the
category row and the first card are flush against each other. The check is evidently
asserting a non-zero gap, so this is a spacing expectation rather than a broken page. It is
a visual matter, and the brief defers visual convergence to a separate task, so it is
recorded rather than changed.

## 8. `tests/business/front-me.spec.ts` - misses the long-term analysis consent

**Fails with:** `expected 200 "OK", got 404 "Not Found"`

Three of the four failures in `test:front-business` are the AI balance
(`expected 'fallback' to be 'succeeded'`); this is the fourth, and it is different.

The spec calls:

```js
const report = await request(server).get(`/api/v1/report/month?month=2026-07`).expect(200);
const completed = await waitForAiJob(server, report.body.item.aiJobId);
```

but `/api/v1/report/month` returns early when long-term analysis has not been consented to
(`apps/api/src/monthly-report.service.ts:312`):

```js
const analysisAllowed = this.store.privacySettings[userId]?.allowJourneyLongTermAnalysis === true;
if (!monthly.item.analysisAllowed) return { item: { month, content: '', aiJobStatus: 'disabled', analysisAllowed: false } };
```

`allowJourneyLongTermAnalysis` defaults to `false` and the spec never grants it, so the
response contains no `aiJobId`. Measured live:

```
GET /api/v1/report/month?month=2026-07
  -> 200 { "aiJobId": null, "aiJobStatus": "disabled", "analysisAllowed": false }
```

`waitForAiJob(server, undefined)` then polls `/api/v1/ai/tasks/undefined`, which is a 404.
So the endpoint is behaving correctly and the spec is missing a consent step, exactly like
finding 2.

## 9. `scripts/front-phase3-me.ts` - waits for a testid that only exists as a CSS class

**Fails with:** `locator.waitFor: Timeout 10000ms exceeded` waiting for
`getByTestId('me-user-card')`.

`me-user-card` appears in `apps/mp/src/styles.scss` as a class selector, but no template
in `apps/mp/src` carries `data-testid="me-user-card"`. The Me page's actual hooks are
`me-current-journey`, `me-current-journey-empty`, `me-support-status`,
`entry-current-journey`, `entry-start-journey`, `btn-clear-data` and friends.

The page itself is fine - the route walk found `/pages/me/index` rendering with 20 visible
controls and 21 testids - so this is a hook that was styled but never added to the markup.

## 10. The `final-*` scripts are fixture-scoped and refuse the development database

`test:final-live-admin-crud` exits with:

```
DATABASE_URL must use port 55432, received 15432
```

That is a deliberate guard (`scripts/final-live-admin-crud.ts:59`), and twelve scripts
carry it: `final-ai-routing-proof`, `final-database-audit`, `final-human-reply-mute-flow`,
`final-private-diary-flow`, `final-public-moderation-flow`, `final-feedback-upload-flow`,
`import-json-store-to-db`, the `cleanup-*` scripts and others.

They belong to the isolated visual-fixture harness, which runs its own PostgreSQL, API,
front and admin on separate ports (the fixture API is 3001 and the fixture database port in
`apps/api/src/runtime-environment.ts` is 55433). They are therefore **out of scope for the
development-database regression** rather than broken; they correctly declined to touch the
normal database. Their run recorded `Checks: 0; cleanup checks: 5; passed: 5; failed: 0` -
no real check ran, which is why the exit code is non-zero.

One inconsistency worth noting for whoever owns the fixture harness: the guard requires
port **55432** while `runtime-environment.ts` declares the fixture database port as
**55433**. Nothing was changed here.

## Summary

| Suite | Cause | Action taken |
| --- | --- | --- |
| `tests/visual/front-layout.spec.ts` | capture never wrote the asserted path | **fixed** by producing the documented artifact |
| `tests/visual/admin-layout.spec.ts` | expected filenames do not exist | reported |
| `tests/business/goodnight-2-incremental.spec.ts` | test misses a required privacy flag | reported |
| `tests/business/front-me.spec.ts` | test misses the long-term analysis consent | reported |
| `scripts/business-flow-01-02.ts` | expects an emotion the template slices off | reported |
| `scripts/audit-front-navigation-layout.ts` | expects pre-third-stage tabs and alias routes | reported |
| `scripts/problem02-ai-dynamic-report.ts` | waits for the retired `emotion-decompose` endpoint | reported |
| `scripts/problem01-layout-click-report.ts` | asserts non-zero section gaps that are currently 0 | reported |
| `scripts/front-phase3-me.ts` | waits for a testid that only exists as a CSS class | reported |
| `scripts/final-*` (12 scripts) | fixture-scoped; correctly refuse the dev database | out of scope |
| `test:reference-qa-first-stage-shells` | 6px layout overage on the notifications page | reported |

Everything else that failed in this recovery failed for one reason only: the DeepSeek
account returns HTTP 402, and those suites assert real funded remote AI output. That
covers `test:cross`, `diagnose:all`, `test:click-all`, the four peer-stage aliases,
`third-stage-memory`, `third-stage-monthly-report`, `third-stage-future-self`, and three of
the four `test:front-business` failures.

## What did pass

For context, the following all exit 0 on the restored environment: `lint`, `typecheck`,
`test:unit`, `test:api`, `test:e2e`, `test:first-batch-core`, `test:reference-qa-journey`,
`test:reference-qa-action`, `test:notification-truth-state`,
`test:reference-fidelity-first-stage`, `test:reference-fidelity-peer-stage`,
`test:reference-fidelity-third-stage`, `audit:first-stage-final` (FIRST_STAGE_UI_FROZEN=true),
`audit:design-references`, `audit:ui-artifacts`, `test:ai-routing`, `test:admin-sync`,
`test:third-stage-business`, `-persistence`, `-security`, `-decision`, `-privacy`,
`-archive`, `-migrations`, `test:real-browser-front-clicks`, `-admin-clicks`, `-cross-flow`,
`test:business-flow`, and the four-layer smoke test.
