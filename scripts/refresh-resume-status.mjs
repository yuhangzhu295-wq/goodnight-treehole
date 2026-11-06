// Refresh the resume doc's HEAD, evidence and gate position after the Batch 3 gate work.
import { readFileSync, writeFileSync } from 'node:fs';
const PATH = 'docs/architecture/CONTINUOUS_RESUME_STATUS.md';
let doc = readFileSync(PATH, 'utf8');

const edits = [
  ['**HEAD at this writing:** `52ff3e7`', '**HEAD at this writing:** `c16b71a`'],
  [
    '- CI **green** on `52ff3e7` (run 38251486463) and on the two commits before it.',
    '- CI **green** on `c16b71a` (run 38396476874) and on the commits before it.',
  ],
  [
    '- Full business suite: **41/41 files, 272 passed / 0 failed / 7 skipped**.',
    '- Full business suite: **42/42 files, 276 passed / 0 failed / 7 skipped**.',
  ],
  [
    '| 12 | Batch 3 final gate | **not run** | `PERSISTENCE_BATCH3_STABLE` stays **false** |',
    '| 12 | Batch 3 final gate | **1 of 8 gates established** | `SELF_FULL_FLUSH=false` ESTABLISHED — `BATCH3_SELF_FULL_FLUSH_GATE.md`, 4/4 tests plus a discriminating mutation. The other seven are not established; `PERSISTENCE_BATCH3_STABLE` stays **false** |',
  ],
];

for (const [from, to] of edits) {
  if (!doc.includes(from)) throw new Error(`anchor not found: ${from.slice(0, 60)}`);
  doc = doc.replace(from, to);
}

// Record the two new environment facts and the A8 fix.
const envAnchor = '## Environment facts that cost time (read before the next session)';
const extraEnv = `${envAnchor}

0. **WSL2 suspends and the forwarded ports die with it.** \`ensure-infra.mjs\` probes TCP properly
   and reports the containers reachable, but the VM can suspend seconds later, so the next process
   sees \`ECONNREFUSED\`. Hold it awake for the whole run, e.g. \`(wsl.exe -e sleep 1200 &)\` before
   \`ensure-infra.mjs\`, and pass an explicit IPv4 \`DATABASE_URL\` (\`127.0.0.1\`, not \`localhost\`)
   to the test runner, which otherwise prefers the \`.env\` value.`;

doc = doc.replace(envAnchor, extraEnv);

const defectAnchor = 'Details: `docs/architecture/PEER_JOURNEY_CONTRACT_FIXES.md`.';
const extraDefect = `${defectAnchor}

3. **\`FutureSelf.vue\` blanked itself when the optional context was refused** (A8). The letter list
   and three optional context lists loaded in one \`Promise.all\`, and \`/me/recovery\` is gated on
   \`allowRecoveryData\`, so turning that consent off hid letters that were independently readable.
   The letters are now the critical path and the optional context degrades on its own. Pinned by a
   test in \`batch3-future-self-authority.spec.ts\`.`;

doc = doc.replace(defectAnchor, extraDefect);

writeFileSync(PATH, doc);
console.log('resume doc updated');
