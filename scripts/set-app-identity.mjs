// Point the app's stored identity at a valid session for the walkthrough account, so the pages that
// read per-user data can be reviewed against real rows. Writes the credential through the same
// Preferences key the app itself uses; nothing else is touched.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { repoFile } from './repo-root.mjs';

const ADB = [process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'].join('/');
const CDP = 9333;
const env = readFileSync(repoFile('.env'), 'utf8');
const url = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)[1];
const prisma = new PrismaClient({ datasources: { db: { url } } });

const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
adb('shell', 'am', 'start', '-n', 'com.goodnight.treehole/.MainActivity');
await new Promise((r) => setTimeout(r, 4000));
const pid = adb('shell', 'pidof', 'com.goodnight.treehole');
adb('forward', '--remove-all');
adb('forward', `tcp:${CDP}`, `localabstract:webview_devtools_remote_${pid}`);
await new Promise((r) => setTimeout(r, 1500));
const list = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
const t = list.find((x) => x.type === 'page');
if (!t) { console.log('NO TARGET'); process.exit(1); }
const ws = new WebSocket(t.webSocketDebuggerUrl);
let n = 0;
const w = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); const f = w.get(m.id); if (f) { w.delete(m.id); f(m); } });
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const call = (me, p) => new Promise((r) => { const id = ++n; w.set(id, r); ws.send(JSON.stringify({ id, method: me, params: p || {} })); });
const ev = async (x, ap = true) => {
  const r = await call('Runtime.evaluate', { expression: x, awaitPromise: ap, returnByValue: true });
  return r?.result?.result?.value ?? r?.result?.exceptionDetails?.text ?? null;
};
await call('Runtime.enable');

// A fresh, valid session for the walkthrough account.
const APP = process.env.APP_USER ?? 'user_anon_4c115912';
await prisma.user.upsert({
  where: { id: APP },
  create: { id: APP, openid: `openid_${APP}`, anonymousCode: `anon_${APP}`, nickname: `测试_${APP}` },
  update: {},
});
const secret = crypto.randomBytes(32).toString('base64url');
const row = await prisma.anonymousSession.create({
  data: { userId: APP, secretHash: crypto.createHash('sha256').update(secret).digest('hex'), expiresAt: new Date(Date.now() + 30 * 86400000) },
});
const credential = `${row.id}.${secret}`;

const stored = await ev(`(async()=>{
  var p = window.Capacitor.Plugins.Preferences;
  await p.set({ key: 'goodnight-identity-credential', value: ${JSON.stringify(credential)} });
  var back = await p.get({ key: 'goodnight-identity-credential' });
  return back && back.value ? 'stored ' + back.value.slice(0, 12) + '…' : 'FAILED';
})()`);
console.log('credential:', stored);

// Confirm the API now recognises this identity and sees the seeded conversation.
const check = await ev(`(async()=>{
  var r = await fetch('http://127.0.0.1:3000/api/v1/peer-conversations',{headers:{'x-goodnight-user-id':${JSON.stringify(credential)}}});
  var b = await r.json();
  return r.status + ' count=' + (b.items||[]).length;
})()`);
console.log('peer-conversations:', check);
ws.close();
await prisma.$disconnect();
