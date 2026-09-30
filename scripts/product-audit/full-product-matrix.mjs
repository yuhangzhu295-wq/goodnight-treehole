import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const j = (p) => JSON.parse(read(p));

const mpRoutes = j('artifacts/product-audit/mp-routes.json');
const adminRoutes = j('artifacts/product-audit/admin-routes.json');
const viewRoutes = {};
for (const r of mpRoutes.routes) {
  if (!r.component) continue;
  (viewRoutes[r.component] ??= []).push(r.path);
}

// Section bodies end at the next heading of the same or higher level, so `### Static
// evidence` must terminate `## FINAL_STATUS` too.
const section = (src, name) => {
  const m = src.match(new RegExp(`## ${name}\\n+([\\s\\S]*?)\\n#{2,3} `));
  return (m?.[1] ?? '').trim();
};
const oneLine = (s, n = 110) => String(s).replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, n);
const countBullets = (s) => (s.match(/^\s*[-*|]/gm) || []).length;
const firstList = (s, n = 3) => (s.match(/`[^`]*\/api\/[^`]*`/g) || []).slice(0, n).join(' ');
const modelNames = (s) => (s.match(/\*\*([A-Z][A-Za-z]+)\*\*/g) || [])
  .map((x) => x.replace(/\*\*/g, ''))
  .filter((v, idx, arr) => arr.indexOf(v) === idx)
  .slice(0, 8)
  .join(' ') || '-';

const out = [];
out.push('# FULL PRODUCT MATRIX');
out.push('');
out.push('One row per surface entry. `State / Entry / Exit / Admin / AI / Privacy / Android` are summarised here;' );
out.push('the linked audit file carries the full text for each of those sections.');
out.push('');
out.push('| # | Surface | Route | View | Purpose | Controls | API | DB | Status | Issues | Audit |');
out.push('| ---: | --- | --- | --- | --- | ---: | --- | --- | --- | ---: | --- |');

let i = 0;
for (const v of fs.readdirSync(path.join(ROOT, 'apps/mp/src/views')).filter((f) => f.endsWith('.vue')).sort()) {
  i += 1;
  const name = v.replace(/\.vue$/, '');
  const src = read(`docs/product-audit/pages/mp/${name}.md`);
  const routes = (viewRoutes[v] ?? []).map((p) => `\`${p}\``).join('<br>') || '(none)';
  const purpose = oneLine(section(src, 'PURPOSE'));
  const controls = countBullets(section(src, 'CONTROLS'));
  const api = [firstList(section(src, 'API_READS'), 2), firstList(section(src, 'API_WRITES'), 2)].filter(Boolean).join('<br>') || '-';
  const db = modelNames(section(src, 'DB_ENTITIES'));
  const status = (section(src, 'FINAL_STATUS').split(/[\s(（-]/)[0] || 'UNKNOWN').toUpperCase();
  const issues = countBullets(section(src, 'ISSUES'));
  out.push(`| ${i} | mp | ${routes} | ${name} | ${purpose} | ${controls} | ${api} | ${db} | ${status} | ${issues} | [${name}.md](./pages/mp/${name}.md) |`);
}
for (const item of adminRoutes.menu) {
  i += 1;
  const src = read(`docs/product-audit/pages/admin/${item.resource}.md`);
  const purpose = oneLine(section(src, 'PURPOSE'));
  const controls = countBullets(section(src, 'CONTROLS'));
  const api = [firstList(section(src, 'API_READS'), 2), firstList(section(src, 'API_WRITES'), 2)].filter(Boolean).join('<br>') || '-';
  const db = modelNames(section(src, 'DB_ENTITIES'));
  const status = (section(src, 'FINAL_STATUS').split(/[\s(（-]/)[0] || 'UNKNOWN').toUpperCase();
  const issues = countBullets(section(src, 'ISSUES'));
  out.push(`| ${i} | admin | \`${item.path}\` | ${item.resource} (${item.label}) | ${purpose} | ${controls} | ${api} | ${db} | ${status} | ${issues} | [${item.resource}.md](./pages/admin/${item.resource}.md) |`);
}
out.push('');
fs.writeFileSync(path.join(ROOT, 'docs/product-audit/FULL_PRODUCT_MATRIX.md'), out.join('\n'));
console.log(`rows: ${i}`);
