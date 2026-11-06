# ToolDecompose

Source: `apps/mp/src/views/ToolDecompose.vue`

Routes: `/pages/tool/decompose`, `/pages/tool/breakdown`

## PURPOSE

ToolDecompose is the "情绪拆解" (emotion breakdown) tool. It takes a free-text description of a feeling, queues an `emotion_analysis` AI task, polls it to completion, and renders a four-block structured result (触发事件 / 核心情绪 / 真实需要 / 可以先做的一件小事). It can then save that result into a Diary or copy it. It is the legacy emotion-tooling surface that predates the Journey situation-analysis flow.

## USER_JOB

"I feel bad but I cannot name why; I want the app to break it into an event, a feeling, a need and one small next step."

## ENTRY

- ToolIndex 情绪拆解 tile `tool-decompose` -> `card.route` = `/pages/tool/decompose` (`apps/mp/src/views/ToolIndex.vue:12`, applied at `ToolIndex.vue:42-45`).
- **ToolIndex itself has no inbound control anywhere in `apps/mp/src`** (`docs/product-audit/discovery-agent1-page-graph.md` section 3, ISSUE-004). So ToolDecompose is **DIRECT_ONLY** in the running app: reachable only by typing the URL.
- The route is not in `tabbarPaths` (`apps/mp/src/App.vue:14-39`), so no bottom bar renders.
- The `?job=<id>` query is read at `ToolDecompose.vue:68` to restore a previous result, but no control in `apps/mp/src` ever writes that parameter (exhaustive search for `?job=` and `query.job` finds only this reader). The deep link has no producer. UNCONFIRMED as a real product path.

## EXIT

None forward. The only control is `front-tool-back` -> `router.back()` (`ToolDecompose.vue:95`). Saving to a diary does not navigate; it sets `saved` and shows "已保存到日记" in place (`ToolDecompose.vue:58`).

## ROUTES

`/pages/tool/decompose` and `/pages/tool/breakdown` both mount `ToolDecompose` (`apps/mp/src/router.ts:80-81`; `mp-routes.json` aliasGroup of size 2, `legacyOrCurrent: ALIAS`). `/pages/tool/breakdown` is a dead alias - nothing pushes it (`discovery-agent1-page-graph.md` section 4).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| idle (no result) | `result` undefined | `ToolDecompose.vue:11`, `:98` |
| running ("拆解中…", button disabled) | `loading` | `ToolDecompose.vue:14`, `:46`, `:97` |
| result rendered (4 blocks + optional summary) | `result` | `ToolDecompose.vue:98-113` |
| summary disclosure present | `result.summary` | `ToolDecompose.vue:105` |
| copied confirmation | `copied` | `ToolDecompose.vue:12`, `:64`, `:110` |
| saved confirmation | `saved` | `ToolDecompose.vue:13`, `:58`, `:109` |
| floating status / error | `message` | `ToolDecompose.vue:15`, `:52`, `:114` |
| input text + counter | `content` / `count` | `ToolDecompose.vue:10`, `:16`, `:97` |

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| `front-tool-back` | `router.back()` (`ToolDecompose.vue:95`) | history back |
| `input-decompose` textarea | `v-model` | free text, maxlength 1000 |
| `btn-decompose-run` | `run` (`ToolDecompose.vue:45-53`) | `POST /api/v1/ai/tasks`, then `poll` until terminal |
| `btn-decompose-again` | `run` (`ToolDecompose.vue:108`) | re-runs the same job; this is the *same* `run`, not a variation |
| `btn-decompose-save` | `save` (`ToolDecompose.vue:55-59`) | `POST /api/v1/diaries` |
| `btn-decompose-copy` | `copyResult` (`ToolDecompose.vue:61-65`) | joins the four blocks and `copyText`s them |

Cross-check: `control-manifest.json` lists 12 controls; `android-route-manifest.json` shows 2 buttons + 1 textarea (3 visible) and 3 test ids on both alias routes, 0 console errors - i.e. the runtime capture saw only the idle state, because `result` is undefined until a run completes.

## API_READS

- `GET /api/v1/ai/tasks/:id` inside `poll` (`ToolDecompose.vue:35`), every 350 ms for up to 120 s (`:33`, `:40`), and once in `restoreExistingResult` (`:73`). Handler `controllers.ts:1020-1028` -> finds the job and enforces `job.userId === resolveRuntimeUserId(...)`, throwing `NotFoundException('AI 任务不存在')` otherwise; returns `{jobId, status, job, result, structured}`.

## API_WRITES

| endpoint | call site | controller | store method | Prisma model changed |
| --- | --- | --- | --- | --- |
| `POST /api/v1/ai/tasks` | `ToolDecompose.vue:48` | `controllers.ts:994-1001` | `store.queueAI` (`store.service.ts:5066-5085`) -> `queueAiJob` (`:5103-5177`) | **AIJob** |
| `POST /api/v1/diaries` | `ToolDecompose.vue:57` | `controllers.ts:1364-1391` | inline in the controller | **Diary** |

The AI task body is `{taskType: 'emotion_analysis', content: content || '我说不清楚自己为什么难受。', style: 'rational', sourceId: 'emotion_<ts>'}` (`ToolDecompose.vue:48`). `normalizeTaskType` maps `emotion_analysis -> breakdown` (`store.service.ts:5693`), so the job is labelled 情绪拆解 with `contentType: 'ToolTask'` (`store.service.ts:5772-5794`) and style `rational`.

Note the diary write hard-codes `emotion: '焦虑'` (`ToolDecompose.vue:57`) regardless of what the decomposition found, and `createDiary` runs `normalizeEmotion` on it (`controllers.ts:1380`). It also does not pass `assetIds`, so no attachments.

## DB_ENTITIES

- Reads: **AIJob** (via the task status read).
- Writes: **AIJob** (create, via `queueAI`), **Diary** (create, with `source: 'emotion-analysis'` and `toolResult` JSON).
- Cross-checked against `artifacts/product-audit/db-models.json`.

## ADMIN_VISIBILITY

Partly. The **AIJob** this page creates is admin-visible: resource **jobs** -> `/ai/jobs` (`apps/admin/src/router.ts:45`, label AI 任务记录) -> `GET /api/admin/v1/ai/jobs` (`apps/admin/src/views/TablePage.vue:46`, `controllers.ts:2547`). The **Diary** it saves is not admin-visible - there is no diary resource in `menuGroups` and no admin diary endpoint. So the operator sees the job trace (including the fallback status and error string) but not the saved diary.

## AI_USAGE

Yes, this page is an AI caller. `taskType: 'emotion_analysis'` normalizes to `breakdown` (`store.service.ts:5693`), default style `rational` (`store.service.ts:5750-5769`), and `breakdown` is in the `needsStructuredResult` list (`store.service.ts:5347-5361`), so the job requests JSON and parses it through `parseBreakdownResult` (`store.service.ts:5656-5657`).

Fallback handling: `poll` accepts both `succeeded` and `fallback` as terminal success (`ToolDecompose.vue:37`) and returns `state.structured`. On the server, a fallback job still writes `job.structuredResult` from the safe template (`store.service.ts:5516-5517`), so the page renders the template's blocks as if they were a real analysis. Under the DAPI 402 blocker every job ends `fallback` with `providerId: provider_safe_template`, so the four blocks a user sees are always template output, with no degradation signal - ISSUE-007 (P1 AI). The page reads the error string only on a hard failure (`ToolDecompose.vue:37`), never on fallback.

## PRIVACY

- No `PrivacySetting` flag gates this page. The AI task is queued with `sourceId: 'emotion_<ts>'` and the raw `content` as the prompt summary (`ToolDecompose.vue:48`), and `queueAI` falls back to `latestUserContent` only when content is blank (`store.service.ts:5069`).
- `activeMemoriesForTask` runs inside `runAiJob` (`store.service.ts:5328`), so consented memory can be appended to the prompt, but that is server-side and the page neither shows nor controls it.
- The saved **Diary** is private (no admin surface), but it is written unconditionally: `createDiary` does not call `privacyAllows` or `assertCanWrite` (`controllers.ts:1364-1391`), unlike `createMood` which does call `assertCanWrite` (`store.service.ts:4880`). A banned/limited user can still save here.
- `GET /api/v1/ai/tasks/:id` is ownership-checked (`controllers.ts:1022-1024`), so a job id from another user returns 404.

## ERROR_STATES

Yes, one shared `message` line rendered by `<p v-if="message" class="floating-status">` (`ToolDecompose.vue:114`). Sources:
- `run` catch (`ToolDecompose.vue:52`): the server's `job.errorMessage` or "拆解失败，请稍后重试".
- `poll` timeout after 120 s (`ToolDecompose.vue:42`): "情绪拆解任务超时".
- `restoreExistingResult` catch (`ToolDecompose.vue:84`): the server message or "无法读取这次情绪拆解结果".

It is a floating toast, not an inline field error, and `save` (`ToolDecompose.vue:55-59`) has **no** `try/catch`, so a failed diary save rejects silently and `saved` stays `false` with no message. `copyResult` reports its own failure in `message` (`:64`).

## EMPTY_STATES

Not applicable to a list; the page has no collection. The nearest thing is the idle state: with no `result`, only the input card renders (`ToolDecompose.vue:97`) and the result section is absent. There is no prompt telling the user the result area will appear, only the guide line "把情绪理清楚，才能温柔地照顾自己" (`ToolDecompose.vue:96`).

## NATIVE_RISKS

- Safe area: inherits `.goodnight-page` padding (`styles.scss:4147`); the page is a normal scroll flow with no fixed elements.
- Keyboard: the textarea opens the soft keyboard; the 开始拆解 button sits immediately below it in the same card (`ToolDecompose.vue:97`), so a raised keyboard can cover the button. No viewport handling. UNCONFIRMED at runtime.
- Back button: no custom handling; Android BACK walks WebView history (`native/back-button.ts:26-33`). Because the page is DIRECT_ONLY with no inbound navigation, an app opened directly on this route has a single history entry and BACK exits the app.
- Polling: `poll` runs a 350 ms `setTimeout` loop for up to 120 s (`ToolDecompose.vue:33-42`). If the WebView is backgrounded mid-poll the timer is throttled but the loop still holds `loading` true on return; there is no cancellation on unmount, so a run can outlive the page and write `result` or `message` after navigation. UNCONFIRMED at runtime.

## ISSUES

- P1 ORPHAN: the page cannot be reached by tapping through the app. Its only inbound control is ToolIndex (`ToolIndex.vue:12`), which has no inbound control at all (`discovery-agent1-page-graph.md` section 3; ISSUE-004 in `docs/product-audit/ISSUE_REGISTER.md:74-89`). An entire tool is dead for a real user.
- P2 AI: fallback results are presented as real analyses. `poll` treats `fallback` as success (`ToolDecompose.vue:37`) and the server writes template blocks into `structuredResult` (`store.service.ts:5516-5517`), so with the DAPI 402 blocker the four rendered blocks are always safe-template text with no signal to the user (ISSUE-007).
- P2 DATA: `save` hard-codes `emotion: '焦虑'` (`ToolDecompose.vue:57`) instead of using `result.coreEmotions`, so every diary saved from this tool is filed as 焦虑 even when the decomposition says otherwise. The saved content also concatenates `content` with `summary ?? nextSmallStep`, so the stored text can duplicate the user's own input.
- P2 FUNCTIONAL: `save` has no error handling (`ToolDecompose.vue:55-59`). A failed `POST /api/v1/diaries` rejects silently; the button stays on "保存到日记" and no message appears.
- P2 PRIVACY: `POST /api/v1/diaries` (`controllers.ts:1364-1391`) does not call `assertCanWrite`, so a banned or limited account can still write a diary here, unlike the mood path (`store.service.ts:4880`).
- P3 FUNCTIONAL: `btn-decompose-again` is bound to the same `run` as the primary button (`ToolDecompose.vue:108` vs `:97`), so 重新拆解 re-queues an identical job with the same content and style. It is not a variation/regenerate (same defect class as ISSUE-008 in ActionCenter).
- P3 UX: `toResult` (`ToolDecompose.vue:22-30`) silently substitutes "未记录触发事件" and "先给自己一点安静的时间。" when the model omits fields, so a degraded result can look like a valid one with placeholder content.
- P3 ORPHAN: `/pages/tool/breakdown` is a dead alias (`discovery-agent1-page-graph.md` section 4).
- P3 TEST_CONTRACT: the `?job=` deep link (`ToolDecompose.vue:68`) has no producer in `apps/mp/src`, so the restore path is unreachable and untested from the UI.

## FINAL_STATUS

PARTIAL - the AI task lifecycle, the poll loop, the fallback path, the diary write and all states are traced from source, and both alias routes render on the real Android APK with 0 console errors; the result branch could not be exercised at runtime because the harness only captured the idle state, and every real run would end in fallback under the DAPI 402 blocker.

Group recommendation: **DEPRECATE_CANDIDATE**. ToolDecompose duplicates capability that the newer Journey system already owns: `createJourney` queues a `situation_analysis` job (`store.service.ts:2541-2548`) that produces a structured snapshot with the same intent (event, feelings, needs, next step), is reachable from the 今晚 tab, and writes into the durable Journey/SituationSnapshot model instead of a throwaway AIJob. ToolDecompose is unreachable, hard-codes the diary emotion, and has no degradation signal. It complements nothing the newer system lacks. Flag it for deprecation review - do not delete it in this round.

### Static evidence

- Controls discovered: 12
- API reads (static): `/api/v1/ai/tasks/:param`
- API writes (static): `POST /api/v1/ai/tasks`, `POST /api/v1/diaries`
- Candidate fake markers: 2
- Adjudication: NOT_FAKE - `setTimeout` at `ToolDecompose.vue:40` is the poll interval inside `poll()` (`:32-43`) and `placeholder` at `:97` is the textarea attribute; the result comes from `state.structured` of a real job (`discovery-agent5-fake-candidates.md` M28).
- Appended: `normalizeTaskType` maps the page's `emotion_analysis` to the internal `breakdown` type (`store.service.ts:5693`), which is why the admin AI-job table labels it 情绪拆解 (`store.service.ts:5800`).
- Appended: the `?job=` restore path (`ToolDecompose.vue:67-88`) has no writer anywhere in `apps/mp/src`.

