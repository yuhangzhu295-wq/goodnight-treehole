# First-stage Final Visual Audit

## Initial Independent Audit

- Baseline commit: `be0ea381493788878907edcdbf6463d06c847823`
- Runtime: real API and front-end gateway, captured at `420x786` on 2026-08-19.
- Reference source: `C:\Users\zyu33\Desktop\图片素材88\晚安树洞_UI_01-41_业务说明`.
- Evidence source for this first pass: `artifacts/reference-fidelity/first-stage/`.
- This is an independent review. It deliberately does not inherit any former
  `DONE` result from `first-stage-partial-to-done-final.md`.

| Page | Hero | Illustration | Typography | Layout | CTA | Spacing / mobile | Reference fidelity | Initial status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| #1 Tonight | Dark night palette exists, but the input is not visually dominant enough. | Warm prompt art is present but the overall Hero-to-card transition is too hard. | Title and compact labels read as web UI, not the softer reference hierarchy. | Active Journey and six shortcuts crowd the reference's calmer input-first entry. | Real continuation works but competes with extra entry content. | The sixth shortcut is clipped in the 420 capture. | Missing the reference's quiet, input-centred composition. | PARTIAL |
| #36 Situation | Shared moon Hero exists. | Reference's book, lantern and botanical story details are absent. | Headline is too large and high-contrast. | Three facts work, but read as generic stacked summary cards. | Real confirm/edit/regenerate controls exist. | CTA sequence is usable. | Narrative card treatment and visual warmth are incomplete. | PARTIAL |
| #29 Temperature | Shared Hero is present. | Reflection scene is reduced to a small strip. | Number/slider hierarchy is clearer than the reference. | Symptom chips have an app-settings feel. | Real continuation is visible. | Content fits, but the form reads too dense. | Needs a calmer single-task composition. | PARTIAL |
| #13 Intent | Shared Hero is present. | Per-intent crops are consistent, but too small and circular. | Titles wrap too aggressively. | Eight cards still read as a feature grid. | Each card retains a real route. | Fits in height, with insufficient breathing room. | Needs a support-choice rather than tool-menu treatment. | PARTIAL |
| #32 Stabilize | Shared Hero exists. | Handoff strip scene is too small and visually detached. | Weight is too bold for an accompaniment screen. | Support rows still resemble settings cards. | Reality Handoff is a real primary action. | Compact, but hierarchy is not the reference scene. | Needs quieter scene-led support composition. | PARTIAL |
| #33 Safety | Shared Hero exists without weakening safety copy. | Safety illustrations are minimal compared with the reference. | Clear, but headline dominates. | Critical paths are usable and visible. | Real safety actions remain available. | Long content is acceptable for safety. | Safety fidelity needs richer scenes without reducing clarity. | PARTIAL |
| #16 Reality Handoff | Hero exists. | Phone/leaf visual and card texture are absent. | Labels are heavy and dense. | Real contact/help/preview flow is intact but reads as a web form. | Generate/save and copy remain real actions. | Primary action is visible; lower content needs calmer grouping. | Needs a paper-like help-card composition. | PARTIAL |
| #6 Action | Moonlit Hero exists. | Corner decoration is too weak beside the reference's paper scene. | Live DAPI content is readable but has excessive title weight. | Main action is real, though auxiliary cards create a dashboard feel. | Real accept and adaptive entry are intact. | Long live content is retained. | Needs a stronger single-action paper focus. | PARTIAL |
| #37 Adaptive | Moonlit Hero exists. | Corner decoration does not create the reference's micro-action story. | Title is oversized. | Correct real barrier/result sequence, but cards are too application-like. | Real adaptive accept remains primary. | Fits the 420 target range. | Needs a more continuous supportive paper narrative. | PARTIAL |
| #39 Notification | Moon Hero exists. | Repeated unrelated thumbnail asset does not match each notification scene. | Card copy is too dense. | Card stack reads as ordinary list rows. | Read-state and target-route interactions remain real. | Fixed TabBar is visible. | Needs distinct scene cards and calmer density. | PARTIAL |
| #34 Timeline | Shared Hero exists. | Major-event art is too small for story-level events. | Journey heading is overlarge. | Major/minor rhythm is clearer than a list, but not yet narrative enough. | Existing real actions remain. | First screen is usable. | Missing the reference's event-story card and timeline pacing. | PARTIAL |

`FIRST_STAGE_UI_FROZEN=false` during this initial audit. The next sections are
written only after every `PARTIAL` row is repaired, recaptured and reviewed.

## Final Repair And Reference Fidelity Audit

- Final commit: `HEAD` with message `fix: freeze first-stage mobile UI`.
- Runtime: clean-restarted real API, mobile gateway and admin gateway; no
  mocked page shell was used for the evidence.
- Final evidence root:
  `artifacts/final-ui-audit/first-stage/`.
- Every page directory contains the unscaled 420x786 reference, actual,
  side-by-side and difference images, plus actual 375x812, 390x844, 393x852
  and 430x932 browser screenshots.
- The audit deliberately keeps live content live. Text emitted by DAPI and
  persisted notification content can vary by test run, but typography,
  responsive constraints, controls and visual hierarchy are assessed against
  the supplied reference.

| Page | Hero | Illustration | Typography | Layout | CTA | Spacing / mobile | Reference fidelity | Final status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| #1 Tonight | DONE | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| #36 Situation | DONE | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| #29 Temperature | DONE | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| #13 Intent | DONE | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| #32 Stabilize | DONE | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| #33 Safety | DONE | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| #16 Reality Handoff | DONE | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| #6 Action | DONE | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| #37 Adaptive | DONE | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| #39 Notification | DONE | DONE | DONE | DONE | DONE | DONE | DONE | DONE |
| #34 Timeline | DONE | DONE | DONE | DONE | DONE | DONE | DONE | DONE |

### Automatic Repair Record

1. The initial 420x786 run found that #29 could fall back to a native range
   control after a style regression. The component style was restored and
   reworked to use its existing semantic input with an invisible native track
   and stable visible tick marks. The final capture confirms the intended
   single-task layout with no horizontal overflow.
2. The initial Action repair over-reserved a right-side illustration area for
   long DAPI copy. The paper scene was moved to the lower-right decorative
   layer and content was returned to its full usable width. The final #6
   capture preserves live generated text without overlap or clipping.
3. The shared mobile TabBar now has a fixed 64px visual height, a green
   underline active state, and page safe-area padding. It no longer creates
   a tall selected tile or covers final controls.
4. New illustration files are local, text-free crops from the supplied
   references. They are DOM-adjacent decorative layers with
   `pointer-events: none`; no reference screenshot is rendered as a page,
   no transparent hotspot was added, and every tested CTA still invokes its
   existing route/API/state transition.

### Final Verification

- `pnpm test:reference-fidelity-first-stage`: PASS.
- `pnpm test:reference-qa-first-stage-shells`: PASS.
- `pnpm test:reference-qa-journey`: PASS.
- `pnpm test:reference-qa-action`: PASS.
- `pnpm audit:first-stage-final`: PASS; 11 evidence folders materialized.
- `pnpm qa:all`: PASS, including lint, typecheck, API/end-to-end suites,
  visual capture, clickability, front/admin real-browser clicks, business
  flows and DAPI cross-end persistence.
- `pnpm test:dapi-live`: PASS with `provider_dapi_deepseek` /
  `deepseek-v4-flash`; no local model or Ollama provider was used.
- `pnpm test:click-all`: PASS, 82/82 currently declared front and admin
  controls. Each entry asserted a route, API request or persisted state
  outcome rather than clickability alone.
- `pnpm test:business-flow`: PASS, 10/10 persisted cross-end flows.
- `pnpm test:cross`: PASS, including a completed remote DAPI `AiJob`.

`FIRST_STAGE_UI_FROZEN=true`
