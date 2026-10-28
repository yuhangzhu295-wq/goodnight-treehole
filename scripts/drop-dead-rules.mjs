// Delete the stylesheet rules whose elements are gone, by walking each rule's braces.
//
// A bulk edit that removes markup leaves its CSS behind, and dead rules are how a later change ends up
// styling the wrong thing. Written as a file rather than an inline `node -e` because the selector
// strings contain quotes that break shell escaping.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = process.argv[2];
const DEAD = process.argv.slice(3);
if (!FILE || !DEAD.length) {
  console.error('usage: node scripts/drop-dead-rules.mjs <file> <selector> [selector...]');
  process.exit(1);
}

const lines = readFileSync(FILE, 'utf8').split('\n');
const drop = new Set();

for (let i = 0; i < lines.length; i += 1) {
  const selector = lines[i].trim().replace(/\s*\{$/, '').trim();
  if (!DEAD.includes(selector)) continue;
  if (!/\{\s*$/.test(lines[i].trim())) continue;
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
  for (let k = i; k <= close; k += 1) drop.add(k);
  if (close + 1 < lines.length && lines[close + 1].trim() === '') drop.add(close + 1);
  console.log(`removed ${selector} (lines ${i + 1}-${close + 1})`);
}

const out = lines.filter((_, idx) => !drop.has(idx)).join('\n').replace(/\n{3,}/g, '\n\n');
writeFileSync(FILE, out, 'utf8');
console.log(`total removed: ${drop.size} lines`);
