import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  expectApi,
  kill,
  restUrls,
  screenshot,
  startFrontRestStack,
  step,
  type ReportRow,
} from './front-rest-test-utils';

const reportPath = 'artifacts/test-report/front-rest-cross-flow.md';
const reportTitle = 'Front Rest Cross Page Business Flow';
const JOB_TIMEOUT = 120_000;

async function main() {
  const rows: ReportRow[] = [];
  const procs = await startFrontRestStack('front-rest-cross-flow');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'zh-CN' });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();

    await step(rows, reportPath, reportTitle, '工具拆解保存后进入我的日记可见', async () => {
      await page.goto(`${restUrls.front}/pages/tool/decompose`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('input-decompose').fill('跨页面业务流：我想把这份情绪保存成日记。');
      await expectApi(page, 'POST', '/api/v1/ai/tasks', () => page.getByTestId('btn-decompose-run').click());
      await page.getByTestId('decompose-result-card').waitFor({ state: 'visible', timeout: JOB_TIMEOUT });
      const save = await expectApi(page, 'POST', '/api/v1/diaries', () => page.getByTestId('btn-decompose-save').click());
      await page.goto(`${restUrls.front}/pages/diary/index`, { waitUntil: 'domcontentloaded' });
      await page.getByText('跨页面业务流', { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
      await screenshot(page, 'after', 'cross-diary-saved');
      return save;
    });

    await step(rows, reportPath, reportTitle, '月报读取刚保存后的真实统计', async () => {
      await page.goto(`${restUrls.front}/pages/report/month`, { waitUntil: 'domcontentloaded' });
      await page.getByText('情绪趋势').waitFor({ state: 'visible', timeout: 10000 });
      await screenshot(page, 'after', 'cross-report-month');
      return page.url();
    });

    await step(rows, reportPath, reportTitle, '回信收藏后出现在我的收藏', async () => {
      await page.goto(`${restUrls.front}/pages/letter/list`, { waitUntil: 'domcontentloaded' });
      const favoriteButton = page.getByTestId('btn-letter-list-fav');
      if ((await favoriteButton.innerText()).includes('已收藏')) {
        await expectApi(page, 'DELETE', /\/api\/v1\/letters\/[^/]+\/favorite/, () => favoriteButton.click());
      }
      await expectApi(page, 'POST', /\/api\/v1\/letters\/[^/]+\/favorite/, () => page.getByTestId('btn-letter-list-fav').click());
      await page.goto(`${restUrls.front}/pages/favorite/index`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('favorite-card-first').waitFor({ state: 'visible', timeout: 10000 });
      await screenshot(page, 'after', 'cross-favorite-letter');
      return page.url();
    });

    await step(rows, reportPath, reportTitle, '反馈提交后后端工单数量增加', async () => {
      const before = await fetch(`${restUrls.api}/api/v1/feedback`).then((res) => res.json() as Promise<any>);
      await page.goto(`${restUrls.front}/pages/help/feedback`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('input-feedback-content').fill('跨页面业务流反馈：请确认工单已经写入后台。');
      const submit = await expectApi(page, 'POST', '/api/v1/feedback', () => page.getByTestId('btn-feedback-submit').click());
      const after = await fetch(`${restUrls.api}/api/v1/feedback`).then((res) => res.json() as Promise<any>);
      if ((after.items?.length ?? 0) <= (before.items?.length ?? 0)) throw new Error('feedback ticket count did not increase');
      await screenshot(page, 'after', 'cross-feedback-ticket');
      return submit;
    });

    await context.tracing.stop({ path: 'artifacts/traces/front-rest/front-rest-cross-flow.zip' });
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
