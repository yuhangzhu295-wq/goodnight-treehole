import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const front = 'http://127.0.0.1:5173';
const admin = 'http://127.0.0.1:5174';
const api = 'http://127.0.0.1:3000';

async function main() {
  await fs.mkdir('artifacts/screenshots/real-user/front', { recursive: true });
  await fs.mkdir('artifacts/screenshots/real-user/admin', { recursive: true });
  await fs.mkdir('artifacts/test-report', { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 430, height: 764 }, locale: 'zh-CN' });
  const page = await context.newPage();
  const rows: string[] = [];
  try {
    const tonight = await (await fetch(`${api}/api/v1/tonight`)).json() as any;
    const journeyId = tonight.item.journey?.id;
    if (!journeyId) throw new Error('当前真实运行数据没有可验证的 active journey');

    await page.goto(`${front}/pages/tonight/index`, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: 'artifacts/screenshots/real-user/front/09-tonight.png', fullPage: true });
    rows.push(`今晚页=${page.url()}`);

    await page.goto(`${front}/pages/journey/detail?id=${journeyId}`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('记录事情后来发生了什么，或这一步带来了什么变化').fill(`浏览器回归记录 ${Date.now()}`);
    await page.getByRole('button', { name: '保存进展' }).click();
    await new Promise((resolve) => setTimeout(resolve, 700));
    const updatedJourney = await (await fetch(`${api}/api/v1/journeys/${journeyId}`)).json() as any;
    if (!updatedJourney.item.updates.some((item: any) => item.content.startsWith('浏览器回归记录'))) throw new Error('后来呢没有持久化');
    await page.screenshot({ path: 'artifacts/screenshots/real-user/front/10-journey.png', fullPage: true });

    const browserActionTitle = `浏览器回归行动 ${Date.now()}`;
    await page.getByPlaceholder('也可以自己写一件小事').fill(browserActionTitle);
    await page.getByRole('button', { name: '保存这一步' }).click();
    await new Promise((resolve) => setTimeout(resolve, 700));
    const actionTitle = (await page.locator('.action-form input').first().inputValue().catch(() => ''));
    const refreshedTonight = await (await fetch(`${api}/api/v1/tonight`)).json() as any;
    if (!refreshedTonight.item.activeActions.some((item: any) => item.title === browserActionTitle)) throw new Error(`行动没有持久化: ${actionTitle}`);
    const actionPage = page;
    await actionPage.goto(`${front}/pages/action/index`, { waitUntil: 'domcontentloaded' });
    await actionPage.locator('.commitment-list article').filter({ hasText: browserActionTitle }).getByRole('button', { name: '完成并回顾' }).click();
    await new Promise((resolve) => setTimeout(resolve, 700));
    const checkedTonight = await (await fetch(`${api}/api/v1/tonight`)).json() as any;
    if (checkedTonight.item.activeActions.some((item: any) => item.title === browserActionTitle)) throw new Error('行动完成后仍停留在 active 列表');
    await actionPage.screenshot({ path: 'artifacts/screenshots/real-user/front/11-action.png', fullPage: true });
    rows.push(`后来呢、行动、回访=${actionPage.url()}`);

    await actionPage.getByText('把支持带回现实', { exact: true }).click();
    await actionPage.getByPlaceholder('你现在想做什么？').fill(`浏览器决策 ${Date.now()}`);
    await actionPage.getByRole('button', { name: '先放这里' }).click();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const decisions = await (await fetch(`${api}/api/v1/decisions`)).json() as any;
    if (!decisions.items?.some((item: any) => item.question.startsWith('浏览器决策'))) throw new Error('决策没有持久化');
    await actionPage.getByPlaceholder('想先留住的那句话或决定').fill(`浏览器冷静箱 ${Date.now()}`);
    await actionPage.getByRole('button', { name: '放进冷静箱' }).click();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const cooldowns = await (await fetch(`${api}/api/v1/cooldown`)).json() as any;
    if (!cooldowns.items?.some((item: any) => item.title.startsWith('浏览器冷静箱'))) throw new Error('冷静箱没有持久化');
    const handoffRecipient = `可信任的人-${Date.now()}`;
    await actionPage.getByPlaceholder('朋友、家人或同事').fill(handoffRecipient);
    await actionPage.getByPlaceholder('希望对方怎么陪你？').fill('请在今天晚些时候问我是否完成了这一步。');
    await actionPage.getByRole('button', { name: '保存这张求助卡' }).click();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const handoffs = await (await fetch(`${api}/api/v1/handoffs`)).json() as any;
    const savedHandoff = handoffs.items?.find((item: any) => item.recipient === handoffRecipient);
    if (!savedHandoff) throw new Error('现实交接没有持久化');
    if (savedHandoff.status !== 'ready') throw new Error(`现实交接初始状态不正确: ${savedHandoff.status}`);
    const handoffRow = actionPage.locator('.saved-tools p').filter({ hasText: handoffRecipient });
    const shareButton = handoffRow.getByTestId('action-share-handoff');
    await shareButton.waitFor({ state: 'visible', timeout: 5000 });
    const [shareResult] = await Promise.all([
      actionPage.waitForResponse((response) => response.url().includes('/api/v1/handoffs/') && response.url().endsWith('/share') && response.request().method() === 'POST'),
      shareButton.click(),
    ]);
    if (!shareResult.ok()) throw new Error('现实交接分享接口失败');
    await actionPage.screenshot({ path: 'artifacts/screenshots/real-user/front/13-action-advanced.png', fullPage: true });
    rows.push('决策、冷静箱、现实交接、确认分享=真实 DOM 点击与 API 成功');

    await page.goto(`${front}/pages/peers/index`, { waitUntil: 'domcontentloaded' });
    const peerText = await page.locator('body').innerText();
    if (peerText.includes('同路经历加载失败')) throw new Error('同路经历页加载失败');
    await page.screenshot({ path: 'artifacts/screenshots/real-user/front/12-peers.png', fullPage: true });
    rows.push(`同路页=${page.url()}`);

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
      if (name === 'journeys') await adminPage.screenshot({ path: 'artifacts/screenshots/real-user/admin/03-experience-journeys.png', fullPage: true });
      rows.push(`后台 ${name}=${adminPage.url()}`);
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    if (!overflow) throw new Error('同路页存在横向溢出');
    await fs.writeFile('artifacts/test-report/real-browser-goodnight-2.md', `# GoodnightTreeHole 2.0 新业务浏览器回归\n\nPASS\n\n${rows.map((row) => `- ${row}`).join('\n')}\n`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
