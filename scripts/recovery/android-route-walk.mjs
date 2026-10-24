#!/usr/bin/env node
/* global process, console, fetch, WebSocket, setTimeout */
/**
 * Native route discovery and per-page control scan for the Android app.
 *
 * Parses the real route table out of apps/mp/src/router.ts, then walks every route inside
 * the running Android WebView, recording for each one:
 *   - whether the page actually rendered (visible text length)
 *   - how many controls of each kind the page exposes (button / input / textarea / switch /
 *     link / tab / modal / sheet), per the delivery checklist
 *   - every console error and every failed network request seen while it loaded
 *
 * Routes are reached with CDP Page.navigate, which is a real navigation of the real app
 * inside the real WebView. That is deliberately different from the tap-driven business
 * flows in docs/android-native-verification.md, which use genuine adb touch events; this
 * script is about coverage, not about proving a user gesture.
 *
 * Setup:
 *   adb forward tcp:9333 localabstract:webview_devtools_remote_$(adb shell pidof com.goodnight.treehole)
 * Usage:
 *   node scripts/recovery/android-route-walk.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const artifacts = path.join(repoRoot, 'artifacts', 'recovery');
fs.mkdirSync(artifacts, { recursive: true });

const CDP = process.env.ANDROID_CDP_URL ?? 'http://127.0.0.1:9333/json';
const ORIGIN = process.env.ANDROID_WEBVIEW_ORIGIN ?? 'https://localhost';
const PER_ROUTE_TIMEOUT_MS = Number(process.env.ROUTE_TIMEOUT_MS ?? 12_000);

/** Read the route table straight from the source so the manifest cannot drift from it. */
function readRoutes() {
  const source = fs.readFileSync(path.join(repoRoot, 'apps', 'mp', 'src', 'router.ts'), 'utf8');
  const paths = new Set();
  for (const match of source.matchAll(/\{\s*path:\s*'([^']+)'/g)) {
    const route = match[1];
    if (route !== '/') paths.add(route);
  }
  const tabMatch = source.match(/tabRoutes\s*=\s*\[([^\]]+)\]/);
  const tabs = tabMatch ? [...tabMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
  return { routes: [...paths], tabs };
}

const { routes, tabs } = readRoutes();
console.log(`route manifest: ${routes.length} routes, ${tabs.length} tabs`);

const targets = await (await fetch(CDP)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('no WebView page target; is the app running and the forward set up?');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
let consoleErrors = [];
let failedRequests = [];

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(message.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  }
  if (message.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(String(message.params.exceptionDetails?.exception?.description ?? 'exception').slice(0, 300));
  }
  if (message.method === 'Network.loadingFailed') {
    failedRequests.push(`${message.params.type} ${message.params.errorText}`);
  }
  if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
    failedRequests.push(`${message.params.response.status} ${message.params.response.url.slice(0, 160)}`);
  }
});
await new Promise((resolve) => ws.addEventListener('open', resolve));
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');

const SCAN = `(() => {
  const count = (sel) => document.querySelectorAll(sel).length;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const text = (document.body.innerText || '').trim();
  return JSON.stringify({
    path: location.pathname,
    search: location.search,
    textLength: text.length,
    firstLine: text.split('\\n').map((s) => s.trim()).filter(Boolean).slice(0, 3).join(' / '),
    controls: {
      button: count('button'),
      input: count('input'),
      textarea: count('textarea'),
      switch: count('[role="switch"], input[type="checkbox"], .switch'),
      link: count('a[href]'),
      tab: count('[role="tab"], .tabbar a, .tabbar button, .notice-tabs button'),
      modal: count('[role="dialog"], .modal, .sheet-mask, .end-confirm, .request-sheet'),
      sheet: count('.relation-sheet, .request-panel, .confirm-card, [class*="sheet"]'),
    },
    visibleControls: Array.from(document.querySelectorAll('button, a[href], input, textarea')).filter(visible).length,
    hasTestIds: document.querySelectorAll('[data-testid]').length,
    title: document.title,
  });
})()`;

const results = [];
let index = 0;
for (const route of routes) {
  index += 1;
  consoleErrors = [];
  failedRequests = [];
  const url = `${ORIGIN}${route}`;
  await send('Page.navigate', { url });

  // Wait for the SPA to settle: poll until the path matches and there is rendered text,
  // or give up after the timeout so one bad route cannot stall the walk.
  const deadline = Date.now() + PER_ROUTE_TIMEOUT_MS;
  let scan = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 700));
    const probe = await send('Runtime.evaluate', { expression: SCAN, returnByValue: true });
    const value = probe.result?.result?.value;
    if (!value) continue;
    scan = JSON.parse(value);
    if (scan.path === route && scan.textLength > 0) break;
  }

  const entry = scan ?? { path: route, textLength: 0, controls: {}, visibleControls: 0, hasTestIds: 0 };
  entry.route = route;
  entry.isTab = tabs.includes(route);
  entry.rendered = entry.textLength > 20;
  entry.consoleErrors = [...new Set(consoleErrors)].slice(0, 5);
  entry.failedRequests = [...new Set(failedRequests)].slice(0, 5);
  results.push(entry);

  const mark = entry.rendered ? 'OK  ' : 'BAD ';
  console.log(`${mark} ${String(index).padStart(2)}/${routes.length} ${route} text=${entry.textLength} ctrl=${entry.visibleControls} testids=${entry.hasTestIds} err=${entry.consoleErrors.length} netfail=${entry.failedRequests.length}`);
}

const summary = {
  generatedAt: new Date().toISOString(),
  origin: ORIGIN,
  totalRoutes: routes.length,
  tabs,
  rendered: results.filter((r) => r.rendered).length,
  blank: results.filter((r) => !r.rendered).map((r) => r.route),
  withConsoleErrors: results.filter((r) => r.consoleErrors.length).map((r) => ({ route: r.route, errors: r.consoleErrors })),
  withFailedRequests: results.filter((r) => r.failedRequests.length).map((r) => ({ route: r.route, failures: r.failedRequests })),
  results,
};
fs.writeFileSync(path.join(artifacts, 'android-route-manifest.json'), `${JSON.stringify(summary, null, 2)}\n`);

console.log(`\nrendered ${summary.rendered}/${summary.totalRoutes}`);
if (summary.blank.length) console.log(`blank: ${summary.blank.join(', ')}`);
if (summary.withFailedRequests.length) console.log(`routes with failed requests: ${summary.withFailedRequests.map((r) => r.route).join(', ')}`);
console.log(`manifest: artifacts/recovery/android-route-manifest.json`);
ws.close();
process.exit(summary.rendered >= summary.totalRoutes - 2 ? 0 : 1);
