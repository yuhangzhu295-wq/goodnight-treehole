import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  assertNoProxyDom,
  assertNoVisibleTestWords,
  assertRealDomHit,
  expectApi,
  kill,
  restUrls,
  screenshot,
  startFrontRestStack,
  step,
  type ReportRow,
} from './front-rest-test-utils';

const reportPath = 'artifacts/test-report/front-phase3-me.md';
const reportTitle = 'Front Phase3 Me Real Interactions';
const currentMonth = new Date().toISOString().slice(0, 7);

async function main() {
  const rows: ReportRow[] = [];
  const procs = await startFrontRestStack('front-phase3-me');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'zh-CN' });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();

    await step(rows, reportPath, reportTitle, '08 我的页面入口真实可点', async () => {
      await page.goto(`${restUrls.front}/pages/me/index`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('me-user-card').waitFor({ state: 'visible', timeout: 10000 });
      await assertNoVisibleTestWords(page);
      await assertNoProxyDom(page);
      await screenshot(page, 'before', '08-me');
      const entries = [
        ['entry-diary', '/pages/diary/index'],
        ['entry-letter-list', '/pages/letter/list'],
        ['entry-favorite', '/pages/favorite/index'],
        ['entry-report', '/pages/me/month-report'],
        ['entry-privacy', '/pages/settings/privacy'],
        ['entry-feedback', '/pages/help/feedback'],
      ] as const;
      const hits: string[] = [];
      for (const [selector, target] of entries) {
        await page.goto(`${restUrls.front}/pages/me/index`, { waitUntil: 'domcontentloaded' });
        hits.push(await assertRealDomHit(page, selector));
        await page.getByTestId(selector).click();
        await page.waitForTimeout(350);
        if (!page.url().includes(target)) throw new Error(`${selector} expected ${target}, got ${page.url()}`);
      }
      return hits.join(', ');
    });

    await step(rows, reportPath, reportTitle, '09 日记筛选和写新日记真实生效', async () => {
      await page.goto(`${restUrls.front}/pages/diary/index`, { waitUntil: 'domcontentloaded' });
      await screenshot(page, 'before', '09-diary-index');
      await page.getByTestId('btn-diary-filter').click();
      await page.getByTestId('filter-diary-emotion-jiaolv').click();
      await page.getByTestId('filter-diary-letter-true').click();
      const filter = await expectApi(page, 'GET', `/api/v1/diaries?month=${currentMonth}&emotion=焦虑&hasLetter=true`, () => page.getByTestId('btn-diary-filter-confirm').click());
      await page.getByTestId('btn-new-diary').click();
      await page.waitForURL('**/pages/mood/create', { timeout: 10000 });
      return filter;
    });

    await step(rows, reportPath, reportTitle, '10 月报分享图和建议真实请求', async () => {
      await page.goto(`${restUrls.front}/pages/report/month`, { waitUntil: 'domcontentloaded' });
      await screenshot(page, 'before', '10-report-month');
      const posterButton = page.getByTestId('btn-report-poster');
      const deadline = Date.now() + 120000;
      while (!(await posterButton.isEnabled()) && Date.now() < deadline) await page.waitForTimeout(250);
      const poster = await expectApi(page, 'POST', `/api/v1/reports/monthly/${currentMonth}/poster`, () => posterButton.click());
      await page.locator('[data-state="report-poster"]').waitFor({ state: 'visible', timeout: 10000 });
      await page.getByTestId('btn-report-poster-close').click();
      await page.locator('[data-state="report-poster"]').waitFor({ state: 'detached', timeout: 5000 });
      const advice = await expectApi(page, 'GET', `/api/v1/reports/monthly/${currentMonth}/advice`, () => page.getByTestId('btn-report-advice').click());
      await page.getByTestId('report-advice-panel').waitFor({ state: 'visible', timeout: 120000 });
      await screenshot(page, 'after', '10-report-month-advice');
      await page.getByTestId('btn-report-advice-close').click();
      await expectApi(page, 'POST', `/api/v1/reports/monthly/${currentMonth}/poster`, () => posterButton.click());
      await page.locator('[data-state="report-poster"]').waitFor({ state: 'visible', timeout: 10000 });
      await page.getByTestId('btn-report-poster-save').click();
      return `${poster}; ${advice}`;
    });

    await step(rows, reportPath, reportTitle, '11 回信筛选、喜欢、收藏、查看全文真实生效', async () => {
      await page.goto(`${restUrls.front}/pages/letter/list`, { waitUntil: 'domcontentloaded' });
      await screenshot(page, 'before', '11-letter-list');
      const unread = await expectApi(page, 'GET', '/api/v1/letters?status=unread', () => page.getByTestId('filter-letter-unread').click());
      await expectApi(page, 'GET', '/api/v1/letters', () => page.getByTestId('filter-letter-all').click());
      const like = await expectApi(page, 'POST', /\/api\/v1\/letters\/[^/]+\/like/, () => page.getByTestId('btn-letter-like-first').click());
      const favoriteButton = page.getByTestId('btn-letter-list-fav');
      if ((await favoriteButton.innerText()).includes('已收藏')) {
        await expectApi(page, 'DELETE', /\/api\/v1\/letters\/[^/]+\/favorite/, () => favoriteButton.click());
      }
      const fav = await expectApi(page, 'POST', /\/api\/v1\/letters\/[^/]+\/favorite/, () => page.getByTestId('btn-letter-list-fav').click());
      const read = await expectApi(page, 'PATCH', /\/api\/v1\/letters\/[^/]+\/read/, () => page.getByTestId('btn-letter-read-full-first').click());
      await page.waitForURL('**/pages/letter/detail**', { timeout: 10000 });
      return `${unread}; ${like}; ${fav}; ${read}`;
    });

    await step(rows, reportPath, reportTitle, '12 收藏筛选和取消收藏真实生效', async () => {
      await page.goto(`${restUrls.front}/pages/favorite/index`, { waitUntil: 'domcontentloaded' });
      await screenshot(page, 'before', '12-favorite-index');
      const post = await expectApi(page, 'GET', '/api/v1/favorites?type=post', () => page.getByTestId('filter-fav-post').click());
      const remove = await expectApi(page, 'DELETE', /\/api\/v1\/favorites\/[^/]+/, () => page.getByTestId('btn-favorite-remove').click());
      await screenshot(page, 'after', '12-favorite-removed');
      return `${post}; ${remove}`;
    });

    await step(rows, reportPath, reportTitle, '13 隐私开关和日记导出真实生效', async () => {
      await page.goto(`${restUrls.front}/pages/settings/privacy`, { waitUntil: 'domcontentloaded' });
      await screenshot(page, 'before', '13-privacy-settings');
      const privacy = await expectApi(page, 'PUT', '/api/v1/settings/privacy', () => page.getByTestId('toggle-privacy-private').click());
      const exportResult = await expectApi(page, 'POST', '/api/v1/diaries/export', () => page.getByTestId('btn-export-diaries').click());
      await page.getByTestId('btn-clear-cache').click();
      await page.getByTestId('btn-data-explain').click();
      await page.getByTestId('privacy-explain-panel').waitFor({ state: 'visible', timeout: 5000 });
      return `${privacy}; ${exportResult}`;
    });

    await step(rows, reportPath, reportTitle, '14 FAQ、上传、提交反馈真实生效', async () => {
      await page.goto(`${restUrls.front}/pages/help/feedback`, { waitUntil: 'domcontentloaded' });
      await screenshot(page, 'before', '14-feedback-help');
      await page.getByTestId('faq-item-first').click();
      const upload = await expectApi(page, 'POST', '/api/v1/media/upload', () => page.getByTestId('input-feedback-upload').setInputFiles({
        name: 'feedback-proof.png',
        mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X7mW3wAAAABJRU5ErkJggg==', 'base64'),
      }));
      await page.getByTestId('input-feedback-content').fill('真实反馈流验证：按钮点击后需要创建后台反馈工单。');
      const submit = await expectApi(page, 'POST', '/api/v1/feedback', () => page.getByTestId('btn-feedback-submit').click());
      await page.getByTestId('btn-support-more').click();
      await page.getByTestId('support-panel').waitFor({ state: 'visible', timeout: 5000 });
      await screenshot(page, 'after', '14-feedback-submitted');
      return `${upload}; ${submit}`;
    });

    await step(rows, reportPath, reportTitle, '08 清空记录真实删除演示个人数据', async () => {
      await page.goto(`${restUrls.front}/pages/me/index`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('btn-clear-data').click();
      await page.getByTestId('clear-confirm-panel').waitFor({ state: 'visible', timeout: 5000 });
      const clear = await expectApi(page, 'DELETE', '/api/v1/me/data', () => page.getByTestId('btn-clear-confirm').click());
      await screenshot(page, 'after', '08-me-cleared');
      return clear;
    });

    await context.tracing.stop({ path: 'artifacts/traces/front-rest/front-phase3-me.zip' });
    await context.close();
  } finally {
    await browser.close();
    for (const proc of procs) kill(proc);
  }
  if (rows.some((row) => !row.ok)) process.exit(1);
  await fs.writeFile(reportPath, (await fs.readFile(reportPath, 'utf8')).trimEnd() + '\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
