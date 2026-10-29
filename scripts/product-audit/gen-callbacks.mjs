/* global process, console */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const lines = [];
const push = (kind, payload) => lines.push(JSON.stringify({ at: new Date().toISOString(), kind, ...payload }));

const mp = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/product-audit/mp-routes.json'), 'utf8'));
const admin = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/product-audit/admin-routes.json'), 'utf8'));
const api = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/product-audit/api-endpoints.json'), 'utf8'));
const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/product-audit/db-models.json'), 'utf8'));
const controls = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/product-audit/control-manifest.json'), 'utf8'));
const runtime = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/post-recovery/control-coverage.json'), 'utf8'));
const graph = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/product-audit/business-graph-core.json'), 'utf8'));
const unguarded = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/product-audit/admin-unguarded.json'), 'utf8'));

push('PHASE', { phase: 'DISCOVERY', detail: 'read-only discovery started at HEAD 158c298' });
push('PAGE', { surface: 'mp', totalRoutes: mp.totalRoutes, uniqueViews: mp.totalUniqueViews, tabRoutes: mp.tabRoutes });
push('PAGE', { surface: 'admin', totalRoutes: admin.totalRoutes, resources: admin.menu.length });
push('API', { total: api.total });
push('DB', { models: db.models.length, enums: db.enums.length });
push('CONTROL', { static: controls.total, runtime: runtime.totalControls, pressed: runtime.clickedControls, destructiveSkipped: runtime.destructiveSkipped });
push('FLOW', { nodes: graph.nodes.length, edges: graph.edges.length, flows: Object.keys(graph.flows), supportIntents: graph.supportIntents });

for (const route of runtime.coverage) {
  push('PAGE', { surface: 'mp', route: route.route, rendered: route.rendered, controls: route.controls.length, consoleErrors: route.consoleErrors.length });
}

push('SECURITY', { issue: 'ISSUE-001', severity: 'P0', detail: `admin handlers without a token guard: ${unguarded.unguarded.length} of ${unguarded.total}`, evidence: 'work/audit-admin-guards.mjs + work/verify-unauth-delete.mjs' });
push('SECURITY', { issue: 'ISSUE-017', severity: 'P1', detail: 'GET /api/v1/letters/:id is not scoped by user', evidence: 'work/verify-ownership.mjs' });
push('SECURITY', { issue: 'ISSUE-019', severity: 'P1', detail: 'GET /api/v1/handoffs is not scoped by user', evidence: 'work/verify-ownership.mjs' });
push('ISSUE', { issue: 'ISSUE-002', severity: 'P1', detail: 'admin user export returns {} and a fabricated downloadUrl', evidence: 'work/verify-findings.mjs' });
push('ISSUE', { issue: 'ISSUE-004', severity: 'P1', detail: 'tool subtree has no inbound control', evidence: 'docs/product-audit/discovery-agent1-page-graph.md' });
push('ISSUE', { issue: 'ISSUE-006', severity: 'P1', detail: 'three support intents collapse', evidence: 'JourneyDetail.vue:93-103' });
push('AI', { detail: 'every AIJob terminates as fallback', provider: 'provider_dapi_deepseek', error: 'Remote provider returned HTTP 402', evidence: 'work/q-aijobs.sql' });
push('DB', { detail: 'Android core flow persisted', journey: 'journey_044afe1bc1', action: 'action_826fbc0efe', evidence: 'artifacts/recovery/android-flow-stage1-core.json' });
push('ADMIN', { detail: 'admin app reachable at 127.0.0.1:5174; resources audited: 24' });
push('RETEST', { detail: 'lint exit 0, typecheck exit 0' });
push('PHASE', { phase: 'DISCOVERY_FROZEN', detail: 'DISCOVERY_FROZEN=true; no code fixes applied in this run' });

fs.writeFileSync(path.join(ROOT, 'artifacts/product-audit/callbacks.jsonl'), lines.join('\n') + '\n');
console.log(`callbacks: ${lines.length}`);
