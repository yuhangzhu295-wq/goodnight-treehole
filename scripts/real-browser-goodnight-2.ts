import { chromium, type Page } from 'playwright';
import fs from 'node:fs/promises';

const front = String(process.env.FRONT_BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const admin = String(process.env.ADMIN_BASE_URL ?? 'http://127.0.0.1:5174').replace(/\/$/, '');
const api = String(process.env.API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const fixture = { journeyIds: [] as string[], notificationIds: [] as string[], decisionIds: [] as string[], cooldownIds: [] as string[] };

async function json<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${url}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${url}: ${response.status} ${body.message ?? ''}`.trim());
  return body as T;
}

async function cleanupFixtures(legacy = false) {
  return json('/api/v1/testing/cleanup-browser-fixtures', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goodnight-test-cleanup': 'first-batch-browser' },
    body: JSON.stringify({ journeyIds: fixture.journeyIds, notificationIds: fixture.notificationIds, decisionIds: fixture.decisionIds, cooldownIds: fixture.cooldownIds, legacy }),
  });
}

async function capture(page: Page, file: string, rows: string[]) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error(`${page.url()} has horizontal overflow`);
  const text = await page.locator('body').innerText();
  if (/浏览器回归|通知验证行动|浏览器决策|浏览器冷静箱|direct-check|fixture/i.test(text)) throw new Error('browser fixture text leaked into the UI');
  await page.screenshot({ path: file, fullPage: true });
  rows.push(`${page.url()} -> ${file}`);
}

async function main() {
  await fs.mkdir('artifacts/screenshots/real-user/front', { recursive: true });
  await fs.mkdir('artifacts/screenshots/real-user/admin', { recursive: true });
  await fs.mkdir('artifacts/test-report', { recursive: true });
  await cleanupFixtures(true);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 430, height: 764 }, locale: 'zh-CN' });
  const page = await context.newPage();
  const rows: string[] = [];
  let failure: unknown;

  try {
    await page.goto(`${front}/pages/tonight/index`, { waitUntil: 'domcontentloaded' });
    await capture(page, 'artifacts/screenshots/real-user/front/09-tonight.png', rows);

    await page.getByTestId('tonight-input').fill('今晚我想把想发给对方的话先放一下，给自己一点空间。');
    await page.getByTestId('tonight-continue').click();
    await page.waitForURL('**/pages/journey/detail?*', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    const journeyId = String(new URL(page.url()).searchParams.get('id') ?? '');
    if (!journeyId) throw new Error('真实 UI 没有返回测试 Journey id');
    fixture.journeyIds.push(journeyId);

    const created = await json<{ item: { id: string } }>(`/api/v1/journeys/${journeyId}/actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '先写下想说的话', description: '写三句话，今晚先不发送。' }),
    });
    const actionId = created.item.id;
    await page.goto(`${front}/pages/action/index?journeyId=${journeyId}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '做到了', exact: true }).click();
    await page.getByTestId('action-complete-submit').waitFor({ state: 'visible', timeout: 8_000 });
    await page.getByPlaceholder('这一小步带来了什么变化？').fill('我把想说的话先写下来了，心里松了一点。');
    await page.getByTestId('action-complete-submit').click();
    await page.waitForTimeout(700);
    const detail = await json<{ item: { commitments: Array<{ id: string; status: string }> } }>(`/api/v1/journeys/${journeyId}`);
    const checked = detail.item.commitments.find((item) => item.id === actionId);
    if (!checked || checked.status === 'active') throw new Error('Action completion did not persist');
    await capture(page, 'artifacts/screenshots/real-user/front/11-action.png', rows);

    await page.getByTestId('action-shortcut-decision').click();
    await page.getByPlaceholder('这个决定现在最让你为难的是什么？').fill('我想先留住这个决定，明天再回答。');
    const [decisionResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/api/v1/decisions') && response.request().method() === 'POST'),
      page.getByRole('button', { name: '先留在这里', exact: true }).click(),
    ]);
    const decisionBody = await decisionResponse.json() as { item?: { id?: string } };
    if (!decisionBody.item?.id) throw new Error('decision response did not contain an id');
    fixture.decisionIds.push(decisionBody.item.id);
    await page.getByText('这个决定已经先替你留住。', { exact: true }).waitFor({ state: 'visible', timeout: 8_000 });
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByTestId('action-shortcut-cooldown').click();
    await page.getByPlaceholder('想先留住的一句话').fill('今晚先不发送这句话。');
    const [cooldownResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/api/v1/cooldowns') && response.request().method() === 'POST'),
      page.getByRole('button', { name: '先放一晚', exact: true }).click(),
    ]);
    const cooldownBody = await cooldownResponse.json() as { item?: { id?: string } };
    if (!cooldownBody.item?.id) throw new Error('cooldown response did not contain an id');
    fixture.cooldownIds.push(cooldownBody.item.id);
    await page.getByText('已经替你先放一晚。', { exact: true }).waitFor({ state: 'visible', timeout: 8_000 });
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await capture(page, 'artifacts/screenshots/real-user/front/13-action-shortcuts.png', rows);

    await page.getByTestId('action-shortcut-handoff').click();
    await page.waitForURL('**/pages/reality-handoff/index?*', { waitUntil: 'domcontentloaded' });
    await capture(page, 'artifacts/screenshots/real-user/front/14-reality-handoff.png', rows);
    await page.goto(`${front}/pages/action/index?journeyId=${journeyId}`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('action-shortcut-future').click();
    await page.waitForURL('**/pages/future-self/index?*', { waitUntil: 'domcontentloaded' });
    await capture(page, 'artifacts/screenshots/real-user/front/15-future-self.png', rows);

    await page.goto(`${front}/pages/peers/index`, { waitUntil: 'domcontentloaded' });
    if ((await page.locator('body').innerText()).includes('同路经历加载失败')) throw new Error('同路经历页加载失败');
    await capture(page, 'artifacts/screenshots/real-user/front/12-peers.png', rows);

    const adminPage = await context.newPage();
    await adminPage.setViewportSize({ width: 1448, height: 1086 });
    await adminPage.goto(`${admin}/login`, { waitUntil: 'domcontentloaded' });
    await adminPage.getByTestId('admin-login-username').fill('admin');
    await adminPage.getByTestId('admin-login-password').fill('admin123');
    await adminPage.getByTestId('admin-login-submit').click();
    await adminPage.waitForURL('**/dashboard');
    for (const [path, name] of ([['/experience/journeys', 'journeys'], ['/experience/actions', 'actions'], ['/experience/checkins', 'checkins'], ['/experience/peers', 'peers'], ['/safety/events', 'safety']] as const)) {
      await adminPage.goto(`${admin}${path}`, { waitUntil: 'domcontentloaded' });
      if ((await adminPage.locator('body').innerText()).includes('加载失败')) throw new Error(`后台 ${name} 页面加载失败`);
      rows.push(`后台 ${name}=${adminPage.url()}`);
    }

    const decisionState = await json<{ items: Array<{ question: string }> }>('/api/v1/decisions');
    if (!decisionState.items.some((item) => item.question === '我想先留住这个决定，明天再回答。')) throw new Error('decision did not persist');
    const cooldownState = await json<{ items: Array<{ title: string }> }>('/api/v1/cooldown');
    if (!cooldownState.items.some((item) => item.title === '今晚先不发送这句话。')) throw new Error('cooldown did not persist');

    await fs.writeFile('artifacts/test-report/real-browser-goodnight-2.md', `# GoodnightTreeHole 2.0 浏览器回归\\n\\nPASS\\n\\n${rows.map((row) => `- ${row}`).join('\\n')}\\n\\n测试 Journey 会在 finally 中通过受控清理接口删除。\\n`, 'utf8');
  } catch (cause) {
    failure = cause;
  } finally {
    try {
      const cleanup = await cleanupFixtures(false);
      await fs.writeFile('artifacts/test-report/real-browser-goodnight-2-cleanup.json', JSON.stringify(cleanup, null, 2), 'utf8');
    } catch (cleanupError) {
      failure = failure ?? cleanupError;
    }
    await context.close();
    await browser.close();
  }
  if (failure) throw failure;
}

main().catch((error) => { console.error(error); process.exit(1); });
