# RC QA MATRIX

Every result below was produced in this round on this machine. Nothing is carried over from an
earlier run. `QA_ALL_PASS = false` — see the note at the end; the cause is external and singular.

## `pnpm qa:all` — the gate

20 step labels executed, 14 logical steps. **13 pass, 1 fails** (`test:cross`).

| Step | Result | Detail |
| --- | --- | --- |
| lint | PASS | 0 errors, 6 warnings (all pre-existing) |
| typecheck | PASS | api, admin, mp, shared-types, api-sdk |
| test:unit | PASS | 2 files / 7 tests |
| test:api | PASS | 1 file / 2 tests |
| test:e2e | PASS | 12 files / 12 tests |
| test:visual | PASS | 2 files / 2 tests |
| diagnose:all → runtime | PASS | |
| diagnose:all → dom-overlays | PASS | |
| diagnose:all → routes | PASS | |
| diagnose:all → api-bindings | PASS | |
| diagnose:all → clickability | PASS | |
| audit:ui-artifacts | PASS | ran twice, both clean |
| test:real-browser-front-clicks | PASS | exit 0 |
| test:real-browser-admin-clicks | PASS | exit 0 |
| test:real-browser-cross-flow | PASS | exit 0 |
| test:click-all | PASS | **124 PASS / 0 FAIL** |
| test:business-flow | PASS | exit 0 |
| **test:cross** | **FAIL** | 1 failed / 2 passed — `uses the supplied remote DAPI and persists the completed AiJob` expects `status: 'succeeded'`; the account returns HTTP 402 |

Log: `artifacts/product-closure/evidence/rc-qa-all.log` (1427 lines, ANSI stripped).

An earlier attempt at this run failed `test:click-all` with 9 failures (all "element not visible" or
"expected API not seen"). That was the API process dying mid-run, not a product fault: the same
checks pass 124/124 when the API stays up, which is what the run above shows. The step was re-run with
the servers and the gate inside a single process tree so nothing could separate them.

## Business suites (Stage 1 / 2 / 3)

| Suite | Result | Detail |
| --- | --- | --- |
| test:first-batch-core | PASS | 2/2 |
| test:peer-stage-business | FAIL (external) | same spec, 4 invocations |
| test:peer-stage-security | FAIL (external) | |
| test:peer-stage-two-user | FAIL (external) | |
| test:peer-stage-expiry | FAIL (external) | |
| test:third-stage-business | PASS | 1/1 |
| test:third-stage-persistence | PASS | 2/2 |
| test:third-stage-security | PASS | 1/1 |
| test:third-stage-memory | FAIL (external) | AI job must be `succeeded` |
| test:third-stage-decision | PASS | 1/1 |
| test:third-stage-future-self | PASS | 1/1 (see note) |
| test:third-stage-privacy | PASS | 1/1 |
| test:third-stage-monthly-report | FAIL (external) | `expected 'fallback' to be 'succeeded'` |
| test:third-stage-archive | PASS | 1/1 |
| test:third-stage-migrations | PASS | fresh PASS / upgrade PASS / cleanup PASS |

The four `test:peer-stage-*` scripts all run the **same** spec file
(`tests/business/peer-support-stage.spec.ts`) with different names, and all four stop at the same
assertion: the peer assist AI job must end `succeeded`. `tests/business/third-stage-monthly-report.spec.ts`
is not part of `qa:all`.

**Note on `test:third-stage-future-self`.** It was flaky on unchanged code — 1 pass, 2 failures across
three runs — because it asserts a future message's `contextLabel`, which is derived from the journey
title, while an asynchronous AI completion was rewriting that title. Investigating it found a real
product defect (the AI result replaced a title the user had chosen, in a block that otherwise refuses
to overwrite user-confirmed facts). Fixing that (`9da861f`) made the spec deterministic: five
consecutive passes, and 1/1 in the gate run above.

## Migration gate

| Check | Result |
| --- | --- |
| `test:third-stage-migrations` | fresh PASS (12), upgrade PASS (12), cleanup PASS |
| clean database from 0 tables | 12 migrations applied, 54 tables |
| diff(clean → schema) / diff(schema → clean) / diff(migrations → schema) | all empty |
| generated client deleted + regenerated | ok, runtime probe ok |
| `MIGRATIONS_REPRODUCIBLE` | **true** |

Details in `MIGRATION_REPRODUCIBILITY.md`.

## Closure verification suites

| Suite | Result |
| --- | --- |
| `verify-safety-closure.mjs` | 19/19 |
| `verify-admin-search-pagination.mjs` | 58/58 |
| `verify-peer-report-admin.mjs` | 24/24 |
| `verify-peer-report-history.mjs` | 24/24 |
| `verify-admin-user-note.mjs` | 22/22 |
| `verify-admin-closure-ui.mjs` | 18/18 |
| `verify-admin-rc-ui.mjs` | 16/16 |
| `verify-ai-degradation-ui.mjs` | 9/9 |
| `verify-security-controls.mjs` | 20/20 |
| `verify-android-native.mjs` | 8/8 |
| `verify-android-rc.mjs` | 12/12 |
| prior-round regressions (`verify-fixed-issues`, `verify-settings-enforced`, `verify-login-throttle`, `verify-privacy-data`, `verify-hug`, `verify-admin-error-visible`, `verify-core-flow`) | 9/9, 7/7, 7/7, 8/8, 7/7, 4/4, 15/15 |

## DAPI

| Check | Result |
| --- | --- |
| `test:dapi-live` | FAIL — provider test returns HTTP 402 |
| `provider_dapi_deepseek` test | HTTP 402 |
| `provider_openai_remote` test | HTTP 401 |
| local model available as a substitute | none (`provider_qwen` disabled, Ollama off) |
| fallback path verified instead | 9/9 in a browser, 12/12 on the native app |
| `DAPI_VERIFIED` | **false** — `BLOCKED_EXTERNAL` |

Details in `DAPI_FINAL_VERIFICATION.md`.

## Android

| Check | Result |
| --- | --- |
| APK built from HEAD | `BUILD SUCCESSFUL`, sha256 `57e2cd96…` |
| installed + launched | `Success`, `topResumedActivity=…/.MainActivity` |
| `verify-android-native.mjs` | 8/8 |
| `verify-android-rc.mjs` | 12/12 (core business, BACK, peer report, AI fallback) |
| `ANDROID_EMULATOR_VERIFIED` | **true** |
| `PHYSICAL_ANDROID_VERIFIED` | **false** — `adb devices -l` lists only `emulator-5554`; reason `NO_PHYSICAL_ANDROID_CONNECTED` |

## Fake-control re-scan

These counters are claims about the **audited surface**, not about every route that exists. The scope
is stated so the numbers cannot be read as broader than they are.

| Counter | Value | Basis | Scope |
| --- | --- | --- | --- |
| `FAKE_BUTTON_COUNT` | 0 | `test:click-all` asserts, per interaction, that the expected API call and/or URL was observed. 124/124 pass. | the 124 interactions in `tests/interaction-manifest.front.json` and `…admin.json` |
| `FAKE_FUNCTION_COUNT` | 0 | same run, plus every closure suite asserts persistence after the write | same 124 interactions |
| `WRITE_ONLY_OPERATION_COUNT` | 0 | the two write-only operations found in the audit were closed this round: the user note now persists a real row, and the peer report now has history. Both asserted against PostgreSQL. | controls reachable from the product UI. **Not a claim that no endpoint anywhere echoes its input** — `PATCH/POST users/:id/tags` does exactly that and is recorded as an open P3 in `RC_STATUS.md`. It is unreachable from the UI, so it is not a product-facing write-only control. |
| `DECORATIVE_SECURITY_CONTROL_COUNT` | 0 | the decorative captcha is gone (`verify-login-throttle.mjs` 7/7), throttling is real (429 with a retry hint), and the dead captcha CSS was removed from the admin stylesheet this round | admin login surface |

## Security

`verify-security-controls.mjs` 20/20 — admin auth on read/write/delete, forged tokens rejected, login
throttling, cross-user reads refused, privacy gates, PII refused in peer requests, report fields not
leaked to peers, and privileged writes audited with before/after state.

## Finding surfaced while re-capturing this evidence

One admin login returned **500** during back-to-back verification runs. The cause is not this round's
code: the relational flush is a single transaction that upserts the whole store row by row, and on a
database grown to 12,558 rows by this round's own test traffic it is approaching its 30-second
transaction timeout. Measured write latency across three consecutive flushes: 6,401 ms → 16,297 ms →
19,924 ms. Recorded as an open technical P2 in `RC_STATUS.md`, with the recommended fix. The suites
below were re-captured afterwards and pass; the finding is about the ceiling above them.

## Why `QA_ALL_PASS` is false

Exactly one assertion **inside `qa:all`** fails: `tests/cross/cross.spec.ts` expects a live
`provider_dapi_deepseek` job with `status: 'succeeded'` and `fallbackUsed: false`, and the account
returns HTTP 402. It is the only coverage of the real DAPI integration, so it was left intact rather
than weakened to accept a fallback.

Outside `qa:all`, the same class of assertion fails in the suites above: the four `test:peer-stage-*`
invocations (one spec), `test:third-stage-memory` and `test:third-stage-monthly-report`, plus
`test:dapi-live` and `tests/business/third-stage-monthly-report.spec.ts`. So "one failing assertion"
is true of the gate, not of the whole matrix — the matrix has six AI-success assertions that cannot
pass without a funded account. For the peer path the cause is proven directly, not inferred: a probe
of the same endpoint records `taskType=peer_response_assist`, `status=failed`,
`providerId=provider_dapi_deepseek`, `fallbackUsed=false`, error `... HTTP 402`
(`artifacts/product-closure/evidence/dapi-live.txt`).

Funding the account and re-running `pnpm test:cross` and `pnpm qa:all` is the whole remedy; no code
change is needed.

## Raw evidence

The captured outputs in `docs/product-closure/verification/captured/` are the versioned record of the
verification scripts. Three claims rest on commands whose output is kept in
`artifacts/product-closure/evidence/` instead, because they are shell proofs rather than scripts:

| File | Proves |
| --- | --- |
| `migration-reproducibility.txt` | the three `migrate diff` results, the empty database, `migrate deploy` applying 12 migrations, 0 → 54 tables |
| `flush-timing.txt` | the row counts, the three timed writes, and the transaction settings the flush uses |
| `dapi-live.txt` | the provider probes, the `test:dapi-live` output including its native assertion, the job status counts, and the peer-assist probe |
| `rc-qa-all.log` | the full `qa:all` run, ANSI-stripped |
