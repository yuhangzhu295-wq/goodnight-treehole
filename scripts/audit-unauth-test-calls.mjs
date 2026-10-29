// Finds test call sites that hit the routes whose demo-user fallback was just removed, without
// sending an identity. Those calls relied on the fallback and now answer 401.
import { readFileSync } from 'node:fs';

const AFFECTED = [
  '/api/v1/diaries',
  '/api/v1/letters',
  '/api/v1/favorites',
  '/api/v1/feedback',
  '/api/v1/posts/',
  '/api/v1/moods/',
  '/api/v1/tools/',
  '/api/v1/ai/tools/',
  '/api/v1/exports/',
];

const FILES = process.argv.slice(2);
if (!FILES.length) throw new Error('usage: node scripts/audit-unauth-test-calls.mjs <spec>...');

let total = 0;
for (const file of FILES) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const hits = [];
  lines.forEach((line, index) => {
    if (!line.includes('request(server)')) return;
    const window = lines.slice(index, index + 6).join('\n');
    const path = AFFECTED.find((prefix) => window.includes(prefix));
    if (!path) return;
    if (window.includes(".set(")) return;
    hits.push({ line: index + 1, path, text: line.trim().slice(0, 100) });
  });
  if (hits.length) {
    console.log(`\n${file}`);
    for (const hit of hits) console.log(`  ${hit.line}: ${hit.path}  ${hit.text}`);
    total += hits.length;
  }
}
console.log(`\ntotal unauthenticated calls to affected routes: ${total}`);
