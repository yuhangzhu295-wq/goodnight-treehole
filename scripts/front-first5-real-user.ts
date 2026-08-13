import fs from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import {
  assertNoProxyDom,
  assertNoVisibleTestWords,
  assertRealDomHit,
  expectApi,
  first5Urls,
  kill,
  screenshot,
  startFirst5Stack,
  step,
  type ReportRow,
} from './front-first5-test-utils';

const reportPath = 'artifacts/test-report/front-first5-real-user.md';
const reportTitle = 'Front First5 Real User Clicks';

async function openAndCapture(page: Page, route: string, phase: 'before' | 'after', name: string, waitTestId: string) {
  await page.goto(`${first5Urls.front}${route}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId(waitTestId).waitFor({ state: 'visible', timeout: 10000 });
  await assertNoVisibleTestWords(page);
  await assertNoProxyDom(page);
  return screenshot(page, phase, name);
}

async function clickAndCloseSheet(page: Page, selector: string) {
  await assertRealDomHit(page, selector);
  await expectApi(page, 'GET', '/api/v1/reply-presets', () => page.getByTestId(selector).click());
  await page.getByTestId('btn-close-reply').click();
  await page.getByTestId('input-reply-content').waitFor({ state: 'hidden', timeout: 5000 });
}

async function main() {
  const rows: ReportRow[] = [];
  const procs = await startFirst5Stack('front-first5-real-user');
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'zh-CN' });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();

    await step(rows, reportPath, reportTitle, '生成 01-05 修复前状态截图', async () => {
      const shots = [
        await openAndCapture(page, '/pages/square/index', 'before', '01-square', 'filter-all'),
        await openAndCapture(page, '/pages/mood/create', 'before', '02-mood-create', 'btn-submit-mood'),
        await openAndCapture(page, '/pages/post/detail?id=post_1', 'before', '03-post-detail', 'btn-open-reply'),
        await openAndCapture(page, '/pages/post/detail?id=post_1&sheet=reply', 'before', '04-reply-sheet', 'input-reply-content'),
        await openAndCapture(page, '/pages/letter/index', 'before', '05-letter-today', 'btn-letter-save'),
      ];
      return shots.join(', ');
    });

    await step(rows, reportPath, reportTitle, '01 广场筛选、更多、抱抱、回应全部真实可点', async () => {
      await page.goto(`${first5Urls.front}/pages/square/index`, { waitUntil: 'domcontentloaded' });
      await assertRealDomHit(page, 'filter-weiqu');
      const weak = await expectApi(page, 'GET', '/api/v1/posts?emotion=委屈', () => page.getByTestId('filter-weiqu').click());
      await assertRealDomHit(page, 'filter-jiaolv');
      const anxious = await expectApi(page, 'GET', '/api/v1/posts?emotion=焦虑', () => page.getByTestId('filter-jiaolv').click());
      await assertRealDomHit(page, 'filter-all');
      const all = await expectApi(page, 'GET', /^\/api\/v1\/posts$/, () => page.getByTestId('filter-all').click());
      await page.getByTestId('post-more-first').click();
      await page.getByTestId('square-menu-cancel').click();
      const hugText = await page.getByTestId('btn-square-hug-first').innerText();
      const hug = await expectApi(page, 'POST', /\/api\/v1\/posts\/[^/]+\/hug/, () => page.getByTestId('btn-square-hug-first').click());
      await expectApi(page, 'GET', '/api/v1/reply-presets', () => page.getByTestId('btn-square-reply-first').click());
      await page.getByTestId('input-reply-content').waitFor({ state: 'visible', timeout: 10000 });
      await screenshot(page, 'after', '04-reply-sheet');
      return `${weak}; ${anxious}; ${all}; ${hug}; before hug=${hugText}`;
    });

    await step(rows, reportPath, reportTitle, '02 写下心情所有选择控件、图片、发布真实生效', async () => {
      await page.goto(`${first5Urls.front}/pages/mood/create`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('input-mood-content').fill(`第一轮真实交互测试：我希望这个按钮是真的 ${Date.now()}`);
      for (const selector of ['mood-emotion-nanguo', 'mood-emotion-jiaolv', 'mood-emotion-weiqu', 'mood-emotion-shengqi', 'mood-emotion-gudu', 'mood-emotion-shimian']) {
        await assertRealDomHit(page, selector);
        await page.getByTestId(selector).click();
      }
      await page.getByTestId('mood-emotion-weiqu').click();
      await page.getByTestId('mood-visibility-private').click();
      await page.getByTestId('mood-visibility-public').click();
      for (const selector of ['mood-style-rational', 'mood-style-light', 'mood-style-poetic', 'mood-style-clear', 'mood-style-warm']) {
        await page.getByTestId(selector).click();
      }
      const asset = await expectApi(page, 'POST', '/api/v1/assets/complete', () => page.getByTestId('btn-add-image').click());
      const mood = await expectApi(page, 'POST', '/api/v1/moods', () => page.getByTestId('btn-submit-mood').click());
      await page.waitForURL('**/pages/post/detail**', { timeout: 10000 });
      await screenshot(page, 'after', '02-mood-create');
      return `${asset}; ${mood}; ${page.url()}`;
    });

    await step(rows, reportPath, reportTitle, '03 详情页按钮真实触发菜单、风格抽屉、点赞、抱抱、收藏', async () => {
      await page.goto(`${first5Urls.front}/pages/post/detail?id=post_1`, { waitUntil: 'domcontentloaded' });
      await expectApi(page, 'POST', '/api/v1/posts/post_1/hug', () => page.getByTestId('btn-hug').click());
      await expectApi(page, 'POST', '/api/v1/posts/post_1/favorite', () => page.getByTestId('btn-favorite').click());
      await page.getByTestId('btn-open-more').click();
      await page.getByTestId('detail-menu-cancel').click();
      for (const selector of ['detail-style-warm', 'detail-style-rational', 'detail-style-light', 'detail-style-clear', 'detail-style-poetic']) {
        await clickAndCloseSheet(page, selector);
      }
      await page.getByTestId('reply-like-first').click();
      await clickAndCloseSheet(page, 'quick-hug-0');
      await screenshot(page, 'after', '03-post-detail');
      return page.url();
    });

    await step(rows, reportPath, reportTitle, '04 回复抽屉 textarea、预设、匿名、可见范围、提交真实生效', async () => {
      await page.goto(`${first5Urls.front}/pages/post/detail?id=post_1&sheet=reply`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('input-reply-content').waitFor({ state: 'visible', timeout: 10000 });
      for (const selector of ['reply-preset-0', 'reply-preset-1', 'reply-preset-2', 'reply-preset-3', 'reply-preset-4']) {
        await assertRealDomHit(page, selector);
        await page.getByTestId(selector).click();
      }
      await page.getByTestId('input-reply-content').fill('第一轮真实回应：这些抽屉按钮都能真实触发。');
      await page.getByTestId('toggle-reply-anonymous').click();
      await page.getByTestId('select-reply-visibility').selectOption('PRIVATE');
      const reply = await expectApi(page, 'POST', '/api/v1/posts/post_1/replies', () => page.getByTestId('btn-submit-reply').click());
      await page.getByText('已提交，等待审核').waitFor({ state: 'visible', timeout: 10000 });
      return reply;
    });

    await step(rows, reportPath, reportTitle, '05 今日回信风格、换风格、保存、分享、建议全部真实生效', async () => {
      await page.goto(`${first5Urls.front}/pages/letter/index`, { waitUntil: 'domcontentloaded' });
      for (const selector of ['btn-letter-warm', 'btn-letter-rational', 'btn-letter-light', 'btn-letter-poetic']) {
        const styleResult = await expectApi(page, 'POST', /\/api\/v1\/letters\/[^/]+\/regenerate/, () => page.getByTestId(selector).click());
        await page.getByText('回信已换成新的语气').waitFor({ state: 'visible', timeout: 5000 });
        if (!styleResult) throw new Error(`${selector} did not regenerate`);
      }
      const regen = await expectApi(page, 'POST', /\/api\/v1\/letters\/[^/]+\/regenerate/, () => page.getByTestId('btn-letter-regenerate').click());
      const save = await expectApi(page, 'POST', /\/api\/v1\/letters\/[^/]+\/save-to-diary/, () => page.getByTestId('btn-letter-save').click());
      const share = await expectApi(page, 'POST', /\/api\/v1\/letters\/[^/]+\/poster/, () => page.getByTestId('btn-letter-poster').click());
      await page.getByText('今日回信分享图').waitFor({ state: 'visible', timeout: 5000 });
      await page.getByTestId('letter-share-close').click();
      await page.getByTestId('letter-advice-water').click();
      await screenshot(page, 'after', '05-letter-today');
      return `${regen}; ${save}; ${share}`;
    });

    await context.tracing.stop({ path: 'artifacts/traces/first5/front-first5-real-user.zip' });
    await context.close();
  } finally {
    await browser.close();
    for (const proc of procs) kill(proc);
  }

  await fs.writeFile(reportPath, (await fs.readFile(reportPath, 'utf8')).trimEnd() + '\n');
  if (rows.some((row) => !row.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
