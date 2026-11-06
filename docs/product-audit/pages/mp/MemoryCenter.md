# MemoryCenter

Source: `apps/mp/src/views/MemoryCenter.vue`

Routes: `/pages/memory/index`

## PURPOSE

MemoryCenter is the consent console for the bounded-memory feature. It lists every memory the system holds about the user (active, disabled and expired alike), shows where each one came from, which AI scope may use it and how many days it has left, and lets the user edit it, stop future use, expire it immediately or delete it. It also offers a manual composer so a memory can only be created by an explicit confirmation rather than inferred from conversation.

## USER_JOB

"I want to see exactly what the AI has been told to remember about me, and be able to change or kill any of it."

## ENTRY

- Me, AI 记得什么, `data-testid=entry-memory` -> `router.push('/pages/memory/index')` (`apps/mp/src/views/Me.vue:60`, rendered `:199-200`).

That is the only entry. A repo-wide search for `/pages/memory` returns the route (`apps/mp/src/router.ts:70`), the Me entry, and the privacy gate's own push in the other direction (`MemoryCenter.vue:150`).

## EXIT

- 去隐私设置 (privacy gate only) -> `router.push('/pages/settings/privacy')` (`MemoryCenter.vue:150`).
- ‹ 返回 -> `router.back()` (`:139`).

There is no other forward navigation: creating, editing, disabling, expiring and deleting all stay on the page and reload the list. The route is not in `tabbarPaths` (`apps/mp/src/App.vue:7-40`), so the tab bar is hidden.

## ROUTES

`/pages/memory/index` (`apps/mp/src/router.ts:70`). Single route, no aliases. Not a tab route; `activeTab` would classify it as 我的 (`App.vue:62-68`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading note | `loading` (starts `true`) | `MemoryCenter.vue:21`, `:152` |
| list of memory cards | `items` | `MemoryCenter.vue:20`, `:154` |
| empty list | `!items.length` | `MemoryCenter.vue:216` |
| privacy banner ("AI 记忆当前已关闭") | `!memoryAllowed` | `MemoryCenter.vue:25`, `:147` |
| create button visible | `memoryAllowed && !composerOpen` | `MemoryCenter.vue:238` |
| composer open | `composerOpen` | `MemoryCenter.vue:26`, `:220` |
| inline edit form open | `editingId === item.id` | `MemoryCenter.vue:27`, `:196` |
| two-tap delete armed | `pendingDeleteId === item.id` | `MemoryCenter.vue:28`, `:175` |
| busy on a row / on create | `busyId` | `MemoryCenter.vue:22`, `:198`, `:235` |
| error note | `error` | `MemoryCenter.vue:23`, `:218` |
| success notice | `notice` | `MemoryCenter.vue:24`, `:219` |
| active-usage count | `activeCount` | `MemoryCenter.vue:32-34`, `:144` |
| per-row status active | `item.status === 'active'` | `MemoryCenter.vue:176` |
| per-row status disabled | `item.status === 'disabled'` | `MemoryCenter.vue:184` |
| per-row status expired | `item.status === 'expired'` | `MemoryCenter.vue:166`, `:188` |
| row already used by an AI job | `item.usages?.length` | `MemoryCenter.vue:163` |
| days-left label | `daysLeft(item)` | `MemoryCenter.vue:48-52`, `:160` |

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| ‹ 返回 | `router.back()` | history back |
| 去隐私设置 (gate) | `router.push('/pages/settings/privacy')` | opens privacy settings |
| ✎ 编辑 (`aria-label="编辑<title>"`) | `beginEdit(item)` | opens the inline form pre-filled from the row |
| 删除 / 确认删除 | `remove(item)` | first tap arms `pendingDeleteId`, second tap issues the DELETE |
| 以后不要用 (active rows) | `update(item, {status:'disabled'}, ...)` | PATCH status disabled |
| 恢复使用 (disabled rows) | `update(item, {status:'active'}, ...)` | PATCH status active |
| 立即过期 (non-expired rows) | `update(item, {status:'expired'}, ...)` | PATCH status expired |
| 保存修改 (inline form submit) | `update(item, {...editDraft}, ...)` | PATCH title, content, days, scope |
| 取消 (inline form) | `editingId = ''` | closes the form without saving |
| 保存一条我确认的记忆 (`memory-create-open`) | `composerOpen = true` | opens the composer |
| 确认并保存 (`memory-create-save`) | `createMemory` | `POST /api/v1/memory` |
| 取消 (composer) | `composerOpen = false` | closes the composer |
| 为什么 AI 知道这个？ (rows with usages) | `notice = ...` | prints the job id and task type of the first usage into the notice line |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 17 entries; `artifacts/post-recovery/control-coverage.json` records only 2 visible controls on the real APK (back and `memory-create-open`), state `possibly-empty` - i.e. the list was empty, so no per-row controls existed and the gate was not shown.

## API_READS

Two GETs in one `Promise.all` (`MemoryCenter.vue:57-65`):

- `GET /api/v1/me/memories` -> `controllers.ts:743-757` -> `store.memoryList(true, userId)` (`store.service.ts:4696-4702`), **including inactive rows**, then decorated with `usages` computed server-side by scanning `store.aiJobs[].traceJson` for `memory-context` entries whose `memoryIds` contain the row (`controllers.ts:746-754`).
- `GET /api/v1/settings/privacy` -> `controllers.ts:1604-1607` -> `store.privacySettings[runtimeId]`. Only `allowLongTermMemory` is read (`MemoryCenter.vue:62`).

## API_WRITES

- `POST /api/v1/memory` with `{title, content, days, scope, category: '用户主动保存'}` (`MemoryCenter.vue:80`). Handler `controllers.ts:759-774` forces `source: 'user_saved'` and calls `store.saveMemory` (`store.service.ts:4704-4749`), which gates on `allowLongTermMemory` (`:4714`), clamps `days` to 1..3650 (`:4715`), validates `scope` against `{all_ai, journey, recovery, support}` (`:4724-4726`) and writes a **MemoryItem** with `status: 'active'` and `expiresAt = now + days` (`:4740-4742`).
- `PATCH /api/v1/me/memories/:id` (`MemoryCenter.vue:103`). Handler `controllers.ts:775-783` -> `store.updateMemory` (`store.service.ts:4751-4782`). Store method: `StoreService.updateMemory`; Prisma model changed: **MemoryItem**.
- `DELETE /api/v1/me/memories/:id` (`MemoryCenter.vue:122`). Handler `controllers.ts:789-792` -> `store.deleteMemory` (`store.service.ts:4784-4793`), which sets `deletedAt` and `status: 'expired'` - a soft delete.

Store methods: `saveMemory`, `updateMemory`, `deleteMemory`. Prisma model changed by all three: **MemoryItem**.

## DB_ENTITIES

Reads: **MemoryItem**, **PrivacySetting**, **AIJob** (the `usages` decoration reads `aiJobs[].traceJson`).

Writes: **MemoryItem** (create, update, soft delete).

Cross-checked against `prisma/schema.prisma:672-692` (MemoryItem: `status String @default("active")`, `scope String @default("all_ai")`, `expiresAt`, `deletedAt DateTime?`, `@@index([userId, status, expiresAt])`) and `:1013-1042` (AIJob `traceJson Json`).

## ADMIN_VISIBILITY

**Yes, on `/safety/memory`** (`apps/admin/src/router.ts:79`, label 有限记忆). The route is generated from the menu into `TablePage` with `resource: 'memory'` (`apps/admin/src/router.ts:112-118`), which maps to `GET /api/admin/v1/memory` (`apps/admin/src/views/TablePage.vue:66`) -> `controllers.ts:2066-2078` -> `store.memoryItems.filter((item) => !item.deletedAt)`. Columns are 记忆 ID / 用户 / 类型 (category) / 到期时间 / 创建时间 (`TablePage.vue:324-330`).

Two notes. First, the admin list shows every non-deleted row regardless of `status`, matching this page's `memoryList(true)` view. Second, the admin handler **does** call `this.admin(auth)` (`controllers.ts:2072`), unlike the 58 unguarded handlers recorded in `docs/product-audit/ISSUE_REGISTER.md` ISSUE-001. The admin table does not render `title` or `content`, so the memory text itself is not exposed in the console.

## AI_USAGE

No AiJob is created by this page. It **reads** job traces: `usages` is derived from `AIJob.traceJson` `memory-context` events (`controllers.ts:746-754`), which the store appends when it injects memories into a prompt (`store.service.ts:5328-5336`).

The eligibility rule that decides whether a memory reaches a model is `StoreService.activeMemoriesForTask` (`store.service.ts:4795-4808`), and it enforces all four conditions the group-C brief asks about:

1. `allowAiMemoryUse === true`, else the function returns `[]` immediately (`:4796`);
2. `!item.deletedAt` and `item.status === 'active'` (`:4804`) - so disabled and expired rows are excluded;
3. `Date.parse(item.expiresAt) > Date.now()` (`:4805`) - so a stale `expiresAt` cannot smuggle a row in;
4. `scopeAllowed(item.scope)` (`:4798-4802`): `all_ai` always, `journey` only when the task's `contentType` contains "journey", `recovery` only for `taskType === 'recovery_summary'`, `support` only for `support_plan` / `risk_analysis` / `barrier_analysis`.

It also caps the injection at 8 memories, newest first (`:4806-4807`). The caller adds the ids to the job trace and formats them into the prompt as 仅可引用，不得推断人格或敏感属性 (`store.service.ts:5328-5340`).

When the provider fails, the job still reaches `status: 'fallback'` with a template result and the error string preserved (`store.service.ts:5513-5530`), which is the externally known DAPI 402 condition - it does not affect memory eligibility.

## PRIVACY

- **Reading the list is not gated.** `GET /api/v1/me/memories` has no `privacyAllows` call; the gate lives on creation (`store.service.ts:4714`). That is deliberate: the banner says 现有内容仍对你可见，但任何 AI 任务都不能读取 (`MemoryCenter.vue:148`).
- **The banner is driven by the wrong flag.** `memoryAllowed` is set from `allowLongTermMemory` (`MemoryCenter.vue:62`), but the flag that actually blocks AI from reading memories is `allowAiMemoryUse` (`store.service.ts:4796`). The two are independent columns with independent defaults (`prisma/schema.prisma:219-220`) and are separately toggled in PrivacySettings (`PrivacySettings.vue:253` and `:339`). See ISSUES - this is the most consequential finding on the page.
- `allowLongTermMemory` does correctly gate the create button (`MemoryCenter.vue:238`) and the POST (`store.service.ts:4714`), so the composer and the write are consistent.
- Scope labels exposed to the user (`MemoryCenter.vue:41-46`) match the server's accepted set exactly (`store.service.ts:4724`), so a user's scope choice is never silently widened - except by the edit path described in ISSUES.

## ERROR_STATES

- Load failure: `error` = API message or 记忆资料读取失败 (`MemoryCenter.vue:66-68`). Because both reads share one `Promise.all`, a failure of the **privacy** read also leaves `memoryAllowed` at `false`, which renders the 已关闭 banner (`:147`) alongside the error - the page tells the user AI memory is off when in fact it could not check. The list section is replaced by the loading note only while `loading` is true (`:152`), so on failure the list renders empty and the empty copy appears too.
- Create failure: `error` = API message or 记忆没有保存成功 (`:84`); the composer stays open and the draft is not cleared (`:81` runs only on success).
- Update failure: `error` = API message or 记忆状态没有更新成功 (`:107`).
- Delete failure: `error` = API message or 记忆没有删除成功 (`:126`); `pendingDeleteId` is only cleared on success (`:123`), so the button stays armed for a retry.

## EMPTY_STATES

- 这里还没有记忆。系统不会从普通对话里偷偷建立你的画像。 (`MemoryCenter.vue:216`) - present and appropriately explicit about the consent model.
- No explicit empty state for the trusted-contact-style lists; the only other collection is `usages`, which hides its button when empty (`:163`).

## NATIVE_RISKS

- Safe area: `.memory-page` pads `0 22px 40px` (`MemoryCenter.vue:252-254`) with no `env(safe-area-inset-bottom)`; the shared `.goodnight-page` rule supplies `calc(130px + env(safe-area-inset-bottom))` (`apps/mp/src/styles.scss:4145-4147`) and the scoped rule does not override `padding-bottom`, so the clearance holds. The route has no tab bar, so the space is dead.
- Keyboard: the composer and the inline edit form are in normal flow (`MemoryCenter.vue:196-236`) with `Keyboard.resize: 'body'` (`apps/mp/capacitor.config.ts`), so the number inputs stay reachable. The inline form is nested inside the card's grid (`:197` `grid-column: 1/4`), which keeps it full width on a narrow screen.
- Back button: no custom handling; BACK walks WebView history (`apps/mp/src/native/back-button.ts:30-36`).
- No dial intent, clipboard or external link.

## ISSUES

- P1 PRIVACY: the 已关闭 banner and the composer button are keyed to `allowLongTermMemory` (`MemoryCenter.vue:62`, `:238`), but the flag that actually stops the AI reading memories is `allowAiMemoryUse` (`store.service.ts:4796`). A user who leaves `allowLongTermMemory` on and turns `allowAiMemoryUse` off still sees no warning and no gate, while every AI task silently receives zero memories; the reverse case tells the user "任何 AI 任务都不能读取" while existing memories are still injected. The page must read `allowAiMemoryUse` for the banner and `allowLongTermMemory` for the composer, and say which is which.
- P1 STATE_MACHINE: saving the inline edit form silently re-activates a disabled or expired memory. The form always submits `{title, content, days, scope}` (`MemoryCenter.vue:198`) and the server treats the presence of `days` as an instruction to set `status = 'active'` (`store.service.ts:4768-4772`). Editing the scope of a row the user had just switched to 以后不要用 therefore turns it back on, with only the generic 这条记忆已经更新 notice.
- P2 STATE_MACHINE: for an expired row `beginEdit` computes `remaining` from `expiresAt`, which `updateMemory` has already set to "now" (`MemoryCenter.vue:94` vs `store.service.ts:4777`), so the form opens showing 1 day. Saving it grants a fresh day of life and re-activates the row.
- P2 STATE_MACHINE: a failed privacy read is indistinguishable from "memory is off". `load()` assigns `memoryAllowed` only on success (`MemoryCenter.vue:57-65`), so the `403`-free but failing case leaves the flag `false` and renders the 已关闭 banner plus the error line (`:147`, `:218`).
- P2 UX: the composer button is hidden entirely when `memoryAllowed` is false (`MemoryCenter.vue:238`) rather than disabled with an explanation, so a user who has never enabled long-term memory sees no way to create one and no reason why.
- P2 DATA: the delete is a soft delete - `deleteMemory` sets `deletedAt` and `status: 'expired'` (`store.service.ts:4784-4793`) and the row survives in the database, excluded only by a `!item.deletedAt` filter in `memoryList` (`:4699`) and the admin handler (`controllers.ts:2074`). The UI copy says 这条记忆已经删除 (`MemoryCenter.vue:123`) without disclosing that the content is retained server-side.
- P3 DATA: `createMemory` always sends `category: '用户主动保存'` (`MemoryCenter.vue:80`), so every user-created row has the same category and the admin 类型 column (`TablePage.vue:327`) carries no information for this source.
- P3 UX: 为什么 AI 知道这个？ overwrites the shared `notice` ref (`MemoryCenter.vue:166`) rather than opening a panel, so the answer replaces any other status message and can only be read until the next action.
- P3 DUPLICATE: the four scope options are declared three times - twice as `<option>` lists in the edit and create forms (`MemoryCenter.vue:203-206`, `:228-231`) and once as the `scopeLabel` map (`:41-46`).

## FINAL_STATUS

PARTIAL - the list, the three writes, the five eligibility conditions in `activeMemoriesForTask` and every UI state are traced to lines, and the APK sweep shows the route rendering in its empty state with 2 controls and 0 console errors, but no memory was created or mutated at runtime in this pass, so the disable / expire / re-activate transitions are verified statically only.

### Static evidence

- Controls discovered: 17
- API reads (static): `/api/v1/me/memories`, `/api/v1/settings/privacy`
- API writes (static): `DELETE /api/v1/me/memories/:param`, `PATCH /api/v1/me/memories/:param`, `POST /api/v1/memory`
- Candidate fake markers: 2
- Appended: both fake-marker candidates (placeholder at lines 221 and 224) are HTML placeholder attributes on the composer's title input and textarea, adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` (M12).
- Appended: group-C eligibility check - `activeMemoriesForTask` (`store.service.ts:4795-4808`) excludes deleted, non-active, expired and out-of-scope rows and additionally requires `allowAiMemoryUse`; the eight-row cap and the 不得推断人格或敏感属性 prompt clause are at `store.service.ts:4806-4807` and `:5338-5340`.
- Appended: runtime cross-check `artifacts/recovery/android-route-manifest.json` - `/pages/memory/index` rendered=true, textLength 106, 2 visible controls, 0 console errors, 0 failed requests. `artifacts/post-recovery/control-coverage.json` records state `possibly-empty`, i.e. the list was empty and only the back and `memory-create-open` controls existed.