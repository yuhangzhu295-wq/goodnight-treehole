import { chromium, type Page } from 'playwright';
import {
  apiJson,
  expectApi,
  expectApiJson,
  first5Urls,
  kill,
  screenshot,
  startFirst5Stack,
  step,
  type ReportRow,
} from './front-first5-test-utils';

const reportPath = 'artifacts/test-report/front-first5-business-flow.md';
const reportTitle = 'Front First5 Business Flow';
const JOB_TIMEOUT = 120_000;

async function waitText(page: Page, text: string) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: JOB_TIMEOUT });
}

async function main() {
  const rows: ReportRow[] = [];
  const procs = await startFirst5Stack('front-first5-business-flow');
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'zh-CN' });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    const createdContent = `第一轮真实交互测试：我希望这个按钮是真的 ${Date.now()}`;
    const replyContent = `第一轮真实回应验证：抽屉提交进入后端 ${Date.now()}`;

    await step(rows, reportPath, reportTitle, '业务流 1：广场筛选请求与列表变化', async () => {
      await page.goto(`${first5Urls.front}/pages/square/index`, { waitUntil: 'domcontentloaded' });
      const before = await page.locator('.treehole-card').count();
      const weak = await expectApi(page, 'GET', '/api/v1/posts?emotion=委屈', () => page.getByTestId('filter-weiqu').click());
      await waitText(page, '还没有这类心情');
      const anxious = await expectApi(page, 'GET', '/api/v1/posts?emotion=焦虑', () => page.getByTestId('filter-jiaolv').click());
      await page.getByTestId('post-card-first').waitFor({ state: 'visible', timeout: 10000 });
      const all = await expectApi(page, 'GET', /^\/api\/v1\/posts$/, () => page.getByTestId('filter-all').click());
      const after = await page.locator('.treehole-card').count();
      await screenshot(page, 'after', '01-square');
      if (after < before) throw new Error(`expected all list to recover, before=${before}, after=${after}`);
      return `${weak}; ${anxious}; ${all}; list ${before}->${after}`;
    });

    await step(rows, reportPath, reportTitle, '业务流 2：写心情发布公开树洞并能从后端查到', async () => {
      await page.getByTestId('btn-write-mood').click();
      await page.waitForURL('**/pages/mood/create', { timeout: 10000 });
      await page.getByTestId('input-mood-content').fill(createdContent);
      await page.getByTestId('mood-emotion-weiqu').click();
      await page.getByTestId('mood-visibility-public').click();
      const mood = await expectApiJson<{ mood: { id: string }; post: { id: string }; reviewStatus: string }>(page, 'POST', '/api/v1/moods', () => page.getByTestId('btn-submit-mood').click());
      await page.waitForURL('**/pages/post/detail**', { timeout: 10000 });
      const adminPosts = await apiJson<{ items: Array<{ id: string; content: string; reviewStatus: string }> }>('/api/admin/v1/posts');
      const created = adminPosts.items.find((item) => item.id === mood.post.id && item.content === createdContent);
      if (!created) throw new Error('created post not found from backend admin list');
      return `post=${mood.post.id}; review=${created.reviewStatus}`;
    });

    await step(rows, reportPath, reportTitle, '业务流 3：从广场卡片进入详情并触发详情 API、抱抱、收藏、更多', async () => {
      await page.goto(`${first5Urls.front}/pages/square/index`, { waitUntil: 'domcontentloaded' });
      const detailPromise = page.waitForResponse((res) => res.url().includes('/api/v1/posts/post_1') && res.request().method() === 'GET');
      const repliesPromise = page.waitForResponse((res) => res.url().includes('/api/v1/posts/post_1/replies') && res.request().method() === 'GET');
      await page.getByTestId('post-card-first').click();
      await detailPromise;
      await repliesPromise;
      await page.waitForURL('**/pages/post/detail?id=post_1', { timeout: 10000 });
      const beforeText = await page.getByTestId('btn-hug').innerText();
      const hug = await expectApi(page, 'POST', '/api/v1/posts/post_1/hug', () => page.getByTestId('btn-hug').click());
      const afterText = await page.getByTestId('btn-hug').innerText();
      if (beforeText === afterText) throw new Error('hug count text did not change');
      const fav = await expectApi(page, 'POST', '/api/v1/posts/post_1/favorite', () => page.getByTestId('btn-favorite').click());
      await waitText(page, '已收藏');
      await page.getByTestId('btn-open-more').click();
      await page.getByText('复制内容').waitFor({ state: 'visible', timeout: 5000 });
      await page.getByTestId('detail-menu-cancel').click();
      return `${hug}; ${fav}; ${page.url()}`;
    });

    await step(rows, reportPath, reportTitle, '业务流 4：回复抽屉预设、输入、匿名、范围和发布进入后端', async () => {
      await expectApi(page, 'GET', '/api/v1/reply-presets', () => page.getByTestId('btn-open-reply').click());
      await page.getByTestId('input-reply-content').waitFor({ state: 'visible', timeout: 10000 });
      await page.getByTestId('reply-preset-0').click();
      const presetValue = await page.getByTestId('input-reply-content').inputValue();
      if (!presetValue.includes('抱抱你')) throw new Error(`preset did not fill textarea: ${presetValue}`);
      await page.getByTestId('input-reply-content').fill(replyContent);
      await page.getByTestId('toggle-reply-anonymous').click();
      await page.getByTestId('select-reply-visibility').selectOption('PRIVATE');
      await expectApi(page, 'POST', '/api/v1/posts/post_1/replies', () => page.getByTestId('btn-submit-reply').click());
      await waitText(page, '已提交，等待审核');
      const adminPost = await apiJson<{ replies: Array<{ content: string; status: string }> }>('/api/admin/v1/posts/post_1');
      const created = adminPost.replies.find((item) => item.content === replyContent && item.status === 'pending_review');
      if (!created) throw new Error('submitted reply not found in backend pending review list');
      return `replyStatus=${created.status}`;
    });

    await step(rows, reportPath, reportTitle, '业务流 5：今日回信风格、重生、保存日记、分享预览', async () => {
      await page.goto(`${first5Urls.front}/pages/letter/index`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL('**/pages/letter/index', { timeout: 10000 });
      const rational = await expectApi(page, 'POST', /\/api\/v1\/letters\/[^/]+\/regenerate/, () => page.getByTestId('btn-letter-rational').click());
      await waitText(page, '回信已换成新的语气');
      const regen = await expectApi(page, 'POST', /\/api\/v1\/letters\/[^/]+\/regenerate/, () => page.getByTestId('btn-letter-regenerate').click());
      const save = await expectApi(page, 'POST', /\/api\/v1\/letters\/[^/]+\/save-to-diary/, () => page.getByTestId('btn-letter-save').click());
      await waitText(page, '已保存到日记');
      const diaries = await apiJson<{ items: Array<{ hasLetter: boolean }> }>('/api/v1/diaries');
      if (!diaries.items.some((item) => item.hasLetter)) throw new Error('saved diary not found from API');
      const share = await expectApi(page, 'POST', /\/api\/v1\/letters\/[^/]+\/poster/, () => page.getByTestId('btn-letter-poster').click());
      await page.getByText('今日回信分享图').waitFor({ state: 'visible', timeout: 5000 });
      await screenshot(page, 'after', '05-letter-business-flow');
      return `${rational}; ${regen}; ${save}; ${share}`;
    });

    await context.tracing.stop({ path: 'artifacts/traces/first5/front-first5-business-flow.zip' });
    await context.close();
  } finally {
    await browser.close();
    for (const proc of procs) kill(proc);
  }

  if (rows.some((row) => !row.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
