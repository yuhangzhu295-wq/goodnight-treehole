# Goodnight Treehole

Goodnight Treehole is a monorepo containing:

- `apps/mp`: front H5/mini-program preview.
- `apps/admin`: admin console.
- `apps/api`: NestJS business API.
- `packages/shared-types`: shared domain types.
- `packages/api-sdk`: shared HTTP client.
- `packages/ui-tokens`: shared UI tokens.

The supplied design references are implementation and visual-regression benchmarks:

- Front refs: `design_refs/front/01-square.png` through `14-feedback-help.png`
- Admin refs: `design_refs/admin/01-admin-login.png` through `10-admin-system-settings.png`

The applications render real DOM components, CSS, and cropped project assets. They never use a whole reference image as a page background or transparent hotspots above a reference image; interactions must remain visible controls connected to the API.

## Run

```bash
pnpm install
pnpm dev
```

Default URLs:

- API: `http://localhost:3000`
- Swagger JSON/docs: `http://localhost:3000/docs`
- Front: `http://localhost:5173/pages/square/index`
- Admin: `http://localhost:5174/login`

Admin demo account:

```text
admin / admin123
```

## QA

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:api
pnpm test:e2e
pnpm test:visual
pnpm test:click-all
pnpm test:business-flow
pnpm test:cross
pnpm qa:all
```

## Live Interaction QA

- `tests/interaction-manifest.front.json` lists front controls, routes, and expected API evidence.
- `tests/interaction-manifest.admin.json` lists admin controls, routes, and expected API evidence.
- `pnpm test:click-all` starts isolated API/front/admin servers, clicks manifest controls with Playwright, and writes:
  - `artifacts/test-report/click-all-report.json`
  - `artifacts/test-report/click-all-report.md`
  - `artifacts/videos/click-all`
  - `artifacts/traces/click-all-trace.zip`
- `pnpm test:business-flow` runs front/admin cross-business flows and writes:
  - `artifacts/test-report/business-flow-report.md`
  - `artifacts/test-report/api-report.md`
  - `artifacts/screenshots/business`
  - `artifacts/videos/business-flow`
  - `artifacts/traces/business-flow-trace.zip`
- `pnpm qa:all` includes lint, typecheck, unit, api, e2e, visual, click-all, business-flow, and cross checks.

## Interaction Audit

See `docs/current-interaction-audit.md` for the current page/control/API coverage matrix.
