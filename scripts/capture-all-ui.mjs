#!/usr/bin/env node
/**
 * Capture every C-end route on the attached emulator, for a full UI walkthrough.
 *
 * Unlike `capture-ui-v2-pages.mjs` (which walks the 39 queue pages and asserts preconditions), this
 * one covers the whole router: every route that does not need a record id, plus the id-taking detail
 * pages with a real id resolved from the API, so the screenshots show real content rather than
 * "not found" states.
 *
 * It re-raises the app before each page, because the emulator's foreground is shared with other
 * projects and a backgrounded app captures a stale frame.
 *
 * Usage: node scripts/capture-all-ui.mjs
 * Output: artifacts/ui-screenshots/<route-slug>.png  plus a report.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ADB = process.env.ADB_PATH ?? [process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'].join('/');
const CDP_PORT = 9333;
const OUT = 'artifacts/ui-screenshots';

/** Routes that render without a record id. */
const PLAIN = [
  ['/pages/tonight/index', 'tonight-home'],
  ['/pages/square/index', 'square'],
  ['/pages/peers/index', 'peer-network'],
  ['/pages/peer/requests', 'peer-requests'],
  ['/pages/action/index', 'action-center'],
  ['/pages/future-self/index', 'future-self'],
  ['/pages/tool/index', 'tool-index'],
  ['/pages/tool/decompose', 'tool-decompose'],
  ['/pages/tool/rewrite', 'tool-rewrite'],
  ['/pages/tool/rant', 'tool-rant'],
  ['/pages/tool/heal', 'tool-heal'],
  ['/pages/tool/sleep', 'tool-sleep'],
  ['/pages/tool/work', 'tool-work'],
  ['/pages/tool/breakdown', 'tool-breakdown'],
  ['/pages/tool/future', 'tool-future'],
  ['/pages/tool/run', 'tool-run'],
  ['/pages/recovery/index', 'recovery'],
  ['/pages/support-plan/index', 'support-plan'],
  ['/pages/stable-self/index', 'stable-self'],
  ['/pages/decision/index', 'decision-vault'],
  ['/pages/memory/index', 'memory-center'],
  ['/pages/notifications/index', 'notifications'],
  ['/pages/reality-handoff/index', 'reality-handoff'],
  ['/pages/safety/index', 'safety-support'],
  ['/pages/me/index', 'me'],
  ['/pages/me/profile', 'me-profile'],
  ['/pages/me/diaries', 'me-diaries'],
  ['/pages/me/month-report', 'me-month-report'],
  ['/pages/diary/index', 'diary-list'],
  ['/pages/letter/list', 'letter-list'],
  ['/pages/letter/index', 'letter-today'],
  ['/pages/letter/today', 'letter-today-alias'],
  ['/pages/reply/today', 'reply-today'],
  ['/pages/archive/index', 'archive'],
  ['/pages/favorite/index', 'favorites'],
  ['/pages/settings/privacy', 'settings-privacy'],
  ['/pages/settings/data-policy', 'settings-data-policy'],
  ['/pages/help/feedback', 'help-feedback'],
  ['/pages/help/faqs', 'help-faqs'],
  ['/pages/feedback/index', 'feedback-list'],
  ['/pages/mood/create', 'mood-create'],
  ['/pages/post/create', 'post-create'],
  // ReportMonth is the same component as `me/month-report`; this alias loads it directly and reads
  // the current month itself, so it takes no id.
  ['/pages/report/month', 'report-month'],
];

/**
 * Routes that take an id; the id is resolved from the API at runtime.
 *
 * Some list endpoints wrap their row (`{items:[{journey:{id}}]}`), so the resolver accepts either
 * shape. `extract` picks the id out of a response that is not a plain `{items:[{id}]}` list - the
 * peer pages read their ids out of the network view and the request inbox rather than the admin-only
 * list, because that is what the page itself does.
 */
const BY_ID = [
  ['/pages/journey/detail', 'journey-detail', '/api/v1/journeys'],
  ['/pages/diary/detail', 'diary-detail', '/api/v1/me/diaries'],
  ['/pages/letter/detail', 'letter-detail', '/api/v1/letters'],
  ['/pages/post/detail', 'post-detail', '/api/v1/posts'],
  ['/pages/peer/detail', 'peer-detail', '/api/v1/peers', 'experiences'],
  ['/pages/peer/consent', 'peer-consent', '/api/v1/peer-requests?scope=sent', 'items'],
  ['/pages/peer/conversation', 'peer-conversation', '/api/v1/peer-conversations', 'items'],
  ['/pages/peer/wait', 'peer-wait', '/api/v1/peer-requests?scope=sent', 'items'],
  ['/pages/peer/graduate', 'peer-graduate', '/api/v1/peer-conversations', 'items'],
];

const adb = (...args) =>
  execFileSync(ADB, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const ctl = async (fn) => {
  try {
    return await fn();
  } catch (e) {
    return { __error: String(e && e.message) };
  }
};

function ensureForeground() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const focus = adb('shell', 'dumpsys', 'window');
    if (focus.includes('com.goodnight.treehole')) return true;
    adb('shell', 'am', 'start', '-n', 'com.goodnight.treehole/.MainActivity');
    execFileSync(process.execPath, ['-e', 'setTimeout(()=>{}, 1500)']);
  }
  // A third check: the emulator's foreground is shared with other projects on this machine, and
  // another app can re-take it between the start above and this line. Waiting once more catches
  // that; failing here means the capture would only be recording the other app.
  const focus = adb('shell', 'dumpsys', 'window');
  return focus.includes('com.goodnight.treehole');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const pid = adb('shell', 'pidof', 'com.goodnight.treehole');
  if (!pid) throw new Error('the app is not running; adb shell am start -n com.goodnight.treehole/.MainActivity');
  adb('forward', '--remove-all');
  adb('forward', `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`);
  adb('reverse', 'tcp:3000', 'tcp:3000');

  const list = await ctl(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json());
  if (!Array.isArray(list)) throw new Error('no CDP target: ' + JSON.stringify(list));
  const target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let seq = 0;
  const waiters = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    const f = waiters.get(msg.id);
    if (f) {
      waiters.delete(msg.id);
      f(msg);
    }
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  const call = (method, params) =>
    new Promise((res) => {
      const id = ++seq;
      waiters.set(id, res);
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  const ev = async (expression, awaitPromise = true) => {
    const r = await ctl(async () =>
      call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }),
    );
    if (r && r.__error) return null;
    if (r?.result?.exceptionDetails) return null;
    return r?.result?.result?.value;
  };
  await call('Runtime.enable');
  await call('Page.enable');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // A credential is required: the C-end refuses anonymous reads with 401, and a page rendered
  // without one shows its empty state, which is not what a walkthrough should show.
  const cred = await ev(
    "(async()=>{var p=window.Capacitor.Plugins.Preferences;var r=await p.get({key:'goodnight-identity-credential'});return (r&&r.value)||'';})()",
    true,
  );
  if (!cred) {
    await ev(
      "(async()=>{var r=await fetch('http://127.0.0.1:3000/api/v1/auth/anonymous',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});return (await r.json()).item.credential;})()",
      true,
    );
    await sleep(500);
  }

  const results = [];

  /**
   * A credential, present before every page.
   *
   * The C-end refuses reads without one, and a page captured in that state renders its empty state -
   * which is not what a walkthrough should show. The app can lose its stored credential mid-run (a
   * device-side restart, or the app being cleared), so this is re-checked per page rather than once
   * at the start; an earlier version checked once and produced three blank pages.
   */
  let credential = await ev(
    "(async()=>{var p=window.Capacitor.Plugins.Preferences;var r=await p.get({key:'goodnight-identity-credential'});return (r&&r.value)||'';})()",
    true,
  );
  const ensureCredential = async () => {
    if (credential) return credential;
    // One round trip: issue an anonymous session and return the credential string.
    credential = await ev(
      "(async()=>{var r=await fetch('http://127.0.0.1:3000/api/v1/auth/anonymous',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});var b=await r.json();return b && b.item ? b.item.credential : null;})()",
      true,
    );
    if (!credential) console.log('[capture] warning: could not obtain an identity credential');
    return credential;
  };

  const shoot = async (route, slug) => {
    await ensureCredential();
    await ev(
      `(function(){var a=document.createElement('a');a.href=${JSON.stringify(route)};a.style.display='none';document.body.appendChild(a);a.click();a.remove();})()`,
      false,
    );
    await sleep(3000);
    const state = await ev(
      `(function(){var m=document.querySelector('.goodnight-page')||document.querySelector('main');var t=(m?m.innerText:'')||'';var errs=Array.from(document.querySelectorAll('[role=alert],.error-note,.error')).filter(function(e){return (e.innerText||'').trim();}).map(function(e){return (e.innerText||'').trim().slice(0,40);});return JSON.stringify({len:t.replace(/\\s+/g,' ').trim().length,text:t.replace(/\\s+/g,' ').trim().slice(0,220),errs:errs.slice(0,3)});})()`,
      false,
    );
    const shot = await ctl(async () => call('Page.captureScreenshot', { format: 'png' }));
    let file = null;
    if (shot && shot.result && shot.result.data) {
      file = path.join(OUT, `${slug}.png`).replaceAll('\\', '/');
      fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    }
    let parsed = {};
    try {
      parsed = JSON.parse(state || '{}');
    } catch {
      // An unparseable payload leaves `parsed` empty, which the report records as a page with no text.
      parsed = {};
    }
    results.push({ route, slug, file, ...parsed });
    const flag = parsed.errs && parsed.errs.length ? ' [note: ' + parsed.errs.join(';') + ']' : '';
    console.log(`${String(parsed.len ?? 0).padStart(4)}  ${slug.padEnd(22)} ${route}${flag}`);
  };

  for (const [route, slug] of PLAIN) {
    if (!ensureForeground()) {
      // Stop instead of skipping: every remaining page would be captured against the other app, so
      // continuing only produces a full run of unusable screenshots.
      console.log(`ABORT ${slug} (another app holds the foreground and will not yield)`);
      break;
    }
    await shoot(route, slug);
  }

  // Detail pages: resolve a real id first, so the capture shows a record rather than "not found".
  for (const [route, slug, listPath, collection = 'items'] of BY_ID) {
    if (!ensureForeground()) {
      console.log(`ABORT ${slug} (another app holds the foreground and will not yield)`);
      break;
    }
    // `collection` is where the rows live in the response: `items` for the common shape, or the
    // network view's own key. `peer/consent` and `peer/wait` are the same inbox from two directions,
    // so both read the sent-side list.
    // `collection` is where the rows live in the response: `items` for the common shape, or the
    // network view's own key under `item`. `peer/consent` and `peer/wait` are the same inbox from two
    // directions, so both read the sent-side list.
    const id = await ev(
      `(async()=>{try{var r=await fetch('http://127.0.0.1:3000${listPath}',{headers:{'x-goodnight-user-id':${JSON.stringify(String((await ensureCredential()) || ''))}}});var b=await r.json();var rows=b.items||(b.item&&b.item[${JSON.stringify(collection)}])||[];var it=rows[0];if(!it)return null;var isMatch=typeof it.matchId==='string';return String(isMatch?it.matchId:(it.id||(it.journey&&it.journey.id)||''));}catch(e){return null;}})()`,
      true,
    );
    if (!id) {
      console.log(`SKIP  ${slug} (no record from ${listPath})`);
      results.push({ route, slug, file: null, skipped: 'no record' });
      continue;
    }
    // Every peer detail page reads `matchId`; the rest read `id`.
    const param = slug.startsWith('peer-') && slug !== 'peer-detail' ? 'matchId' : 'id';
    await shoot(`${route}?${param}=${encodeURIComponent(id)}`, slug);
  }

  ws.close();
  fs.writeFileSync(
    path.join(OUT, 'report.json').replaceAll('\\', '/'),
    JSON.stringify({ capturedAt: new Date().toISOString(), count: results.length, pages: results }, null, 2) + '\n',
  );
  console.log(`\n[capture] ${results.length} page(s) -> ${OUT}`);
  const withNote = results.filter((r) => r.errs && r.errs.length);
  if (withNote.length) console.log(`[attention] ${withNote.length} page(s) rendered an error element: ${withNote.map((r) => r.slug).join(', ')}`);
}

main().catch((e) => {
  console.error('[capture] failed:', e.message);
  process.exit(1);
});
