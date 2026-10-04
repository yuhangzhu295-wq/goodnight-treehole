# Earlier-round verification scripts

The verification scripts from the rounds before the release-candidate round, recovered from `work/`.

They were authored in `work/`, which `.gitignore` excludes, and `work/` is **not** covered by
`scripts/backup-all.ps1` either (it archives `artifacts/recovery`, `artifacts/post-recovery` and
`artifacts/product-closure`). So these scripts existed in exactly one place on one machine while the
tracked documents cited them as evidence — `CLOSURE_REGISTER.md` and `CURRENT_CLOSURE_STATUS.md`
reference `verify-fixed-issues.mjs`, `verify-settings-enforced.mjs`, `verify-login-throttle.mjs`,
`verify-privacy-data.mjs`, `verify-hug.mjs`, `verify-admin-error-visible.mjs` and `verify-core-flow.mjs`
by name. A citation to a file nobody can open is not evidence, so they are versioned here.

These are the scripts that produced the pass counts recorded in `CLOSURE_REGISTER.md` and
`CURRENT_CLOSURE_STATUS.md`. They were not re-run in the release-candidate round; the counts they are
cited for are from the round that produced them.

The current round's scripts live one directory up, with their captured output in `captured/`.

## Notes

- Each file's `/* global */` line was corrected so the linter accepts them; nothing else was changed.
- They talk to a running local stack and write real rows. Run them on a development database.
- `work/` still holds ~90 other one-off scripts (discovery, debugging, matrix generation) that are not
  versioned here; they are archived instead in the backup's evidence bundle, under
  `product-closure/evidence/work-scripts/`.
