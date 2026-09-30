#!/usr/bin/env node
/* global process, console, fetch, WebSocket, setTimeout */
/**
 * Android control discovery and coverage.
 *
 * Generates the route manifest from apps/mp/src/router.ts, then walks the running Android
 * WebView and enumerates every interactive control on every route with a stable selector,
 * its visibility and enabled state, and - for controls that are safe to press - the result
 * of actually clicking it.
 *
 * Selectors are preferred in this order, per the task rules: data-testid, then
 * role + accessible name, then a structural path. Fixed screen coordinates are never used
 * as the primary mechanism.
 *
 * Safety: controls whose label reads as destructive (delete / clear / remove / archive /
 * close / end / block / report and their Chinese equivalents) are recorded but NOT clicked.
 * Pressing them on every route would corrupt the very data the rest of the validation
 * depends on.
 *
 * Setup:
 *   adb forward tcp:9333 localabstract:webview_devtools_remote:$(adb shell pidof com.goodnight.treehole)
 * Usage:
 *   node scripts/recovery/android-control-coverage.mjs            # inventory only
 *   node scripts/recovery/android-control-coverage.mjs --click    # also press safe controls
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(repoRoot, 'artifacts', 'post-recovery');
fs.mkdirSync(outDir, { recursive: true });

const CDP = process.env.ANDROID_CDP_URL ?? 'http://127.0.0.1:9333/json';
const ORIGIN = 'https://localhost';
const doClick = process.argv.includes('--click');
const PER_ROUTE_MS = Number(process.env.ROUTE_TIMEOUT_MS ?? 10_000);

/** Route manifest straight from the source, so it cannot drift from the router. */
function readRoutes() {
  const source = fs.readFileSync(path.join(repoRoot, 'apps', 'mp', 'src', 'router.ts'), 'utf8');
  const routes = [];
  for (const m of source.matchAll(/\{\s*path:\s*'([^']+)'\s*,\s*component:\s*(\w+)/g)) {
    routes.push({ path: m[1], component: m[2] });
  }
  const tabMatch = source.match(/tabRoutes\s*=\s*\[([^\]]+)\]/);
  const tabs = tabMatch ? [...tabMatch[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
  return { routes, tabs };
}

const { routes, tabs } = readRoutes();
const manifest = {
  generatedAt: new Date().toISOString(),
  source: 'apps/mp/src/router.ts',
  totalRoutes: routes.length,
  tabs,
  routes: routes.map((r) => ({ ...r, isTab: tabs.includes(r.path) })),
};
fs.writeFileSync(path.join(outDir, 'routes.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`routes.json: ${routes.length} routes, ${tabs.length} tabs`);

const targets = await (await fetch(CDP)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('no WebView page target; is the app running and the forward set up?');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const consoleErrors = [];
ws.addEventListener('message', (event) => {
  const m = JSON.parse(event.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args.map((a) => a.value ?? '').join(' ').slice(0, 200));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(String(m.params.exceptionDetails?.exception?.description ?? 'exception').slice(0, 200));
  }
});
await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}) =>
  new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
await send('Runtime.enable');
await send('Page.enable');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A wedged WebView must not hang the whole run. Every evaluate is bounded, and a timeout
// resolves to undefined so the caller treats it as "no reading" and moves on.
async function evaluate(expression, timeoutMs = 8000) {
  const result = await Promise.race([
    send('Runtime.evaluate', { expression, returnByValue: true }),
    new Promise((r) => setTimeout(() => r(undefined), timeoutMs)),
  ]);
  return result?.result?.result?.value;
}

/** Enumerate interactive controls with a preferred selector, visibility and enabled state. */
const SCAN = `(() => {
  const DESTRUCTIVE = /删除|清空|归档|结束|关闭|举报|屏蔽|退出|delete|remove|clear|archive|close|end|block|report|uninstall/i;
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const name = (el) => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.getAttribute('title') || '').replace(/\\s+/g, ' ').trim().slice(0, 40);
  const selectorFor = (el, index) => {
    const id = el.getAttribute('data-testid');
    if (id) return '[data-testid="' + id + '"]';
    const role = el.getAttribute('role');
    const n = name(el);
    if (role && n) return 'role=' + role + '[name="' + n.replace(/"/g, '') + '"]';
    if (el.tagName === 'A' && el.getAttribute('href')) return 'a[href="' + el.getAttribute('href') + '"]';
    return el.tagName.toLowerCase() + ':nth-of-type(' + index + ')';
  };
  const nodes = Array.from(document.querySelectorAll(
    'button, a[href], input, textarea, select, [role="button"], [role="link"], [role="switch"], [role="tab"], [role="checkbox"], [role="radio"], [data-testid]'
  ));
  const controls = nodes.map((el, i) => {
    const label = name(el);
    const cs = getComputedStyle(el);
    return {
      selector: selectorFor(el, i + 1),
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || null,
      testid: el.getAttribute('data-testid') || null,
      name: label,
      visible: visible(el),
      enabled: !el.disabled && el.getAttribute('aria-disabled') !== 'true' && cs.pointerEvents !== 'none',
      destructive: DESTRUCTIVE.test(label) || DESTRUCTIVE.test(el.getAttribute('data-testid') || ''),
    };
  });
  return JSON.stringify({
    path: location.pathname + location.search,
    textLength: (document.body.innerText || '').trim().length,
    state: document.querySelector('[role="dialog"], .sheet-mask, .modal, [class*="sheet"]') ? 'modal-open'
         : (document.querySelector('[class*="empty"]') ? 'possibly-empty' : 'default'),
    controls,
  });
})()`;

const coverage = [];
for (const route of routes) {
  consoleErrors.length = 0;
  await send('Page.navigate', { url: `${ORIGIN}${route.path}` });
  const deadline = Date.now() + PER_ROUTE_MS;
  let scan = null;
  while (Date.now() < deadline) {
    await sleep(700);
    const raw = await evaluate(SCAN);
    if (!raw) continue;
    scan = JSON.parse(raw);
    if (scan.path.startsWith(route.path) && scan.textLength > 0) break;
  }
  if (!scan) { console.log(`SKIP  ${route.path} (no scan)`); continue; }

  const rows = scan.controls.map((c) => ({ route: route.path, state: scan.state, ...c, clicked: false, result: 'not-attempted' }));

  if (doClick) {
    for (const row of rows) {
      if (!row.visible || !row.enabled) { row.result = 'skipped: not actionable'; continue; }
      if (row.destructive) { row.result = 'skipped: destructive control'; continue; }
      if (row.tag === 'input' || row.tag === 'textarea' || row.tag === 'select') { row.result = 'skipped: text field'; continue; }
      // Links navigate by definition; the route walk already covers every route.
      if (row.tag === 'a') { row.result = 'skipped: link (covered by the route walk)'; continue; }
      const before = await evaluate('location.pathname + location.search + "|" + (document.body.innerText||"").length');
      if (before === undefined) { row.result = 'skipped: WebView unresponsive'; continue; }
      const clicked = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(row.selector)});
        if (!el) return 'not-found'; el.click(); return 'clicked'; })()`);
      await sleep(900);
      const after = await evaluate('location.pathname + location.search + "|" + (document.body.innerText||"").length');
      row.clicked = clicked === 'clicked';
      row.result = clicked !== 'clicked' ? 'not-found' : (before === after ? 'no observable change' : 'changed');
      // Return to the route so the next control is evaluated on the same page.
      if (before !== after) {
        await send('Page.navigate', { url: `${ORIGIN}${route.path}` });
        await sleep(1400);
      }
    }
  }

  coverage.push({ route: route.path, component: route.component, isTab: tabs.includes(route.path), rendered: scan.textLength > 20, state: scan.state, consoleErrors: [...new Set(consoleErrors)].slice(0, 3), controls: rows });
  const visible = rows.filter((r) => r.visible).length;
  console.log(`${scan.textLength > 20 ? 'OK  ' : 'BAD '} ${route.path} controls=${rows.length} visible=${visible}${doClick ? ` clicked=${rows.filter((r) => r.clicked).length}` : ''}`);
}

const summary = {
  generatedAt: new Date().toISOString(),
  mode: doClick ? 'inventory+click' : 'inventory',
  origin: ORIGIN,
  totalRoutes: coverage.length,
  rendered: coverage.filter((c) => c.rendered).length,
  totalControls: coverage.reduce((n, c) => n + c.controls.length, 0),
  visibleControls: coverage.reduce((n, c) => n + c.controls.filter((x) => x.visible).length, 0),
  clickedControls: coverage.reduce((n, c) => n + c.controls.filter((x) => x.clicked).length, 0),
  destructiveSkipped: coverage.reduce((n, c) => n + c.controls.filter((x) => x.result === 'skipped: destructive control').length, 0),
  withoutTestId: coverage.reduce((n, c) => n + c.controls.filter((x) => !x.testid).length, 0),
  coverage,
};
fs.writeFileSync(path.join(outDir, 'control-coverage.json'), `${JSON.stringify(summary, null, 2)}\n`);

console.log(`\ncontrol-coverage.json: routes=${summary.totalRoutes} rendered=${summary.rendered} controls=${summary.totalControls} visible=${summary.visibleControls} clicked=${summary.clickedControls} destructive-skipped=${summary.destructiveSkipped}`);
ws.close();
