/* global console, fetch, process */
// Android native verification for the closure round.
//
// Drives the real Capacitor WebView on the running emulator over the WebView DevTools
// protocol (adb forward -> localabstract:webview_devtools_remote_<pid>), so the assertions
// run against the APK's own bundled assets talking to the real API over `adb reverse`.
// Nothing here is a browser preview: the target is the native activity's WebView.
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';

const CDP = process.env.ANDROID_CDP_URL ?? 'http://127.0.0.1:9333';
const out = [];
const record = (name, pass, detail) => out.push(`${pass ? 'PASS' : 'FAIL'} ${name} :: ${detail}`);

const browser = await chromium.connectOverCDP(CDP);
const contexts = browser.contexts();
const page = contexts[0]?.pages()[0] ?? (await contexts[0].newPage());

const appUrl = page.url();
record('the target is the native app WebView', /^https:\/\/localhost\//.test(appUrl), appUrl);

// ---- the native shell can reach the real API ----
// The tool page runs a real AiJob; a fallback result proves the round trip completed.
await page.goto('https://localhost/pages/tool/rewrite', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const hasInput = await page.getByTestId('input-tool-run').count();
record('the native app renders the tool page', hasInput > 0, `inputs=${hasInput}`);

await page.getByTestId('input-tool-run').fill('我今天又想起他了，心里很乱。');
await page.getByTestId('btn-tool-run-submit').click();

let noticeAppeared = false;
let noticeText = '';
for (let attempt = 0; attempt < 50; attempt += 1) {
  await page.waitForTimeout(500);
  if (await page.getByTestId('ai-degradation-notice').count()) {
    noticeAppeared = true;
    noticeText = (await page.getByTestId('ai-degradation-notice').first().innerText()).replace(/\s+/g, ' ');
    break;
  }
}
record('the native app reaches the real API and completes an AI task', noticeAppeared, noticeText || 'no notice after 25s');
record('the native app labels the fallback instead of faking a model answer',
  /兜底/.test(noticeText) && /不是模型/.test(noticeText), noticeText);

const resultCards = await page.getByTestId('tool-run-result-card').count();
record('the native app shows the real result content', resultCards > 0, `resultCards=${resultCards}`);

// ---- and the write really landed in the database ----
const prisma = new PrismaClient();
try {
  const job = await prisma.aIJob.findFirst({ where: { taskType: 'negative_rewrite' }, orderBy: { createdAt: 'desc' } });
  record('the AI job from the native app is persisted in PostgreSQL',
    Boolean(job) && Date.now() - new Date(job.createdAt).getTime() < 10 * 60_000,
    `id=${job?.id} status=${job?.status} provider=${job?.providerId} age=${job ? Math.round((Date.now() - new Date(job.createdAt).getTime()) / 1000) : '-'}s`);
} finally {
  await prisma.$disconnect();
}

// ---- a second surface, to prove the notice is not a one-page accident ----
await page.goto('https://localhost/pages/tool/decompose', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.getByTestId('btn-decompose-run').click();
let decomposeNotice = false;
for (let attempt = 0; attempt < 50; attempt += 1) {
  await page.waitForTimeout(500);
  if (await page.getByTestId('ai-degradation-notice').count()) { decomposeNotice = true; break; }
}
record('the native decompose surface carries the same notice', decomposeNotice,
  decomposeNotice ? (await page.getByTestId('ai-degradation-notice').first().innerText()).replace(/\s+/g, ' ') : 'no notice after 25s');

// ---- the app is still alive as a native activity after the flows ----
let health = 0;
try { health = (await fetch('http://127.0.0.1:3000/api/admin/v1/config')).status; } catch { health = 0; }
record('the API is still serving after the native flows', health === 401, `adminConfigStatus=${health}`);

await browser.close();
const failed = out.filter((line) => line.startsWith('FAIL'));
console.log(out.join('\n'));
console.log(`\n${out.length - failed.length}/${out.length} pass`);
process.exitCode = failed.length ? 1 : 0;