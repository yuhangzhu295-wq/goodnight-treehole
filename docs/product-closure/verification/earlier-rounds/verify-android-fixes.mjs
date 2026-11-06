/* global WebSocket, console, fetch, setTimeout */
import { spawnSync } from 'node:child_process';

const ADB = 'C:\\Users\\zyu33\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const CDP = 'http://127.0.0.1:9333/json';
const ORIGIN = 'https://localhost';
const adb = (...args) => spawnSync(ADB, args, { encoding: 'utf8', windowsHide: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pid = adb('shell', 'pidof', 'com.goodnight.treehole').stdout.trim();
adb('forward', 'tcp:9333', `localabstract:webview_devtools_remote_${pid}`);
adb('reverse', 'tcp:3000', 'tcp:3000');
await sleep(1500);

const targets = await (await fetch(CDP)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params }));
});
await send('Runtime.enable');
await send('Page.enable');
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }))?.result?.result?.value;

async function goto(path) {
  await send('Page.navigate', { url: `${ORIGIN}${path}` });
  await sleep(2600);
  return evaluate('location.pathname + location.search');
}

// ISSUE-004: Me -> 情绪小工具 -> a tool, entirely by tapping real controls
console.log('on Me:', await goto('/pages/me/index'));
const hasEntry = await evaluate(`!!document.querySelector('[data-testid="entry-tool-index"]')`);
console.log('tool entry present:', hasEntry);
await evaluate(`document.querySelector('[data-testid="entry-tool-index"]').scrollIntoView({block:'center'}); document.querySelector('[data-testid="entry-tool-index"]').click();`);
await sleep(2200);
console.log('after tapping the tool entry:', await evaluate('location.pathname + location.search'));
const tools = await evaluate(`document.querySelectorAll('[data-testid^="tool-"]').length`);
console.log('tool buttons on the index:', tools);
const clicked = await evaluate(`(() => { const b = document.querySelectorAll('[data-testid^="tool-"]'); if (!b.length) return 'none'; b[b.length-1].click(); return 'clicked'; })()`);
await sleep(2200);
console.log(`tool click (${clicked}) ->`, await evaluate('location.pathname + location.search'));

// ISSUE-005: the peer privacy-boundary link must land on a real route
await goto('/pages/peers/index');
const boundary = await evaluate(`!!document.querySelector('[data-testid="peer-privacy-boundary"]')`);
console.log('privacy boundary rendered:', boundary);
if (boundary) {
  await evaluate(`document.querySelector('[data-testid="peer-privacy-boundary"]').click()`);
  await sleep(2200);
  console.log('boundary click ->', await evaluate('location.pathname'));
}

ws.close();
