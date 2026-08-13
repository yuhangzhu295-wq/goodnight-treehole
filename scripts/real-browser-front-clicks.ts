import { chromium, type Page } from 'playwright';
import fs from 'node:fs/promises';
import { cleanRuntime, ensureNoVisibleTestWords, kill, markdown, startFrontStack, urls } from './real-browser-utils';

async function expectApi(page: Page, method: string, pathPart: string, action: () => Promise<void>) {
  const responsePromise = page.waitForResponse((res) => res.url().includes(pathPart) && res.request().method() === method, { timeout: 10000 });
  await action();
  const response = await responsePromise;
  return response.status();
}

async function assertNoProxyLayers(page: Page) {
  const bad = await page.evaluate(() => Array.from(document.querySelectorAll('[class*="hotspot"], [class*="live-layer"], [class*="ref-shell"], [class*="ref-content"]')).map((el) => (el as HTMLElement).className));
  if (bad.length) throw new Error(`Proxy/overlay DOM still present: ${bad.join(', ')}`);
}

async function main() {
  await fs.mkdir('artifacts/test-report', { recursive: true });
  await fs.mkdir('artifacts/debug', { recursive: true });
  await fs.mkdir('artifacts/screenshots/real-user/front', { recursive: true });
  await fs.mkdir('artifacts/traces', { recursive: true });
  await cleanRuntime();
  const procs = await startFrontStack();
  const rows: Array<{ name: string; ok: boolean; evidence?: string; error?: string }> = [];
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext({ viewport: { width: 430, height: 764 }, locale: 'zh-CN' });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();

    async function check(name: string, fn: () => Promise<string>) {
      try {
        rows.push({ name, ok: true, evidence: await fn() });
      } catch (error: any) {
        rows.push({ name, ok: false, error: error?.message ?? String(error) });
      }
      const report = markdown('Real Browser Front Clicks', rows);
      await fs.writeFile('artifacts/test-report/real-browser-front-clicks.md', report);
      await fs.writeFile('artifacts/test-report/real-user-front.md', report);
    }

    await check('打开前台广场且无测试热区/英文测试词', async () => {
      await page.goto(`${urls.front}/pages/square/index`, { waitUntil: 'domcontentloaded' });
      await ensureNoVisibleTestWords(page);
      await assertNoProxyLayers(page);
      await page.screenshot({ path: 'artifacts/debug/current-front-square.png', fullPage: true });
      await page.screenshot({ path: 'artifacts/screenshots/real-user/front/01-square.png', fullPage: true });
      return page.url();
    });

    await check('点击中文筛选按钮触发真实列表请求', async () => {
      const status = await expectApi(page, 'GET', '/api/v1/posts?mood=anxious', () => page.getByTestId('filter-jiaolv').click());
      return `GET /api/v1/posts?mood=anxious => ${status}`;
    });

    await check('写心情发布调用后端并进入详情', async () => {
      await page.getByTestId('btn-write-mood').click();
      await page.waitForURL('**/pages/post/create', { timeout: 10000 });
      await page.getByTestId('input-mood-content').fill(`真实浏览器心情 ${Date.now()}`);
      await page.getByTestId('mood-visibility-public').click();
      const status = await expectApi(page, 'POST', '/api/v1/moods', () => page.getByTestId('btn-submit-mood').click());
      await page.waitForURL('**/pages/post/detail**', { timeout: 10000 });
      return `POST /api/v1/moods => ${status}; ${page.url()}`;
    });

    await check('详情页回复抽屉打开并提交真实回应', async () => {
      await page.goto(`${urls.front}/pages/post/detail?id=post_1&sheet=reply`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('input-reply-content').waitFor({ state: 'visible', timeout: 10000 });
      await page.getByTestId('input-reply-content').fill('真实浏览器回应：我看见你了。');
      const replyStatus = await expectApi(page, 'POST', '/api/v1/posts/', () => page.getByTestId('btn-submit-reply').click());
      if (replyStatus !== 201) throw new Error(`真人回应提交失败：${replyStatus}`);
      return `reply=${replyStatus}`;
    });

    await check('工具页中文按钮调用工具 API', async () => {
      await page.goto(`${urls.front}/pages/tool/index`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL('**/pages/tool/index', { timeout: 10000 });
      await page.screenshot({ path: 'artifacts/debug/current-front-tool.png', fullPage: true });
      await page.screenshot({ path: 'artifacts/screenshots/real-user/front/06-tool.png', fullPage: true });
      await page.getByTestId('tool-rewrite').click();
      await page.waitForURL(/\/pages\/tool\/run\?type=negative_rewrite/, { timeout: 10000 });
      const status = await expectApi(page, 'POST', '/api/v1/ai/tasks', () => page.getByTestId('btn-tool-run-submit').click());
      return `POST /api/v1/ai/tasks => ${status}`;
    });

    await check('情绪拆解卡片进入子页面', async () => {
      await page.goto(`${urls.front}/pages/tool/index`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('tool-decompose').click();
      await page.waitForURL('**/pages/tool/decompose', { timeout: 10000 });
      return page.url();
    });

    await check('我的页清空记录按钮打开确认弹窗', async () => {
      await page.goto(`${urls.front}/pages/me/index`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL('**/pages/me/index', { timeout: 10000 });
      await page.screenshot({ path: 'artifacts/debug/current-front-me.png', fullPage: true });
      await page.screenshot({ path: 'artifacts/screenshots/real-user/front/08-me.png', fullPage: true });
      await page.getByTestId('btn-clear-data').click();
      await page.getByTestId('clear-confirm-panel').waitFor({ state: 'visible', timeout: 5000 });
      return 'confirm visible';
    });

    await check('今日回信保存与分享调用真实 API', async () => {
      await page.goto(`${urls.front}/pages/letter/index`, { waitUntil: 'domcontentloaded' });
      const saveStatus = await expectApi(page, 'POST', '/save-to-diary', () => page.getByTestId('btn-letter-save').click());
      const shareStatus = await expectApi(page, 'POST', '/poster', () => page.getByTestId('btn-letter-poster').click());
      return `save=${saveStatus}; share=${shareStatus}`;
    });

    await context.tracing.stop({ path: 'artifacts/traces/real-user-front-trace.zip' });
    await context.close();
    const failed = rows.filter((row) => !row.ok);
    if (failed.length) process.exit(1);
  } finally {
    await browser.close();
    for (const proc of procs) kill(proc);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
