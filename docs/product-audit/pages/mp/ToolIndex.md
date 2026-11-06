# ToolIndex

Source: `apps/mp/src/views/ToolIndex.vue`

Routes: `/pages/tool/index`

## PURPOSE

ToolIndex is the catalogue of self-service emotion tools. It advertises nine tools (a one-tap warm letter plus eight tiles) and is the only place a user can choose which small exercise to run, as opposed to the Journey flow which is driven by a written situation.

## USER_JOB

"I want a small, immediate thing to do with what I am feeling right now, without writing a whole situation first."

## ENTRY

No in-app control navigates here. Exhaustive search of `apps/mp/src` for `/pages/tool/index` finds only the router declaration (`apps/mp/src/router.ts:79`) and the tabbar path set (`apps/mp/src/App.vue:23`, which only controls whether the tab bar renders, not navigation). The bottom tab labelled 行动 points at `/pages/action/index` (`apps/mp/src/App.vue:97-106`), not at this page. The card array in this same file is the only producer of `/pages/tool/run` links (`apps/mp/src/views/ToolIndex.vue:12-18`).

Reachable only by typing or deep-linking the URL: DIRECT_ONLY.

## EXIT

Each tile pushes its tool route: decompose -> `/pages/tool/decompose` (`ToolIndex.vue:12`), the six run-based tools -> `/pages/tool/run?type=<canonical>` (`ToolIndex.vue:38`), report -> `/pages/report/month` (`ToolIndex.vue:19`), and the letter card -> `/pages/letter/today` (`ToolIndex.vue:73`). There is no back control and no tab-bar entry back into this page.

## ROUTES

`/pages/tool/index` (`apps/mp/src/router.ts:79`). Single route, no aliases (`artifacts/product-audit/mp-routes.json`, aliasCount 1).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| synced vs loading slogan | `toolsLoaded` (`ref(false)`, set true after the GET resolves) | `ToolIndex.vue:9`, `:23`, `:88` |
| no error state at all | none | see ERROR_STATES |
| no loading indicator beyond the slogan's `data-state` attribute | `toolsLoaded` | `ToolIndex.vue:88` |

There is no modal, sheet, disabled or empty state; the tile grid is a fixed local array so it is never empty.

## CONTROLS

| control (label/testid) | handler function | what it actually does |
| --- | --- | --- |
| `tool-letter` (去试试) | inline `router.push('/pages/letter/today')` | navigates to the warm-letter page |
| `tool-decompose` (情绪拆解) | `openTool(card)` | no canonical mapping for `decompose`, falls to `card.route` -> `/pages/tool/decompose` |
| `tool-rewrite` (负面改写) | `openTool(card)` | canonical map `rewrite->negative_rewrite` -> `/pages/tool/run?type=negative_rewrite` |
| `tool-rant` (发疯文案) | `openTool(card)` | `rant->rant` -> `/pages/tool/run?type=rant` |
| `tool-healing-quote` (治愈短句) | `openTool(card)` | `healing-quote->healing_phrase` -> `/pages/tool/run?type=healing_phrase` |
| `tool-sleep-comfort` (失眠安慰) | `openTool(card)` | `sleep-comfort->sleep_comfort` -> `/pages/tool/run?type=sleep_comfort` |
| `tool-work-support` (工作破防) | `openTool(card)` | `work-support->work_support` -> `/pages/tool/run?type=work_support` |
| `tool-future-letter` (写给未来的自己) | `openTool(card)` | `future-letter->future_letter` -> `/pages/tool/run?type=future_letter` |
| `tool-report` (情绪月报) | `openTool(card)` | no canonical mapping -> `card.route` -> `/pages/report/month` |

Counts cross-check with `artifacts/product-audit/control-manifest.json` (8 controls for this view) and `artifacts/post-recovery/control-coverage.json` (13 visible controls on `/pages/tool/index`, 9 buttons + 4 tab links, all with test ids).

## API_READS

- `GET /api/v1/tools` (`ToolIndex.vue:23`). Handler `PublicController.tools` (`apps/api/src/controllers.ts:1206-1220`) returns a fixed nine-item array; there is no Prisma query behind it.

## API_WRITES

None. No `api.post/patch/put/delete` and no `fetch` in the view.

## DB_ENTITIES

None read and none written. `apps/api/src/controllers.ts:1206-1220` is a literal array, so no model from `prisma/schema.prisma` is touched by this page.

## ADMIN_VISIBILITY

None. There is no tools resource in `apps/admin/src/router.ts` menuGroups, and the endpoint is not backed by a table, so nothing from this page can appear in the admin app.

## AI_USAGE

None. ToolIndex itself creates no AiJob; the run tools it links to do (see ToolRun.md).

## PRIVACY

No privacy flag gates this page. It reads no user data; the endpoint is unauthenticated and identical for every user.

## ERROR_STATES

There is no error state. `loadTools()` awaits `api.get('/api/v1/tools')` with no `try/catch` (`ToolIndex.vue:22-25`), so a failed request rejects the `onMounted` promise, `toolsLoaded` stays `false`, and the slogan is pinned at `data-state="loading"` forever. Nothing is shown to the user. This is a finding.

## EMPTY_STATES

None possible. `toolCards` is a hardcoded array of eight entries (`ToolIndex.vue:11-20`), so the grid always renders eight tiles regardless of the API response.

## NATIVE_RISKS

The page renders inside the tab bar layout (it is in `tabbarPaths`, `App.vue:23`) but has no tab that leads to it, so on Android the only way to land here is a deep link; a hardware BACK from here follows `window.history` and leaves the app at the root (`apps/mp/src/native/back-button.ts:26-33`). No safe-area, keyboard or dial concerns: no text input and no `tel:` link.

## ISSUES

- P1 ORPHAN: no control anywhere in `apps/mp/src` navigates to `/pages/tool/index`. The only references are the route declaration and the tabbar visibility set. The bottom 行动 tab goes to `/pages/action/index`. The page is fully built, rendered and control-complete but unreachable from the product UI.
- P2 FUNCTIONAL: the `GET /api/v1/tools` response is discarded (`ToolIndex.vue:23`) and the tiles come from the local array, so the server's `enabled` flag (`controllers.ts:1209-1217`) has no effect on what the user sees.
- P2 STATE_MACHINE: no `try/catch` around the load, so a failed request leaves the page permanently in the `loading` data-state with no user-visible message (`ToolIndex.vue:22-25`, `:88`).
- P3 UX: the `data-state` attribute is the only consumer of `toolsLoaded`; the value is never rendered as text, so the state is invisible to the user even when it is correct.

## FINAL_STATUS

DONE - the page is read-only, the render is confirmed on the real Android APK (`artifacts/recovery/android-route-manifest.json`, 0 console errors, 0 failed requests, 13 controls) and every claim above is verifiable statically.

### Static evidence

- Controls discovered: 8
- API reads (static): `/api/v1/tools`
- API writes (static): (none)
- Candidate fake markers: 0
- Appended: control-coverage.json shows 13 visible controls on `/pages/tool/index` (9 buttons, 4 tab links), all reachable; android-route-manifest.json shows the route rendered with no console errors and no failed requests.
- Appended: the tools endpoint is a literal array (controllers.ts:1206-1220), so no DB model is involved and the server list cannot change the UI.

