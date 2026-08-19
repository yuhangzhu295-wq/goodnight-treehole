# First-stage UI Truth Verification

Final status: **DONE**
FIRST_STAGE_UI_FROZEN=true

## Integrity boundary

- `materialize-first-stage-final-audit.ts` only copies fresh evidence and cannot assign visual status.
- This evaluator verifies capture dimensions and requires a complete reviewer decision record. It has no default visual status.
- The reviewer decision record was supplied after opening each source reference, actual capture, side-by-side image, and difference image.
- A frozen result is legal only when every page and every review area is DONE.

## Page aggregation

| Page | Title | Status | Reference navigation | Evidence |
| --- | --- | --- | --- | --- |
| 01-tonight | 今晚怎么了 | DONE | four-tab | [audit](../artifacts/final-ui-truth-audit/first-stage/01-tonight/audit.md) |
| 36-situation | 经历指纹确认 | DONE | four-tab | [audit](../artifacts/final-ui-truth-audit/first-stage/36-situation/audit.md) |
| 29-temperature | 情绪温度计 | DONE | four-tab | [audit](../artifacts/final-ui-truth-audit/first-stage/29-temperature/audit.md) |
| 13-intent | 支持意图 | DONE | four-tab | [audit](../artifacts/final-ui-truth-audit/first-stage/13-intent/audit.md) |
| 32-stabilize | 我先接住你 | DONE | four-tab | [audit](../artifacts/final-ui-truth-audit/first-stage/32-stabilize/audit.md) |
| 33-safety | 安全支持 | DONE | detail | [audit](../artifacts/final-ui-truth-audit/first-stage/33-safety/audit.md) |
| 16-handoff | 现实求助卡 | DONE | detail | [audit](../artifacts/final-ui-truth-audit/first-stage/16-handoff/audit.md) |
| 06-action | 今晚，只做这一件事 | DONE | four-tab | [audit](../artifacts/final-ui-truth-audit/first-stage/06-action/audit.md) |
| 37-adaptive | Adaptive Micro Action | DONE | four-tab | [audit](../artifacts/final-ui-truth-audit/first-stage/37-adaptive/audit.md) |
| 39-notification | 提醒与回访 | DONE | four-tab | [audit](../artifacts/final-ui-truth-audit/first-stage/39-notification/audit.md) |
| 34-timeline | Journey 时间线 | DONE | detail | [audit](../artifacts/final-ui-truth-audit/first-stage/34-timeline/audit.md) |

## Reference-derived TabBar contract

- Four-tab navigation: #1 Tonight, #36 Situation, #29 Temperature, #13 Intent, #32 Stabilize, #6 Action, #37 Adaptive Action, #39 Notification.
- Detail navigation: #33 Safety, #16 Reality Handoff, #34 Journey timeline. These pages keep their real return controls and no longer receive a global fixed TabBar.

## Evidence root

- C:\Users\zyu33\Documents\Codex\2026-07-04\yan\artifacts\final-ui-truth-audit\first-stage
- Reviewer input: C:\Users\zyu33\Documents\Codex\2026-07-04\yan\docs\first-stage-ui-truth-review.json

## Notification persisted-state QA

- `test:notification-truth-state` uses an isolated relational test schema. It never injects a Vue array or a transparent test overlay.
- Four-type reference state: COOLDOWN_RELEASED, FOLLOW_UP, FUTURE_SELF, PEER_REQUEST.
- Card click persisted status: read; stress count: 20; cleanup API count: 0.
- Evidence: `artifacts/notification-truth-states/empty.png`, `single.png`, `reference-four.png`, `stress.png`, and `manifest.json`.

## Current outcome and next step

- This execution is frozen: every page and every manually reviewed visual area is `DONE`, and all capture, interaction, persistence, browser and cross-end checks in this report are current.
- Static reference copy and runtime data can legitimately differ. Dynamic DAPI responses, current Journey events and persisted notification text remain live data; they were not replaced with a screenshot or hard-coded sample text to make the comparison appear closer.

## Page-by-page repair summary

Every row was inspected from its current 420x786 `reference.png`, `actual.png`, `side-by-side.png`, and `difference.png` set under `artifacts/final-ui-truth-audit/first-stage/<page>/`.

| Page | Before | After and repair points | Reviewer result |
| --- | --- | --- | --- |
| #1 Tonight | The opening scene did not keep the reference's input-first reading order or stable quick-entry spacing. | Rebalanced night Hero, textarea, six quick entries, companion paper and primary continue action; kept relationship, notification and Journey actions live. | DONE |
| #36 Situation | The confirmation content read as disconnected cards. | Consolidated it into one continuous paper with the three narrative sections, local decorations and real confirm/edit/reanalyze actions. | DONE |
| #29 Temperature | The slider, symptoms and support copy did not follow the reference's single-task rhythm. | Reordered the real range, symptom choices, thought note and support note; retained actual 1-10 data and both save/record actions. | DONE |
| #13 Intent | The eight real support choices lacked the intended warm-paper hierarchy. | Restored the 2-column eight-choice grid, local scene assets and bottom cue while preserving every branch selection. | DONE |
| #32 Stabilize | Breathing, calming, note and real-help controls competed visually. | Established the continuous support-paper order: opening, breathing, calm box, note, real-world support and CTAs. | DONE |
| #33 Safety | Hero height and safety-action density did not match the reference; navigation needed detail-page treatment. | Tightened the Hero and action sequence, added the 3-column step rhythm, preserved real handoff/12356/120/acknowledge actions, and removed the global TabBar as required by the reference. | DONE |
| #16 Handoff | Contact and assistance grids did not match the reference proportions. | Applied short Hero, 4+2 contact layout, 3x2 help layout, phone preview and real generate/save/copy/edit/contact-drawer actions. | DONE |
| #6 Action | Dynamic DAPI action text could crowd the visual hierarchy. | Kept real DAPI output readable with natural wrapping, a primary-action paper, follow-up strip and retained complete/not-complete/assist paths. | DONE |
| #37 Adaptive | The obstacle selection and reduced-action result did not form the reference's clear sequence. | Rebuilt the sequence as previous action, 2x3 barriers, real DAPI smaller action, effort controls and real regenerate/accept actions. | DONE |
| #39 Notification | The live list lacked compact reference hierarchy and type-specific visual anchors. | Added the compact Hero/filter/card structure and persisted type icons; empty, single, four-type and 20-item stress states remain API-backed and clicking a card persists `read`. | DONE |
| #34 Timeline | Summary and timeline events lacked the reference's compact temporal hierarchy. | Applied the dedicated short Hero, compact Journey summary, trend and event anchors; retained real event count, add-update input and journey actions without a TabBar. | DONE |

## Executed verification commands

- Recorded at: 2026-08-19T22:08:30+08:00
- PASS `pnpm lint`: ESLint completed without findings.
- PASS `pnpm typecheck`: API, admin, mobile, shared types and SDK type checks completed.
- PASS `pnpm test:reference-fidelity-first-stage`: Fresh 11-page 420x786 captures were regenerated after the final service restart; every captured page reports scrollWidth=420.
- PASS `pnpm test:reference-qa-first-stage-shells`: Four mobile viewport shell and reference-navigation checks passed.
- PASS `pnpm test:reference-qa-journey`: Five Journey states passed, including tabs for #36/#29/#13/#32 and no tab bar for #34.
- PASS `pnpm test:reference-qa-action`: Action and adaptive mobile reference geometry checks passed.
- PASS `pnpm test:notification-truth-state`: Empty, single, four-type, stress 20 and cleanup state evidence were persisted in an isolated schema.
- PASS `pnpm test:goodnight-2`: 3 incremental persistence, follow-up delivery and peer-conversation tests passed.
- PASS `pnpm test:real-browser-first-batch`: 17 browser evidence states passed and the generated fixtures were cleaned up.
- PASS `pnpm test:real-browser-goodnight-2`: C-end and admin browser routes completed with fixture cleanup evidence.
- PASS `pnpm test:click-all`: 124 visible controls passed with expected route or API evidence.
- PASS `pnpm test:business-flow`: 10 front-to-admin-to-front business flows passed.
- PASS `pnpm test:cross`: 3 cross-terminal acceptance tests passed.
- PASS `pnpm test:dapi-live`: DAPI provider_dapi_deepseek / deepseek-v4-flash succeeded with fallbackUsed=false; no local or Ollama model was invoked.
- PASS `pnpm qa:all`: Final full suite completed lint, typecheck, unit, API, E2E, visual, diagnostics, real-browser clicks, click-all, business flow and cross-flow checks.
