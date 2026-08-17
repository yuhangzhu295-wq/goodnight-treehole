# GoodnightTreeHole 2.0 Phase 2 Visual Report

Date: 2026-08-17

## Current evidence

`pnpm exec tsx scripts/capture-goodnight-2-evidence.ts` completed with:

```text
captured=23 overflow=0
```

The capture viewport is `390x844`, and the evidence directory is
`docs/evidence/goodnight-2.0-phase2/`. It contains the following actual local
browser captures: `01-tonight.png`, `02-journey.png`, `03-need-routing.png`,
`04-fingerprint.png`, `05-action.png`, `06-action-missed-state.png`,
`07-peer-match.png`, `08-peer-requests.png`, `09-peer-detail.png`,
`10-peer-conversation.png`, `11-journey-timeline.png`, `12-decision-vault.png`,
`13-cooldown.png`, `14-reality-handoff.png`, `15-future-self.png`,
`16-support-plan.png`, `17-recovery.png`, `18-me.png`, `19-report.png`,
`20-privacy.png`, `21-admin-dashboard.png`, `22-admin-peer-experiences.png`,
and `23-admin-follow-ups.png`.

The machine-readable URLs, viewport, SHA-256 and overflow results are in
`docs/evidence/goodnight-2.0-phase2/capture-report.json`.

## Visual fixes verified in this pass

- The action-center handoff form now has a real default channel bound to its
  select model, so the visible first option and submitted value agree.
- Monthly-report actions are fixed above the tabBar and the page reserves a
  safe content area; `elementFromPoint` now resolves both real action buttons.
- The clickability diagnostic waits for asynchronous result cards and uses
  Playwright visibility scrolling before checking the actual hit target.
- The existing front theme keeps decorative layers pointer-free and hides
  horizontal overflow; no reference image is used as a full-page background.

## Legacy 14-page visual regression

The local visual suite captured all 14 existing front pages with
`hscroll=false`. Current source-to-reference diff rates were:

`12.42%, 16.69%, 14.00%, 11.35%, 16.41%, 14.55%, 11.30%, 10.42%, 22.25%,
17.81%, 16.82%, 12.64%, 14.34%, 18.20%`.

The visual tests pass their layout assertions, but these rates are not
pixel-perfect acceptance. The diary page is the largest remaining divergence;
report/action placement also changed the monthly-report diff to 18.21% while
removing tabBar occlusion.

Browser chrome, OS notifications and screenshot-tool UI are excluded from the
product visual assertions.
