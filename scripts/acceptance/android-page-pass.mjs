#!/usr/bin/env node
/**
 * F16 - every C-end page opens, responds, and the app's data is real in the database.
 *
 * The pass drives the installed Android app over the WebView's Chrome DevTools protocol. It
 * navigates to each canonical route, waits for the page to settle, reads what the user would see,
 * and captures a screenshot. A page fails when the router did not arrive at the route, the body is
 * effectively empty, an error banner is visible, the literal text `undefined` leaked into the view,
 * or an API call on that page returned 5xx.
 *
 * The foreground is checked before every navigation. The emulator is shared with other work on this
 * machine and another app can take focus; when that happens the route is reported as blocked rather
 * than photographed as if it were ours.
 *
 * The database step reads the identity the app itself stores (Capacitor Preferences), so "the app
 * wrote something" is checked against a row, not against a UI message.
 *
 * Usage:
 *   node scripts/acceptance/android-page-pass.mjs [--run <runId>] [--serial emulator-5554]
 *        [--cdp-port 9333] [--only /pages/me/index] [--no-fixtures]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const APP_ID = 'com.goodnight.treehole';
const API = process.env.ACCEPTANCE_API_BASE ?? 'http://127.0.0.1:3000';

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
const has = (name) => process.argv.includes(name);

const serial = arg('--serial', 'emulator-5554');
const cdpPort = Number(arg('--cdp-port', '9333'));
const only = arg('--only');
const runId = arg('--run', process.env.ACCEPTANCE_RUN_ID ?? `android-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const outDir = path.resolve('artifacts', 'acceptance', runId, 'F16');
const shotDir = path.join(outDir, 'screens');
fs.mkdirSync(shotDir, { recursive: true });

const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
const adb = path.join(sdkRoot, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');

function sh(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}
const adbShell = (...args) => sh(adb, ['-s', serial, 'shell', ...args]);

function foregroundPackage() {
  const dump = adbShell('dumpsys', 'window');
  const match = dump.match(/mCurrentFocus=Window\{[^ ]+ [^ ]+ ([^/\s]+)\//);
  return match?.[1] ?? null;
}

function ensureForeground() {
  if (foregroundPackage() === APP_ID) return true;
  adbShell('am', 'force-stop', APP_ID);
  adbShell('monkey', '-p', APP_ID, '-c', 'android.intent.category.LAUNCHER', '1');
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (foregroundPackage() === APP_ID) return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  return false;
}

function readStoredIdentity() {
  try {
    const xml = adbShell('run-as', APP_ID, 'cat', `/data/data/${APP_ID}/shared_prefs/CapacitorStorage.xml`);
    const credential = xml.match(/name="goodnight-identity-credential">([^<]+)</)?.[1];
    const userId = xml.match(/name="goodnight-identity-user-id">([^<]+)</)?.[1];
    return { credential, userId };
  } catch {
    return {};
  }
}

async function api(pathname, options = {}) {
  const response = await fetch(`${API}${pathname}`, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

function routesFromRouter() {
  const source = fs.readFileSync(path.resolve('apps/mp/src/router.ts'), 'utf8');
  const seen = new Set();
  const routes = [];
  for (const match of source.matchAll(/\{\s*path:\s*'([^']+)'\s*,\s*component:\s*(\w+)\s*\}/g)) {
    const [, route, component] = match;
    if (route === '/' || seen.has(component)) continue;
    seen.add(component);
    routes.push({ route, component });
  }
  return routes;
}

const PARAM_ROUTES = {
  '/pages/journey/detail': 'journeyId',
  '/pages/post/detail': 'postId',
  '/pages/letter/detail': 'letterId',
  '/pages/diary/detail': 'diaryId',
  '/pages/peer/detail': 'experienceId',
  '/pages/decision/index': 'decisionId',
  '/pages/peer/conversation': 'matchId',
  '/pages/peer/consent': 'matchId',
  '/pages/peer/graduate': 'matchId',
  '/pages/peer/wait': 'matchId',
};

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve } = this.pending.get(message.id);
        this.pending.delete(message.id);
        resolve(message);
      } else if (message.method) {
        for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
      }
    };
  }
  async open() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = () => reject(new Error('CDP socket failed to open'));
    });
  }
  send(method, params = {}) {
    return new Promise((resolve) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, listener) {
    const list = this.listeners.get(method) ?? [];
    list.push(listener);
    this.listeners.set(method, list);
  }
  close() {
    try {
      this.ws.close();
    } catch {
      // already closed
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (!fs.existsSync(adb)) throw new Error(`adb not found at ${adb}`);
  sh(adb, ['-s', serial, 'reverse', 'tcp:3000', 'tcp:3000']);
  const pid = adbShell('pidof', APP_ID).trim();
  if (!pid) throw new Error(`${APP_ID} is not running`);
  try {
    sh(adb, ['-s', serial, 'forward', '--remove', `tcp:${cdpPort}`]);
  } catch {
    // no existing forward
  }
  sh(adb, ['-s', serial, 'forward', `tcp:${cdpPort}`, `localabstract:webview_devtools_remote_${pid}`]);
  await sleep(500);

  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
  const page = targets.find((target) => target.type === 'page');
  if (!page) throw new Error('no WebView page target');

  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  let routeResponses = [];
  cdp.on('Network.responseReceived', (params) => {
    const url = params?.response?.url ?? '';
    if (url.includes('/api/')) routeResponses.push({ url, status: params.response.status });
  });

  const identity = readStoredIdentity();
  if (!identity.credential) throw new Error('the app has no stored identity credential');

  const fixtures = {};
  if (!has('--no-fixtures')) {
    const journeys = await api('/api/v1/journeys', { headers: { 'x-goodnight-user-id': identity.credential } });
    fixtures.journeyId = journeys.body?.items?.[0]?.id;
    if (!fixtures.journeyId) {
      const created = await api('/api/v1/journeys', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goodnight-user-id': identity.credential },
        body: JSON.stringify({ title: `F16 页面走查 ${Date.now()}`, domain: '生活', content: 'F16：页面走查用的旅程。', intensity: 4 }),
      });
      fixtures.journeyId = created.body?.journey?.id;
    }
    const decisions = await api('/api/v1/decisions', { headers: { 'x-goodnight-user-id': identity.credential } });
    fixtures.decisionId = decisions.body?.items?.[0]?.id;
    if (!fixtures.decisionId) {
      const created = await api('/api/v1/decisions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goodnight-user-id': identity.credential },
        body: JSON.stringify({ question: 'F16：页面走查用的决定', options: ['现在', '以后'], criteria: ['先看事实'] }),
      });
      fixtures.decisionId = created.body?.item?.id;
    }
    const diaries = await api('/api/v1/me/diaries', { headers: { 'x-goodnight-user-id': identity.credential } });
    fixtures.diaryId = diaries.body?.items?.[0]?.id;
    const letters = await api('/api/v1/letters', { headers: { 'x-goodnight-user-id': identity.credential } });
    fixtures.letterId = letters.body?.items?.[0]?.id;
    const posts = await api('/api/v1/posts');
    fixtures.postId = posts.body?.items?.[0]?.id;
    const peers = await api('/api/v1/peers', { headers: { 'x-goodnight-user-id': identity.credential } });
    fixtures.experienceId = peers.body?.item?.experiences?.[0]?.id;
    fixtures.matchId = peers.body?.item?.matches?.[0]?.id;
  }

  const routes = only ? [{ route: only, component: 'only' }] : routesFromRouter();
  const steps = [];
  let serverErrors = 0;
  let apiCalls = 0;
  let blocked = 0;

  for (const { route, component } of routes) {
    const paramKey = PARAM_ROUTES[route];
    const paramValue = paramKey ? fixtures[paramKey] : undefined;
    const target = paramValue
      ? `${route}?${paramKey === 'matchId' ? 'matchId' : 'id'}=${encodeURIComponent(paramValue)}`
      : route;

    if (!ensureForeground()) {
      blocked += 1;
      steps.push({
        step: `page ${route}`,
        layer: 'UI_EVIDENCE',
        expected: { foregroundApp: APP_ID, rendered: true },
        actual: { foregroundApp: foregroundPackage(), rendered: false },
        detail: { component, target, blockedReason: 'another app held the foreground' },
        verdict: 'FAIL',
      });
      continue;
    }

    routeResponses = [];
    await cdp.send('Page.navigate', { url: `https://localhost${target}` });
    const deadline = Date.now() + 15_000;
    let ready = false;
    while (Date.now() < deadline) {
      const probe = await cdp.send('Runtime.evaluate', {
        expression: 'document.readyState',
        returnByValue: true,
      });
      if (probe.result?.result?.value === 'complete') {
        ready = true;
        break;
      }
      await sleep(200);
    }
    await sleep(900);

    const probe = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const text = (document.body && document.body.innerText) || '';
        return JSON.stringify({
          href: location.pathname + location.search,
          textLength: text.length,
          errorBanner: /加载失败|出错了|网络异常|无法连接|请求失败|服务不可用/.test(text),
          literalUndefined: /\\bundefined\\b/.test(text),
          preview: text.slice(0, 160).replace(/\\n/g, ' / '),
        });
      })()`,
      returnByValue: true,
    });
    const view = JSON.parse(probe.result?.result?.value ?? '{}');
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const slug = route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');
    const shotPath = path.join(shotDir, `${slug}.png`);
    if (screenshot.result?.data) fs.writeFileSync(shotPath, Buffer.from(screenshot.result.data, 'base64'));

    const apiForRoute = routeResponses.filter((item) => item.url.includes('/api/'));
    apiCalls += apiForRoute.length;
    const routeServerErrors = apiForRoute.filter((item) => item.status >= 500);
    serverErrors += routeServerErrors.length;

    const arrived = view.href?.startsWith(route);
    const rendered = ready && arrived && view.textLength >= 20;
    // A detail page opened without a fixture legitimately says "not found"; that is the page's own
    // empty state, not a broken page. With a fixture present the same banner is a failure.
    const missingFixture = Boolean(paramKey && !paramValue);
    const bannerIsExpected = missingFixture && /没有找到|不存在/.test(view.preview ?? '');
    const clean = (!view.errorBanner || bannerIsExpected) && !view.literalUndefined && routeServerErrors.length === 0;
    const pass = rendered && clean;

    steps.push({
      step: `page ${route}`,
      layer: 'UI_EVIDENCE',
      expected: {
        arrived: true,
        rendered: true,
        noUnexpectedErrorBanner: true,
        noUndefinedText: true,
        noServerError: true,
      },
      actual: {
        arrived: Boolean(arrived),
        rendered: Boolean(rendered),
        noUnexpectedErrorBanner: !view.errorBanner || bannerIsExpected,
        noUndefinedText: !view.literalUndefined,
        noServerError: routeServerErrors.length === 0,
      },
      request: { route: target, component },
      response: { href: view.href, textLength: view.textLength, preview: view.preview, apiCalls: apiForRoute.length },
      detail: {
        ...(missingFixture
          ? { missingFixture: paramKey, note: 'no record of this type existed, so the page was opened in its empty state' }
          : {}),
        ...(routeServerErrors.length
          ? { serverErrors: routeServerErrors.map((item) => `${item.status} ${item.url}`) }
          : {}),
      },
      screenshot: path.relative(process.cwd(), shotPath).replaceAll('\\', '/'),
      verdict: pass ? 'PASS' : 'FAIL',
    });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${route}${paramValue ? ' (with fixture)' : ''} - ${view.textLength} chars`);
  }

  // API layer: the pages were driven by real requests; a 5xx anywhere is a failure of the flow.
  steps.push({
    step: 'the pages ran on real API responses',
    layer: 'API_EVIDENCE',
    expected: { apiCallsAtLeastOne: true, serverErrors: 0 },
    actual: { apiCallsAtLeastOne: apiCalls > 0, serverErrors, apiCalls },
    request: { base: API },
    verdict: apiCalls > 0 && serverErrors === 0 ? 'PASS' : 'FAIL',
  });

  // Database layer: the identity the app stores is a real row, and its fixtures are in the table.
  let db = {};
  try {
    // Invoke the tsx CLI through node rather than `npx`: on Windows a .cmd shim needs a shell, and
    // shell quoting around a user id is one more way to run the wrong thing.
    const raw = sh(process.execPath, [
      path.resolve('node_modules/tsx/dist/cli.mjs'),
      'scripts/acceptance/query-db-evidence.ts',
      identity.userId,
    ]);
    db = JSON.parse(raw.trim().split('\n').at(-1));
  } catch (error) {
    db = { error: error instanceof Error ? error.message : String(error) };
  }
  steps.push({
    step: 'the app identity and its records exist in PostgreSQL',
    layer: 'DATABASE_EVIDENCE',
    expected: { userExists: true, journeysAtLeast: 1, decisionsAtLeast: 1 },
    actual: {
      userExists: Boolean(db.userExists),
      journeysAtLeast: (db.counts?.journeys ?? 0) >= 1,
      decisionsAtLeast: (db.counts?.decisions ?? 0) >= 1,
      counts: db.counts,
    },
    request: { userId: identity.userId },
    detail: db.error ? { error: db.error } : undefined,
    verdict:
      db.userExists && (db.counts?.journeys ?? 0) >= 1 && (db.counts?.decisions ?? 0) >= 1 ? 'PASS' : 'FAIL',
  });

  const failures = steps.filter((step) => step.verdict !== 'PASS');
  const evidence = {
    flowId: 'F16',
    runId,
    gitSha: process.env.GIT_COMMIT_SHA ?? 'unknown',
    recordedAt: new Date().toISOString(),
    device: { serial, appId: APP_ID, kind: 'emulator' },
    apkSha256: process.env.APK_SHA256 ?? null,
    verdict: failures.length === 0 ? 'PASS' : 'FAIL',
    stepCount: steps.length,
    steps,
  };
  fs.writeFileSync(path.join(outDir, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  cdp.close();

  console.log(`\nF16 ${evidence.verdict}: ${steps.length - failures.length}/${steps.length} steps passed, ${blocked} blocked`);
  if (failures.length) {
    for (const step of failures) console.log(`  FAIL ${step.step}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
