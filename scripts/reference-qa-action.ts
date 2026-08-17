import { chromium, type Page } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import fs from 'node:fs/promises';
import path from 'node:path';

const front = String(process.env.FRONT_BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const api = String(process.env.API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const root = path.resolve('artifacts/reference-qa/action');
const reportPath = path.resolve('docs/action-reference-qa-report.md');
const viewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
];
const referenceFiles = {
  recommendation: 'C:\\Users\\zyu33\\Desktop\\图片素材88\\晚安树洞_UI_01-41_业务说明\\06_今晚只做这一件事.png',
  adaptive: 'C:\\Users\\zyu33\\Desktop\\图片素材88\\晚安树洞_UI_01-41_业务说明\\37_AdaptiveMicroAction.png',
};
const fixture = { journeyIds: [] as string[] };

async function json<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${url}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${url}: ${response.status} ${body.message ?? ''}`.trim());
  return body as T;
}

async function cleanup(legacy = false) {
  return json('/api/v1/testing/cleanup-browser-fixtures', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goodnight-test-cleanup': 'first-batch-browser' },
    body: JSON.stringify({ journeyIds: fixture.journeyIds, legacy }),
  });
}

function resize(source: PNG, width: number, height: number) {
  const target = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor(x * source.width / width));
      const sourceY = Math.min(source.height - 1, Math.floor(y * source.height / height));
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const targetIndex = (y * width + x) * 4;
      target.data[targetIndex] = source.data[sourceIndex];
      target.data[targetIndex + 1] = source.data[sourceIndex + 1];
      target.data[targetIndex + 2] = source.data[sourceIndex + 2];
      target.data[targetIndex + 3] = 255;
    }
  }
  return target;
}

async function compare(referencePath: string, actualPath: string, sidePath: string, diffPath: string) {
  const reference = PNG.sync.read(await fs.readFile(referencePath));
  const actual = PNG.sync.read(await fs.readFile(actualPath));
  const normalized = resize(actual, reference.width, reference.height);
  const diff = new PNG({ width: reference.width, height: reference.height });
  const mismatched = pixelmatch(reference.data, normalized.data, diff.data, reference.width, reference.height, { threshold: 0.28 });
  const side = new PNG({ width: reference.width * 2, height: reference.height });
  PNG.bitblt(reference, side, 0, 0, reference.width, reference.height, 0, 0);
  PNG.bitblt(normalized, side, 0, 0, reference.width, reference.height, reference.width, 0);
  await fs.writeFile(sidePath, PNG.sync.write(side));
  await fs.writeFile(diffPath, PNG.sync.write(diff));
  return { reference: [reference.width, reference.height], actual: [actual.width, actual.height], mismatchRatio: Number((mismatched / (reference.width * reference.height)).toFixed(4)) };
}

async function createJourney(page: Page) {
  await page.goto(`${front}/pages/tonight/index`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('tonight-input').fill('今晚想把想说的话先放一下，给自己一点空间。');
  await page.getByTestId('tonight-continue').click();
  await page.waitForURL('**/pages/journey/detail?*', { waitUntil: 'domcontentloaded', timeout: 20_000 });
  const journeyId = String(new URL(page.url()).searchParams.get('id') ?? '');
  if (!journeyId) throw new Error('reference QA did not receive a Journey id');
  fixture.journeyIds.push(journeyId);
  return journeyId;
}

async function checkPage(page: Page, expected: string[], criticalSelectors: string[]) {
  const result = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, scrollHeight: document.documentElement.scrollHeight }));
  if (result.scrollWidth > result.innerWidth) throw new Error(`horizontal overflow at ${result.innerWidth}px`);
  const text = await page.locator('body').innerText();
  for (const value of expected) if (!text.includes(value)) throw new Error(`semantic assertion missing: ${value}`);
  if (/浏览器回归|通知验证行动|direct-check|fixture/i.test(text)) throw new Error('fixture text leaked into reference QA');
  const tabbar = await page.locator('.tabbar').boundingBox();
  if (!tabbar) throw new Error('fixed tabbar is missing');
  for (const selector of criticalSelectors) {
    const box = await page.locator(selector).first().boundingBox();
    if (!box || box.bottom > tabbar.y + 1) throw new Error(`${selector} is covered by the fixed tabbar at ${result.innerWidth}px`);
  }
  return result;
}

async function main() {
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await cleanup(true);
  for (const [key, source] of Object.entries(referenceFiles)) await fs.copyFile(source, path.join(root, `reference-${key}.png`));

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: viewports[3], locale: 'zh-CN' });
  const page = await context.newPage();
  let failure: unknown;

  try {
    const journeyId = await createJourney(page);
    await page.goto(`${front}/pages/action/index?journeyId=${journeyId}`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('action-request-plan').click();
    await page.getByTestId('action-accept-plan').waitFor({ state: 'visible', timeout: 120_000 });

    const recommendationSnapshots: Array<{ viewport: string; path: string; dimensions: { scrollWidth: number; innerWidth: number; scrollHeight: number } }> = [];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const dimensions = await checkPage(page, ['今晚，只做这一件事', '我愿意试试'], ['[data-testid="primary-action-card"]', '.shortcut-grid']);
      const file = path.join(root, `actual-recommendation-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: file });
      recommendationSnapshots.push({ viewport: `${viewport.width}x${viewport.height}`, path: file, dimensions });
    }

    await page.setViewportSize(viewports[3]);
    await page.getByTestId('action-accept-plan').click();
    await page.getByRole('button', { name: '没做到', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByRole('button', { name: '没做到', exact: true }).click();
    await page.getByTestId('adaptive-action-sheet').waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByRole('button', { name: '情绪太强', exact: true }).click();
    await page.getByTestId('adaptive-result').waitFor({ state: 'visible', timeout: 120_000 });

    const adaptiveSnapshots: Array<{ viewport: string; path: string; dimensions: { scrollWidth: number; innerWidth: number; scrollHeight: number } }> = [];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const dimensions = await checkPage(page, ['没做到也没关系', '情绪太强', '试试这个更小一步'], ['.adaptive-paper', '[data-testid="adaptive-accept"]', '.secondary-cta']);
      const file = path.join(root, `actual-adaptive-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: file });
      adaptiveSnapshots.push({ viewport: `${viewport.width}x${viewport.height}`, path: file, dimensions });
    }

    const recommendationComparisons = [];
    const adaptiveComparisons = [];
    for (const snapshot of recommendationSnapshots) {
      const comparison = await compare(path.join(root, 'reference-recommendation.png'), snapshot.path, path.join(root, `side-by-side-recommendation-${snapshot.viewport}.png`), path.join(root, `difference-recommendation-${snapshot.viewport}.png`));
      recommendationComparisons.push({ viewport: snapshot.viewport, ...comparison });
    }
    for (const snapshot of adaptiveSnapshots) {
      const comparison = await compare(path.join(root, 'reference-adaptive.png'), snapshot.path, path.join(root, `side-by-side-adaptive-${snapshot.viewport}.png`), path.join(root, `difference-adaptive-${snapshot.viewport}.png`));
      adaptiveComparisons.push({ viewport: snapshot.viewport, ...comparison });
    }

    const lines = [
      '# Action Reference QA',
      '',
      '当前只验收 #6「今晚，只做这一件事」与 #37「没做到也没关系」。',
      '',
      '## Source',
      '',
      'reference-recommendation.png ← #6；reference-adaptive.png ← #37。',
      '',
      '## Semantic And Layout Assertions',
      '',
      '- 推荐态包含标题、真实推荐行动标题和「我愿意试试」。',
      '- Adaptive 态包含标题、阻碍选项、真实 DAPI 生成的缩小行动和「试试这个更小一步」。',
      '- 375x812、390x844、393x852、430x932 均无横向溢出。',
      '- 测试页面未出现浏览器回归词、direct-check 或 fixture 文本。',
      '',
      '## Recommendation Comparisons',
      '',
      '| viewport | actual | side-by-side | difference | mismatch ratio | scroll height |',
      '| --- | --- | --- | --- | ---: | ---: |',
      ...recommendationComparisons.map((item) => `| ${item.viewport} | actual-recommendation-${item.viewport}.png | side-by-side-recommendation-${item.viewport}.png | difference-recommendation-${item.viewport}.png | ${item.mismatchRatio} | ${recommendationSnapshots.find((row) => row.viewport === item.viewport)?.dimensions.scrollHeight} |`),
      '',
      '## Adaptive Comparisons',
      '',
      '| viewport | actual | side-by-side | difference | mismatch ratio | scroll height |',
      '| --- | --- | --- | --- | ---: | ---: |',
      ...adaptiveComparisons.map((item) => `| ${item.viewport} | actual-adaptive-${item.viewport}.png | side-by-side-adaptive-${item.viewport}.png | difference-adaptive-${item.viewport}.png | ${item.mismatchRatio} | ${adaptiveSnapshots.find((row) => row.viewport === item.viewport)?.dimensions.scrollHeight} |`),
      '',
      '## Review',
      '',
      '- 区域顺序：Hero → 主行动纸张 → 跟进条/阻碍选择 → 辅助入口/缩小行动 → 固定导航。',
      '- 主 CTA：推荐态在主纸张末端；Adaptive CTA 在缩小行动卡之后。',
      '- 视觉差异比对仅作区域审查依据，不将像素比例当作业务通过条件。',
      '',
    ];
    await fs.writeFile(reportPath, lines.join('\n'), 'utf8');
  } catch (cause) {
    failure = cause;
  } finally {
    try { await fs.writeFile(path.join(root, 'cleanup.json'), JSON.stringify(await cleanup(false), null, 2), 'utf8'); } catch (cleanupError) { failure = failure ?? cleanupError; }
    await context.close();
    await browser.close();
  }
  if (failure) throw failure;
}

main().catch((error) => { console.error(error); process.exit(1); });
