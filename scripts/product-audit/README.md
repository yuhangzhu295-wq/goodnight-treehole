# Product audit tooling

Reproducible tooling for the COMPLETE PRODUCT GRAPH AUDIT run. Everything here is
read-only with respect to product code; the scripts only read `apps/`, `packages/`,
`prisma/` and write audit output.

## Regenerate the whole audit

```
node scripts/product-audit/generate-discovery.mjs   # route/view/control/API/DB inventories
node scripts/product-audit/generate-reports.mjs     # PRODUCT_INVENTORY, matrices, per-page skeletons
node scripts/product-audit/finalize-matrices.mjs    # fills PAGE_AUDIT_MATRIX + CONTROL_AUDIT_MATRIX from the audits
node scripts/product-audit/full-product-matrix.mjs  # FULL_PRODUCT_MATRIX
node scripts/product-audit/gen-callbacks.mjs        # callbacks.jsonl
```

Outputs land in `artifacts/product-audit/` (gitignored) and `docs/product-audit/`
(tracked). `generate-reports.mjs` only creates *skeletons*; the narrative sections of each
page audit are written by hand or by the audit agents and must not be overwritten after the
fact - re-run `generate-discovery.mjs` alone when only the inventories changed.

## Live verification scripts

These need the stack running (`scripts/recovery/ensure-infra.mjs`, then
`scripts/recovery/start-services.ps1`).

| Script | What it proves |
| --- | --- |
| `audit-admin-guards.mjs` | which admin handlers have no token guard |
| `verify-admin-auth.mjs` | live 200/401 behaviour of admin endpoints with and without a token |
| `verify-unauth-delete.mjs` | whether an unauthenticated DELETE really removes a row (creates and cleans up its own throwaway post) |
| `verify-ownership.mjs` | whether letters / peer experiences / handoffs are scoped to the caller |
| `verify-findings.mjs` | the admin user export defect |
| `probe-api.mjs`, `ai-probe.mjs` | API surface smoke and AI job lifecycle |
| `psql.sh` | runs a `.sql` file against the project database inside the WSL2 container: `wsl -d Ubuntu -- bash <repo>/scripts/product-audit/psql.sh <file>` |

## Android

The device-side collectors live with the rest of the recovery tooling:

```
node scripts/recovery/android-route-walk.mjs
node scripts/recovery/android-control-coverage.mjs --click
node scripts/recovery/android-business-flow.mjs stage1-core
```

They need `adb forward tcp:9333 localabstract:webview_devtools_remote:$(adb shell pidof com.goodnight.treehole)`.
