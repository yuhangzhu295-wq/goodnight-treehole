import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(ROOT, p), s);
const j = (p) => JSON.parse(read(p));

const mpRoutes = j('artifacts/product-audit/mp-routes.json');
const adminRoutes = j('artifacts/product-audit/admin-routes.json');
const controlManifest = j('artifacts/product-audit/control-manifest.json');
const runtime = j('artifacts/post-recovery/control-coverage.json');

const mpViews = fs.readdirSync(path.join(ROOT, 'apps/mp/src/views')).filter((f) => f.endsWith('.vue'));

const viewRoutes = {};
for (const r of mpRoutes.routes) {
  if (!r.component) continue;
  (viewRoutes[r.component] ??= []).push(r.path);
}

function extract(file) {
  const src = read(file);
  const status = (src.match(/## FINAL_STATUS\s*\n+([^\n]+)/) || [])[1]?.trim() ?? 'UNKNOWN';
  const first = status.split(/[\s(（-]/)[0].toUpperCase();
  const issueBlock = (src.match(/## ISSUES\n+([\s\S]*?)\n## /) || [])[1] ?? '';
  const issues = (issueBlock.match(/^\s*[-*|].*\bP[0-3]\b/gm) || []).length;
  return { status: first, raw: status, issues };
}

// ---------- PAGE_AUDIT_MATRIX ----------
const rows = [];
rows.push('# PAGE AUDIT MATRIX');
rows.push('');
rows.push('One row per unique MP view and per admin resource. Status values: DONE / PARTIAL / FAIL / BLOCKED.');
rows.push('');
rows.push('| # | Surface | View / resource | Routes | Issues | Audit file | FINAL_STATUS |');
rows.push('| ---: | --- | --- | ---: | ---: | --- | --- |');
let i = 0;
for (const v of mpViews) {
  i += 1;
  const name = v.replace(/\.vue$/, '');
  const file = `docs/product-audit/pages/mp/${name}.md`;
  const { status, issues } = extract(file);
  const routes = (viewRoutes[`${name}.vue`] ?? []).map((p) => `\`${p}\``).join('<br>') || '(none)';
  rows.push(`| ${i} | mp | ${name} | ${routes} | ${issues} | [${name}.md](./pages/mp/${name}.md) | ${status} |`);
}
for (const item of adminRoutes.menu) {
  i += 1;
  const file = `docs/product-audit/pages/admin/${item.resource}.md`;
  const { status, issues } = extract(file);
  rows.push(`| ${i} | admin | ${item.resource} (${item.label}) | \`${item.path}\` | ${issues} | [${item.resource}.md](./pages/admin/${item.resource}.md) | ${status} |`);
}
rows.push('');
write('docs/product-audit/PAGE_AUDIT_MATRIX.md', rows.join('\n'));

// ---------- CONTROL_AUDIT_MATRIX ----------
// Map the runtime click result onto each static control using its testid.
const runtimeByTestId = new Map();
for (const route of runtime.coverage) {
  for (const c of route.controls) {
    if (c.testid) runtimeByTestId.set(c.testid, c);
  }
}
function verdict(c) {
  const testid = (String(c.handler).match(/data-testid|testid/) || [])[0];
  const t = (c.handler.match(/[\w-]+/) || [])[0];
  // handlers are @click expressions; the testid lives on the element, not the handler,
  // so fall back to matching by view + kind.
  const key = null;
  if (key && runtimeByTestId.has(key)) {
    const r = runtimeByTestId.get(key);
    if (r.result === 'changed') return 'REAL';
    if (r.result === 'no observable change') return 'LOCAL_UI_ONLY_BY_DESIGN';
    if (r.result === 'not-found') return 'BROKEN';
    if (String(r.result).startsWith('skipped: destructive')) return 'BLOCKED (destructive, policy)';
    if (String(r.result).startsWith('skipped: link')) return 'REAL (route covered by walk)';
    if (String(r.result).startsWith('skipped: text field')) return 'REAL (input, not clickable)';
    if (String(r.result).startsWith('skipped: not actionable')) return 'LOCAL_UI_ONLY_BY_DESIGN (hidden/disabled)';
  }
  return 'STATIC_ONLY';
}
const cm = [];
cm.push('# CONTROL AUDIT MATRIX');
cm.push('');
cm.push(`Static discovery found ${controlManifest.total} interactive bindings across both front ends.`);
cm.push('');
cm.push('Runtime evidence (`artifacts/post-recovery/control-coverage.json`, real Android APK):');
cm.push(`${runtime.totalControls} controls found on the 54 routes, ${runtime.visibleControls} visible, ` +
  `${runtime.clickedControls} pressed with a real tap, ${runtime.destructiveSkipped} destructive controls skipped by policy, ` +
  `${runtime.withoutTestId} without a data-testid.`);
cm.push('');
cm.push('Status vocabulary follows section 129 of the task: REAL / LOCAL_UI_ONLY_BY_DESIGN / BROKEN / FAKE / BLOCKED.');
cm.push('A static binding is `STATIC_ONLY` when it has no runtime counterpart in the sweep (for example an admin-only control, or an element without a stable selector). `STATIC_ONLY` is not a pass.');
cm.push('');
// Runtime control-level status, keyed by the stable data-testid the sweep recorded.
cm.push('## Runtime control status (real Android APK, by data-testid)');
cm.push('');
cm.push('| Route | testid | Control | Result | Status |');
cm.push('| --- | --- | --- | --- | --- |');
const RUNTIME_STATUS = (result) => {
  if (result === 'changed') return 'REAL';
  if (result === 'no observable change') return 'LOCAL_UI_ONLY_BY_DESIGN';
  if (result === 'not-found') return 'BROKEN';
  if (String(result).startsWith('skipped: destructive')) return 'BLOCKED (destructive, policy)';
  if (String(result).startsWith('skipped: link')) return 'REAL (route covered by walk)';
  if (String(result).startsWith('skipped: text field')) return 'REAL (input, not clickable)';
  if (String(result).startsWith('skipped: not actionable')) return 'LOCAL_UI_ONLY_BY_DESIGN (hidden/disabled)';
  return 'UNKNOWN';
};
let runtimeRows = 0;
for (const route of runtime.coverage) {
  for (const c of route.controls) {
    if (!c.testid) continue;
    runtimeRows += 1;
    const name = String(c.name ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 40);
    cm.push(`| ${route.route} | \`${c.testid}\` | ${name} | ${c.result} | ${RUNTIME_STATUS(c.result)} |`);
  }
}
cm.push('');
cm.push(`Runtime rows with a stable selector: ${runtimeRows}.`);
cm.push('');
cm.push('## Static bindings (source-level, not individually exercised)');
cm.push('');
cm.push('| # | Surface | View | Kind | Handler | Line | Status |');
cm.push('| ---: | --- | --- | --- | --- | ---: | --- |');
controlManifest.controls.forEach((c, idx) => {
  const h = String(c.handler).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 90);
  cm.push(`| ${idx + 1} | ${c.surface} | ${c.view} | ${c.kind} | \`${h}\` | ${c.line} | ${verdict(c)} |`);
});
cm.push('');
write('docs/product-audit/CONTROL_AUDIT_MATRIX.md', cm.join('\n'));

const statuses = {};
for (const v of mpViews) {
  const s = extract(`docs/product-audit/pages/mp/${v.replace(/\.vue$/, '')}.md`).status;
  statuses[s] = (statuses[s] ?? 0) + 1;
}
console.log('MP page statuses:', JSON.stringify(statuses));
const adminStatuses = {};
for (const item of adminRoutes.menu) {
  const s = extract(`docs/product-audit/pages/admin/${item.resource}.md`).status;
  adminStatuses[s] = (adminStatuses[s] ?? 0) + 1;
}
console.log('Admin resource statuses:', JSON.stringify(adminStatuses));
