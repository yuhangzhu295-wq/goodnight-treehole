import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from 'playwright';

const front = String(process.env.FRONT_BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const api = String(process.env.API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const screenshotDir = path.resolve('artifacts', 'screenshots', 'first-batch');
const reportDir = path.resolve('artifacts', 'test-report');
const rows: Array<{ state: string; url: string; sha256: string }> = [];

async function json(url: string, init?: RequestInit) {
  const response = await fetch(`${api}${url}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${url}: ${response.status} ${body.message ?? ''}`.trim());
  return body;
}

async function capture(page: Page, state: string) {
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (hasHorizontalOverflow) throw new Error(`${state} has horizontal overflow`);
  const file = path.join(screenshotDir, `${state}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const sha256 = createHash('sha256').update(await fs.readFile(file)).digest('hex');
  rows.push({ state, url: page.url(), sha256 });
}

async function waitFor(page: Page, selector: string, label: string, timeout = 120_000) {
  await page.locator(selector).waitFor({ state: 'visible', timeout });
  if (!await page.locator(selector).count()) throw new Error(`${label} did not appear`);
}

async function createJourneyThroughUi(page: Page, content: string, relation = false) {
  await page.goto(`${front}/pages/tonight/index`, { waitUntil: 'domcontentloaded' });
  if (relation) {
    await page.getByRole('button', { name: '感情', exact: true }).click();
    await page.getByTestId('relation-sheet').waitFor({ state: 'visible', timeout: 8_000 });
    await page.getByRole('button', { name: '刚分手', exact: true }).click();
  }
  await page.getByTestId('tonight-input').fill(content);
  await page.getByTestId('tonight-continue').click();
  await page.waitForURL('**/pages/journey/detail?*', { timeout: 20_000, waitUntil: 'domcontentloaded' });
  return String(new URL(page.url()).searchParams.get('id') ?? '');
}

async function confirmAndChoose(page: Page, intent: 'JUST_LISTEN' | 'NEXT_STEP') {
  await waitFor(page, '[data-testid="fingerprint-accurate"]', 'fingerprint confirmation');
  await page.getByTestId('fingerprint-accurate').click();
  await page.getByTestId('emotion-temperature').waitFor({ state: 'visible', timeout: 12_000 });
  const range = page.getByLabel('情绪难受程度');
  await range.press('ArrowRight');
  await range.press('ArrowRight');
  await range.press('ArrowRight');
  await page.getByPlaceholder('写一句就好，也可以留空。').fill('我希望先把这一晚撑过去。');
  await page.getByTestId('temperature-continue').click();
  await page.getByTestId('support-intent-picker').waitFor({ state: 'visible', timeout: 12_000 });
  await page.getByTestId(`intent-${intent.toLowerCase()}`).click();
}

async function main() {
  await fs.mkdir(screenshotDir, { recursive: true });
  await fs.mkdir(reportDir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 430, height: 860 }, locale: 'zh-CN' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: front });
  const page = await context.newPage();
  try {
    await page.goto(`${front}/pages/tonight/index`, { waitUntil: 'domcontentloaded' });
    await capture(page, '01-tonight-empty');
    await page.getByRole('button', { name: '感情', exact: true }).click();
    await page.getByTestId('relation-sheet').waitFor({ state: 'visible', timeout: 8_000 });
    await capture(page, '02-tonight-relation-sheet');
    await page.getByRole('button', { name: '刚分手', exact: true }).click();
    await page.getByTestId('tonight-input').fill('第一批浏览器回归：刚分手后我很想联系对方，今晚睡不着。');
    await capture(page, '03-tonight-text-entered');
    await page.getByTestId('tonight-continue').click();
    await page.waitForURL('**/pages/journey/detail?*', { timeout: 20_000, waitUntil: 'domcontentloaded' });
    const stabilizeJourneyId = String(new URL(page.url()).searchParams.get('id') ?? '');
    await page.getByTestId('fingerprint-loading').waitFor({ state: 'visible', timeout: 12_000 });
    await capture(page, '04-fingerprint-loading');
    await waitFor(page, '[data-testid="fingerprint-accurate"]', 'fingerprint confirmation');
    await capture(page, '05-fingerprint-confirm');
    const [reanalyzeResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes(`/api/v1/journeys/${stabilizeJourneyId}/situation/reanalyze`) && response.request().method() === 'POST'),
      page.getByTestId('fingerprint-reanalyze').click(),
    ]);
    if (!reanalyzeResponse.ok()) throw new Error('fingerprint reanalysis request failed');
    await page.getByTestId('fingerprint-loading').waitFor({ state: 'visible', timeout: 12_000 });
    await waitFor(page, '[data-testid="fingerprint-accurate"]', 'reanalysed fingerprint confirmation');
    await page.getByTestId('fingerprint-accurate').click();
    await page.getByTestId('emotion-temperature').waitFor({ state: 'visible', timeout: 12_000 });
    await capture(page, '06-emotion-temperature');
    const temperature = page.getByLabel('情绪难受程度');
    await temperature.press('ArrowRight');
    await temperature.press('ArrowRight');
    await temperature.press('ArrowRight');
    await page.getByPlaceholder('写一句就好，也可以留空。').fill('我希望先把这一晚撑过去。');
    await page.getByTestId('temperature-continue').click();
    await page.getByTestId('support-intent-picker').waitFor({ state: 'visible', timeout: 12_000 });
    await capture(page, '07-support-intent');
    await page.getByTestId('intent-just_listen').click();
    await page.waitForURL('**mode=stabilize', { timeout: 20_000, waitUntil: 'domcontentloaded' });
    await page.getByTestId('stabilize-panel').waitFor({ state: 'visible', timeout: 10_000 });
    await capture(page, '08-stabilize');
    await page.getByRole('button', { name: '帮我告诉现实中的一个人', exact: true }).click();
    await page.waitForURL('**/pages/reality-handoff/index?*', { timeout: 20_000, waitUntil: 'domcontentloaded' });
    await capture(page, '10-reality-handoff');
    await page.getByRole('button', { name: '家人', exact: true }).click();
    await page.getByRole('button', { name: '今晚问问我怎么样', exact: true }).click();
    const [saveHandoffResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/v1/handoffs') && response.request().method() === 'POST'),
      page.getByTestId('handoff-save').click(),
    ]);
    if (!saveHandoffResponse.ok()) throw new Error('reality handoff did not persist');
    await page.getByText('求助卡已经保存到现实支持里').waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByTestId('handoff-copy').click();
    await page.getByText('已复制到剪贴板').waitFor({ state: 'visible', timeout: 10_000 });

    await page.goto(`${front}/pages/journey/detail?id=${stabilizeJourneyId}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '换一种支持', exact: true }).click();
    await page.getByTestId('support-intent-picker').waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByTestId('intent-high_distress').click();
    await page.waitForURL('**/pages/safety/index?*', { timeout: 20_000, waitUntil: 'domcontentloaded' });
    await capture(page, '09-safety');

    const actionJourneyId = await createJourneyThroughUi(page, `第二段浏览器回归 ${Date.now()}：我今晚想把想发给 TA 的话先放一下。`, true);
    await confirmAndChoose(page, 'NEXT_STEP');
    await page.waitForURL('**/pages/action/index?*', { timeout: 20_000, waitUntil: 'domcontentloaded' });
    await page.getByTestId('action-request-plan').click();
    await page.getByTestId('action-accept-plan').waitFor({ state: 'visible', timeout: 120_000 });
    await capture(page, '11-action-recommendation');
    await page.getByTestId('action-accept-plan').click();
    await page.getByRole('button', { name: '没做到', exact: true }).waitFor({ state: 'visible', timeout: 12_000 });
    await capture(page, '12-action-accepted');

    const overdue = await json(`/api/v1/journeys/${actionJourneyId}/actions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: `通知验证行动 ${Date.now()}`, dueAt: new Date(Date.now() - 3_000).toISOString() }) });
    const notificationId = `notification_${overdue.followUp.id}`;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const notice = await json('/api/v1/notifications');
      if (notice.items.some((item: { id: string; status: string }) => item.id === notificationId && item.status === 'unread')) break;
      await page.waitForTimeout(250);
    }
    await page.goto(`${front}/pages/notifications/index`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId(`notification-${notificationId}`).waitFor({ state: 'visible', timeout: 20_000 });
    await capture(page, '13-follow-up-notification');
    await page.getByTestId(`notification-${notificationId}`).click();
    await page.waitForTimeout(1_000);
    const readback = await json('/api/v1/notifications');
    if (!readback.items.some((item: { id: string; status: string }) => item.id === notificationId && item.status === 'read')) throw new Error('notification read status did not persist');

    await page.goto(`${front}/pages/action/index?journeyId=${actionJourneyId}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '没做到', exact: true }).click();
    await page.getByRole('heading', { name: /为什么变难了/ }).waitFor({ state: 'visible', timeout: 10_000 });
    await capture(page, '14-action-missed');
    await page.getByRole('button', { name: '情绪太强', exact: true }).click();
    await capture(page, '15-barrier-selected');
    await page.getByRole('button', { name: '那我们再缩小一点', exact: true }).click();
    await page.getByRole('button', { name: '试试这个更小一步', exact: true }).waitFor({ state: 'visible', timeout: 120_000 });
    await capture(page, '16-adaptive-action');
    await page.getByRole('button', { name: '试试这个更小一步', exact: true }).click();
    await page.goto(`${front}/pages/journey/detail?id=${actionJourneyId}`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('journey-timeline').waitFor({ state: 'visible', timeout: 15_000 });
    await capture(page, '17-journey-timeline');

    const unique = new Set(rows.map((row) => row.sha256));
    if (rows.length !== 17 || unique.size !== rows.length) throw new Error(`screenshot state evidence is not unique: ${rows.length} files, ${unique.size} hashes`);
    await fs.writeFile(path.join(reportDir, 'real-browser-first-batch.md'), ['# First-batch browser evidence', '', 'PASS', '', 'Every named state is a separately captured browser screenshot. SHA-256 values are unique.', '', ...rows.map((row) => `- ${row.state}: ${row.url} · ${row.sha256}`), ''].join('\n'), 'utf8');
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
