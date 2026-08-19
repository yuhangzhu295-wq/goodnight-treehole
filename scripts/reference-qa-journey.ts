import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { PNG } from 'pngjs';

const front = String(process.env.FRONT_BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const api = String(process.env.API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const root = path.resolve('artifacts', 'reference-qa', 'journey');
const reportPath = path.resolve('docs', 'journey-reference-qa-report.md');
const viewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
];
const references = {
  confirm: 'C:\\Users\\zyu33\\Desktop\\图片素材88\\晚安树洞_UI_01-41_业务说明\\36_经历指纹确认_正式版.png',
  temperature: 'C:\\Users\\zyu33\\Desktop\\图片素材88\\晚安树洞_UI_01-41_业务说明\\29_情绪温度计.png',
  intent: 'C:\\Users\\zyu33\\Desktop\\图片素材88\\晚安树洞_UI_01-41_业务说明\\13_你现在最需要什么.png',
  stabilize: 'C:\\Users\\zyu33\\Desktop\\图片素材88\\晚安树洞_UI_01-41_业务说明\\32_我先接住你.png',
  timeline: 'C:\\Users\\zyu33\\Desktop\\图片素材88\\晚安树洞_UI_01-41_业务说明\\34_Journey时间线_正式版.png',
};
const tabbarByState = {
  confirm: true,
  temperature: true,
  intent: true,
  stabilize: true,
  timeline: false,
} as const;
const fixture = { journeyIds: [] as string[] };

type Geometry = {
  viewport: string;
  heroHeight: number;
  mainTop: number;
  mainWidth: number;
  ctaY: number;
  tabbarY: number | null;
  scrollHeight: number;
  primarySectionCount: number;
};

async function json<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${url}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${url}: ${response.status} ${String((body as { message?: string }).message ?? '')}`.trim());
  return body as T;
}

async function cleanup(legacy = false) {
  return await json('/api/v1/testing/cleanup-browser-fixtures', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goodnight-test-cleanup': 'first-batch-browser' },
    body: JSON.stringify({ journeyIds: fixture.journeyIds, legacy }),
  });
}

async function referenceDimensions(file: string) {
  const image = PNG.sync.read(await fs.readFile(file));
  return `${image.width}x${image.height}`;
}

async function capture(page: Page, state: keyof typeof references, expected: string[], primarySelector: string, minSections: number): Promise<Geometry[]> {
  const results: Geometry[] = [];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(80);
    const metrics = await page.evaluate(({ expectedText, selector, requiredSections, expectedTabbar }) => {
      const bodyText = document.body.innerText;
      const banned = /(domain|stage|clarifying|planning|stabilizing|safety_first|user_confirmed|confidence)/i;
      if (banned.test(bodyText)) throw new Error('Journey screen exposes an internal state');
      for (const value of expectedText) if (!bodyText.includes(value)) throw new Error('Missing visible copy: ' + value);
      if (document.documentElement.scrollWidth > window.innerWidth) throw new Error('Horizontal overflow at ' + window.innerWidth + 'px');
      const heroNode = document.querySelector('.journey-flow-hero');
      const mainNode = document.querySelector('.journey-flow-main');
      const ctaNode = document.querySelector(selector);
      if (!heroNode || !mainNode || !ctaNode) throw new Error('Missing geometry target');
      const hero = heroNode.getBoundingClientRect();
      const main = mainNode.getBoundingClientRect();
      const cta = ctaNode.getBoundingClientRect();
      const sectionCount = document.querySelectorAll('.situation-section, .field-block, .thought-field, .intent-grid button, .support-option, .write-option, .timeline-list article').length;
      const tabbarNode = [...document.querySelectorAll<HTMLElement>('.tabbar')].find((node) => getComputedStyle(node).display !== 'none');
      const tabbar = tabbarNode?.getBoundingClientRect();
      if (hero.bottom < 150 || hero.bottom > 245) throw new Error('Hero height ' + hero.bottom + ' is outside the Journey reference band');
      if (main.top < hero.bottom - 42 || main.top > hero.bottom + 12) throw new Error('Main content top is detached from hero');
      if (main.width < window.innerWidth - 52) throw new Error('Main content width is too narrow');
      if (cta.top < main.top || cta.bottom > document.documentElement.scrollHeight + 1) throw new Error('Primary CTA is outside the document flow');
      if (sectionCount < requiredSections) throw new Error('Expected at least ' + requiredSections + ' primary sections, got ' + sectionCount);
      if (expectedTabbar && !tabbar) throw new Error('Journey state must render the four-tab navigation');
      if (!expectedTabbar && tabbar) throw new Error('Journey timeline must not render the four-tab navigation');
      return { heroHeight: Math.round(hero.bottom), mainTop: Math.round(main.top), mainWidth: Math.round(main.width), ctaY: Math.round(cta.top), tabbarY: tabbar ? Math.round(tabbar.top) : null, scrollHeight: Math.round(document.documentElement.scrollHeight), primarySectionCount: sectionCount };
    }, { expectedText: expected, selector: primarySelector, requiredSections: minSections, expectedTabbar: tabbarByState[state] });
    if (![metrics.heroHeight, metrics.mainTop, metrics.mainWidth, metrics.ctaY, metrics.scrollHeight, metrics.primarySectionCount].every(Number.isFinite)) throw new Error(`Missing geometry metrics for ${state} at ${viewport.width}x${viewport.height}`);
    const file = path.join(root, `actual-${state}-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: file });
    results.push({ viewport: `${viewport.width}x${viewport.height}`, ...metrics });
  }
  return results;
}

async function createJourney(page: Page) {
  await page.goto(`${front}/pages/tonight/index`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('tonight-input').fill('今晚总是想联系对方，心里很乱，也睡不着，想先让自己慢一点。');
  await page.getByTestId('tonight-continue').click();
  await page.waitForURL('**/pages/journey/detail?*', { waitUntil: 'domcontentloaded', timeout: 20_000 });
  const id = String(new URL(page.url()).searchParams.get('id') ?? '');
  if (!id) throw new Error('Journey QA did not receive a Journey id from the real UI flow');
  fixture.journeyIds.push(id);
  await page.getByTestId('fingerprint-accurate').waitFor({ state: 'visible', timeout: 120_000 });
  return id;
}

function table(rows: Geometry[]) {
  return [
    '| viewport | Hero height | main top | main width | CTA y | tabBar y | scroll height | sections |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map((row) => `| ${row.viewport} | ${row.heroHeight} | ${row.mainTop} | ${row.mainWidth} | ${row.ctaY} | ${row.tabbarY ?? 'N/A'} | ${row.scrollHeight} | ${row.primarySectionCount} |`),
  ].join('\n');
}

async function main() {
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await cleanup(true);
  const refSizes = Object.fromEntries(await Promise.all(Object.entries(references).map(async ([key, source]) => {
    await fs.copyFile(source, path.join(root, `reference-${key}.png`));
    return [key, await referenceDimensions(source)];
  })));

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: viewports[1], locale: 'zh-CN' });
  const page = await context.newPage();
  let failure: unknown;
  const evidence: Partial<Record<keyof typeof references, Geometry[]>> = {};

  try {
    const journeyId = await createJourney(page);
    evidence.confirm = await capture(page, 'confirm', ['我理解的是这些，对吗？', '发生了什么', '现在', '影响', '准确'], '[data-testid="fingerprint-accurate"]', 3);

    await page.getByTestId('fingerprint-accurate').click();
    await page.getByTestId('emotion-temperature').waitFor({ state: 'visible', timeout: 15_000 });
    evidence.temperature = await capture(page, 'temperature', ['今晚现在有多难受？', '情绪温度计', '身体感觉', '脑子里最吵的一句', '继续'], '[data-testid="temperature-continue"]', 2);

    await page.getByLabel('情绪难受程度').press('ArrowRight');
    await page.getByRole('button', { name: '胸口闷', exact: true }).click();
    await page.getByPlaceholder('写一句就好，也可以留空。').fill('我希望先把这一晚撑过去。');
    await page.getByTestId('temperature-continue').click();
    await page.getByTestId('support-intent-picker').waitFor({ state: 'visible', timeout: 15_000 });
    evidence.intent = await capture(page, 'intent', ['你现在最需要什么？', '只想有人听我说说', '想知道下一步怎么办', '我现在真的撑得很难'], '[data-testid="intent-next_step"]', 8);

    await page.getByTestId('intent-just_listen').click();
    await page.waitForURL('**mode=stabilize', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.getByTestId('stabilize-panel').waitFor({ state: 'visible', timeout: 15_000 });
    evidence.stabilize = await capture(page, 'stabilize', ['我先接住你', '跟我呼吸30秒', '先把想做的事情放一下', '帮我告诉现实中的一个人'], '[data-testid="stabilize-breath"]', 3);

    await page.getByRole('button', { name: '换一种支持', exact: true }).click();
    await page.getByTestId('support-intent-picker').waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByTestId('intent-next_step').click();
    await page.waitForURL('**/pages/action/index?*', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.getByTestId('action-request-plan').click();
    await page.getByTestId('action-accept-plan').waitFor({ state: 'visible', timeout: 120_000 });
    await page.getByTestId('action-accept-plan').click();
    await page.goto(`${front}/pages/journey/detail?id=${journeyId}`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('journey-timeline').waitFor({ state: 'visible', timeout: 20_000 });
    evidence.timeline = await capture(page, 'timeline', ['后来呢', '今晚定下了一小步', '看看今晚的小行动', '换一种支持'], '.timeline-actions button:first-child', 1);
    await page.getByRole('button', { name: '写下后来呢', exact: true }).click();
    await page.getByPlaceholder('不需要完整，写下一点变化或这一步带来的感觉。').fill('今晚已经比刚才平静一点。');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByText('今晚已经比刚才平静一点。', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });

    const persisted = await json<{ item: { journey: { id: string; currentIntent?: string }; snapshot: { intensity?: number }; updates: Array<{ kind: string }> } }>(`/api/v1/journeys/${journeyId}`);
    if (persisted.item.journey.id !== journeyId || persisted.item.snapshot.intensity === undefined || !persisted.item.updates.some((item) => item.kind === 'commitment_created') || !persisted.item.updates.some((item) => item.kind === 'later')) throw new Error('Journey UI changes did not persist through the API');

    const sections = Object.entries(evidence).flatMap(([state, rows]) => [`## ${state}`, '', `Reference: ${refSizes[state as keyof typeof refSizes]} · artifacts/reference-qa/journey/reference-${state}.png`, '', table(rows ?? []), '']);
    await fs.writeFile(reportPath, [
      '# Journey Reference QA', '',
      '验收范围：#36 经历确认、#29 情绪温度、#13 当前需要、#32 稳定支持、#34 Journey 时间线。', '',
      '## Method', '',
      '- 每张设计参考图均复制到 `artifacts/reference-qa/journey/`，不作为页面背景。',
      '- 截图严格使用 375x812、390x844、393x852、430x932；没有把实际页面拉伸为参考图尺寸。',
      '- 每个视口同时断言 Hero 高度、主区起点和宽度、主 CTA 的 Y 位置、参考图规定的 TabBar 显隐、总滚动高度、主分区数量，以及无横向溢出。',
      '- 业务链路通过真实 UI 创建 Journey、确认、记录温度、选择支持、进入 Action、接受 DAPI 行动、写下后来，再回到真实时间线；末尾从 API 回读强度、`commitment_created` 与 `later` 记录。', '',
      ...sections,
      '## Review', '',
      '- 这五个状态共享同一 Journey ID 与 API 状态机，但每个状态由独立 Screen 组件渲染。',
      '- #36/#29/#13/#32 参考图显示四栏 TabBar；#34 时间线不显示全局 TabBar，因此只有时间线记录为 N/A，底部留白由 Shell 安全区负责。',
      '- 视觉数据用于几何验收，而不是把像素误差当成业务通过依据。', '',
    ].join('\n'), 'utf8');
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
