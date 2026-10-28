# PeerGraduation

Source: `apps/mp/src/views/PeerGraduation.vue`

Routes: `/pages/peer/graduate`

## PURPOSE

PeerGraduation closes the loop after an anonymous conversation ends. It records how the conversation felt, optionally lets the user leave one sentence, and - if the user explicitly chooses 愿意匿名分享 - creates a new pending-review PeerExperience so their "后来" can help someone else. It is also the page that surfaces the "share a later" privacy consent.

## USER_JOB

"That conversation is over. Let me note whether it helped, and decide separately whether anything of it should be shared."

## ENTRY

- `closeConversation()` in PeerConversation (`apps/mp/src/views/PeerConversation.vue:14`).
- `block()` in PeerConversation (`apps/mp/src/views/PeerConversation.vue:16`).
- 留下感受 in PeerConversation's closed card (`apps/mp/src/views/PeerConversation.vue:29`).
- Reachable with no `matchId` by typing the URL; `loadConversation` then sets `conversation = null` and the summary card is hidden (`PeerGraduation.vue:6`, `:14`, `:22`).

## EXIT

- 愿意匿名分享 -> `save(true)`: POSTs the feedback with `shareLater:true`, sets `complete`, and **does not navigate** (`PeerGraduation.vue:15`, `:23`).
- 以后再说 -> `save(false)`: POSTs the feedback with `shareLater:false`, sets `complete`, and does not navigate (`PeerGraduation.vue:15`, `:23`).
- 先不分享 -> `/pages/peers/index` with no API call at all (`PeerGraduation.vue:23`).
- There is no explicit "done" exit; after a successful save the page simply stays with the buttons disabled.

## ROUTES

`/pages/peer/graduate` (`apps/mp/src/router.ts:62`). One route, no aliases, not a `tabRoute`, but listed in `tabbarPaths` (`apps/mp/src/App.vue:15`).

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| conversation summary shown | `conversation` non-null | `PeerGraduation.vue:8`, `:14`, `:22` |
| conversation summary hidden (bad matchId) | `conversation === null` | `PeerGraduation.vue:14`, `:22` |
| selected feeling | `feedback` (default `'helpful'`) | `PeerGraduation.vue:7`, `:23` |
| note field open | `noteOpen` | `PeerGraduation.vue:7`, `:23` |
| note text | `note` | `PeerGraduation.vue:7`, `:23` |
| saving (both save buttons disabled + relabelled) | `busy` | `PeerGraduation.vue:7`, `:15`, `:23` |
| saved (success note, buttons disabled, 已完成) | `complete` | `PeerGraduation.vue:7`, `:15`, `:23` |
| error note | `error` | `PeerGraduation.vue:7`, `:15`, `:23` |
| message count | `messageCount` from `conversation.messages.length` | `PeerGraduation.vue:9`, `:22` |
| start date | `startedLabel` from `conversation.startsAt` | `PeerGraduation.vue:10-13`, `:22` |

## CONTROLS

| control (label/testid) | handler | what it actually does |
| --- | --- | --- |
| 有被接住 / 没什么变化 / 有点不舒服 (no testids) | `feedback = option.value` | sets the feeling; local only until a save |
| 想留下一句话（可选） / 收起这句话 (no testid) | `noteOpen = !noteOpen` | toggles the note textarea |
| note textarea (maxlength 500, no testid) | `v-model="note"` | the optional sentence |
| 愿意匿名分享 (no testid, class `share`) | `save(true)` | POSTs feedback with `shareLater:true`, which may create a PeerExperience |
| 以后再说 (no testid, class `later`) | `save(false)` | POSTs feedback with `shareLater:false` |
| 先不分享 (no testid, class `back`) | inline `router.push('/pages/peers/index')` | leaves without saving anything |

Cross-check: `artifacts/product-audit/control-manifest.json` lists 6 controls; `artifacts/post-recovery/control-coverage.json` records `/pages/peer/graduate` in state `default` with the three feeling buttons `no observable change`, 想留下一句话 `changed`, and 愿意匿名分享 / 以后再说 / 先不分享 all `not-found` (0 console errors, 0 failed requests). The clicker reached the page with no conversation, and the three save buttons were never exercised.

## API_READS

- `GET /api/v1/peer-conversations` (`PeerGraduation.vue:14`), then `.items.find(item => item.matchId === matchId)`. Handler `controllers.ts:687-690` -> `store.conversationList` (`store.service.ts:4150-4156`). The catch swallows the error and sets `conversation = null` with no user-visible message.

## API_WRITES

- `POST /api/v1/peer-conversations/:matchId/feedback` with `{feedback, note, shareLater}` (`PeerGraduation.vue:15`). Handler `PublicController.peerConversationFeedback` (`controllers.ts:729-736`) -> `store.savePeerConversationFeedback` (`store.service.ts:4227-4282`), which writes **PeerConversation** (`feedback`, `feedbackNote`) and, when `shareLater === true` and `allowAnonymousExperienceShare` is on, creates a new **PeerExperience** with `status:'pending_review'` (`store.service.ts:4243-4276`).

## DB_ENTITIES

- Reads: **PeerConversation**, **PeerMessage** (for the count), **PeerMatch**, **PeerExperience**, **LifeJourney**, **SituationSnapshot**, **PrivacySetting** (inside the share branch).
- Writes: **PeerConversation**, **PeerExperience** (conditional).
- Cross-checked against `prisma/schema.prisma:767-791`, `:496-522`, `:524-550`.

## ADMIN_VISIBILITY

- The feedback is stored on the conversation and appears under **peer-conversations** -> `/experience/peer-conversations` (`apps/admin/src/router.ts:70`, `controllers.ts:2029-2044`).
- A shared experience is created as `pending_review` and therefore appears in the moderation queue under **peer-experiences** -> `/experience/peers` (`apps/admin/src/router.ts:67`), reviewed through `PATCH /api/admin/v1/peer-experiences/:id/review` (`controllers.ts:1977-1991`, which writes an audit log entry `PEER_EXPERIENCE_REVIEW`).
- No notification is created by this page.

## AI_USAGE

None. `savePeerConversationFeedback` does not call `queueAI` (`store.service.ts:4227-4282`). The share text is not AI-generated: it is the user's note, redacted, or a fixed sentence (`store.service.ts:4252-4254`).

## PRIVACY

- Saving feedback requires that the conversation is finished: `savePeerConversationFeedback` throws 400 请先结束这段同行，再留下感受 when the conversation is still `active` and unexpired (`store.service.ts:4233-4234`). This is what stops a user from graduating a live chat.
- The feedback value is whitelisted to `helpful` | `unchanged` | `uncomfortable` (`store.service.ts:4236-4237`).
- The note is PII-checked by `assertPeerDraftSafe` and throws 400 rather than redacting (`store.service.ts:4239`).
- Sharing is gated by `privacyAllows(userId, 'allowAnonymousExperienceShare')`, which throws 403 with 请先在隐私设置中允许匿名留下经历 if the flag is off (`store.service.ts:4244`). This is the only place in the peer flow that consults that flag.
- The shared experience is created as `pending_review`, so it is never visible to peers until an admin publishes it (`store.service.ts:4270`; `peerNetwork` filters on `status === 'published'`, `:3709`). Consent-to-share and consent-to-publish are correctly separated.
- The share text is redacted before storage (`store.service.ts:4252-4254`).

## ERROR_STATES

One error path, driven by `error`: a failed save sets 这份感受暂时没有保存成功 or the API message (`PeerGraduation.vue:15`), rendered at the bottom of the page (`:23`). The two save buttons re-enable because `busy` is cleared in `finally` (`:15`).

The 403 from a missing `allowAnonymousExperienceShare` surfaces as the raw API message 请先在隐私设置中允许匿名留下经历 with no link to the privacy settings, so the user has to find the setting themselves.

The conversation read has **no** error state: the catch is bare (`catch { conversation.value = null; }`, `PeerGraduation.vue:14`), so a failed read is indistinguishable from "no conversation" and the summary card simply disappears.

## EMPTY_STATES

- No conversation resolved: the summary card is hidden (`v-if="conversation"`, `PeerGraduation.vue:22`) and the page still shows the hardcoded 72 in the second stat is absent with it; the feeling buttons, note toggle and all three buttons remain usable.
- No note: the textarea is hidden until 想留下一句话 is pressed (`v-if="noteOpen"`, `:23`).
- No error-specific empty state.

## NATIVE_RISKS

- Safe area: the page pads `142px` bottom (`PeerGraduation.vue:29`); the tab bar renders because the path is in `tabbarPaths`.
- Keyboard: the note textarea is in normal flow; `Keyboard.resize:'body'` keeps it visible.
- Back button: nothing to intercept; the page has no overlay.
- No dial intent, no clipboard, no file picker.
- The hero uses a CSS gradient background with no image asset (`PeerGraduation.vue:29`).

## ISSUES

- P1 DATA: the journey summary is partly fabricated. The card hardcodes `<b>72</b>` for 小时安全边界 (`PeerGraduation.vue:22`) rather than reading `expiresAt - startsAt`, and when `conversation` is null it renders nothing at all - but if a conversation exists with a non-72h window (which the server does allow, `store.service.ts:4078` is the only writer today) the page would state a wrong fact. The `messageCount` and `startedLabel` fall back to `0` and 刚刚 respectively (`PeerGraduation.vue:9`, `:13`), so a failed read would be presented as "0 messages, started just now" if the card were rendered.
- P2 FAKE_FUNCTION: 以后再说 reads as "decide later" but it is a full save: it POSTs the feedback with `shareLater:false` and permanently sets `complete`, disabling both buttons (`PeerGraduation.vue:15`, `:23`). The only true "do nothing" control is 先不分享.
- P2 PRIVACY / UX: when `allowAnonymousExperienceShare` is off, 愿意匿名分享 fails with a 403 whose message tells the user to go to privacy settings but provides no link or navigation (`PeerGraduation.vue:23`; error from `store.service.ts:4244`). The user must find `/pages/settings/privacy` by hand.
- P2 STATE_MACHINE: `feedback` defaults to `'helpful'` (`PeerGraduation.vue:7`), so pressing 愿意匿名分享 without touching the feelings row records 有被接住. A neutral default (no selection, save disabled) would match the page's own framing that the feeling is a choice.
- P2 UX: the share preview under 如果分享，别人会这样看见你 shows hardcoded copy (`PeerGraduation.vue:23`), not the user's actual note, so the preview does not show what would actually be published.
- P3 STATE_MACHINE: the conversation read swallows all errors (`PeerGraduation.vue:14`), so the summary silently vanishes on a network failure with no error and no retry.
- P3 NAVIGATION: after a successful save the page stays put with disabled buttons; there is no 完成 or return control, so the only way out is the bottom tab bar or the Android back button.

## FINAL_STATUS

PARTIAL - the feedback write, the share gate and the pending-review creation are traced to concrete lines, but the runtime walk reached the page with no conversation and all three save buttons were `not-found`, so the save path was never exercised on the device.

### Static evidence

- Controls discovered: 6
- API reads (static): `/api/v1/peer-conversations`
- API writes (static): `POST /api/v1/peer-conversations/:param/feedback`
- Candidate fake markers: 1 - adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` M16 (a textarea placeholder) and M37 (the 愿意匿名分享 button does create a persisted `pending_review` PeerExperience, not a frontend-array push).
- Appended: `tests/business/peer-support-stage.spec.ts:196` shows the created experience must be published by an admin before it can be matched, which is the executable form of "consent-to-share != consent-to-publish".

