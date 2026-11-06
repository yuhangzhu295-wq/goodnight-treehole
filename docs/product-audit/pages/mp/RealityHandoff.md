# RealityHandoff

Source: `apps/mp/src/views/RealityHandoff.vue`

Routes: `/pages/reality-handoff/index`

## PURPOSE

RealityHandoff turns an intention to reach out into a concrete sentence. The user picks who they would tell and what kind of help they want, the page composes a message from local presets, lets the user edit it, and saves it as a "help card". Nothing is ever sent: the only delivery mechanism is the user's own clipboard.

## USER_JOB

"I want to ask a real person for something specific, but I do not know how to say it, and I do not want the app contacting anyone on my behalf."

## ENTRY

- SafetySupport, `data-testid=safety-handoff` (发求助卡给信任的人) -> `router.push('/pages/reality-handoff/index')` with `?journeyId=` only when the safety screen has one (`apps/mp/src/views/SafetySupport.vue:65`).
- ActionCenter, the 找现实中的人 shortcut card `action-shortcut-handoff` -> `openShortcut('handoff')` -> `router.push('/pages/reality-handoff/index')` with `?journeyId=` when a journey is loaded (`apps/mp/src/views/ActionCenter.vue:241-246`).
- JourneyDetail's stabilize step, the handoff button inside StabilizeScreen -> `router.push('/pages/reality-handoff/index?journeyId=<id>')` (`apps/mp/src/components/journey/StabilizeScreen.vue:38`).

## EXIT

There is no forward navigation. The only exit is the hero back button, which calls `router.back()` (`RealityHandoff.vue:59`). After saving, the page stays put and shows a status line. The saved handoff has no follow-up screen anywhere in the app (see ISSUES).

## ROUTES

`/pages/reality-handoff/index` (`apps/mp/src/router.ts:63`). Single route, no aliases. It is not in `tabbarPaths`, so no tab bar renders.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| recipient selection | `recipient` (default 朋友) | `RealityHandoff.vue:14`, `:60` |
| need selection | `need` (default 听我说 10 分钟) | `RealityHandoff.vue:15`, `:60` |
| card text preview vs edited | `cardText` -> `generatedText` computed | `RealityHandoff.vue:16`, `:33-34`, `:60` |
| editing mode (textarea vs blockquote) | `editing` | `RealityHandoff.vue:17`, `:60` |
| saved (button relabelled, copy enabled) | `saved` | `RealityHandoff.vue:18`, `:60` |
| trusted-contacts sheet open | `contactSheet` | `RealityHandoff.vue:19`, `:62-63` |
| contact list populated vs empty | `contacts.length` | `RealityHandoff.vue:20`, `:63` |
| busy (save buttons disabled) | `busy` | `RealityHandoff.vue:23`, `:60`, `:63` |
| success status line | `status` | `RealityHandoff.vue:22`, `:62` |
| error text | `error` | `RealityHandoff.vue:21`, `:62` |
| contact form partially filled | `contactForm` | `RealityHandoff.vue:24`, `:63` |

## CONTROLS

| control (label/testid) | handler function | what it actually does |
| --- | --- | --- |
| hero 返回 | inline `router.back()` | pops WebView history |
| 6 recipient buttons (朋友 家人 伴侣 室友 同事 其他) | `selectRecipient(value)` | sets `recipient` |
| 6 need buttons (听我说 10 分钟, 陪我出去走走, ...) | `selectNeed(value)` | sets `need`, which swaps the composed text |
| `handoff-save` (生成并保存求助卡 / 保存这一版求助卡) | `saveCard` | POST `/api/v1/handoffs`; disabled while `busy` |
| `handoff-copy` (复制这张求助卡) | `copyCard` | `navigator.clipboard.writeText(generatedText)`; disabled until `saved` |
| 我自己改一下 / 完成编辑 | `editing = !editing` | toggles the textarea |
| 管理信任联系人 | `contactSheet = true` | opens the contacts sheet |
| sheet × and mask | `contactSheet = false` | closes the sheet |
| 保存联系人 | `saveContact` | POST `/api/v1/trusted-contacts`; needs nickname and contactHint |
| three contact inputs (称呼 / 关系 / 联系方式提示) | `v-model` on `contactForm` | free text |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 14 controls; `artifacts/post-recovery/control-coverage.json` shows 18 visible controls on `/pages/reality-handoff/index` (the sheet was closed, so 17 buttons plus the card section), 0 console errors, 0 failed requests.

## API_READS

- `GET /api/v1/trusted-contacts` (`RealityHandoff.vue:37`). Handler `PublicController.trustedContacts` (`apps/api/src/controllers.ts:614-617`) -> `store.trustedContactList` (`apps/api/src/store.service.ts:4524-4526`), which filters by user **and** `enabled`.

## API_WRITES

- `POST /api/v1/handoffs` with `{journeyId?, recipient, channel:'由我选择联系', summary}` (`RealityHandoff.vue:44`). Handler `controllers.ts:594-597` -> `store.createRealityHandoff` (`store.service.ts:4472-4489`), writing a **RealityHandoff** with `status='ready'`.
- `POST /api/v1/trusted-contacts` with the whole `contactForm` (`RealityHandoff.vue:52`). Handler `controllers.ts:609-612` -> `store.saveTrustedContact` (`store.service.ts:4508-4522`), writing a **TrustedContact** with `enabled=true`.

## DB_ENTITIES

- Reads: **TrustedContact** (`prisma/schema.prisma`).
- Writes: **RealityHandoff** (`status='ready'`) and **TrustedContact**.
- Cross-checked against `artifacts/product-audit/db-models.json`.

## ADMIN_VISIBILITY

**None.** `apps/admin/src/router.ts` menuGroups contain no handoff and no trusted-contact resource; the reachable resources are journeys, actions, checkins, peer-experiences, peer-matches, follow-ups, peer-conversations, notifications, safety-events, support-plans and memory (`apps/admin/src/router.ts:64-79`). `RealityHandoff` and `TrustedContact` are written and never surface in the admin app. Given that the help card can contain a real person's name and the user's crisis wording, and that `HandoffStatus` exists as an enum, the absence of any operator view is a finding.

## AI_USAGE

None. No AiJob is created and no generated text is used. The message body comes from the local `needMessages` map (`RealityHandoff.vue:25-32`) selected by `need`. This means the page also works with DAPI unavailable, which matters because the page is on the safety path.

## PRIVACY

- No `privacyAllows` gate on either call (`store.service.ts:4472-4489`, `:4508-4522`). The privacy-gated sibling is the archive retention flag on journey status, not this.
- The page states its own boundary in copy: 只保存你确认过的内容，系统不会自动联系任何人 (`RealityHandoff.vue:60`) and the sheet says 只保存在你的支持卡里，不会自动联系任何人 (`RealityHandoff.vue:63`). The first claim is accurate for the card (the summary is exactly `generatedText`), and the second is accurate for the contacts.
- The **RealWorldHandoff channel** is hardcoded to 由我选择联系, so the record never implies the app sent anything.
- Note `POST /api/v1/handoffs/:id/share` exists (`controllers.ts:599-602` -> `store.shareRealityHandoff`, `store.service.ts:4491-4501`, sets `status='shared'`) and is called by no mp view, so `HandoffStatus` can only ever be `ready` from the product UI.

## ERROR_STATES

- contact load failure: catch sets 支持联系人暂时没有加载出来 (`RealityHandoff.vue:37`).
- card save failure: 求助卡没有保存成功 or the API message (`RealityHandoff.vue:44`).
- copy failure: 浏览器没有允许复制，请手动选择文字复制。 (`RealityHandoff.vue:47`).
- contact save failure: 联系人没有保存成功 or the API message (`RealityHandoff.vue:52`).
- All four render into the same `role="alert"` paragraph (`RealityHandoff.vue:62`).

`copyCard` uses `navigator.clipboard.writeText` directly rather than the project's `copyText` helper (`apps/mp/src/clipboard.ts`), which has a hidden-textarea `execCommand` fallback. So on a WebView where the clipboard API is unavailable, the copy simply fails with the generic message and there is no fallback path.

## EMPTY_STATES

- contacts: `<p v-else class="muted">还没有保存联系人。</p>` (`RealityHandoff.vue:63`). Present and clear.
- No other list on the page. The preview always has text because `generatedText` falls back to the first preset (`RealityHandoff.vue:33-34`).

## NATIVE_RISKS

- Clipboard: as above, `navigator.clipboard` only. Inside the Capacitor WebView the clipboard API requires a secure context; `@capacitor/clipboard` is bundled in the APK (`apps/mp/android/app/src/main/assets/capacitor.plugins.json`) but is not imported by any mp source file, so the plugin is unused and there is no native fallback.
- Bottom sheet + back button: the contacts sheet is a plain `v-if` overlay with only the mask and the × to close (`RealityHandoff.vue:63`); the Android hardware back button is not intercepted (`apps/mp/src/native/back-button.ts:26-33`), so BACK with the sheet open leaves the page instead of closing the sheet.
- Keyboard: three inputs and one textarea, all in normal flow inside a `max-height:78vh` scrollable sheet (`RealityHandoff.vue` scoped `.contacts-sheet`); `Keyboard.resize: 'body'` (`apps/mp/capacitor.config.ts`) keeps them reachable but the sheet's `78vh` cap can push the 保存联系人 button under the keyboard on short screens. Not verified on device.
- Safe area: not a tab route; the page pads `calc(36px + env(safe-area-inset-bottom))` and the sheet pads `calc(22px + env(safe-area-inset-bottom))` (`RealityHandoff.vue` scoped styles). Adequate.
- No dial intent on this page.

## ISSUES

- P1 DATA: a saved help card is a dead end. There is no `GET /api/v1/handoffs` caller anywhere in `apps/mp` (the endpoint exists at `controllers.ts:604-607`), no admin resource for `RealityHandoff`, and no route that reads it back. The card is written once and never shown again to anyone, including the user.
- P1 FUNCTIONAL: the first time the user taps 我自己改一下 the textarea is empty. `cardText` starts as `''` (`RealityHandoff.vue:16`) and only gains a value after a save (`RealityHandoff.vue:44`), while the textarea binds `cardText` directly (`RealityHandoff.vue:60`). So the user sees the composed preview, taps edit, and is handed a blank field with the preview gone. There is no path to "edit what I just saw" before saving.
- P2 NATIVE: `copyCard` uses `navigator.clipboard` with no fallback (`RealityHandoff.vue:47`) even though `apps/mp/src/clipboard.ts` provides `copyText` with an `execCommand` fallback and is used by ToolRun for the same purpose (`apps/mp/src/views/ToolRun.vue:93`).
- P2 PRIVACY: neither write is gated by any `PrivacySetting` flag (`store.service.ts:4472-4489`, `:4508-4522`), and neither model has an admin resource, so a trusted contact's name and the user's crisis wording are stored with no user-visible or operator-visible surface.
- P2 DUPLICATE: the copy button is disabled until `saved` is truthy (`RealityHandoff.vue:60`), which forces a database write before the user can copy text the page has already generated locally. The user cannot just copy and paste into their own messaging app, which is the stated intent of the screen.
- P3 UX: after `saveCard` the label changes to 保存这一版求助卡 and the status line appears, but if the user then changes `recipient` or `need`, the preview changes while the copy button still copies the previously saved `cardText` (because `generatedText` prefers `cardText` over `defaultText`, `RealityHandoff.vue:34`). The user can copy text that does not match what is on screen.
- P3 FUNCTIONAL: `saveContact` requires both `nickname` and `contactHint` (`RealityHandoff.vue:50`) but silently returns without any message when either is empty, so tapping 保存联系人 with a blank field does nothing at all.
- P3 STATE_MACHINE: the contact list is only reloaded on mount (`onMounted(load)`, `RealityHandoff.vue:54`); after `saveContact` the new contact is unshifted locally (`RealityHandoff.vue:52`), so the local list and the server list agree only until another device or session changes it.

## FINAL_STATUS

PARTIAL - both writes and every control are traced to lines and the route renders on the APK (18 controls, 0 console errors), but the clipboard path, which is the page's only delivery mechanism, was not exercised on a device.

### Static evidence

- Controls discovered: 14
- API reads (static): `/api/v1/trusted-contacts`
- API writes (static): `POST /api/v1/handoffs`, `POST /api/v1/trusted-contacts`
- Candidate fake markers: 3
- Appended: all three fake-marker candidates are the HTML `placeholder` attributes on the three trusted-contact inputs (line 63), adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` (M21).
- Appended: `HandoffStatus` is `draft | ready | shared | completed` (`prisma/schema.prisma:118-123`); this page only ever produces `ready`, and no mp caller reaches `shared`, so two of the four enum values are unreachable from the product.
