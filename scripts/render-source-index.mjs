// Render the full 52-row mapping table into the source index, so the document is complete rather
// than pointing at the JSON. Re-run after any re-extraction.
import { readFileSync, writeFileSync } from 'node:fs';
import { repoFile } from './repo-root.mjs';

const DOC = 'docs/design-v2/UI_V2_SOURCE_INDEX.md';
const pages = JSON.parse(readFileSync(repoFile('artifacts/v2-source/audit-pages.json'), 'utf8'));

const rows = pages
  .map((p) => `| ${p.slug} | \`${p.route}\` | ${p.design || '—'} | ${p.relation || '—'} | ${p.priority} |`)
  .join('\n');

const START = '<!-- MAP-TABLE-START -->';
const END = '<!-- MAP-TABLE-END -->';
const block = `${START}\n| 审计 slug | 路由 | V2 设计图 | 关系 | 优先级 |\n| --- | --- | --- | --- | --- |\n${rows}\n${END}`;

const doc = readFileSync(DOC, 'utf8');
const next = doc.includes(START)
  ? doc.slice(0, doc.indexOf(START)) + block + doc.slice(doc.indexOf(END) + END.length)
  : doc.replace(/\| 审计 slug \| 路由 \| V2 设计图 \| 关系 \| 优先级 \|\n\| --- \| --- \| --- \| --- \| --- \|\n/, block + '\n');
writeFileSync(DOC, next, 'utf8');
console.log('wrote', rows.split('\n').length, 'rows into', DOC);
