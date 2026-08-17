import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const front = 'http://127.0.0.1:5173';
const admin = 'http://127.0.0.1:5174';
const api = 'http://127.0.0.1:3000';

async function main() {
  await fs.mkdir('artifacts/screenshots/real-user/front', { recursive: true });
  await fs.mkdir('artifacts/screenshots/real-user/admin', { recursive: true });
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
    const updateResponse = page.waitForResponse((response) => response.url().includes(`/api/v1/journeys/${journeyId}/updates`) && response.request().method() === 'POST');
    await page.getByPlaceholder('记录事情后来发生了什么，或这一步带来了什么变化').fill(`浏览器回归记录 ${Date.now()}`);
    await page.getByRole('button', { name: '保存进展' }).click();
    if (!(await updateResponse).ok()) throw new Error('后来呢保存接口失败');
    await page.screenshot({ path: 'artifacts/screenshots/real-user/front/10-journey.png', fullPage: true });

    const actionResponse = page.waitForResponse((response) => response.url().includes(`/api/v1/journeys/${journeyId}/actions`) && response.request().method() === 'POST');
    await page.getByPlaceholder('我愿意先做的一件小事').fill(`浏览器回归行动 ${Date.now()}`);
    await page.getByRole('button', { name: '添加行动' }).click();
    if (!(await actionResponse).ok()) throw new Error('行动创建接口失败');
    const actionPage = await context.newPage();
    await actionPage.goto(`${front}/pages/action/index`, { waitUntil: 'domcontentloaded' });
    const checkinResponse = actionPage.waitForResponse((response) => response.url().includes('/api/v1/actions/') && response.url().endsWith('/checkin') && response.request().method() === 'POST');
    await actionPage.getByRole('button', { name: '完成并回顾' }).click();
    if (!(await checkinResponse).ok()) throw new Error('行动回访接口失败');
    await actionPage.screenshot({ path: 'artifacts/screenshots/real-user/front/11-action.png', fullPage: true });
    if ((await actionPage.locator('body').innerText()).includes('浏览器回归行动')) throw new Error('行动完成后仍停留在 active 列表');
    rows.push(`后来呢、行动、回访=${actionPage.url()}`);

    await actionPage.getByText('把支持带回现实', { exact: true }).click();
    const decisionResponse = actionPage.waitForResponse((response) => response.url().includes('/api/v1/decisions') && response.request().method() === 'POST');
    await actionPage.getByPlaceholder('这次要做什么决定？').fill(`浏览器决策 ${Date.now()}`);
    await actionPage.getByRole('button', { name: '保存决策' }).click();
    if (!(await decisionResponse).ok()) throw new Error('决策保存接口失败');
    const cooldownResponse = actionPage.waitForResponse((response) => response.url().includes('/api/v1/cooldowns') && response.request().method() === 'POST');
    await actionPage.getByPlaceholder('暂缓处理的事项').fill(`浏览器冷静箱 ${Date.now()}`);
    await actionPage.getByRole('button', { name: '加入冷静箱' }).click();
    if (!(await cooldownResponse).ok()) throw new Error('冷静箱保存接口失败');
    const handoffResponse = actionPage.waitForResponse((response) => response.url().includes('/api/v1/handoffs') && response.request().method() === 'POST');
    await actionPage.getByPlaceholder('交接给谁').fill('可信任的人');
    await actionPage.getByPlaceholder('联系渠道').fill('当面沟通');
    await actionPage.getByPlaceholder('希望对方知道什么').fill('请在今天晚些时候问我是否完成了这一步。');
    await actionPage.getByRole('button', { name: '保存交接' }).click();
    const handoffResult = await handoffResponse;
    if (!handoffResult.ok()) throw new Error(`现实交接保存接口失败: ${handoffResult.status()} ${await handoffResult.text()}`);
    const shareButton = actionPage.getByRole('button', { name: '确认已分享' }).first();
    if (!(await shareButton.count())) throw new Error('现实交接保存后没有出现确认分享操作');
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
