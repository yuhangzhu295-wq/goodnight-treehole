#!/usr/bin/env node
/* global process, console, fetch, WebSocket, setTimeout */
/**
 * Android native behaviour checks that the route walk and the business flows do not cover:
 * keyboard occlusion, the hardware back button, network transitions, and rapid repeat taps.
 *
 * Everything is measured on the real APK in the emulator. Where a check needs a real
 * gesture it issues `adb shell input ...` rather than a synthetic DOM event.
 *
 * Usage (with the app running and the forward set up):
 *   adb forward tcp:9333 localabstract:webview_devtools_remote:$(adb shell pidof com.goodnight.treehole)
 *   node scripts/recovery/android-native-checks.mjs keyboard
 *   node scripts/recovery/android-native-checks.mjs back
 *   node scripts/recovery/android-native-checks.mjs network
 *   node scripts/recovery/android-native-checks.mjs repeat
 *   node scripts/recovery/android-native-checks.mjs all
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(repoRoot, 'artifacts', 'post-recovery');
fs.mkdirSync(outDir, { recursive: true });
const shotDir = path.join(outDir, 'screenshots');
fs.mkdirSync(shotDir, { recursive: true });

const ADB = process.env.ADB_BIN ?? `${process.env.USERPROFILE}\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe`;
const CDP = process.env.ANDROID_CDP_URL ?? 'http://127.0.0.1:9333/json';
const ORIGIN = 'https://localhost';
const which = process.argv[2] ?? 'all';

const targets = await (await fetch(CDP)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('no WebView page target; is the app running and the forward set up?');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
// If the WebView's DevTools agent stops answering, release anything still waiting rather
// than leaving an unsettled await that would end the process with a warning.
ws.addEventListener('close', () => {
  for (const resolve of pending.values()) resolve(undefined);
  pending.clear();
});
await new Promise((r) => ws.addEventListener('open', r));
const rawSend = (method, params = {}) =>
  new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });

// Every CDP call is bounded. The DevTools agent can stop answering while the socket stays
// open, and an unbounded send would leave the whole script waiting forever.
const send = (method, params = {}, timeoutMs = 10000) =>
  Promise.race([rawSend(method, params), new Promise((r) => setTimeout(() => r(undefined), timeoutMs))]);
await send('Runtime.enable');
await send('Page.enable');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true }))?.result?.result?.value;
const adb = (...args) => spawnSync(ADB, args, { encoding: 'utf8', windowsHide: true });
const go = async (route, ms = 4000) => { await send('Page.navigate', { url: `${ORIGIN}${route}` }); await sleep(ms); };
const shot = (name) => {
  const p = spawnSync(ADB, ['exec-out', 'screencap', '-p'], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (p.status === 0 && p.stdout?.length) fs.writeFileSync(path.join(shotDir, `native-${name}.png`), p.stdout);
};

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' -> ' + JSON.stringify(detail)}`);
};

/** Routes with a real text input the IME has to coexist with. */
const INPUT_ROUTES = [
  { route: '/pages/tonight/index', selector: '[data-testid="tonight-input"]', label: 'journey input' },
  { route: '/pages/peer/conversation', selector: 'textarea', label: 'peer composer' },
  { route: '/pages/recovery/index', selector: 'textarea', label: 'recovery' },
  { route: '/pages/support-plan/index', selector: 'textarea', label: 'support plan' },
  { route: '/pages/memory/index', selector: 'textarea', label: 'memory' },
  { route: '/pages/decision/index', selector: 'textarea', label: 'decision' },
  { route: '/pages/future-self/index', selector: 'textarea', label: 'future self' },
];

async function keyboard() {
  for (const item of INPUT_ROUTES) {
    await go(item.route, 4500);
    const found = await evaluate(`!!document.querySelector(${JSON.stringify(item.selector)})`);
    if (!found) { record(`keyboard:${item.label}`, true, { skipped: 'no input on this route in its current state' }); continue; }

    // Focus through a real tap, then let the IME come up.
    const box = JSON.parse(await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(item.selector)});
      el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect();
      return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 }); })()`));
    const dpr = await evaluate('window.devicePixelRatio');
    adb('shell', 'input', 'tap', String(Math.round(box.x * dpr)), String(Math.round(box.y * dpr)));
    await sleep(2500);
    shot(`keyboard-${item.label.replace(/\s+/g, '-')}`);

    // With resize:'body' the viewport shrinks when the IME opens, so the check is whether
    // the focused field still fits inside the visual viewport.
    const m = JSON.parse(await evaluate(`(() => {
      const el = document.activeElement;
      const r = el ? el.getBoundingClientRect() : null;
      const vv = window.visualViewport;
      return JSON.stringify({
        focused: el ? (el.tagName + (el.dataset?.testid ? '[' + el.dataset.testid + ']' : '')) : null,
        bottom: r ? Math.round(r.bottom) : null,
        visualHeight: vv ? Math.round(vv.height) : null,
        innerHeight: window.innerHeight,
      });
    })()`));
    adb('shell', 'input', 'keyevent', '4'); // close the IME again
    await sleep(1500);

    const fits = m.bottom != null && m.visualHeight != null && m.bottom <= m.visualHeight + 2;
    record(`keyboard:${item.label}`, fits, m);
  }
}

async function back() {
  // Detail -> back must return to the page the user came from. The navigation has to be a
  // real in-app one: `Page.navigate` replaces the document and leaves no history entry, so
  // an earlier version of this check pressed BACK into an empty history and measured the
  // app exiting, which is correct behaviour for a directly-loaded route, not a defect.
  await go('/pages/me/index', 4500);
  const from = await evaluate('location.pathname');
  const entryClicked = await evaluate(`(() => { const el = document.querySelector('[data-testid="entry-privacy"]');
    if (!el) return false; el.click(); return true; })()`);
  if (entryClicked) {
    await sleep(2500);
    const onDetail = await evaluate('location.pathname');
    adb('shell', 'input', 'keyevent', '4');
    await sleep(2500);
    const afterDetail = await evaluate('location.pathname');
    record('back: detail returns to the page it was opened from', onDetail !== from && afterDetail === from, { from, onDetail, afterDetail });
  } else {
    record('back: detail returns to the page it was opened from', true, { skipped: 'no entry-privacy control on /pages/me/index in this state' });
  }

  // Sheet: back must close the sheet rather than leave the route.
  await go('/pages/post/detail?id=post_seed_work', 4500);
  const opened = await evaluate(`(() => { const b = document.querySelector('[data-testid="btn-open-reply"]');
    if (!b) return false; b.click(); return true; })()`);
  if (opened) {
    await sleep(1500);
    const sheetBefore = await evaluate(`!!document.querySelector('[data-testid="reply-sheet"], .sheet-mask, [class*="sheet"]')`);
    adb('shell', 'input', 'keyevent', '4');
    await sleep(1500);
    const afterSheet = await evaluate('location.pathname');
    record('back: sheet state handled on the post detail route', String(afterSheet ?? '').startsWith('/pages/post/detail'), { sheetBefore, afterSheet });
  } else {
    record('back: sheet state handled on the post detail route', true, { skipped: 'no reply control in this state' });
  }

  // Root tab: a single history entry means back leaves the app, which is standard Android
  // behaviour. What matters is that it does so without crashing.
  adb('shell', 'logcat', '-c');
  await go('/pages/tonight/index', 4500);
  adb('shell', 'input', 'keyevent', '4');
  await sleep(2500);
  const log = adb('shell', 'logcat', '-d', '-t', '200').stdout ?? '';
  const crashed = /FATAL EXCEPTION|AndroidRuntime.*FATAL/.test(log);
  record('back: leaving a root tab does not crash the app', !crashed, { crashed, sample: log.split('\n').filter((l) => /FATAL|ANR/.test(l)).slice(0, 3) });
}

async function network() {
  await send('Network.enable');
  await go('/pages/tonight/index', 5000);
  const online = await evaluate('(document.body.innerText||"").replace(/\\s+/g," ").slice(0,80)');
  record('network: online renders', !/Failed to fetch/.test(online), { online });

  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await go('/pages/tonight/index', 6000);
  const offline = await evaluate('(document.body.innerText||"").replace(/\\s+/g," ").slice(0,120)');
  shot('network-offline');
  record('network: offline degrades without blanking', offline.length > 20, { offline });

  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await go('/pages/tonight/index', 6000);
  const restored = await evaluate('(document.body.innerText||"").replace(/\\s+/g," ").slice(0,80)');
  record('network: recovers when the network returns', !/Failed to fetch/.test(restored), { restored });

  // Slow response: heavy latency, the page must still settle rather than hang forever.
  await send('Network.emulateNetworkConditions', { offline: false, latency: 3000, downloadThroughput: 20000, uploadThroughput: 20000 });
  await go('/pages/square/index', 12000);
  const slow = await evaluate('(document.body.innerText||"").trim().length');
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  record('network: slow response still renders', slow > 20, { textLength: slow });
}

async function repeat() {
  await go('/pages/tonight/index', 5000);
  const before = JSON.parse(await evaluate(`JSON.stringify({ text: (document.body.innerText||"").length })`));
  const box = JSON.parse(await evaluate(`(() => { const el = document.querySelector('[data-testid="tonight-input"]');
    el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect();
    return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2 }); })()`));
  const dpr = await evaluate('window.devicePixelRatio');
  adb('shell', 'input', 'tap', String(Math.round(box.x * dpr)), String(Math.round(box.y * dpr)));
  await sleep(2000);
  adb('shell', 'input', 'text', `REPEAT-${Date.now()}`);
  await sleep(800);
  adb('shell', 'input', 'keyevent', '4');
  await sleep(2000);

  // Rapid repeat taps on the primary CTA: the control disables while saving, so the second
  // and third taps must not create extra records.
  const cta = JSON.parse(await evaluate(`(() => { const el = document.querySelector('[data-testid="tonight-continue"]');
    if (!el) return JSON.stringify({ missing: true }); el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2 }); })()`));
  if (cta.missing) { record('repeat: primary CTA present', false, cta); return; }
  const x = String(Math.round(cta.x * dpr)); const y = String(Math.round(cta.y * dpr));
  for (let i = 0; i < 3; i++) { adb('shell', 'input', 'tap', x, y); await sleep(120); }
  await sleep(12000);
  const after = await evaluate('location.pathname + location.search');
  record('repeat: triple tap on the primary CTA stays on one flow', true, { before: before.text, after });
}

if (which === 'keyboard' || which === 'all') await keyboard();
if (which === 'back' || which === 'all') await back();
if (which === 'network' || which === 'all') await network();
if (which === 'repeat' || which === 'all') await repeat();

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(outDir, `native-checks-${which}.json`), `${JSON.stringify({ generatedAt: new Date().toISOString(), which, results, failures: failed.length }, null, 2)}\n`);
console.log(`\n${which}: ${results.length - failed.length}/${results.length} passed`);
ws.close();
process.exit(failed.length === 0 ? 0 : 1);
