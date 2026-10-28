// Delete the stylesheet rules whose elements no longer exist in the templates.
//
// Removing an element from a page leaves its CSS behind, and dead rules are how a later change ends up
// styling the wrong thing - or how a "cleaned up" page still carries its old weight. This deletes by
// selector name, whole block, and prints what it took so the deletion can be reviewed.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'apps/mp/src/styles.scss';
const TARGETS = [
  '.diary-intro',
  '.diary-intro p',
  '.diary-intro > span',
  '.diary-calendar-mark',
  '.diary-calendar-mark::before',
  '.diary-calendar-mark::after',
  '.diary-filter-mark',
  '.diary-filter-mark::before',
  '.diary-filter-mark::after',
  '.diary-entry-visual',
  '.diary-entry-image',
  '.diary-entry-placeholder',
  '.diary-letter-state',
  '.diary-letter-icon',
];

const lines = readFileSync(FILE, 'utf8').split('\n');
const removed = [];
const drop = new Set();

for (let i = 0; i < lines.length; i += 1) {
  const sel = lines[i].trim().replace(/\s*\{$/, '').trim();
  if (!TARGETS.includes(sel)) continue;
  if (!/\{$/.test(lines[i].trim())) continue;
  // Walk to the matching close brace.
  let depth = 0;
  let close = -1;
  for (let j = i; j < lines.length; j += 1) {
    for (const ch of lines[j]) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
    }
    if (depth === 0) {
      close = j;
      break;
    }
  }
  if (close < 0) continue;
  for (let j = i; j <= close; j += 1) drop.add(j);
  // A comment directly above belongs to this rule.
  if (i > 0 && lines[i - 1].trim().startsWith('/*')) drop.add(i - 1);
  removed.push(sel);
}

const out = lines.filter((_, idx) => !drop.has(idx)).join('\n').replace(/\n{3,}/g, '\n\n');
writeFileSync(FILE, out, 'utf8');
console.log(`removed ${removed.length} rule(s): ${[...new Set(removed)].join(', ')}`);
const left = (out.match(/\.diary-(?:intro|entry-visual|entry-image|entry-placeholder|calendar-mark|filter-mark|letter-state|letter-icon)\b/g) ?? []).length;
console.log(`references left: ${left}`);
