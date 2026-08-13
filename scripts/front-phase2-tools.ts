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

const reportPath = 'artifacts/test-report/front-phase2-tools.md';
const reportTitle = 'Front Phase2 Tools Real Interactions';

async function main() {
  const rows: ReportRow[] = [];
  const procs = await startFrontRestStack('front-phase2-tools');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'zh-CN' });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();

    await step(rows, reportPath, reportTitle, '06 工具页首屏与禁止测试残留', async () => {
      await page.goto(`${restUrls.front}/pages/tool/index`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('tool-letter').waitFor({ state: 'visible', timeout: 10000 });
      await assertNoVisibleTestWords(page);
      await assertNoProxyDom(page);
      return await screenshot(page, 'before', '06-tool-index');
    });

    await step(rows, reportPath, reportTitle, '06 九个工具入口真实跳转', async () => {
      const entries = [
        ['tool-letter', '/pages/letter/today'],
        ['tool-decompose', '/pages/tool/decompose'],
        ['tool-report', '/pages/report/month'],
        ['tool-rewrite', '/pages/tool/run?type=negative_rewrite'],
        ['tool-rant', '/pages/tool/run?type=rant'],
        ['tool-healing-quote', '/pages/tool/run?type=healing_phrase'],
        ['tool-sleep-comfort', '/pages/tool/run?type=sleep_comfort'],
        ['tool-work-support', '/pages/tool/run?type=work_support'],
        ['tool-future-letter', '/pages/tool/run?type=future_letter'],
      ] as const;
      const evidence: string[] = [];
      for (const [selector, target] of entries) {
        await page.goto(`${restUrls.front}/pages/tool/index`, { waitUntil: 'domcontentloaded' });
        evidence.push(await assertRealDomHit(page, selector));
        await page.getByTestId(selector).click();
        await page.waitForTimeout(350);
        if (!page.url().includes(target)) throw new Error(`${selector} expected ${target}, got ${page.url()}`);
      }
      return evidence.join(', ');
    });

    await step(rows, reportPath, reportTitle, '07 情绪拆解运行、保存、复制', async () => {
      await page.goto(`${restUrls.front}/pages/tool/decompose`, { waitUntil: 'domcontentloaded' });
      await screenshot(page, 'before', '07-tool-decompose');
      await page.getByTestId('input-decompose').fill('今天心里很乱，想知道自己到底在担心什么。');
      const run = await expectApi(page, 'POST', '/api/v1/ai/tasks', () => page.getByTestId('btn-decompose-run').click());
      await page.getByTestId('decompose-result-card').waitFor({ state: 'visible', timeout: 120000 });
      const save = await expectApi(page, 'POST', '/api/v1/diaries', () => page.getByTestId('btn-decompose-save').click());
      await page.getByTestId('btn-decompose-copy').click();
      await screenshot(page, 'after', '07-tool-decompose-result');
      return `${run}; ${save}`;
    });

    await step(rows, reportPath, reportTitle, '06 工具运行页真实生成并保存', async () => {
      await page.goto(`${restUrls.front}/pages/tool/run?type=negative_rewrite`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('input-tool-run').fill('我总觉得自己做不好。');
      const run = await expectApi(page, 'POST', '/api/v1/ai/tasks', () => page.getByTestId('btn-tool-run-submit').click());
      await page.getByTestId('tool-run-result-card').waitFor({ state: 'visible', timeout: 120000 });
      const save = await expectApi(page, 'POST', '/api/v1/diaries', () => page.getByTestId('btn-tool-run-save').click());
      await screenshot(page, 'after', '06-tool-run-rewrite');
      return `${run}; ${save}`;
    });

    await context.tracing.stop({ path: 'artifacts/traces/front-rest/front-phase2-tools.zip' });
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
