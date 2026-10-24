// Remove the pseudo-element rules that cannot render, without touching shared selector lists.
//
// A `::before`/`::after` rule with no `content` generates no box, and one that also paints nothing
// (no background, mask, shadow, border) is dead weight. The catch that makes this worth a script
// rather than a regex: the same selector is often one line of a multi-selector list -
// `.goodnight-page *, .goodnight-page *::before, .goodnight-page *::after { max-width: 100% }` -
// where the `::after` line carries no comma of its own. Deleting that block removes the live
// `max-width` constraint from every child of every page. So the selector list a rule belongs to is
// walked backwards to its first line, and a rule is only removed when it is the sole selector.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'apps/mp/src/styles.scss';
const lines = readFileSync(FILE, 'utf8').split('\n');
const drop = new Set();
const removed = [];
const skipped = [];

/** How many selectors the rule starting at `open` has, and where its list begins. */
function selectorList(open) {
  let start = open;
  // Walk back over continuation lines: a line that ends with a comma belongs to this list.
  while (start > 0 && /,\s*$/.test(lines[start - 1].trim()) && !lines[start - 1].includes('{')) start -= 1;
  const text = lines.slice(start, open + 1).join(' ');
  return { start, count: text.split(',').filter((s) => s.trim() && !s.includes('{')).length };
}

for (let i = 0; i < lines.length; i += 1) {
  const trimmed = lines[i].trim();
  if (!/::(before|after)/.test(trimmed) || !/\{\s*$/.test(trimmed)) continue;
  const list = selectorList(i);
  if (list.count > 1) {
    skipped.push(trimmed.replace(/\s*\{$/, ''));
    continue;
  }
  let depth = 0;
  let body = '';
  let close = -1;
  for (let j = i; j < lines.length; j += 1) {
    for (const ch of lines[j]) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
    }
    body += lines[j] + '\n';
    if (depth === 0) {
      close = j;
      break;
    }
  }
  if (close < 0) continue;
  if (/\bcontent\s*:/.test(body)) continue;
  if (/background|mask|box-shadow|border|outline/.test(body)) continue;
  for (let j = list.start; j <= close; j += 1) drop.add(j);
  if (list.start > 0 && lines[list.start - 1].trim().startsWith('/*')) drop.add(list.start - 1);
  removed.push(trimmed.replace(/\s*\{$/, ''));
}

const out = lines.filter((_, idx) => !drop.has(idx)).join('\n').replace(/\n{3,}/g, '\n\n');
writeFileSync(FILE, out, 'utf8');
console.log(`removed ${removed.length} unrenderable rule(s)`);
for (const r of removed) console.log('  ', r);
console.log(`left alone because the selector is shared: ${[...new Set(skipped)].join(', ') || 'none'}`);
