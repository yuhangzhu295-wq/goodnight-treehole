# First-stage Partial-to-Done Final

## Scope and Method

This is the final visual acceptance record for the six pages that were
previously marked `PARTIAL` from baseline
`0cca9d831a185eb8af5ed082f85e9e12778353ee`.

All reference decisions were reviewed against the supplied files in
`C:\Users\zyu33\Desktop\图片素材88\晚安树洞_UI_01-41_业务说明` at their native
`420x786` frame. The implementation uses DOM text, controls and runtime data;
only text-free, control-free decorative crops were added under
`apps/mp/src/assets/goodnight/illustrations/`. No reference screen is rendered
as a page background or interactive surface.

## Final Acceptance

| Page | Hero | Illustration | Typography | Main layout | CTA | Spacing | Mobile height | Reference fidelity | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| #37 Adaptive Action | Compact supportive Hero; prior action and obstacle question stay above the real generated result. | Text-free moon/tree corner crop. | Three clear levels: context, result label, generated action. | 2x3 barriers followed by a single real result card. | `试试这个更小一步` remains the primary API-backed action. | Card and grid gaps reduced without hiding data. | `874px` at 420x786; responsive QA keeps its core flow within 1.3 screens. | Reference hierarchy, compactness and warm night scene are matched without static output. | DONE |
| #6 Action | Blended moonlit tree Hero with warm light and no hard reference crop. | Text-free moon/tree corner crop. | Main action has highest contrast; helper entries are quiet. | Primary action, follow-up and shortcuts retain their existing real components. | Real AI Action Plan remains primary. | Consistent compact cards and grid gaps. | `867px` at 420x786 with a long live DAPI result; layout minimum is `820px`. | Reference focus and moonlit visual language are matched while preserving live content. | DONE |
| #1 Tonight | Moon, tree shadow and warm night field frame the real input as first focus. | Existing text-free night scene and tree asset. | Title/supporting text yield to the input and active journey. | Input lightly overlaps Hero; six real shortcuts remain one horizontal set. | Real `继续` CTA remains visible after the active journey. | Journey, quiet prompt and CTA were compacted into one rhythm. | `845px` at 420x786. | Reference's calm nightly entry hierarchy is matched without adding modules. | DONE |
| #34 Journey Timeline | Existing timeline header preserved. | Existing journey art is expanded only for major events. | Major event title/detail outweigh minor updates. | Major/minor event rhythm and a restrained `8 → 6` trend replace dashboard-like density. | Existing navigation and event semantics are unchanged. | Greater major-event whitespace; minor updates remain compact. | `863px` at 420x786. | Reference's narrative two-level timeline pacing is matched. | DONE |
| #32 Stabilize | Quiet night-support presentation, not a settings panel. | Text-free bench/lantern/tree crop in the handoff note. | Calm entry labels with clear visual priority for handoff. | Three real support actions retain their original behavior. | Reality Handoff is the only primary CTA; alternate support is text-level. | Scene decoration does not add page length. | `837px` at 420x786. | Reference's quiet support scene and CTA hierarchy are matched. | DONE |
| #13 Support Intent | Existing need-selection header preserved. | Eight text-free, per-intent hand-drawn icon crops. | Prompt reads as a support choice rather than a feature list. | Existing eight cards retain their real values and routes. | Each card remains its existing clickable navigation action. | Larger art, measured card height and softer focus treatment. | `800px` at 420x786. | Reference's illustrated support-choice rhythm is matched without extending the page. | DONE |

## Responsive and Interaction Evidence

- `test:reference-fidelity-first-stage` generated reference, actual,
  side-by-side and difference screenshots for all six pages in
  `artifacts/reference-fidelity/first-stage/`; each final capture has
  `scrollWidth = 420` at the `420x786` viewport.
- `test:reference-qa-first-stage-shells`, `test:reference-qa-journey` and
  `test:reference-qa-action` passed at `375x812`, `390x844`, `393x852` and
  `430x932`, including safe-area, fixed TabBar, CTA and no-horizontal-overflow
  checks.
- `test:real-browser-first-batch`, `test:real-browser-goodnight-2`,
  `test:goodnight-2`, `test:dapi-live`, `test:click-all` and `qa:all` all
  exited with code 0 after this visual pass. The full journey path, high
  distress/safety path, front/admin click coverage and a remote DAPI job were
  exercised.
- The DAPI verification recorded provider `provider_dapi_deepseek`, model
  `deepseek-v4-flash`, a succeeded asynchronous job and no fallback. No local
  or Ollama model was used for this verification.
- Browser fixtures are cleaned by the test cleanup endpoint; normal front
  screens do not retain browser-test journeys, actions, decisions or drafts.

## Preserved Boundaries

No Prisma schema, API contract, DAPI/provider setting, BullMQ behavior,
FollowUp/Journey state machine, Peer, Me, Report or Admin code changed in this
pass. All added images are decorative `pointer-events: none` layers around
existing real DOM controls and runtime data.

## Known Non-Blocking Difference

The supplied references contain fixed sample copy, whereas Action and Adaptive
Action render real DAPI-generated copy. Their measured height may therefore
vary within the verified responsive layout; it is not replaced by a static
sample or clipped to force a screenshot match.
