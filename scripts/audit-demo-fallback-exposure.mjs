// Measures whether the demo-user fallback is reachable without a credential.
//
// Finding 6 (open, P1) says Self routes still silently fall back to the demo user. The routes it
// named are fixed, but an audit found 21 others with the same shape. This probes the read-only ones
// and reports exactly what an unauthenticated caller receives, so the finding rests on a measurement
// rather than on a grep. Mutating routes are listed but not called.
const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3000';

const READS = [
  '/api/v1/diaries',
  '/api/v1/diaries/months',
  '/api/v1/favorites',
  '/api/v1/feedback',
  '/api/v1/letters',
  '/api/v1/letters/today',
];

const MUTATING = [
  'POST /api/v1/diaries',
  'POST /api/v1/diaries/export',
  'POST /api/v1/letters/generate',
  'POST /api/v1/letters/:id/favorite',
  'DELETE /api/v1/letters/:id/favorite',
  'POST /api/v1/posts/:id/favorite',
  'DELETE /api/v1/posts/:id/favorite',
  'DELETE /api/v1/favorites/:id',
  'POST /api/v1/moods/:id/queue-ai-replies',
  'POST /api/v1/tools/emotion-decompose',
  'POST /api/v1/tools/run',
  'POST /api/v1/tools/emotion-decompose/:taskId/save',
  'GET /api/v1/diaries/:id',
  'GET /api/v1/exports/:assetId/download',
];

console.log('Unauthenticated reads (no x-goodnight-user-id header):\n');
let leaked = 0;
for (const path of READS) {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  let items = null;
  try {
    const json = JSON.parse(text);
    items = Array.isArray(json?.items) ? json.items.length : json?.item ? 1 : null;
  } catch {
    items = null;
  }
  const exposure = res.ok ? `LEAKS ${items ?? '?'} record(s)` : 'refused';
  if (res.ok) leaked += 1;
  console.log(`  ${String(res.status).padEnd(4)} ${path.padEnd(34)} ${exposure}`);
}

console.log(`\nreads answered without a credential: ${leaked} of ${READS.length}`);
console.log('\nMutating routes with the same fallback shape (NOT called, to avoid side effects):');
for (const route of MUTATING) console.log(`  ${route}`);
