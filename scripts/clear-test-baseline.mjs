// Clears the tolerated-failure baseline in docs/architecture/TEST_BASELINE_FAILURES.md.
//
// Every test in the old set now either passes or is explicitly skipped as NOT_RUN_NO_SECRET, so
// keeping them listed would let them silently return: the gate treats a listed failure as "known".
// The old set is preserved below the new one for the record.
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'docs/architecture/TEST_BASELINE_FAILURES.md';
const doc = readFileSync(PATH, 'utf8');

const heading = '## The baseline failing set';
const start = doc.indexOf(heading);
if (start === -1) throw new Error('baseline heading not found');

// Find the fenced block that follows the heading.
const fenceOpen = doc.indexOf('```', start);
const fenceClose = doc.indexOf('```', doc.indexOf('\n', fenceOpen) + 1);
if (fenceOpen === -1 || fenceClose === -1) throw new Error('baseline fence not found');
const oldEntries = doc
  .slice(doc.indexOf('\n', fenceOpen) + 1, fenceClose)
  .split('\n')
  .filter((line) => line.trim());

const replacement = `## The baseline failing set (now empty)

Cleared on 2026-10-12. Every test that was listed here now either passes or is explicitly skipped
as \`NOT_RUN_NO_SECRET\` (no \`DAPI_API_KEY\`), so there is no tolerated failure left and any failure
from now on is a new regression.

\`\`\`
\`\`\`

### The set that was cleared, for the record

\`\`\`
${oldEntries.join('\n')}
\`\`\`
`;

const updated = doc.slice(0, start) + replacement + doc.slice(fenceClose + 3);
writeFileSync(PATH, updated);
console.log(`cleared ${oldEntries.length} baseline entries`);
