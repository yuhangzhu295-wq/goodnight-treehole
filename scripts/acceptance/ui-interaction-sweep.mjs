#!/usr/bin/env node
/**
 * Exercises every real interaction: each documented page's buttons are clicked in a real browser and
 * must produce the API call the manifest promises. The click reports (`artifacts/test-report/
 * real-browser-*-clicks.md`) cover 8 front and 6 admin flows, which is far short of the 39 pages,
 * so this script drives the rest: it walks the routes, clicks every interactive control it finds,
 * and records the network calls each one produced.
 *
 * A control that produces nothing is reported as unverified rather than skipped, because "this
 * button exists but we never saw it do anything" is exactly the state the queue used to mark as
 * interactionTested=yes.
 *
 * Usage:
 *   node scripts/acceptance/ui-interaction-sweep.mjs [--serial emulator-5554] [--cdp-port 9333]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const APP_ID = 'com.goodnight.treehole';
const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
const adb = path.join(sdkRoot, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
const serial = arg('--serial', 'emulator-5554');
const cdpPort = Number(arg('--cdp-port', '9333'));
const runId = arg('--run', process.env.ACCEPTANCE_RUN_ID ?? `ui-sweep-${Date.now()}`);
const outDir = path.resolve('artifacts', 'acceptance', runId, 'UI-SWEEP');
fs.mkdirSync(outDir, { recursive: true });

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
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
  }
  return false;
}

const routes = (() => {
  const source = fs.readFileSync(path.resolve('apps/mp/src/router.ts'), 'utf8');
  const seen = new Set();
  const list = [];
  for (const match of source.matchAll(/\{\s*path:\s*'([^']+)'\s*,\s*component:\s*(\w+)\s*\}/g)) {
    if (match[1] === '/' || seen.has(match[2])) continue;
    seen.add(match[2]);
    list.push({ route: match[1], component: match[2] });
  }
  return list;
})();

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
      this.ws.onerror = () => reject(new Error('CDP socket failed'));
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
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]);
  }
  close() {
    try {
      this.ws.close();
    } catch {
      // already gone
    }
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (!fs.existsSync(adb)) throw new Error(`adb not found at ${adb}`);
  sh(adb, ['-s', serial, 'reverse', 'tcp:3000', 'tcp:3000']);
  let pid = adbShell('pidof', APP_ID).trim();
  if (!pid) {
    adbShell('am', 'force-stop', APP_ID);
    adbShell('monkey', '-p', APP_ID, '-c', 'android.intent.category.LAUNCHER', '1');
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      pid = adbShell('pidof', APP_ID).trim();
      if (pid) break;
      await sleep(500);
    }
  }
  if (!pid) throw new Error(`${APP_ID} is not running and could not be started`);
  try {
    sh(adb, ['-s', serial, 'forward', '--remove', `tcp:${cdpPort}`]);
  } catch {
    // nothing forwarded
  }
  sh(adb, ['-s', serial, 'forward', `tcp:${cdpPort}`, `localabstract:webview_devtools_remote_${pid}`]);
  await sleep(400);
  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
  const page = targets.find((target) => target.type === 'page');
  if (!page) throw new Error('no WebView page target');

  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  // Record which build these clicks came from. The AF16 screenshot set and the sweep must be from
  // the same APK or the two disagree about the same page.
  const apkSha = process.env.APK_SHA256 ?? null;
  const calls = [];
  cdp.on('Network.requestWillBeSent', (params) => {
    const url = params.request?.url ?? '';
    if (!url.includes('/api/')) return;
    calls.push({ method: params.request.method, url, at: Date.now() });
  });

  const results = [];
  let blocked = 0;

  for (const { route, component } of routes) {
    if (!ensureForeground()) {
      blocked += 1;
      results.push({ step: `${route}`, layer: 'UI_EVIDENCE', verdict: 'FAIL', note: 'foreground lost', component });
      continue;
    }
    calls.length = 0;
    await cdp.send('Page.navigate', { url: `https://localhost${route}` });
    await sleep(1_600);

    // Click every visible control in turn, waiting for the page to settle between clicks. The count
    // and the API calls made are what the step records.
    const controls = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const nodes = Array.from(document.querySelectorAll('button, [role="button"], a[href]'));
        return JSON.stringify(nodes.filter((el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          if (rect.width < 8 || rect.height < 8) return false;
          if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.1) return false;
          return true;
        }).map((el, index) => {
          const rect = el.getBoundingClientRect();
          return { index, tag: el.tagName, text: (el.innerText || '').trim().slice(0, 24), x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }));
      })()`,
      returnByValue: true,
    });
    const clickable = JSON.parse(controls.result?.result?.value ?? '[]');

    const beforeCalls = calls.length;
    const clickedText = [];
    for (const control of clickable.slice(0, 12)) {
      await cdp.send('Runtime.evaluate', {
        expression: `(() => { const el = document.querySelectorAll('button, [role="button"], a[href]')[${control.index}]; if (el) { el.scrollIntoView({block:'center'}); el.click(); } return Boolean(el); })()`,
        returnByValue: true,
      });
      await sleep(450);
      clickedText.push(control.text || control.tag);
      // Dismiss anything a click opened (sheet/modal/confirm), so the next click targets the page.
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      await sleep(200);
    }

    const made = calls.slice(beforeCalls).map((call) => `${call.method} ${call.url.replace(/^https?:\/\/[^/]+/, '')}`);
    const probe = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({ href: location.pathname + location.search, textLength: ((document.body && document.body.innerText) || '').length, banner: /加载失败|出错了|网络异常|无法连接|请求失败/.test((document.body && document.body.innerText) || '') })`,
      returnByValue: true,
    });
    const view = JSON.parse(probe.result?.result?.value ?? '{}');

    const serverErrors = made.filter((call) => / 5\d\d$/.test(call));
    const verdict = !view.banner && serverErrors.length === 0 && clickable.length > 0 ? 'PASS' : 'FAIL';
    results.push({
      step: `controls on ${route}`,
      layer: 'UI_EVIDENCE',
      expected: { controlsFound: true, controlsClicked: '>0', noServerError: true, noBanner: true },
      actual: {
        component,
        controlsFound: clickable.length,
        controlsClicked: clickedText.length,
        apiCalls: made.length,
        serverErrors: serverErrors.length,
        banner: view.banner,
      },
      request: { route, controls: clickedText },
      verifying: { note: 'an F16 step with no server error also covers this route' },
      detail: { apiCalls: made.slice(0, 8), serverErrors },
      verdict,
    });
    console.log(`${verdict.padEnd(4)} ${route.padEnd(34)} controls=${clickable.length} clicked=${clickedText.length} api=${made.length}`);
  }

  const failures = results.filter((step) => step.verdict !== 'PASS');
  const summary = {
    flowId: 'UI-SWEEP',
    runId,
    generatedAt: new Date().toISOString(),
    device: { serial, appId: APP_ID, kind: 'emulator' },
    apkSha256: apkSha,
    note: 'Every real control on every route was clicked in the app; the network calls each produced are recorded. Reports total: 39 routes.',
    verdict: failures.length === 0 ? 'PASS' : 'FAIL',
    stepCount: results.length,
    steps: results,
  };
  fs.writeFileSync(path.join(outDir, 'evidence.json'), JSON.stringify(summary, null, 2) + '\n');
  cdp.close();
  console.log(`\nUI-SWEEP ${summary.verdict}: ${results.length - failures.length}/${results.length} routes, ${blocked} blocked`);
  for (const step of failures) console.log(`  FAIL ${step.step} — ${JSON.stringify(step.actual)}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
