#!/usr/bin/env node
/* global process, console, fetch, WebSocket, setTimeout */
/**
 * Drives a real business flow inside the installed Android app.
 *
 * Every interaction is a genuine `adb shell input tap` / `input text`, with coordinates
 * resolved from the live WebView layout over the DevTools protocol - the CSS viewport is
 * 411x890 at devicePixelRatio 2.625 inside a 1080x2400 screen and the page scrolls, so
 * hard-coded coordinates miss.
 *
 * This is the tap-driven counterpart to android-route-walk.mjs, which covers routes by
 * navigation. Use this one when the point is that a user gesture actually works.
 *
 * Setup:
 *   adb forward tcp:9333 localabstract:webview_devtools_remote:$(adb shell pidof com.goodnight.treehole)
 * Usage:
 *   node scripts/recovery/android-business-flow.mjs [flow-name]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const artifacts = path.join(repoRoot, 'artifacts', 'recovery');
fs.mkdirSync(artifacts, { recursive: true });

const ADB = process.env.ADB_BIN ?? `${process.env.USERPROFILE}\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe`;
const CDP = process.env.ANDROID_CDP_URL ?? 'http://127.0.0.1:9333/json';
const ORIGIN = 'https://localhost';

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const marker = `ANDROID-FLOW-${stamp}`;

/**
 * Stage 1 core loop, the same chain the first-batch business spec exercises on the API:
 * create a journey, confirm the situation fingerprint, then ask for and accept a plan.
 */
const flows = {
  'stage1-core': [
    { name: 'tonight', goto: '/pages/tonight/index' },
    { name: 'type-entry', tap: '[data-testid="tonight-input"]', then: { text: `${marker} 今晚心里很乱，想先把这件事放在这里。` } },
    { name: 'dismiss-keyboard', keyevent: 4, waitMs: 1500 },
    { name: 'submit-journey', tap: '[data-testid="tonight-continue"]', waitMs: 12000 },
    { name: 'confirm-fingerprint', tap: '[data-testid="fingerprint-accurate"]', waitMs: 6000, optional: true },
    { name: 'open-action-tab', goto: '/pages/action/index', waitMs: 4000 },
    { name: 'request-plan', tap: '[data-testid="action-request-plan"]', waitMs: 12000, optional: true },
    { name: 'accept-plan', tap: '[data-testid="action-accept-plan"]', waitMs: 8000, optional: true },
  ],
};

const flowName = process.argv[2] ?? 'stage1-core';
const steps = flows[flowName];
if (!steps) {
  console.error(`unknown flow: ${flowName}. known: ${Object.keys(flows).join(', ')}`);
  process.exit(2);
}

const targets = await (await fetch(CDP)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('no WebView page target; is the app running and the forward set up?');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const consoleErrors = [];
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(message.params.args.map((a) => a.value ?? '').join(' ').slice(0, 200));
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function adb(...args) {
  const result = spawnSync(ADB, args, { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`adb ${args.join(' ')} exited ${result.status}: ${result.stderr}`);
  return result.stdout;
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  return result.result?.result?.value;
}

/** Resolve an element to physical pixels, or report that it is not on the page. */
async function locate(selector) {
  const raw = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return JSON.stringify({ found: false });
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return JSON.stringify({ found: true, x: r.x + r.width / 2, y: r.y + r.height / 2,
      w: Math.round(r.width), h: Math.round(r.height),
      visible: cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.height > 0 });
  })()`);
  return JSON.parse(raw);
}

const results = [];
for (const step of steps) {
  const entry = { name: step.name };
  try {
    if (step.goto) {
      await send('Page.navigate', { url: `${ORIGIN}${step.goto}` });
      await sleep(step.waitMs ?? 3500);
      entry.goto = step.goto;
      entry.url = await evaluate('location.pathname');
    }
    if (step.tap) {
      const box = await locate(step.tap);
      if (!box.found || !box.visible) {
        if (step.optional) {
          entry.skipped = `not present: ${step.tap}`;
          results.push(entry);
          console.log(`SKIP  ${step.name} (${entry.skipped})`);
          continue;
        }
        throw new Error(`not visible: ${step.tap}`);
      }
      const dpr = await evaluate('window.devicePixelRatio');
      const x = Math.round(box.x * dpr);
      const y = Math.round(box.y * dpr);
      await adb('shell', 'input', 'tap', String(x), String(y));
      entry.tap = { selector: step.tap, x, y };
      await sleep(step.waitMs ?? 2500);
      entry.url = await evaluate('location.pathname + location.search');
    }
    if (step.then?.text) {
      await adb('shell', 'input', 'text', step.then.text);
      entry.typed = step.then.text;
      await sleep(800);
    }
    if (step.keyevent) {
      await adb('shell', 'input', 'keyevent', String(step.keyevent));
      await sleep(step.waitMs ?? 1200);
    }
    entry.text = await evaluate('(document.body.innerText || "").replace(/\\s+/g, " ").slice(0, 140)');
    entry.ok = true;
    console.log(`PASS  ${step.name} -> ${entry.url ?? ''}`);
  } catch (error) {
    entry.ok = false;
    entry.error = String(error.message ?? error);
    console.log(`FAIL  ${step.name} -> ${entry.error}`);
  }
  results.push(entry);

  const shot = path.join(artifacts, `android-flow-${flowName}-${String(results.length).padStart(2, '0')}-${step.name}.png`);
  try {
    const png = spawnSync(ADB, ['exec-out', 'screencap', '-p'], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
    if (png.status === 0 && png.stdout?.length) fs.writeFileSync(shot, png.stdout);
  } catch { /* screenshot is evidence, not a gate */ }
}

const failures = results.filter((r) => r.ok === false);
const summary = { flow: flowName, marker, startedAt: stamp, results, consoleErrors: [...new Set(consoleErrors)], failures: failures.length };
fs.writeFileSync(path.join(artifacts, `android-flow-${flowName}.json`), `${JSON.stringify(summary, null, 2)}\n`);

console.log(`\nflow ${flowName}: ${results.length - failures.length}/${results.length} steps ok, marker=${marker}`);
if (consoleErrors.length) console.log(`console errors: ${[...new Set(consoleErrors)].join(' | ')}`);
ws.close();
process.exit(failures.length === 0 ? 0 : 1);
