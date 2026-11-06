// Remove the decorative pseudo-element layers from the global stylesheet.
//
// Each one is a `::before`/`::after` block whose only job is to paint a mascot or foliage cutout over
// a hero or card. They are pure decoration - `content: ""`, `pointer-events: none` - so removing them
// cannot change behaviour, and they are what the audit measured as the ink excess on the list pages.
//
// The blocks are located by scanning for a selector line that names the target, then taking the whole
// `{ ... }` that follows, because SCSS rules span many lines and a single-line regex cannot see them.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'apps/mp/src/styles.scss';

/** selector -> the asset it paints, so a removal can be checked against what it took away. */
const TARGETS = [
  '.detail-top::before',
  '.detail-rest-page::before',
  '.diary-list-page::before',
  '.report-hero::before',
  '.letter-list-hero::before',
  '.favorite-list-hero::before',
  '.tool-page .tool-hero::before',
  '.me-page .me-hero::before',
  '.feature-card::after',
  '.tool-page .feature-card::after',
  '.list-page .letter-list-card::after',
  '.letter-intro::before',
  '.letter-card-actions button:last-child',
];

const DECOR = /goodnight\/(tree-top-cutout|tool-baby-letter-cutout|square-baby-cutout|letter-envelope-cutout)\.png/;

const text = readFileSync(FILE, 'utf8');
const lines = text.split('\n');
const removed = [];
const kept = [];

/** The index of the `{` that opens this rule, or -1. */
function openBraceFrom(i) {
  for (let j = i; j < lines.length && j < i + 6; j += 1) {
    if (lines[j].includes('{')) return j;
    // A blank line or a comment between the selector and its brace ends the search.
    if (lines[j].trim() === '' || lines[j].trim().startsWith('/*') || lines[j].trim().startsWith('//')) return -1;
  }
  return -1;
}

const drop = new Set();
for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  const selectorHit = TARGETS.find((sel) => line.includes(sel) && !line.trim().startsWith('//'));
  if (!selectorHit) continue;
  const open = openBraceFrom(i);
  if (open < 0) continue;
  // The rule body runs until the brace depth returns to zero.
  let depth = 0;
  let close = -1;
  for (let j = open; j < lines.length; j += 1) {
    for (const ch of lines[j]) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
    }
    if (depth === 0 && j >= open) {
      close = j;
      break;
    }
  }
  if (close < 0) continue;
  const body = lines.slice(open, close + 1).join('\n');
  if (!DECOR.test(body)) {
    kept.push(selectorHit);
    continue;
  }
  // A selector line can list several selectors; keep the ones that are not the target.
  const head = line;
  const others = head
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !s.includes(selectorHit));
  if (others.length && others.length !== head.split(',').length) {
    lines[i] = others.join(',\n');
  } else {
    drop.add(i);
  }
  for (let j = i + 1; j <= close; j += 1) drop.add(j);
  removed.push({ selector: selectorHit, from: i + 1, to: close + 1 });
}

const out = lines.filter((_, idx) => !drop.has(idx)).join('\n').replace(/\n{3,}/g, '\n\n');
writeFileSync(FILE, out, 'utf8');
console.log(`removed ${removed.length} decorative rule(s):`);
for (const r of removed) console.log(`  ${r.selector.padEnd(44)} lines ${r.from}-${r.to}`);
if (kept.length) console.log(`matched but kept (no cutout inside): ${[...new Set(kept)].join(', ')}`);
const left = (out.match(DECOR) ?? []).length;
console.log(`decorative cutout references left: ${left}`);
