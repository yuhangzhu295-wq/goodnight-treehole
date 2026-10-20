#!/usr/bin/env node
/**
 * Walks the C-end routes the UI V2 queue has no capture for, on the attached emulator, and writes a
 * screenshot plus a one-line state probe per page.
 *
 * Why this exists: 19 of the 39 queue tasks had no screenshot at all, so no visual review of them was
 * possible. The earlier R3 batch was captured while the API was unreachable, which produced two
 * "blank page" findings that were environment failures - this script asserts the preconditions
 * (identity present, API answering) before it captures, and records them per page so a blank capture
 * can be told apart from a blank page.
 *
 * It navigates through the SPA router (`pushState` + `popstate`) rather than `Page.navigate`: the
 * Capacitor server serves only the app root, so a deep URL load lands on chrome-error.
 *
 * Usage: node scripts/capture-ui-v2-pages.mjs [route ...]
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const ADB = process.env.ADB_PATH ?? [process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'].join('/');
const OUT_DIR = 'artifacts/ui-v2/android';
const CDP_PORT = 9333;

const DEFAULT_ROUTES = [
  ['UI-V2-19', 'MemoryCenter', '/pages/memory/index'],
  ['UI-V2-21', 'Archive', '/pages/archive/index'],
  ['UI-V2-22', 'Square', '/pages/square/index'],
  ['UI-V2-23', 'MoodCreate', '/pages/mood/create'],
  ['UI-V2-24', 'PostDetail', '/pages/post/detail'],
  ['UI-V2-25', 'LetterToday', '/pages/letter/index'],
  ['UI-V2-26', 'ToolIndex', '/pages/tool/index'],
  ['UI-V2-27', 'ToolDecompose', '/pages/tool/decompose'],
  ['UI-V2-28', 'ToolRun', '/pages/tool/run'],
  ['UI-V2-30', 'DiaryList', '/pages/diary/index'],
  ['UI-V2-31', 'DiaryDetail', '/pages/diary/detail'],
  ['UI-V2-32', 'ReportMonth', '/pages/report/month'],
  ['UI-V2-33', 'LetterList', '/pages/letter/list'],
  ['UI-V2-34', 'LetterDetail', '/pages/letter/detail'],
  ['UI-V2-35', 'FavoriteList', '/pages/favorite/index'],
  ['UI-V2-36', 'PrivacySettings', '/pages/settings/privacy'],
  ['UI-V2-37', 'DataPolicy', '/pages/settings/data-policy'],
  ['UI-V2-38', 'FeedbackHelp', '/pages/help/feedback'],
  ['UI-V2-39', 'HelpFaqs', '/pages/help/faqs'],
];

const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function currentFocus() {
  const out = adb('shell', 'dumpsys', 'window');
  return out.split(/\r?\n/).find((line) => line.includes('mCurrentFocus')) ?? '';
}

function ensureForeground() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (currentFocus().includes('com.goodnight.treehole')) return true;
    adb('shell', 'am', 'start', '-n', 'com.goodnight.treehole/.MainActivity');
    // Synchronous wait: this runs before the CDP calls, which are async.
    execFileSync(process.execPath, ['-e', 'setTimeout(()=>{}, 1500)']);
  }
  return currentFocus().includes('com.goodnight.treehole');
}

function findWebviewPid() {
  const pid = adb('shell', 'pidof', 'com.goodnight.treehole');
  if (!pid) throw new Error('the app is not running; start it with: adb shell am start -n com.goodnight.treehole/.MainActivity');
  return pid.split(/\s+/)[0];
}

async function connect(pid) {
  adb('forward', `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`);
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('no debuggable page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  return { ws, send };
}

const evaluate = async (send, expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluate failed');
  return r.result?.result?.value;
};

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const requested = process.argv.slice(2);
  const routes = requested.length ? DEFAULT_ROUTES.filter(([, , r]) => requested.includes(r)) : DEFAULT_ROUTES;
  const { ws, send } = await connect(findWebviewPid());
  await send('Page.enable');
  await send('Runtime.enable');

  // Preconditions, checked once and recorded. A capture taken without these is not evidence.
  const pre = await evaluate(send, `(async () => {
    const cred = (await window.Capacitor.Plugins.Preferences.get({ key: 'goodnight-identity-credential' })).value;
    let api = null;
    try { api = (await fetch('http://127.0.0.1:3000/api/v1/feedback/faqs')).status; } catch (e) { api = 'ERR ' + e; }
    return JSON.stringify({ hasIdentity: Boolean(cred), apiStatus: api });
  })()`, true);
  console.log(`[precondition] ${pre}`);
  const preOk = JSON.parse(pre);
  if (!preOk.hasIdentity || preOk.apiStatus !== 200) {
    console.error('[abort] identity or API missing; captures would be invalid evidence (this is what produced the false R3 findings)');
    process.exit(1);
  }

  const report = [];
  for (const [id, page, route] of routes) {
    if (!ensureForeground()) {
      report.push({ id, page, route, file: null, verdict: 'FOREGROUND_LOST' });
      console.log(`FOREGROUND_LOST  ${id} ${page.padEnd(18)} another app holds the foreground`);
      continue;
    }
    // Navigate the way a user would: click a same-origin link, which vue-router intercepts. A bare
    // `pushState` + `popstate` bypasses the router's internal history state, and the router then
    // rewrites the URL back to the route it still believes it is on - which is why an earlier run
    // captured every page one step behind.
    await evaluate(send, `(() => {
      const a = document.createElement('a');
      a.href = ${JSON.stringify(route)};
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
    })()`);
    await new Promise((r) => setTimeout(r, 2500));
    // The snippet runs in the page, so it is built with String.raw: a template literal would have to
    // escape the `\s` in the whitespace collapse, and that escape is exactly what ESLint's
    // no-useless-escape flags (the browser needs a single backslash).
    const state = JSON.parse(await evaluate(send, String.raw`(() => {
      const main = document.querySelector('main');
      const text = (main?.innerText || '').replace(/\s+/g, ' ').trim();
      return JSON.stringify({
        path: location.pathname,
        matched: location.pathname === ${JSON.stringify(route)},
        textLength: text.length,
        text: text.slice(0, 160),
        fullTextLength: text.length,
        // Error *elements*, not the word. A first version matched /失败/ over the whole text and
        // flagged ReportMonth, whose body legitimately says 没有把未完成当成失败. A detector that
        // matches product copy produces false defects, so the check is on the rendered alert nodes.
        hasError: Array.from(document.querySelectorAll('[role="alert"], .error-note, .error, [data-testid*="error"]'))
          .some((el) => (el.innerText || '').trim().length > 0),
      });
    })()`));
    const file = `${OUT_DIR}/R4_${page}_capture.png`;
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    if (shot.result?.data) fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    const verdict = !state.matched ? 'ROUTE_NOT_MATCHED' : state.hasError ? 'ERROR_STATE' : state.textLength < 20 ? 'EMPTY' : 'RENDERED';
    report.push({ id, page, route, file, verdict, ...state });
    console.log(`${verdict.padEnd(16)} ${id} ${page.padEnd(18)} ${route}  len=${state.textLength}`);
  }
  ws.close();
  fs.writeFileSync(`${OUT_DIR}/R4_capture-report.json`, JSON.stringify({ capturedAt: new Date().toISOString(), precondition: preOk, pages: report }, null, 2) + '\n');
  console.log(`\n[report] ${OUT_DIR}/R4_capture-report.json`);
  const bad = report.filter((r) => r.verdict !== 'RENDERED');
  if (bad.length) console.log(`[attention] ${bad.length} page(s) not cleanly rendered: ${bad.map((b) => `${b.page}=${b.verdict}`).join(', ')}`);
}

main().catch((e) => { console.error('[capture] failed:', e.message); process.exit(1); });
