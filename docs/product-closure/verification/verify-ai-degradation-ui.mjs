/* global console, fetch */
// ISSUE-007 (product side): when the remote model is unavailable the product degrades to a
// safe template. That is legitimate, but the user must be told the content is a fallback and
// not a live model reply. This drives the real mp surfaces and asserts the notice appears.
//
// The external half of ISSUE-007 (a live model answer) stays BLOCKED_EXTERNAL: the DAPI
// account returns HTTP 402, so every AI job in this environment is a genuine fallback. That
// is exactly the condition this check needs, and it is asserted as real, not simulated.
import { chromium } from 'playwright';

const MP = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:3000';
const out = [];
const record = (name, pass, detail) => out.push(`${pass ? 'PASS' : 'FAIL'} ${name} :: ${detail}`);

// The provider really is refusing work, and the product really is degrading.
const login = await (await fetch(`${API}/api/admin/v1/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })).json();
const providerTest = await (await fetch(`${API}/api/admin/v1/ai/providers/provider_dapi_deepseek/test`, { method: 'POST', headers: { authorization: `Bearer ${login.token}` } })).json();
record('the remote model is genuinely unavailable (HTTP 402)',
  providerTest.ok === false && /402/.test(String(providerTest.message)), String(providerTest.message));

const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 414, height: 896 } });
const page = await context.newPage();

// ---- tool run: submit a real AI task and expect the degradation notice ----
await page.goto(`${MP}/pages/tool/rewrite`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.getByTestId('btn-tool-run-submit').click();
// the job runs through the real queue; the 402 fallback lands within a few seconds
const notice = page.getByTestId('ai-degradation-notice');
let appeared = false;
for (let attempt = 0; attempt < 40; attempt += 1) {
  await page.waitForTimeout(500);
  if (await notice.count()) { appeared = true; break; }
}
const noticeText = appeared ? (await notice.first().innerText()).replace(/\s+/g, ' ') : '';
record('the tool result carries a visible degradation notice', appeared, noticeText || 'no notice element');
record('the notice says the content is not a live model reply',
  /兜底/.test(noticeText) && /不是模型/.test(noticeText), noticeText);
const resultShown = await page.getByTestId('tool-run-result-card').count();
record('the real fallback content is still shown to the user', resultShown > 0, `resultCards=${resultShown}`);

// ---- emotion decompose: same contract on a different AI task type ----
await page.goto(`${MP}/pages/tool/decompose`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.getByTestId('btn-decompose-run').click();
let decomposeAppeared = false;
for (let attempt = 0; attempt < 40; attempt += 1) {
  await page.waitForTimeout(500);
  if (await page.getByTestId('ai-degradation-notice').count()) { decomposeAppeared = true; break; }
}
record('the emotion-decompose result carries the same notice', decomposeAppeared,
  decomposeAppeared ? (await page.getByTestId('ai-degradation-notice').first().innerText()).replace(/\s+/g, ' ') : 'no notice element');

// ---- and the notice must be absent when the content came from the model ----
// Nothing in this environment can produce a model answer (402), so instead assert the
// classifier's contract directly: a succeeded job yields no notice.
const classifier = await page.evaluate(async () => {
  const mod = await import('/src/aiStatus.ts');
  return {
    succeeded: mod.aiDegradationNotice({ status: 'succeeded', job: { fallbackUsed: false } }),
    fallback: mod.aiDegradationNotice({ status: 'fallback', job: { fallbackUsed: true } }),
    failed: mod.aiDegradationNotice({ status: 'failed' }),
    fallbackFlagOnly: mod.aiDegradationNotice({ status: 'succeeded', job: { fallbackUsed: true } }),
  };
});
record('a real model answer produces no notice', classifier.succeeded === '', JSON.stringify(classifier.succeeded));
record('a fallback job produces the notice', classifier.fallback.length > 0, classifier.fallback);
record('a failed job produces its own notice', classifier.failed.length > 0, classifier.failed);
record('fallbackUsed alone is enough to flag degradation', classifier.fallbackFlagOnly.length > 0, classifier.fallbackFlagOnly);

await browser.close();
const failed = out.filter((line) => line.startsWith('FAIL'));
console.log(out.join('\n'));
console.log(`\n${out.length - failed.length}/${out.length} pass`);
process.exitCode = failed.length ? 1 : 0;