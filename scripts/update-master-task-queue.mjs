/**
 * Brings docs/automation/MASTER_TASK_QUEUE.json up to the verified state of HEAD.
 *
 * Every change below is backed by something that was actually run and can be pointed at, not by
 * "this looks finished". The queue had drifted six days behind (head 0157c20 while the branch was at
 * 18267c5) and contained at least one entry marked DONE whose claim was false at the time - which is
 * the specific failure mode the V8 book warns about, so the evidence fields are rewritten rather than
 * the status alone.
 *
 * Usage: node scripts/update-master-task-queue.mjs <headSha> <ciRunUrl>
 */
import fs from 'node:fs';

const [headSha, ciRunUrl] = process.argv.slice(2);
if (!headSha) {
  console.log('usage: node scripts/update-master-task-queue.mjs <headSha> [ciRunUrl]');
  process.exit(1);
}

const path = 'docs/automation/MASTER_TASK_QUEUE.json';
const q = JSON.parse(fs.readFileSync(path, 'utf8'));
const byId = new Map(q.tasks.map((t) => [t.id, t]));

const patched = [];
function patch(id, fields) {
  const task = byId.get(id);
  if (!task) {
    patched.push(`${id}: NOT FOUND (left alone)`);
    return;
  }
  Object.assign(task, fields);
  patched.push(`${id}: -> ${task.status}`);
}

// ---- CI: the entry was DONE while CI was red. Re-point it at a run that exists. ----
patch('CI-GREEN', {
  status: 'DONE',
  implemented: 'yes',
  tested: 'yes',
  evidence: [
    `CI green on ${headSha.slice(0, 7)}: ${ciRunUrl ?? '(run url not supplied)'}.`,
    'Unit tests, full business suite, and the baseline-diff gate all succeeded - the full business',
    'suite had been SKIPPED on the preceding commits because the unit step failed first, so this is',
    'the first run on this branch in which it actually executed.',
    'Corrected from an earlier DONE whose claim was false: CI was failing on 1405ffd, 256bf25 and 828047b.',
  ].join(' '),
  nextAction: 'Keep it green: run the suite locally before each push.',
});

// ---- Closed by work that has landed. ----
patch('B3-R06', {
  status: 'DONE',
  implemented: 'yes',
  tested: 'yes',
  independentReview: 'pending',
  evidence: [
    'First pass: 21 C-end read routes moved to requireRuntimeUserId (DEMO_USER_FALLBACK_CLOSURE.md).',
    'Second pass: the write paths that never read identity at all - createMood, uploadMedia,',
    'createFeedbackTicket, createReply, hidePostForCurrentUser - plus GET /api/v1/tonight, which the',
    'identity matrix had itself declared public while it returned the caller\'s private dashboard.',
    'tests/business/cend-write-ownership.spec.ts 7/7 with three discriminating mutations;',
    'privacy-revocation-safety.spec.ts and privacy-gate-reads-database.spec.ts add M-G and M-E.',
  ].join(' '),
  blocker: '',
  nextAction: 'Independent review of the identity closure.',
});

patch('B3-S5', {
  status: 'DONE',
  implemented: 'yes',
  tested: 'yes',
  independentReview: 'pending',
  evidence: [
    'SELF_ROUTE_IDENTITY_PASS established for its identity and ownership axes:',
    '87/87 C-end and 4/4 admin routes have a 401 negative test; 43/43 parameterised routes have',
    'foreign-id evidence (15 matrix-section, 17 http, 11 persistence-layer); mutation M-F fails 8 of 16.',
    'scripts/audit-identity-gate-coverage.mjs measures it; BATCH3_ROUTE_IDENTITY_GATE.md records it.',
    'The consent axis is enforced centrally by privacyAllows and is NOT claimed per route.',
  ].join(' '),
  blocker: '',
  nextAction: 'Per-route consent negative tests, if the product wants that axis enumerated.',
});

patch('B3-GATE', {
  status: 'RUNNING',
  implemented: 'partial',
  tested: 'partial',
  evidence: [
    '2 of 8 gates established, 3 more partly: SELF_FULL_FLUSH=false ESTABLISHED;',
    'SELF_ROUTE_IDENTITY_PASS ESTABLISHED (identity + ownership axes);',
    'PRIVACY_PASS, MULTI_INSTANCE_SELECTED_FLOWS_PASS and FUTURE_SELF_QUEUE_PASS PARTLY established',
    'with the gaps named in the design\'s §4 rows. PERSISTENCE_BATCH3_STABLE stays false.',
  ].join(' '),
  nextAction: 'SELF_DUAL_WRITER, MEMORY_STATE_PASS, DECISION_STATE_PASS, and the rest of the three partial gates.',
});

patch('P3', {
  status: 'RUNNING',
  implemented: 'partial',
  tested: 'partial',
  evidence: [
    'Batch 4 at 7 of 16. Done: FaqItem, ReplyPreset, FeedbackCategory + FeedbackTicket (registered as one',
    'unit), AdminUserNote, PeerReputation (inert - no writer anywhere, recorded in the plan §5b),',
    'AgentDecisionLog. Each has a statement-level gate in batch4-faq-item-gate.spec.ts (14/14) and a',
    'reverse proof (M-K, M-L, M-M, M-N, M-O, M-P). BATCH4_LEGACY_FLUSH_RETIREMENT.md is the plan.',
  ].join(' '),
  blocker: [
    'Two couplings constrain the order and were found while converting: FeedbackCategory pairs with',
    'FeedbackTicket (§2a); Favorite maintains post.favoriteCount and letter.favorite, so it pairs with',
    'Post and Letter; AIProvider and AIStyleRoute pair (three FKs from the route to the provider).',
  ].join(' '),
  nextAction: 'Convert the AIProvider + AIStyleRoute pair, then the counter-coupled group, then Mood last.',
});

// ---- B3-R02: narrowed and pinned, still open on its display half. ----
patch('B3-R02', {
  status: 'WAITING_REVIEW',
  implemented: 'partial',
  tested: 'partial',
  evidence: [
    'Re-measured: the write gate already reads the committed row (createReply awaits getPrivacySettings),',
    'and every authorization path goes through privacyAllows (16 callers), which reads the row.',
    'What remains cache-backed is DISPLAY only: decoratePost\'s allowHumanReplies and',
    'peerExperienceSummary\'s allowAnonymousExperienceStats. A stale display can offer a reply the',
    'server refuses with 403; no reply gets through.',
    'The gate was unpinned - a change back to the cached accessor failed no test - so',
    'privacy-gate-reads-database.spec.ts now revokes directly in PostgreSQL, asserts the cache is still',
    'stale, expects 403, then restores consent and expects 201. Mutation M-E fails it.',
  ].join(' '),
  blocker: 'Making decoratePost async cascades through its call sites; the fix is a batched read, not a per-row query.',
  nextAction: 'Batch the privacy read for the display projections, or accept the lag as documented.',
});

// ---- B3-R07 / B3-R08: the code exists and was verified; the review is what is outstanding. ----
patch('B3-R07', {
  status: 'WAITING_REVIEW',
  implemented: 'yes',
  tested: 'yes',
  evidence: [
    'Verified present: GET /api/admin/v1/memory/:id calls getAuditedMemoryForAdmin(id, admin.id)',
    '(controllers.ts:2860) and the list route returns metadata only with the search never running over',
    'the memory text. batch3-admin-disclosure.spec.ts covers both (1.1, 1.3, 1.5).',
    'The gate audit found this was the ONE matrix route with no negative test at all; the 401 case was',
    'added in tests/business/batch3-identity-matrix.spec.ts 4.1.',
  ].join(' '),
  blocker: '',
  nextAction: 'Independent review.',
});

patch('B3-R08', {
  status: 'WAITING_REVIEW',
  implemented: 'yes',
  tested: 'partial',
  evidence: [
    'Verified present: MemoryCenter.vue:133 posts to /api/v1/me/memories/:id/reactivate, and the control',
    'renders for effectiveState(item) === "expired" as data-testid="memory-reconsent" (line 378).',
    'The route is controllers.ts:1206. The service side is covered by batch3-memory-reconsent.spec.ts.',
    'No test drives the page\'s own call, which is why tested stays partial.',
  ].join(' '),
  blocker: '',
  nextAction: 'Either a UI-level test for the re-consent control, or independent review.',
});

// ---- New findings that must not live only in a commit message. ----
const newTasks = [
  {
    id: 'B4-FAVORITE-COUNTER-COUPLING',
    phase: 'Batch 4',
    priority: 'P1',
    status: 'BLOCKED_DEPENDENCY',
    title: 'Favorite cannot convert alone: it maintains Post.favoriteCount and Letter.favorite',
    implemented: 'no',
    tested: 'no',
    independentReview: 'pending',
    evidence:
      'addFavorite increments post.favoriteCount for a post target and sets letter.favorite for a letter target; removeFavorite* reverses both (applyFavoriteRemoval). Registering Favorite would empty the array those counters are read from, so the counters and the two models must move together.',
    blocker: 'Post and Letter are not converted yet.',
    nextAction: 'Convert Favorite together with Post and Letter as one unit, per BATCH4_LEGACY_FLUSH_RETIREMENT.md §2a.',
  },
  {
    id: 'B4-AIPROVIDER-ROUTE-PAIR',
    phase: 'Batch 4',
    priority: 'P1',
    status: 'READY',
    title: 'AIProvider + AIStyleRoute convert as a pair',
    implemented: 'no',
    tested: 'no',
    independentReview: 'pending',
    evidence:
      'AIStyleRoute carries three FKs to AIProvider (primary/backup/fallback), and AIProvider is swept twice in the mapper (an if/else over keepProviderIds vs providerMap.keys()). Self-contained otherwise: the only consumers are the admin AI-routing routes and the store\'s provider sync.',
    blocker: '',
    nextAction: 'Register both, convert the admin routes and the store sync, add the gate case and a reverse proof.',
  },
  {
    id: 'B4-DECORATE-READ-PATH',
    phase: 'Batch 4',
    priority: 'P1',
    status: 'PENDING',
    title: 'decoratePost reads in-memory arrays that the remaining conversions will empty',
    implemented: 'no',
    tested: 'no',
    independentReview: 'pending',
    evidence:
      'decoratePost has 7 call sites, two inside loops (the public feed at store.service.ts:6610 and the admin list at controllers.ts:3062). It reads this.favorites for favoritedByCurrentUser and this.assets via mediaByIds for attachments, so converting Favorite or MediaAsset without this makes both silently constant (false / no attachments).',
    blocker: '',
    nextAction: 'Give decoratePost a pre-fetched viewer-favorite set and an asset map, fetched once per request rather than per row.',
  },
  {
    id: 'UI-V2-QUEUE-RECONCILE',
    phase: 'UI V2',
    priority: 'P0',
    status: 'READY',
    title: 'The UI queue disagrees with the code and with the screenshots',
    implemented: 'no',
    tested: 'no',
    independentReview: 'pending',
    evidence:
      'Measured on 18267c5: implemented 18 yes / 1 partial / 20 no; rendered 19 / 0 / 20; interactionTested 8 / 8 / 23; businessVerified 3 / 4 / 32; visualApproved 0 / 1 / 37; codeReviewApproved 0 / 0 / 38; done 0 / 0 / 39. Round 2 shows rendered=10 but implemented=4 (six pages have anti-AI polish only, no V2 restyle - verified by reading PeerRequests against its design). DecisionVault has a genuine 1080x2400 screenshot on disk while the queue says rendered=no.',
    blocker: '',
    nextAction: 'Reconcile per page against the code and the screenshots, then record the real axes rather than flipping flags.',
  },
  {
    id: 'ENV-WSL-DB-DROPS',
    phase: 'Environment',
    priority: 'P2',
    status: 'BLOCKED_ENVIRONMENT',
    title: 'WSL2 stops mid-suite and fakes single-file regressions',
    implemented: 'no',
    tested: 'no',
    independentReview: 'pending',
    evidence:
      'Three separate full-suite runs failed a DIFFERENT file each time with "Can\'t reach database server" or a Prisma "Server has closed the connection". Re-running the file alone passes. Also: leaving the local API on :3000 holds connections to the same PostgreSQL the runner leases from, so drop database fails and the next spec reads stale rows - the tell is that the failing spec never prints its own lease name.',
    blocker: 'No admin rights for netsh portproxy; WSL idle-suspend cannot be disabled from here.',
    nextAction: 'Keep a Windows-side keep-alive running, stop the API before suite runs, and re-run any single failing file alone before calling it a regression.',
  },
];

for (const task of newTasks) {
  if (!byId.has(task.id)) {
    q.tasks.push(task);
    patched.push(`${task.id}: ADDED`);
  } else {
    patched.push(`${task.id}: already present, left alone`);
  }
}

q.head = headSha;
q.updatedAt = new Date().toISOString();
fs.writeFileSync(path, JSON.stringify(q, null, 2) + '\n');

const counts = {};
for (const t of q.tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
console.log('patched:');
for (const line of patched) console.log('  ' + line);
console.log();
console.log('head:', q.head, '| tasks:', q.tasks.length);
console.log('by status:', JSON.stringify(counts));
