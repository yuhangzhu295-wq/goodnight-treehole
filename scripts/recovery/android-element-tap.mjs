#!/usr/bin/env node
/* global process, console, fetch, WebSocket */
/**
 * Taps a real Android control by resolving its position through the WebView.
 *
 * Why this exists: the app renders in a Capacitor WebView whose CSS viewport is not the
 * screen size. On the Pixel 7 AVD the viewport is 411x890 CSS px at devicePixelRatio
 * 2.625 inside a 1080x2400 screen, and the page scrolls, so a hard-coded screen
 * coordinate misses as soon as the layout shifts. This resolves the element's live
 * viewport rect, converts it to physical pixels, and then dispatches a genuine
 * `adb shell input tap` - so the real Android touch path is exercised rather than a
 * synthetic DOM click.
 *
 * Setup (once per app process):
 *   adb forward tcp:9333 localabstract:webview_devtools_remote_$(adb shell pidof com.goodnight.treehole)
 *
 * Usage:
 *   node scripts/recovery/android-element-tap.mjs '[data-testid="tonight-continue"]'
 *   node scripts/recovery/android-element-tap.mjs 'a:has-text("我的")' --text 我的
 *   node scripts/recovery/android-element-tap.mjs --eval '<js returning {x,y} in CSS px>'
 */
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const textFlag = args.indexOf('--text');
const wantedText = textFlag >= 0 ? args[textFlag + 1] : null;
const evalFlag = args.indexOf('--eval');
const selector = args.filter((a, i) => !a.startsWith('--') && (textFlag < 0 || i !== textFlag + 1) && (evalFlag < 0 || i !== evalFlag + 1))[0];

const CDP = process.env.ANDROID_CDP_URL ?? 'http://127.0.0.1:9333/json';
const ADB = process.env.ADB_BIN ?? `${process.env.USERPROFILE}\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe`;

const targets = await (await fetch(CDP)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('no WebView page target; is the app running and the forward set up?');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
await new Promise((resolve) => ws.addEventListener('open', resolve));
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

let expression;
if (evalFlag >= 0) {
  expression = args[evalFlag + 1];
} else if (wantedText) {
  expression = `(() => {
    const target = ${JSON.stringify(wantedText)};
    const nodes = Array.from(document.querySelectorAll('a,button,[role="button"]'));
    const el = nodes.find((n) => (n.textContent || '').trim() === target)
      ?? nodes.find((n) => (n.textContent || '').includes(target));
    if (!el) return JSON.stringify({ error: 'not found: ' + target });
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, tag: el.tagName });
  })()`;
} else if (selector) {
  expression = `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return JSON.stringify({ error: 'not found: ' + ${JSON.stringify(selector)} });
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, tag: el.tagName });
  })()`;
} else {
  console.error('usage: android-element-tap.mjs <css-selector> | --text <label> | --eval <expr>');
  process.exit(2);
}

const probe = await send('Runtime.evaluate', { expression, returnByValue: true });
const value = JSON.parse(probe.result.result.value);
if (value.error) {
  console.error(`FAIL  ${value.error}`);
  ws.close();
  process.exit(1);
}

const dprResult = await send('Runtime.evaluate', { expression: 'window.devicePixelRatio', returnByValue: true });
const dpr = dprResult.result.result.value;

const x = Math.round(value.x * dpr);
const y = Math.round(value.y * dpr);
console.log(`element ${value.tag} ${Math.round(value.w)}x${Math.round(value.h)} css -> physical (${x}, ${y}) at dpr ${dpr}`);

const tap = spawnSync(ADB, ['shell', 'input', 'tap', String(x), String(y)], { encoding: 'utf8', windowsHide: true });
if (tap.status !== 0) {
  console.error(`FAIL  adb tap exited ${tap.status}: ${tap.stderr}`);
  ws.close();
  process.exit(1);
}
console.log('PASS  tap dispatched');
ws.close();
