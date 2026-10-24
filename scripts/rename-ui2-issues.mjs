// Namespace the UI V2 issue numbers to UI2-*.
//
// Why: the repository already had a "product audit" ISSUE-001..027 series (referenced from
// apps/api and apps/admin). UI V2 then started its own series at 001, so ISSUE-005 and ISSUE-007
// each meant two different findings. A code comment citing ISSUE-010 (the product-audit
// follow-up-worker item) was sitting next to a UI V2 fix. This rewrites only the files that
// belong to the UI V2 series.
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  'docs/design-v2/UI_V2_ISSUES.md',
  'docs/design-v2/UI_V2_PROGRESS.md',
  'docs/design-v2/UI_V2_MASTER_QUEUE.json',
  'docs/design-v2/PAGE_IMPLEMENTATION_MATRIX.md',
  'apps/mp/src/App.vue',
  'apps/mp/src/views/TonightHome.vue',
  'apps/mp/src/views/NotificationCenter.vue',
];

// The notification read-receipt fix was written as ISSUE-010, but ISSUE-010 in the product-audit
// series is the follow-up worker. It becomes UI2-009 (see UI_V2_ISSUES.md).
const EXPLICIT = { 'ISSUE-010': 'UI2-009' };

let total = 0;
for (const file of FILES) {
  const before = readFileSync(file, 'utf8');
  let after = before;
  for (const [from, to] of Object.entries(EXPLICIT)) after = after.split(from).join(to);
  // Remaining bare numbers 001..007 are all UI V2 findings.
  after = after.replace(/ISSUE-00([1-7])\b/g, 'UI2-00$1');
  if (after !== before) {
    const n = (before.match(/ISSUE-0\d\d/g) ?? []).length;
    writeFileSync(file, after);
    total += n;
    console.log(`rewrote ${n} reference(s) in ${file}`);
  }
}
console.log(`total ${total}`);
