// Marks Batch 3 finding 6 closed in the resume state, and refreshes the numbers.
import { readFileSync, writeFileSync } from 'node:fs';
const PATH = 'docs/architecture/CONTINUOUS_RESUME_STATUS.md';
let doc = readFileSync(PATH, 'utf8');

const edits = [
  [
    '6. **Open (P1)** — Self routes still silently fall back to the demo user.',
    '6. **CLOSED** — the fallback was on 21 C-end routes, none of them Self routes (the ones the finding cited are peer routes and were already fixed). Measured: six of six read routes answered 200 without a credential and one served a real record. All 21 now require an identity; two remaining fallbacks are intentional (`/auth/demo`, and an admin route behind `this.admin(auth)`). See `DEMO_USER_FALLBACK_CLOSURE.md`. Seven specs were relying on the removed fallback and now send the demo identity.',
  ],
  ['- Full business suite: **42/42 files, 276 passed / 0 failed / 7 skipped**.', '- Full business suite: **42/42 files, 277 passed / 0 failed / 7 skipped**.'],
];

for (const [from, to] of edits) {
  if (!doc.includes(from)) throw new Error(`anchor not found: ${from.slice(0, 60)}`);
  doc = doc.replace(from, to);
}

writeFileSync(PATH, doc);
console.log('resume doc updated');
