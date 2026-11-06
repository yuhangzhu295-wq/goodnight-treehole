# ToolRun

Source: `apps/mp/src/views/ToolRun.vue`

Routes: `/pages/tool/run`, `/pages/tool/rewrite`, `/pages/tool/rant`, `/pages/tool/heal`, `/pages/tool/sleep`, `/pages/tool/work`, `/pages/tool/future` (alias group of 7, `apps/mp/src/router.ts:82-88`, `artifacts/product-audit/mp-routes.json`)

## PURPOSE

ToolRun is the generic single-shot AI tool screen. One view serves six task types; the task type comes from the `type` query parameter or, for the alias paths, from the last path segment. It writes the input text, queues an AI job, polls it, shows the result, and offers to save the result as a diary entry.

## USER_JOB

"I have something specific I want rewritten / released / comforted, and I want a concrete piece of text back that I can keep."

## ENTRY

Only from ToolIndex. Every tile that maps to a canonical type pushes `/pages/tool/run?type=<canonical>` (`apps/mp/src/views/ToolIndex.vue:38`), and the non-canonical fallback pushes `card.route` which is `/pages/tool/run?type=<type>` (`ToolIndex.vue:13-18`, `:45`). No other view in `apps/mp/src` pushes any of the seven alias paths (exhaustive search of `apps/mp/src` for `/pages/tool`). Because ToolIndex itself is DIRECT_ONLY (see ToolIndex.md), ToolRun is reachable in practice only by deep link too.

## EXIT

The back control `front-tool-run-back` calls `router.back()` (`ToolRun.vue:100`), which returns to ToolIndex or to whatever pushed the route. There is no forward navigation after saving; `saveResult` stays on the page and only flips the button label to 已保存到日记 (`ToolRun.vue:88`, `:112`).

## ROUTES

The seven paths above all mount this component (`apps/mp/src/router.ts:82-88`). The alias-to-type mapping inside the view is `rewrite->negative_rewrite`, `rant->rant`, `heal->healing_phrase`, `sleep->sleep_comfort`, `work->work_support`, `future->future_letter` (`ToolRun.vue:19-23`); `/pages/tool/run` has no path alias so it depends entirely on `?type=`.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading / generating | `loading` | `ToolRun.vue:15`, `:104` (button label 生成中…, disabled) |
| queued indicator | `jobId` + `loading` | `ToolRun.vue:105` |
| result card open | `result` (truthy renders `tool-run-result-card`) | `ToolRun.vue:107` |
| future-letter editable | `type === 'future_letter'` | `ToolRun.vue:110` |
| saved | `saved` | `ToolRun.vue:13`, `:112` |
| copied | `copied` | `ToolRun.vue:14`, `:112` |
| error text | `error` | `ToolRun.vue:116` |
| restored-from-latest | `restoreLatestResult()` on mount and on type change | `ToolRun.vue:35-52` |
| unknown type fallback meta | `meta` computed default branch | `ToolRun.vue:33` |

## CONTROLS

| control (label/testid) | handler function | what it actually does |
| --- | --- | --- |
| `front-tool-run-back` (‹) | inline `router.back()` | pops WebView history |
| `input-tool-run` (textarea) | `v-model="input"` | free text, no maxlength attribute |
| `btn-tool-run-submit` | `runTool` | POST `/api/v1/ai/tasks` then poll `/api/v1/ai/tasks/:id`; disabled while `loading` |
| `future-letter-editor` (textarea) | `v-model="result"` | only rendered for `future_letter`; lets the user edit the generated letter |
| `btn-tool-run-save` | `saveResult` | if there is no result it runs the tool first, then POST `/api/v1/diaries` |
| `btn-tool-run-copy` | `copyResult` | `copyText(result)`; on failure sets `error` |
| `btn-tool-run-close` | `result = ''` | hides the result card (result is not persisted) |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 13 controls for this view, `artifacts/post-recovery/control-coverage.json` shows 7 visible controls on `/pages/tool/run` (state `modal-open`, i.e. the result card was open during the sweep).

## API_READS

- `GET /api/v1/ai/tasks/latest?taskType=<type>` (`ToolRun.vue:42`). Handler `PublicController.latestAiTask` (`apps/api/src/controllers.ts:1003-1018`), backed by `store.latestSuccessfulAiJob` (`apps/api/src/store.service.ts:5193-5203`), which returns the newest `succeeded|fallback` job for that user and task type with a non-empty result.
- `GET /api/v1/ai/tasks/:id` in `poll()` (`ToolRun.vue:57`). Handler `aiTaskStatus` (`controllers.ts:1020-1028`).

## API_WRITES

- `POST /api/v1/ai/tasks` with `{taskType, content, sourceId}` (`ToolRun.vue:73`). Handler `PublicController.aiTask` (`controllers.ts:994-1001`) -> `store.queueAI` (`store.service.ts:5066-5085`) -> `queueAiJob` (`store.service.ts:5103-5177`) -> `runAiJob`. Model: **AIJob** (`prisma/schema.prisma:1013-1042`), and through the AI path also **AgentDecisionLog** for structured tasks.
- `POST /api/v1/diaries` with `{emotion, content, hasLetter, source, toolResult}` (`ToolRun.vue:87`). Handler `PublicController.createDiary` (`controllers.ts:1364-1391`), which unshifts into `store.diaries` and persists. Model: **Diary** (`prisma/schema.prisma:335-357`); `source` becomes `tool-<type>` and `toolResult` carries the original input and jobId.

## DB_ENTITIES

- Reads: **AIJob** (via `latestSuccessfulAiJob`).
- Writes: **AIJob**, **Diary**, and **AgentDecisionLog** (`store.service.ts:5213+` writes a decision log for structured task types).
- Cross-checked against `artifacts/product-audit/db-models.json` and `prisma/schema.prisma`.

## ADMIN_VISIBILITY

- The AIJob rows land on admin resource **jobs** -> `/ai/jobs` (`apps/admin/src/router.ts:50`, endpoint `/api/admin/v1/ai/jobs`, `apps/admin/src/views/TablePage.vue:49`).
- The Diary rows have no admin resource; `apps/admin/src/router.ts` menuGroups contain no diary entry, so diary content is not visible in the admin app.
- The AgentDecisionLog has no admin resource either.

## AI_USAGE

Yes. `runTool` posts `taskType: type.value`, which normalises in `store.normalizeTaskType` (`store.service.ts:5688-5748`) to one of `rewrite | rant | heal | sleep | work | future`. Style is chosen by `defaultStyleForTask` (`store.service.ts:5750-5770`): `future -> poetic`, `rewrite -> clear`, everything else `warm`. Content type `ToolTask` (`store.service.ts:5772-5794`).

Failure handling: `poll()` accepts `succeeded` and `fallback` and throws only on anything else (`ToolRun.vue:58-61`). With DAPI returning HTTP 402 the job lands in `fallback` to `provider_safe_template` (`store.service.ts:5513-5530`), so `completed.result` is the template text from `composeDynamicText` (`store.service.ts:6034-6072`) and the page renders it as if it were a model result. The user is never told the AI degraded. `restoreLatestResult` has the same behaviour: it reads whatever `latest.item.result` is, including a fallback result.

## PRIVACY

No `PrivacySetting` flag gates this page or its endpoints. `queueAI`/`queueAiJob` and `createDiary` do not call `privacyAllows`. Memory injection into the prompt is scoped by `activeMemoriesForTask` (`store.service.ts:4795-4810`) and only pulls memories the user explicitly allowed (`allowLongTermMemory` / `allowAiMemoryUse`, `prisma/schema.prisma:219-220`); that is a read-side gate on memory, not on this page's own data.

## ERROR_STATES

Two explicit ones, both rendering into the same `<p v-if="error">`:

- generation failure / timeout: `runTool` catch sets `error` (`ToolRun.vue:78-80`); `poll` throws 生成失败 or `AI 任务超时` after a 120 s deadline (`ToolRun.vue:54-65`).
- restore failure: `restoreLatestResult` catch sets `error` (`ToolRun.vue:47-49`).
- copy failure sets `error` to 复制失败 (`ToolRun.vue:93`).

`saveResult` has **no** try/catch (`ToolRun.vue:84-89`), so a failed `POST /api/v1/diaries` rejects silently and `saved` is never set; the user sees the button stay at 保存到日记 with no explanation. This is a finding.

## EMPTY_STATES

No explicit empty state. When there is no prior job and no result, the result card is simply not rendered (`v-if="result"`, `ToolRun.vue:107`) and the user sees only the input card. That is acceptable but there is no copy telling the user nothing was restored.

## NATIVE_RISKS

- Clipboard: `copyResult` uses `copyText` from `apps/mp/src/clipboard.ts`, which prefers `navigator.clipboard` and falls back to a hidden textarea + `document.execCommand('copy')`. Inside the Capacitor WebView `navigator.clipboard` requires a secure context; if it is unavailable the fallback runs, so the failure path is covered but not surfaced beyond a generic 复制失败.
- Keyboard: the input is a plain `textarea` in normal document flow with no fixed positioning, so `Keyboard.resize: 'body'` (`apps/mp/capacitor.config.ts`) keeps it visible.
- Safe area: the page uses `rest-page`/`detail-rest-page` classes; the shared `.goodnight-page` padding is `calc(130px + env(safe-area-inset-bottom))` (`apps/mp/src/styles.scss:4147`), which clears the tab bar. This page is **not** in `tabbarPaths` (`apps/mp/src/App.vue:8-40`), so the tab bar is hidden here and the 130 px bottom padding is dead space.
- Back button: no custom handling; the Android back button walks WebView history (`apps/mp/src/native/back-button.ts:26-33`).
- No dial intent on this page.

## ISSUES

- P1 AI: a `fallback` job is treated as success (`ToolRun.vue:58-61`) and the template text is presented as an AI result with no disclosure. With DAPI at HTTP 402 every run of this page is a fallback, so the user is systematically shown template copy labelled as generated output.
- P2 FUNCTIONAL: `saveResult` has no error handling (`ToolRun.vue:84-89`); a failed diary write is completely silent and the button never changes state.
- P2 STATE_MACHINE: `restoreLatestResult` runs on every `type` change and unconditionally overwrites `input` with `latest.item.promptSummary` (`ToolRun.vue:45`), so any text the user has typed is replaced when they switch tool type.
- P3 UX: the input textarea has no `maxlength` (`ToolRun.vue:103`) while the backend truncates at 1000 chars in `this.text(input.content, ...)`; a long paste is silently cut server-side.
- P3 DUPLICATE: six task types share one view and one `meta` map, and the canonical type mapping is duplicated in ToolIndex (`ToolIndex.vue:29-36`) and again here as path aliases (`ToolRun.vue:20-22`); the two lists must be kept in sync by hand.
- P3 TEST_CONTRACT: `/pages/tool/run` with no `?type=` silently defaults to `negative_rewrite` (`ToolRun.vue:23`), so a test asserting "the rewrite alias shows rewrite" would pass while the bare route shows the same default for a different reason.

## FINAL_STATUS

DONE - the flow, the two writes and the AI fallback behaviour are all statically traceable and the route renders on the Android APK (7 visible controls, 0 console errors, 0 failed requests).

### Static evidence

- Controls discovered: 13
- API reads (static): `/api/v1/ai/tasks/:param`, `/api/v1/ai/tasks/latest`
- API writes (static): `POST /api/v1/ai/tasks`, `POST /api/v1/diaries`
- Candidate fake markers: 1
- Appended: the single fake-marker candidate (setTimeout at line 62) is the `poll()` interval, adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` (M29).
- Appended: `POST /api/v1/diaries` is handled inline in the controller (`controllers.ts:1364-1391`) and does not go through a store.service.ts write method, unlike the other writes on this page.

