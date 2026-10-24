/* global console, process */
// Android RC regression on the running emulator, driven through the native WebView over the
// DevTools protocol. Covers the flows the round asks for: a core business write, BACK
// navigation, the peer report from the conversation UI, and the AI fallback notice.
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';

const ADB = process.env.ADB_BIN ?? 'C:/Users/zyu33/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const CDP = process.env.ANDROID_CDP_URL ?? 'http://127.0.0.1:9333';
const out = [];
const record = (name, pass, detail) => out.push(`${pass ? 'PASS' : 'FAIL'} ${name} :: ${detail}`);
const stamp = Date.now();

const browser = await chromium.connectOverCDP(CDP);
const page = browser.contexts()[0].pages()[0];
record('the target is the native app WebView', /^https:\/\/localhost\//.test(page.url()), page.url());

/** Poll a predicate in the page until it holds, or give up. Native flows are slower than a
 *  desktop browser and a fixed sleep races them. */
async function waitUntil(check, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

const prisma = new PrismaClient();
try {
  // ---- fresh document so the WebView history starts clean ----
  await page.goto('https://localhost/', { waitUntil: 'domcontentloaded' });
  await waitUntil(async () => (await page.getByTestId('tab-square').count()) > 0);
  await page.getByTestId('tab-square').click();
  await waitUntil(async () => page.url().includes('/pages/tonight/index'));
  record('the native app reaches the tonight page through its own navigation', page.url().includes('/pages/tonight/index'), page.url());

  // ---- core business: a real high-risk journey written from the native UI ----
  const riskText = `ANDROID-RC-${stamp} 我今晚又有了自杀的念头，撑不住了`;
  await page.getByTestId('tonight-input').fill(riskText);
  await page.getByTestId('tonight-continue').click();
  const routed = await waitUntil(async () => page.url().includes('/pages/safety/index'), 25000);
  record('the native app routes a high-risk entry to the safety screen', routed, page.url());
  const safetyEvent = await prisma.safetyEvent.findFirst({
    where: { payload: { path: ['triggerExcerpt'], string_contains: `ANDROID-RC-${stamp}` } },
    orderBy: { createdAt: 'desc' },
  });
  record('the native entry produced a real SafetyEvent', Boolean(safetyEvent) && safetyEvent.status === 'open',
    `id=${safetyEvent?.id} status=${safetyEvent?.status}`);

  // ---- BACK returns in-app rather than exiting ----
  execFileSync(ADB, ['shell', 'input', 'keyevent', '4']);
  const backToTonight = await waitUntil(async () => page.url().includes('/pages/tonight/index'), 15000);
  const topActivity = execFileSync(ADB, ['shell', 'dumpsys', 'activity', 'activities'], { encoding: 'utf8' })
    .split('\n').find((l) => l.includes('topResumedActivity')) ?? '';
  record('BACK returns to the previous page instead of leaving the app',
    backToTonight && topActivity.includes('com.goodnight.treehole'),
    `url=${page.url()} foreground=${topActivity.includes('com.goodnight.treehole')}`);

  // ---- peer report from the native conversation UI ----
  const conversation = await prisma.peerConversation.findFirst({
    where: { OR: [{ starterUserId: 'user_demo' }, { receiverUserId: 'user_demo' }] },
    orderBy: { createdAt: 'desc' },
  });
  record('the demo user has a conversation to report from', Boolean(conversation), `matchId=${conversation?.matchId}`);
  if (conversation) {
    const reason = `ANDROID-RC-REPORT-${stamp} 对方一直索要我的真实联系方式`;
    await page.goto(`https://localhost/pages/peer/conversation?matchId=${encodeURIComponent(conversation.matchId)}`, { waitUntil: 'domcontentloaded' });
    const sheetReady = await waitUntil(async () => (await page.getByLabel('安全操作').count()) > 0);
    record('the native conversation renders its safety control', sheetReady, page.url());
    await page.getByLabel('安全操作').click();
    const sheetOpen = await waitUntil(async () => (await page.getByRole('dialog').count()) > 0);
    record('the safety sheet opens from the native conversation', sheetOpen, 'dialog');
    const sheet = page.getByRole('dialog');
    await sheet.locator('textarea').fill(reason);
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: '提交举报' }).click();
    const stored = await waitUntil(async () => {
      const found = await prisma.peerReport.findFirst({ where: { conversationId: conversation.id, reason } });
      return Boolean(found);
    }, 20000);
    const report = await prisma.peerReport.findFirst({ where: { conversationId: conversation.id, reason } });
    record('the native report reaches the database as its own row',
      stored && report?.status === 'open' && report?.reporterUserId === 'user_demo',
      `id=${report?.id} status=${report?.status} reporter=${report?.reporterUserId}`);
    const historyRows = await prisma.peerReport.count({ where: { conversationId: conversation.id } });
    record('the report is added to the conversation history rather than replacing it',
      historyRows >= 1, `historyRows=${historyRows}`);
  }

  // ---- AI fallback still labelled on the native app ----
  await page.goto('https://localhost/pages/tool/rewrite', { waitUntil: 'domcontentloaded' });
  const toolReady = await waitUntil(async () => (await page.getByTestId('input-tool-run').count()) > 0);
  record('the native tool page renders', toolReady, page.url());
  await page.getByTestId('input-tool-run').fill('RC 安卓兜底提示验证');
  await page.getByTestId('btn-tool-run-submit').click();
  let notice = '';
  await waitUntil(async () => {
    if (await page.getByTestId('ai-degradation-notice').count()) {
      notice = (await page.getByTestId('ai-degradation-notice').first().innerText()).replace(/\s+/g, ' ');
      return true;
    }
    return false;
  }, 30000);
  record('the native app still labels a fallback reply', /兜底/.test(notice) && /不是模型/.test(notice), notice || 'no notice');
} finally {
  await prisma.$disconnect();
}

await browser.close();
const failed = out.filter((line) => line.startsWith('FAIL'));
console.log(out.join('\n'));
console.log(`\n${out.length - failed.length}/${out.length} pass`);
process.exitCode = failed.length ? 1 : 0;