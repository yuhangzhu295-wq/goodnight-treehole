#!/usr/bin/env node
/**
 * The consent axis of the `SELF_ROUTE_IDENTITY_PASS` matrix (design §0.5/A8).
 *
 * The matrix's other two axes are measured by `audit-identity-gate-coverage.mjs` against a table in
 * `SELF_ROUTE_IDENTITY_MATRIX.md`. The consent axis was recorded as "not claimed per route, because
 * it is enforced centrally by `privacyAllows`" - which is true and also not a gate: a central helper
 * says nothing about which routes reach it, and a route that stopped calling it would look identical.
 *
 * So this parses the controllers and follows each handler to the store method it calls, and from
 * there to the `privacyAllows(...)` call that guards it. The result is the consent column, derived
 * from the code rather than typed by hand. A route whose store method has no consent gate is either
 * genuinely unguarded (a gap) or guarded somewhere the trace cannot see - both are printed, and the
 * script does not decide which.
 *
 * It only reads. It never edits the matrix, and it never marks the gate.
 */
import fs from 'node:fs';
import path from 'node:path';

const repo = process.cwd();
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');

const controllers = read('apps/api/src/controllers.ts');
const store = read('apps/api/src/store.service.ts');

/** Every `privacyAllows(userId, 'flag', 'msg')` with the store method that contains it. */
function consentGatesByStoreMethod() {
  const gates = new Map(); // method -> [{flag, line}]
  // Split the store into top-level methods so a gate can be attributed to one.
  const methodStarts = [...store.matchAll(/^ {2}(?:private |public |protected )?(?:async )?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gm)].map(
    (m) => ({ name: m[1], index: m.index }),
  );
  const gateRe = /this\.privacyAllows\(\s*[^,]+,\s*'([a-zA-Z]+)'/g;
  let m;
  while ((m = gateRe.exec(store))) {
    // The innermost method that starts before this gate.
    let owner = null;
    for (const method of methodStarts) {
      if (method.index < m.index && (!owner || method.index > owner.index)) owner = method;
    }
    const name = owner?.name ?? '<module>';
    if (!gates.has(name)) gates.set(name, []);
    gates.get(name).push({ flag: m[1], line: store.slice(0, m.index).split('\n').length });
  }
  return gates;
}

/**
 * Every route decorator in `controllers.ts`, with the source of the handler that follows it.
 *
 * The handler's body runs from the end of its signature to the start of the next decorator, which is
 * why this slices on `@` boundaries rather than trying to match a balanced parameter list - an earlier
 * attempt stopped at the first `)` and captured only the parameter lists, so every route reported
 * "no store call found".
 */
function routes() {
  const marks = [];
  const decoRe = /@(Get|Post|Patch|Delete|Put)\(\s*'([^']*)'\s*\)/g;
  let m;
  while ((m = decoRe.exec(controllers))) marks.push({ kind: 'route', verb: m[1], path: m[2], at: m.index });
  // The admin controller is a separate class; keep the two apart so the C-end count is honest.
  const adminAt = controllers.indexOf("@Controller('api/admin/v1'");
  const publicAt = controllers.indexOf("@Controller('api/v1'");
  return marks
    .map((mark) => {
      const next = marks.find((other) => other.at > mark.at && other.kind === 'route');
      const end = next ? next.at : controllers.length;
      const body = controllers.slice(mark.at, end);
      const handler = (body.match(/(?:async\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\([\s\S]*?\)\s*(?::\s*[^{]+)?\{/) ?? [])[1] ?? '?';
      const calls = [...body.matchAll(/this\.(?:store|selfPersistence|batch1Persistence|feedbackPersistence|peerPersistence|aiRoutingDb|mediaAssetsDb|lettersDb|diariesDb|moodsDb|postsDb|repliesDb|favoritesDb)\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g)].map((c) => c[1]);
      return {
        verb: mark.verb,
        path: mark.path,
        handler,
        body,
        inAdmin: adminAt >= 0 && mark.at > adminAt,
        inPublic: publicAt >= 0 && mark.at > publicAt && (adminAt < 0 || mark.at < adminAt),
        calls: [...new Set(calls)],
      };
    })
    .filter((r) => r.inPublic);
}

const gates = consentGatesByStoreMethod();
const routeList = routes();

const CONSENT_FLAGS = [
  'allowDataExport',
  'allowPeerMatching',
  'allowAnonymousExperienceShare',
  'allowRecoveryData',
  'allowLongTermMemory',
  'allowJourneyArchiveRetention',
];

const rows = routeList.map((route) => {
  const found = [];
  for (const call of route.calls) {
    for (const gate of gates.get(call) ?? []) found.push({ via: call, ...gate });
  }
  // A direct `privacyAllows` inside the handler body counts too.
  for (const flag of CONSENT_FLAGS) {
    if (new RegExp(`privacyAllows\\([^)]*'${flag}'`).test(route.body ?? '')) found.push({ via: 'controller', flag });
  }
  return { ...route, gates: found };
});

const covered = rows.filter((r) => r.gates.length > 0);
const withoutGate = rows.filter((r) => r.gates.length === 0);
const walked = rows.filter((r) => r.calls.length === 0);

console.log(`[consent-matrix] ${rows.length} C-end routes parsed from controllers.ts (admin controller excluded)`);
console.log(`[consent-matrix] ${covered.length} reach a consent gate; ${withoutGate.length} do not`);
console.log('');
console.log('| route | consent gate | flag |');
console.log('| --- | --- | --- |');
for (const r of covered) {
  const flags = r.gates.map((g) => `\`${g.flag}\``).join(', ');
  const via = [...new Set(r.gates.map((g) => g.via))].join(', ');
  console.log(`| ${r.verb} ${r.path} | ${via} | ${flags} |`);
}
console.log('');
/**
 * Why a route legitimately has no consent gate. Without this the 100+ ungated routes read as 100+
 * gaps, which they are not: reading one's own record needs no extra permission, and the consent flags
 * exist for the four acts that leave the user's own device - export, matching, anonymous sharing, and
 * long-term memory/retention.
 */
const NO_GATE_REASONS = [
  [/^\/?(api\/v1\/)?health$/i, 'health probe'],
  [/^\/?debug\//i, 'diagnostics'],
  [/^\/?testing\//i, 'test fixture cleanup'],
  [/^\/?(api\/v1\/)?auth\//i, 'identity issuance, not a consent surface'],
  [/^\/?(api\/v1\/)?config$/i, 'public configuration'],
  [/\/(faqs|categories)$/i, 'public content, no per-user consent'],
  [/^\/?(api\/v1\/)?posts$/i, 'public feed'],
  [/^\/?(api\/v1\/)?feedback(\/|$)/i, 'feedback text, not a privacy-share channel'],
  [/^\/?(api\/v1\/)?settings\/privacy/i, 'the consent editor itself'],
  [/^\/?(api\/v1\/)?media(\/|$)/i, 'attachments, owned and owner-scoped'],
  [/^\/?(api\/v1\/)?packages/i, 'static reference data'],
];

function classifyNoGate(route) {
  const target = route.path.replace(/^\/api\/v1/, '') || route.path;
  for (const [pattern, reason] of NO_GATE_REASONS) {
    if (pattern.test(target) || pattern.test(route.path)) return reason;
  }
  return null;
}

const unguarded = withoutGate.filter((r) => r.calls.length > 0);
const classified = [];
const needsReview = [];
for (const r of unguarded) {
  const reason = classifyNoGate(r);
  if (reason) classified.push({ route: r, reason });
  else needsReview.push(r);
}

for (const r of walked) console.log(`  (no store call found in the handler — cannot trace) ${r.verb} ${r.path}`);
console.log('');
console.log(`Ungated with a stated reason (${classified.length}):`);
for (const { route, reason } of classified) console.log(`  ${route.verb} ${route.path}  — ${reason}`);
/**
 * The one class of ungated route that is a real design question rather than an obvious no, checked
 * here so it is answered in the output rather than left as a maybe: editing content whose *creation*
 * was consent-gated. `createPeerExperience` requires `allowAnonymousExperienceShare`; editing a row
 * that already passed it needs no second gate, because the share decision was made when the content
 * was published. If that ever changes, this list is where it would show.
 */
const EDIT_AFTER_GATE = {
  'peer-experiences/:id': 'edit of content whose create passed allowAnonymousExperienceShare',
  'peer-matches/:id': 'responding to a match; consentMatch is the mutual-consent mechanism itself',
  'peer-matches/:id/respond': 'responding to a match; consentMatch is the mutual-consent mechanism itself',
  'peer-matches/:id/consent': 'consentMatch is the bilateral consent mechanism, not a share channel',
  'me/memories/:id': 'edit or delete of own memory; the save gate is allowLongTermMemory, the read side needs none',
  'memory/:id': 'delete of own memory',
};

const stillUnclassified = [];
for (const r of needsReview) {
  const target = r.path.replace(/^\/api\/v1\//, '');
  const reason = Object.entries(EDIT_AFTER_GATE).find(([key]) => target === key || target.endsWith(key))?.[1];
  if (reason) {
    console.log(`  ${r.verb} ${r.path}  — ${reason}`);
  } else {
    stillUnclassified.push(r);
  }
}
console.log('');
console.log(`Unguarded with no stated reason (${stillUnclassified.length}) — reads of the caller's own records, or writes that do not leave the device:`);
for (const r of stillUnclassified) console.log(`  ${r.verb} ${r.path}  -> ${r.calls.join(', ')}`);

const byFlag = {};
for (const r of covered) {
  for (const g of r.gates) byFlag[g.flag] = (byFlag[g.flag] ?? 0) + 1;
}
console.log('');
console.log('Routes per consent flag:');
for (const flag of CONSENT_FLAGS) console.log(`  ${flag}: ${byFlag[flag] ?? 0}`);

// Every flag must have at least one route, otherwise the flag is dead and the matrix is lying.
const deadFlags = CONSENT_FLAGS.filter((f) => !byFlag[f]);
if (deadFlags.length) console.log(`\n[consent-matrix] flags with no route: ${deadFlags.join(', ')}`);
