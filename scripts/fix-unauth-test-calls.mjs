// Adds the identity to the test calls that relied on the demo-user fallback the API no longer has.
//
// The insertion is deliberately mechanical and minimal: the identity is attached right after the
// method call, because supertest only exposes `.set()` on the Test that `.get()/.post()` returns.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SPECS = process.argv.slice(2);
if (!SPECS.length) throw new Error('usage: node scripts/fix-unauth-test-calls.mjs <spec>...');

// Reuse the detector so the line list cannot drift from what was measured.
const report = execFileSync(process.execPath, ['scripts/audit-unauth-test-calls.mjs', ...SPECS], { encoding: 'utf8' });
const byFile = new Map();
let current = null;
for (const line of report.split('\n')) {
  if (/^\S+\.spec\.ts$/.test(line.trim())) {
    current = line.trim();
    byFile.set(current, []);
    continue;
  }
  const match = line.match(/^\s+(\d+):/);
  if (match && current) byFile.get(current).push(Number(match[1]));
}

for (const [file, lineNumbers] of byFile) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let changed = 0;
  for (const lineNumber of lineNumbers) {
    const index = lineNumber - 1;
    if (!lines[index].includes('request(server)')) continue;
    // Attach after the method call: `request(server).get('/x')` -> `request(server).get('/x').set(...)`
    const before = lines[index];
    lines[index] = before.replace(
      /(request\(server\)\.(?:get|post|patch|put|delete\))\(([^)]*)\))/,
      '$1.set(await demoUserHeaders())',
    );
    // Count only real changes: an earlier version incremented unconditionally, so a multi-line
    // chain that the pattern could not match was reported as fixed when it had not been touched.
    if (lines[index] === before) {
      console.log(`${file}:${lineNumber} NOT CHANGED (multi-line chain? fix by hand)`);
      continue;
    }
    changed += 1;
  }
  let text = lines.join('\n');

  // The helper has to be in scope.
  if (!/demoUserHeaders/.test(text.split('\n').slice(0, 12).join('\n'))) {
    text = text.replace(
      /^(import \{([^}]*)\} from '\.\/helpers';)$/m,
      (whole, _full, names) => {
        const list = names.split(',').map((n) => n.trim()).filter(Boolean);
        if (!list.includes('demoUserHeaders')) list.push('demoUserHeaders');
        return `import { ${list.join(', ')} } from './helpers';`;
      },
    );
  }

  writeFileSync(file, text);
  console.log(`${file}: ${changed} call(s) given an identity`);
}
