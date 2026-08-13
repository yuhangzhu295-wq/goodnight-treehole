# UI Layout Audit

- Local capture: `pnpm visual:capture-front` saved all 14 front viewport screenshots in `artifacts/screenshots/claude-after/`; each reported no 430px horizontal overflow.
- Multi-width DOM audit: all 14 pages had no horizontal overflow at 375, 390, 414, and 430. Evidence: `artifacts/layout/front-horizontal-overflow.md`.
- The dynamic 今日回信 advice label overflow was fixed with truncation and the overlap audit reran with zero text/button overflow.
- Pixel comparison is **not passing**: 11.45%–21.33% across current pages. `02-mood-create` also differs from its reference because the reference includes the explicitly removed reply-style section. No design reference was used as a page background.
- Safe-area and card-spacing heuristic reports contain REVIEW rows requiring a further visual design pass; they are not reported as completed.
