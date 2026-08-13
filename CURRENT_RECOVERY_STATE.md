# Current Recovery State

- Project root: `C:\Users\zyu33\Documents\Codex\2026-07-04\yan`
- Git: no repository exists at this root; `git status` and `git diff` cannot provide a modification set.
- Active phase: Phase 6 isolated visual-fixture remediation (`IN_PROGRESS`).
- Current authoritative checkpoint: `production-checkpoint.json`.
- Latest complete historical strict run: `artifacts/visual-fixtures/v1/runs/run-2026-07-17_03-55-11-889` (96 rows, layout 0, mask policy 0, network leaks 0, 23 pixel failures).
- Current fixture health: PostgreSQL 55433, API 3001, front 5175, admin 5176, and deterministic AI stub 11435 are running; `pnpm visual:fixture:verify` passed after the current source/fixture reset.
- Live database, live uploads, and live services were not written or restarted in this recovery.

## Current-source capture

`admin/09-admin-feedback-ticket` was recaptured through the real table-row click after the current source changes. It remains failed: raw `8.01%`, masked `7.76%`, layout `0`, mask policy `0`, network leaks `0`.

The remaining values below are historical triage baselines only, because the runner now fixes locale/timezone/date, emits overlays, and opens the front reply sheet through real UI interaction. They must be recaptured before any acceptance claim.

| Reference | Historical masked diff |
| --- | ---: |
| admin/02-admin-dashboard | 9.25% |
| admin/03-admin-user-list | 8.31% |
| admin/04-admin-post-content | 8.99% |
| admin/05-admin-reply-moderation | 9.35% |
| admin/06-admin-ai-provider-center | 8.83% |
| admin/07-admin-ai-style-routing | 8.74% |
| admin/08-admin-ai-job-log | 8.50% |
| admin/09-admin-feedback-ticket | 7.46% (superseded by current 7.76%) |
| admin/10-admin-system-settings | 8.76% |
| front/01-square | 15.69% |
| front/02-mood-create | 16.10% |
| front/03-post-detail | 14.01% |
| front/04-post-detail-reply-sheet | 10.65% (invalid old query-open state) |
| front/05-letter-today | 14.35% |
| front/06-tool-index | 13.58% |
| front/07-tool-decompose | 12.57% |
| front/08-me | 9.02% |
| front/09-diary-list | 21.08% |
| front/10-report-month | 17.27% |
| front/11-letter-list | 15.60% |
| front/12-favorite-list | 13.03% |
| front/13-privacy-settings | 13.86% |
| front/14-feedback-help | 16.12% |

## Exact next action

At `1448×1086`, compare `design_refs/admin/09-admin-feedback-ticket.png` with `frame-admin-09-after-2026-07-21-a` overlay. Correct only the admin feedback page’s status/source filter widths, reference-format table values, and detail/reply-card geometry; then run lint, typecheck, fixture verify, and a new `--scope admin --page 09` capture. Do not change masks or the reference image.
