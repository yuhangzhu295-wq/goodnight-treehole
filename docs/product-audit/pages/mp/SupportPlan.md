# SupportPlan

Source: `apps/mp/src/views/SupportPlan.vue`

Routes: `/pages/support-plan/index`

## PURPOSE

SupportPlan is the advance directive for a bad night. While the user is relatively well, they write down what helps, what makes it worse, who to contact, where to go and what the smallest possible action is - so that a future crisis does not have to be figured out from scratch. SafetySupport reads this record back during a crisis.

## USER_JOB

"I want to decide now, while I can think clearly, what should happen to me on a night when I cannot."

## ENTRY

- Me, `data-testid=entry-support-plan` (我的低谷预案) -> `router.push('/pages/support-plan/index')` (`apps/mp/src/views/Me.vue:46`, rendered at `Me.vue:180`).
- Me, `data-testid=me-support-status` (我的现实支持 status strip) -> the same route (`Me.vue:191`).
- SafetySupport, 查看全部 inside the saved-plan block -> `router.push('/pages/support-plan/index')` (`apps/mp/src/views/SafetySupport.vue:107`). Note this control only renders when a plan already exists (`v-if="savedSupport.length"`, `:105`), so it cannot be the first entry.

## EXIT

- `data-testid=support-plan-safety` (需要即时安全支持) -> `router.push('/pages/safety/index')` (`SupportPlan.vue:255`).
- Saving stays on the page and shows a saved notice (`SupportPlan.vue:136-143`, `:266`).
- There is no back control; the tab bar is the only way out, plus BACK.

## ROUTES

`/pages/support-plan/index` (`apps/mp/src/router.ts:68`). Single route, no aliases. It is in `tabbarPaths` (`apps/mp/src/App.vue:17`) and `activeTab` maps it to 行动 (`App.vue:46`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading | `loading` | `SupportPlan.vue:10`, `:150` |
| form rendered | `!loading` (the `v-else` form) | `SupportPlan.vue:151` |
| per-section custom-entry open | `editingKey` | `SupportPlan.vue:14`, `:195`, `:198` |
| saved plan exists (id + timestamp shown) | `currentId`, `updatedAt` | `SupportPlan.vue:15-16`, `:268` |
| trusted contacts available as chips | `contacts` | `SupportPlan.vue:17`, `:180-186` |
| saving | `saving` | `SupportPlan.vue:11`, `:262` |
| saved notice | `savedNotice` | `SupportPlan.vue:13`, `:266` |
| error | `error` | `SupportPlan.vue:12`, `:265` |
| selection count drives save validation | `selectedCount` computed | `SupportPlan.vue:62-67`, `:128-131` |
| details panel open (places / actions / notes) | native `<details>` | `SupportPlan.vue:210` |

## CONTROLS

| control (label/testid) | handler function | what it actually does |
| --- | --- | --- |
| 12 suggestion chips across 4 sections (先听我说, 先让我稳定下来, 提醒我休息, 散步, 写下来, 联系朋友, 早点睡, 讲大道理, 催促, 连续提问) | `toggle(section.key, choice)` | adds/removes the value in `draft[key]`, capped at 12 |
| trusted-contact chips (only in the 我愿意联系的人 section) | `toggle('safePeople', contact.nickname)` | adds the contact's nickname as a free string |
| custom-chip × | `toggle(section.key, choice)` | removes a custom value |
| ＋ 补充 (per section) | `editingKey = section.key` | opens that section's custom input |
| 添加 (per custom input, and on Enter) | `addCustom(key)` | trims, caps at 80 chars, pushes if not duplicate and under 12 |
| places 添加 / smallActions 添加 | `addCustom('places')` / `addCustom('smallActions')` | same, into the extra lists |
| saved-list chips (places, smallActions) | `toggle(...)` | removes the item |
| 现实专业支持备注 textarea (maxlength 500) | `v-model="draft.professionalSupport"` | free text |
| 紧急状态下的处理偏好 textarea (maxlength 500) | `v-model="draft.emergencyPreference"` | free text |
| `support-plan-safety` (需要即时安全支持) | inline `router.push('/pages/safety/index')` | opens SafetySupport with no journeyId |
| `support-plan-save` (保存我的低谷预案, type=submit) | form `@submit.prevent="save"` | PUT `/api/v1/me/support-plan` |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 14 controls; `artifacts/post-recovery/control-coverage.json` shows 26 visible controls on `/pages/support-plan/index` (13 chips, 4 ＋补充, 2 extra inputs, 2 add buttons, 2 textareas, 1 safety link, 1 save, 4 tab links), 0 console errors, 0 failed requests.

## API_READS

Fired in parallel (`SupportPlan.vue:110-112`):

- `GET /api/v1/me/support-plan` -> `controllers.ts:637-640` -> `store.supportPlan` (`apps/api/src/store.service.ts:4635-4638`). **No privacy gate on the read.**
- `GET /api/v1/trusted-contacts` -> `controllers.ts:614-617` -> `store.trustedContactList` (`store.service.ts:4524-4526`), filtered to enabled contacts.

## API_WRITES

- `PUT /api/v1/me/support-plan` with `{title:'我的低谷预案', plan:{...draft}}` (`SupportPlan.vue:136`). Handler `supportPlanPut` (`controllers.ts:642-648`) -> `store.saveSupportPlan` (`store.service.ts:4601-4633`), which calls `privacyAllows(userId,'allowRecoveryData')` at `:4606`, then either updates the existing active **PersonalSupportPlan** or creates one. The whole `plan` object is stored verbatim as JSON (`:4615` / `:4625`).

## DB_ENTITIES

- Reads: **PersonalSupportPlan**, **TrustedContact**.
- Writes: **PersonalSupportPlan** (`plan` JSON, `title`, `updatedAt`).
- Cross-checked against `artifacts/product-audit/db-models.json`.

## ADMIN_VISIBILITY

Yes, read-only. Resource **support-plans** -> admin route `/safety/support-plans` (`apps/admin/src/router.ts:78`, label 支持计划, group 安全与陪伴) -> `GET /api/admin/v1/support/plans` (`apps/admin/src/views/TablePage.vue:65`, `apps/api/src/controllers.ts:2056`). `TrustedContact` has no admin resource.

## AI_USAGE

None. No AiJob is created or read; the whole plan is user-authored and the page renders only what it stored. The backend has a `support_plan` task type (`store.service.ts:5733-5734`, `:5812`, `:6063`) and lists it among the memory-scoped tasks (`:4802`), but no caller creates a `support_plan` job - the only `support_plan` string in `store.service.ts` outside the type tables is the `PersonalSupportPlan` id prefix (`:4621`) and the memory scope list. So the AI capability for this page exists in the type system and is unused.

## PRIVACY

- Write: gated by `allowRecoveryData` (`store.service.ts:4606`, default `false`, `store.service.ts:2350`).
- Read: **not** gated, in this view or in SafetySupport (`store.service.ts:4635-4638`). So the gate is one-directional: a user who revokes `allowRecoveryData` can no longer save but can still read their own plan back, and SafetySupport will still show it.
- The plan content is highly sensitive (named people, safe places, emergency preferences) and is exposed to the admin app at `/safety/support-plans` without any privacy flag filtering (`controllers.ts:2056`).
- The view's own copy is honest about the boundary: 只写你确认过的现实资源 and 例如：先联系谁、去哪里 placeholders (`SupportPlan.vue:230`, `:242`).

## ERROR_STATES

- load failure: `error` set to the API message or 低谷预案读取失败 (`SupportPlan.vue:120-122`). Rendered at `:265`.
- validation: 请至少留下一条真实可用的支持方式 when `selectedCount` is 0 (`SupportPlan.vue:128-131`).
- save failure: `error` set to the API message or 低谷预案没有保存成功 (`:138-140`).
- **A privacy block on save is not distinguished.** The `allowRecoveryData` 403 arrives as a generic message and renders in the same `error-note` paragraph (`SupportPlan.vue:265`) with no link to `/pages/settings/privacy`. Recovery has a dedicated gate for the identical failure (`Recovery.vue:126-130`); this page does not. This is a finding, and it matters because the read succeeds while the write fails, so the user sees their saved plan and then cannot update it, with no explanation of why.

## EMPTY_STATES

- No plan yet: the form is simply blank; `applyPlan` is not called and `currentId` stays empty, so the version note is hidden (`SupportPlan.vue:268`). There is no "you have not written a plan yet" copy and no guidance beyond the section notes.
- No trusted contacts: the 我愿意联系的人 section renders only its suggestions (none) and the ＋ 补充 button (`SupportPlan.vue:180-186`). The section is effectively an empty row with no explanation and no link to `/pages/reality-handoff/index` where contacts are created. This is a real dead end for a first-time user.

## NATIVE_RISKS

- Safe area: this is a tab route; the page pads `calc(112px + env(safe-area-inset-bottom))` and the shared `.goodnight-page` adds `calc(130px + env(safe-area-inset-bottom))` (`apps/mp/src/styles.scss:4147`). Clears the tab bar.
- Keyboard: two inline custom inputs and two textareas inside a `<details>` element, all in normal flow; `Keyboard.resize: 'body'` keeps them reachable. The `<details>` content can be scrolled out of view once the keyboard opens, and there is no scroll-into-view handling.
- Back button: no custom handling (`apps/mp/src/native/back-button.ts:26-33`).
- No dial intent, no clipboard, no external links.
- The two textareas are inside `<label>` elements (`SupportPlan.vue:230-247`) that wrap both the label text and the control, which is correct for Android accessibility.

## ISSUES

- P1 PRIVACY: the plan is readable without the `allowRecoveryData` gate that protects the write (`store.service.ts:4635-4638` vs `:4606`). A user who turns the flag off can still read the plan here and on SafetySupport, which contradicts the gate's stated purpose in the 403 message 请先在隐私设置中允许保存支持计划.
- P1 PRIVACY: the full plan JSON - named contacts, safe places, emergency preferences - is exposed to the admin app at `/safety/support-plans` with no privacy filtering (`controllers.ts:2056`).
- P2 UX: a privacy block on save is indistinguishable from a network error (`SupportPlan.vue:265`), with no link to the privacy settings, unlike Recovery which shows a dedicated gate for the same 403 (`Recovery.vue:126-130`).
- P2 ORPHAN: the 我愿意联系的人 section has no path to create a contact. It can only offer contacts created in RealityHandoff (`apps/mp/src/views/RealityHandoff.vue:52`), and when there are none the section renders an empty chip row with no explanation or link (`SupportPlan.vue:180-186`).
- P2 DATA: `saveSupportPlan` stores `input.plan` verbatim as JSON (`store.service.ts:4615`, `:4625`) with no server-side validation of keys or lengths, so the persisted shape is entirely client-controlled. The only client-side limits are `slice(0,12)` per list and `slice(0,80)` per custom value (`SupportPlan.vue:94`, `:98`), which are not enforced by the API.
- P3 FUNCTIONAL: the `selectedCount` validation counts any non-empty string including `professionalSupport` and `emergencyPreference` (`SupportPlan.vue:62-67`), so a plan consisting only of a note in the collapsed `<details>` panel passes the "at least one real support" check that the copy implies.
- P3 DUPLICATE: the plan's list keys are declared in three places - the `ListKey` union, the `custom` reactive object and the `draft` reactive object (`SupportPlan.vue:4-5`, `:18-34`) - plus a fourth time in `applyPlan` (`:79-88`) and a fifth in the `sections` array (`:36-61`), which must all stay in sync by hand.
- P3 UX: the 补充地点、最低行动与现实支持 `<details>` is collapsed by default (`SupportPlan.vue:210`) while places and smallActions are exactly what SafetySupport reads back and displays (`SafetySupport.vue:13-17`), so the most crisis-relevant fields are the least discoverable.

## FINAL_STATUS

DONE - both reads, the single write, the privacy asymmetry, the admin exposure and all empty states are traced to lines, and the route renders on the Android APK with 26 controls and 0 console errors.

### Static evidence

- Controls discovered: 14
- API reads (static): `/api/v1/me/support-plan`, `/api/v1/trusted-contacts`
- API writes (static): `PUT /api/v1/me/support-plan`
- Candidate fake markers: 5
- Appended: all five fake-marker candidates are HTML `placeholder` attributes on the two extra inputs and the two textareas (lines 204, 216, 230, 242, 248), adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` (M26).
- Appended: `POST /api/v1/support-plans` exists as an alias of this PUT (`controllers.ts:629-635`) and has no mp caller.
- Appended: the plan read is consumed twice - here and by SafetySupport's saved-plan block (`apps/mp/src/views/SafetySupport.vue:26`), which is why the read-side privacy gap has two visible surfaces.

