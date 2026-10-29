# Post-Recovery Test Contract Review

Every failure observed on the restored product, re-derived fresh on 2026-09-30 on branch
`codex/post-recovery-validation`. No conclusion here is carried over from an earlier
report; each was re-run and, where the cause is not obvious, re-read from the source.

Allowed classifications, per the task rules:
`PRODUCT_BUG` · `STALE_TEST` · `FIXTURE_PERMISSION_BUG` · `ENVIRONMENT` · `UNKNOWN`

Rules applied throughout:

- The server's privacy, PII and consent checks are never weakened to make a test pass.
- A stale test is fixed, not accommodated by reverting product behaviour.
- Only the five classifications above are used; anything not provable stays `UNKNOWN`.

---

## Group A - blocked by the AI account balance

These ten suites all fail on the same external condition. None is a code or test defect.

| Id | Suite | Actual | Expected |
| --- | --- | --- | --- |
| CONTRACT-001 | `test:peer-stage-business` | peer assist job `status=failed`, `fallbackUsed=false` | `status=succeeded`, `providerId=provider_dapi_deepseek` |
| CONTRACT-002 | `test:peer-stage-security` | same spec, same failure | same |
| CONTRACT-003 | `test:peer-stage-two-user` | same spec, same failure | same |
| CONTRACT-004 | `test:peer-stage-expiry` | same spec, same failure | same |
| CONTRACT-005 | `test:third-stage-memory` | job `status` not `succeeded` | `succeeded` |
| CONTRACT-006 | `test:third-stage-future-self` | `contextLabel` is `旅程：其他里正在整理的一件事` | contains `未来信关联旅程` |
| CONTRACT-007 | `test:third-stage-monthly-report` | `expected 'fallback' to be 'succeeded'` | `succeeded` |
| CONTRACT-008 | `test:cross` | `status=fallback`, `providerId=provider_safe_template` | `succeeded`, `provider_dapi_deepseek`, `fallbackUsed=false` |
| CONTRACT-009 | `test:click-all` | `Monthly report job did not finish through DAPI: fallback` | job completes through DAPI |
| CONTRACT-010 | `diagnose:all` | same as CONTRACT-009 | same |

**Root cause (re-verified, not inherited):** the DeepSeek account has no credit.

```
GET  https://api.deepseek.com/user/balance   -> 200 {"is_available":false,...}
POST https://api.deepseek.com/chat/completions -> 402 Insufficient Balance
job row -> provider_dapi_deepseek attempted,
           errorMessage "provider_dapi_deepseek:Remote provider returned HTTP 402."
```

**CONTRACT-006 deserves its own note** because its assertion does not look like an AI
assertion. Re-derived from source and data rather than assumed:

1. The spec POSTs a journey with `title: '未来信关联旅程 ' + Date.now()`.
2. The stored journey title in the test schema is `其他里正在整理的一件事`, not that value.
3. `apps/api/src/store.service.ts:5971`, inside `fallbackStructuredTask` for
   `situation_analysis`, overwrites `title` with `` `${domain}里正在整理的一件事` ``.
4. `store.service.ts:4553` then builds `` contextLabel = `旅程：${journey.title}` ``.

So the AI failure causes the title overwrite, which causes the label mismatch. Root cause
is the same 402; the test's own assertion is otherwise correct.

| Field | Value |
| --- | --- |
| Reference / product requirement | Real remote AI output is required by the product |
| API requirement | `provider_dapi_deepseek`, `status=succeeded`, `fallbackUsed=false` |
| Security requirement | None involved; the privacy gates in these specs pass |
| Classification | **ENVIRONMENT** (`EXTERNAL_BLOCKER` / `BLOCKED_DAPI_BALANCE`) |
| Decision | No fix. Owner action: top up the account. |
| Fix | None - and none is permitted. No code change, local model, stub, mock, Ollama or automatic downgrade may be used to make these pass. |
| Retest | Pending the account being funded. |

---

## CONTRACT-011 - `test:goodnight-2` receives 403 publishing a peer experience

| Field | Value |
| --- | --- |
| Test | `tests/business/goodnight-2-incremental.spec.ts`, 2 of 3 cases |
| Actual | `expected 201 "Created", got 403 "Forbidden"` on `POST /api/v1/peer-experiences` |
| Expected by the test | 201 |
| Reference / product requirement | Publishing an anonymous experience requires the user's consent |
| API requirement | `store.service.ts:3541` - `privacyAllows(journey.userId, 'allowAnonymousExperienceShare', '请先在隐私设置中允许匿名经验分享')` |
| Security requirement | **The 403 is the security rule working correctly.** It must not be removed or relaxed |
| Root cause | The spec's `beforeAll` grants four privacy flags (`allowPeerMatching`, `allowAnonymousExperienceStats`, `allowRecoveryData`, `allowLongTermMemory`) but never `allowAnonymousExperienceShare`, which is the flag this endpoint actually checks |
| Classification | **FIXTURE_PERMISSION_BUG** |
| Decision | Fix the fixture: grant the missing consent through the real privacy API before publishing, exactly as a user would |
| Fix | **Applied.** `allowAnonymousExperienceShare: true` added to both privacy patches in the spec (the first at the top of the file, the second for `user_guest` at the start of the second case) |
| Retest | `test:goodnight-2` - both 403s are gone. The suite now advances further and stops on two assertions that are themselves stale; see CONTRACT-020 and CONTRACT-021. Still red, for different and now-recorded reasons |

The server was not touched: the 403 was and remains the correct answer to a request made
without consent.

---

## CONTRACT-020 - `test:goodnight-2` asserts a `status` field the summary never had

| Field | Value |
| --- | --- |
| Test | `tests/business/goodnight-2-incremental.spec.ts`, case 1, after CONTRACT-011's fix |
| Actual | `expected undefined to be 'pending_review'` |
| Expected by the test | `experience.body.item.status === 'pending_review'` |
| Reference / product requirement | The author should be able to see that a published experience is awaiting review |
| API requirement | `POST /api/v1/peer-experiences` returns `{ item: peerExperienceSummary(item) }`; `peerExperienceSummary` (`store.service.ts:3724`) returns id, title, domain, subDomain, stage, tags, createdAt, graduated, laterRecordCount - **no `status`** |
| Security requirement | The summary is a redaction-aware public view; omitting internal status is consistent with that |
| Root cause | The test asserts a field the endpoint has never returned. Verified from history: `git log -S peerExperienceSummary` gives two commits (`bc9e767`, `f51e636`) and **neither** contains `status:` inside the function, so this is not a regression |
| Supporting evidence | No front-end code calls this endpoint at all - the only consumer in `apps/mp/src` is a GET of `/api/v1/peer-experiences/:id`. The product's real path, `POST /api/v1/journeys/:id/graduation-consent`, returns the raw record as `draft`, which **does** carry `status`, and the spec's assertion on that field passes |
| Classification | **STALE_TEST** |
| Decision | Fix the test: assert the persisted row's status (the spec already has a Prisma client) rather than a field the response does not carry |
| Fix | Deferred, per the same reasoning as CONTRACT-013 |

---

## CONTRACT-021 - `test:goodnight-2` asserts match score internals that are not exposed

| Field | Value |
| --- | --- |
| Test | `tests/business/goodnight-2-incremental.spec.ts`, case 2, after CONTRACT-011's fix |
| Actual | `TypeError: actual value must be number or bigint, received "undefined"` at line 298 |
| Expected by the test | `exactMatch.score > 0.5` and `exactMatch.fingerprintSimilarity > 0` |
| Reference / product requirement | The user sees a recommended peer, not a numeric score |
| API requirement | `POST /api/v1/journeys/:id/peer-matches` returns `peerMatchForUser` (`store.service.ts:3749`): id, journeyId, peerExperienceId, status, reasons, requestReason, requestQuestion, acceptedAt, createdAt, updatedAt, experience - **no `score`, no `fingerprintSimilarity`** |
| Security requirement | Match scoring is internal; not exposing it to the user is the safer default |
| Root cause | The test asserts scoring internals. Verified from history: `git log -S peerMatchForUser` gives `bc9e767` and `8fb2d83`, and neither contains a `score:` or `fingerprintSimilarity:` field in the returned object |
| Classification | **STALE_TEST** |
| Decision | Fix the test: assert on the exposed match (`peerExperienceId`, `reasons`) and, if the score matters, read it from the database rather than the API response |
| Fix | Deferred, per the same reasoning as CONTRACT-013 |

---

## CONTRACT-012 - `test:front-business` / `front-me.spec.ts` polls an undefined job id

| Field | Value |
| --- | --- |
| Test | `tests/business/front-me.spec.ts` |
| Actual | `expected 200 "OK", got 404 "Not Found"` |
| Expected by the test | 200 from `waitForAiJob(server, report.body.item.aiJobId)` |
| Reference / product requirement | Long-term analysis is opt-in |
| API requirement | `monthly-report.service.ts:312` - `analysisAllowed = privacySettings[userId]?.allowJourneyLongTermAnalysis === true`; when false the endpoint returns `aiJobStatus: 'disabled'` and **no** `aiJobId` |
| Security requirement | The early return is the consent gate; it must not be removed |
| Root cause | The spec never grants `allowJourneyLongTermAnalysis`, so `aiJobId` is `undefined`, and `waitForAiJob` then polls `/api/v1/ai/tasks/undefined` -> 404. Measured live: `200 {"aiJobId":null,"aiJobStatus":"disabled","analysisAllowed":false}` |
| Classification | **FIXTURE_PERMISSION_BUG** |
| Decision | Fix the fixture: grant `allowJourneyLongTermAnalysis` first |
| Fix | **Applied.** Added to the privacy patch in `tests/business/front-me.spec.ts` |
| Retest | **Confirmed.** The 404 is gone and the case now fails on `expected 'fallback' to be 'succeeded'` - i.e. it has become CONTRACT-007-class (ENVIRONMENT). This is exactly the outcome predicted before the fix was applied, which is the evidence that the 404 really was the fixture and not the endpoint |
| Note | The suite still cannot pass while the account is unfunded, because the case then asserts a **succeeded** AI job. Recorded so the fix is not mistaken for a green suite |

The other three failures in `test:front-business` are `expected 'fallback' to be
'succeeded'` - Group A, ENVIRONMENT.

---

## CONTRACT-013 - `tests/visual/admin-layout.spec.ts` expects filenames that do not exist

| Field | Value |
| --- | --- |
| Test | `tests/visual/admin-layout.spec.ts` (`test:visual`) |
| Actual | `artifacts/screenshots/admin/login.png: expected false to be true` |
| Expected by the test | `login.png`, `dashboard.png`, `users.png`, `posts.png`, `replies-moderation.png`, `ai-providers.png`, `ai-routes.png`, `ai-jobs.png`, `ops-feedback.png`, `ops-config.png` to exist |
| Reference / product requirement | The admin console must render its ten pages; nothing requires these filenames |
| API requirement | None |
| Security requirement | None |
| Root cause | Every admin capture script writes `<name>-<width>.png` (for example `01-admin-login-1366.png`), `admin-pages.ts` has no short-name field, and `compare-admin-designs.ts` reads the same `<name>-<width>` form. The asserted names exist nowhere in the repository. Re-verified by grep and by listing the produced files |
| Classification | **STALE_TEST** |
| Decision | Fix the test to assert the artifacts the tooling actually produces. The screenshots themselves are real and present |
| Fix | Deferred - see the note below |
| Retest | `test:visual` |

The sibling `tests/visual/front-layout.spec.ts` had the same class of defect and was
already fixed during the recovery by making the documented `artifacts/screenshots/front`
path real; it passes now (`1 failed | 1 passed`).

---

## CONTRACT-014 - `test:reference-qa-first-stage-shells` layout overage

| Field | Value |
| --- | --- |
| Test | `scripts/reference-qa-first-stage-shells.ts` |
| Actual | `notifications 430x932 main content detached from hero` |
| Expected by the test | `mainTop <= heroHeight + 130` |
| Reference / product requirement | The reference fixes the notifications page composition, but no measurement of the tab strip's height is published |
| API requirement | None |
| Security requirement | None |
| Root cause | Measured at 430x932: hero height 245, `.notice-tabs` height 114, `.notice-list` top 381, allowance 375 - six pixels over. Re-measured with zero unread notifications and the numbers were identical, so it is structural, not content-dependent. The page's other checks (no horizontal overflow, hero inside 120-245, minimum sections) all pass |
| Classification | **UNKNOWN** |
| Decision | Not fixed. Deciding whether the 114px tab strip or the 130px allowance is wrong requires the reference visual work, which the task explicitly defers |
| Fix | None in this task |
| Retest | Not applicable |

---

## CONTRACT-015 - `business-flow-01-02` clicks an emotion the UI does not render

| Field | Value |
| --- | --- |
| Test | `scripts/business-flow-01-02.ts`, Flow A |
| Actual | `locator.click: Timeout 30000ms exceeded` waiting for `getByTestId('mood-emotion-gongzuo')`; the fourth check then cascades (`backend AI task log visible` counts jobs the failed flow never created) |
| Expected by the test | A clickable 工作 emotion control on `/pages/mood/create` |
| Reference / product requirement | **Checked as the task requires.** `design_refs/front/02-mood-create.png` shows the 选择心情 section with exactly six options: 难过 / 焦虑 / 委屈 / 生气 / 孤独 / 失眠. There is no 工作 option |
| API requirement | None |
| Security requirement | None |
| Root cause | `apps/mp/src/views/MoodCreate.vue` declares seven emotions but renders `emotions.slice(0, 6)`. The slice matches the reference; the seventh entry is dead data and is never in the DOM. Confirmed on the live page: the rendered testids are exactly the six above |
| Classification | **STALE_TEST** |
| Decision | Per the task rule - the design allows six, so **fix the test, not the product**. Changing the slice to seven would add a chip the reference does not have |
| Fix | Change the script to click an emotion that exists (`mood-emotion-weiqu`, which the same script already uses elsewhere) |
| Retest | `test:business-flow-01-02` |

---

## CONTRACT-016 - `audit:front-navigation-layout` expects the pre-third-stage tabs

| Field | Value |
| --- | --- |
| Test | `scripts/audit-front-navigation-layout.ts` |
| Actual | 14 of 20 pass, 6 fail: `tab-letter`, `tab-tool`, `tool-decompose`, `tool-rewrite`, `tool-report`, `08-我的 页面健康检查` |
| Expected by the test | `tab-letter` -> `/pages/letter/index`; `tab-tool` -> `/pages/tool/index`; `tool-decompose` -> `/pages/tool/breakdown`; `tool-rewrite` -> `/pages/tool/rewrite`; `tool-report` -> `/pages/me/month-report` |
| Reference / product requirement | The current tab bar is 今晚 / 同路 / 行动 / 我的 |
| API requirement | None |
| Security requirement | None |
| Root cause | The audit predates the third-stage tab rework. The app navigates to `/pages/peers`, `/pages/action`, `/pages/tool/decompose`, `/pages/tool/run?type=negative_rewrite` and `/pages/report/month`. `router.ts` registers both spellings as aliases of the same component and the app uses the first. The audit's own health evidence for those pages shows `hasError:false, overflow:0` |
| Classification | **STALE_TEST** |
| Decision | Fix the test's route expectations to the current canonical paths |
| Fix | Deferred - see the note below |
| Retest | `audit:front-navigation-layout` |

---

## CONTRACT-017 - `problem01-layout-click-report` fails 8 of 9 while the page looks healthy

| Field | Value |
| --- | --- |
| Test | `scripts/problem01-layout-click-report.ts` |
| Actual | 8 fail, 1 passes (`console has no blocking errors`) |
| Expected by the test | Section spacing between hero, category row and card |
| Reference / product requirement | The reference fixes the square page composition, but no numeric gap is published |
| API requirement | None |
| Security requirement | None |
| Root cause | Every failing row's own evidence shows `overflowX:0`, `badButtons:[]`, `forbiddenLayers:[]`, clickable controls and correct mood routing. What it does show is `rowGapFromHero:0` and `cardGapFromRow:0`, so the check asserts a non-zero gap that is currently zero |
| Classification | **UNKNOWN** |
| Decision | Not fixed. Whether the gap or the expectation is wrong is a visual-reference question, deferred by the task |
| Fix | None in this task |

---

## CONTRACT-018 - `problem02-ai-dynamic-report` waits for a retired endpoint

| Field | Value |
| --- | --- |
| Test | `scripts/problem02-ai-dynamic-report.ts` |
| Actual | `page.waitForResponse: Timeout 10000ms exceeded` |
| Expected by the test | A POST to `/api/v1/tools/emotion-decompose` after clicking `btn-decompose-run` |
| Reference / product requirement | The decompose tool must run and show a result |
| API requirement | The front end now uses the asynchronous job API |
| Security requirement | None |
| Root cause | Driven by hand, the control works: the click issues `POST /api/v1/ai/tasks` and polls `GET /api/v1/ai/tasks/<id>`, and the result card renders the full decomposition. The script waits for a path the UI no longer calls |
| Classification | **STALE_TEST** |
| Decision | Fix the test to wait for the job API |
| Fix | Deferred - see the note below |
| Retest | `test:problem02-ai` |

---

## CONTRACT-019 - `front-phase3-me` waits for a testid that only exists as a CSS class

| Field | Value |
| --- | --- |
| Test | `scripts/front-phase3-me.ts` |
| Actual | `locator.waitFor: Timeout 10000ms exceeded` waiting for `getByTestId('me-user-card')` |
| Expected by the test | A `data-testid="me-user-card"` element |
| Reference / product requirement | The Me page must expose its entries |
| API requirement | None |
| Security requirement | None |
| Root cause | `me-user-card` appears in `apps/mp/src/styles.scss` as a class selector only; no template in `apps/mp/src` carries `data-testid="me-user-card"`. The page's real hooks are `me-current-journey`, `me-current-journey-empty`, `me-support-status`, `entry-current-journey`, `entry-start-journey`, `btn-clear-data`. The page renders (20 visible controls, 21 testids on the route walk) |
| Classification | **STALE_TEST** |
| Decision | Fix the test to target a hook that exists |
| Fix | Deferred - see the note below |
| Retest | `test:front-phase3-me` |

---

## Why four stale-test fixes are deferred

CONTRACT-013, 016, 018 and 019 are all provably stale and their fixes are small. They are
recorded, decided and **not applied yet**, for two reasons:

1. The task permits fixing a stale test once all real product business passes. It does not
   yet, because Group A is blocked by the account balance. Applying test edits now would
   make it harder to tell, when the account is funded, whether a newly-passing suite is
   passing because the product works or because a test was loosened.
2. None of the four is a blocker for the Android verification that follows, which is the
   part of this task that can still make real progress.

They will be applied, one at a time with an individual retest, once the AI blocker is
cleared. CONTRACT-011 and CONTRACT-012 are different: they are fixture bugs where the
server is correct, and fixing the fixture is the only correct action, so they are applied
in this task.

## Summary

| Classification | Count | Contracts |
| --- | ---: | --- |
| ENVIRONMENT (`BLOCKED_DAPI_BALANCE`) | 10 | 001-010 |
| FIXTURE_PERMISSION_BUG | 2 | 011, 012 |
| STALE_TEST | 7 | 013, 015, 016, 018, 019, 020, 021 |
| UNKNOWN | 2 | 014, 017 |
| PRODUCT_BUG | **0** | - |

**No product bug was found.** Every failure is either an external AI balance blocker, a
fixture that forgot to grant a consent the server correctly requires, or a test whose
expectation no longer matches the code. No server-side permission was removed or relaxed,
and no test was deleted or had its assertions lowered.

Two of the stale tests (020, 021) were only reachable after the CONTRACT-011 fixture fix
was applied - before that, both cases stopped at a 403 and never got as far as those
assertions. That is the expected shape of a suite that has never passed: fixing the real
defect exposes the next stale expectation behind it. It is also why the fixture fixes are
worth applying now even though the suite stays red.
