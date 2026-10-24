# Closure verification scripts

The scripts that produced the evidence cited by `CURRENT_CLOSURE_STATUS.md`,
`FINAL_PRODUCT_CLOSURE.md`, `ADMIN_FINAL_MATRIX.md`, `ANDROID_FINAL_MATRIX.md` and
`SECURITY_FINAL_MATRIX.md`.

They are versioned here because the closure documents cite them by name: a citation that points at
an ignored path is not evidence. The repository's `.gitignore` keeps `work/` (scratch) and
`artifacts/` (generated output) out of git, so the scripts were authored in `work/` and are mirrored
here, together with the output each one produced.

## Layout

| Path | Content |
| --- | --- |
| `verify-*.mjs` | the runnable checks |
| `captured/verify-*.output.txt` | the captured output of the run cited in the documents |
| `captured/qa-all.txt` | the full `pnpm qa:all` log (ANSI stripped) |
| `captured/qa-all-summary.txt` | per-step summary extracted from that log |

The directory is named `captured/` and the log keeps a `.txt` extension because `.gitignore` ignores
any `outputs/` directory and any `*.log` file; naming them that way keeps the evidence tracked
without adding exceptions to a repository-wide ignore rule.

## Running them

They talk to a running local stack and create real rows; they are not fixtures. Start the API, the
mp app and the admin app first (`pnpm dev`, or the three `--filter` commands individually), plus
PostgreSQL on the configured `DATABASE_URL`.

```bash
node docs/product-closure/verification/verify-safety-closure.mjs
node docs/product-closure/verification/verify-admin-search-pagination.mjs
node docs/product-closure/verification/verify-peer-report-admin.mjs
node docs/product-closure/verification/verify-security-controls.mjs
node docs/product-closure/verification/verify-admin-closure-ui.mjs      # needs admin on :5174
node docs/product-closure/verification/verify-ai-degradation-ui.mjs     # needs mp on :5173
```

Each prints one `PASS`/`FAIL` line per assertion, a final `n/n pass`, and exits non-zero on failure.

`verify-android-native.mjs` is different: it drives the app already running on an emulator over the
WebView DevTools protocol, so it needs `adb forward` first.

```bash
adb reverse tcp:3000 tcp:3000
adb forward tcp:9333 localabstract:webview_devtools_remote_$(adb shell pidof com.goodnight.treehole)
ANDROID_CDP_URL=http://127.0.0.1:9333 node docs/product-closure/verification/verify-android-native.mjs
```

## Two things to know before trusting a re-run

- **They write.** They create journeys, peer experiences, matches, conversations, reports and safety
  events, and they change privacy flags. Run them against a development database, not a shared one.
  `verify-security-controls.mjs` deliberately locks out one synthetic `x-forwarded-for` identity to
  prove throttling; it uses synthetic addresses so the real operator identity is never affected.
- **`verify-ai-degradation-ui.mjs` asserts the degraded state.** It first proves the provider really
  is refusing (HTTP 402), then asserts the user-visible fallback notice appears. If the DAPI account
  is funded, the provider succeeds and that script's fallback assertions will fail — that is the
  script correctly detecting that its precondition no longer holds, not a product regression.

## Result of the run cited in the documents

| Script | Result |
| --- | --- |
| `verify-safety-closure.mjs` | 19/19 |
| `verify-admin-search-pagination.mjs` | 58/58 |
| `verify-peer-report-admin.mjs` | 24/24 |
| `verify-admin-closure-ui.mjs` | 18/18 |
| `verify-ai-degradation-ui.mjs` | 9/9 |
| `verify-android-native.mjs` | 8/8 |
| `verify-security-controls.mjs` | 20/20 |
