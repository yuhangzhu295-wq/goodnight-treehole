import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from 'playwright';

type PageCase = {
  key: string;
  route: string;
  reference: string;
  hero: string;
  main: string;
  primarySelector: string;
  tabbar: boolean;
  minSections: number;
  mainTopAllowance?: number;
};

type Geometry = {
  viewport: string;
  heroHeight: number;
  mainTop: number;
  mainWidth: number;
  primaryY: number;
  tabbarY: number | null;
  scrollHeight: number;
  primarySections: number;
};

const front = String(process.env.FRONT_BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const referenceRoot = 'C:/Users/zyu33/Desktop/图片素材88/晚安树洞_UI_01-41_业务说明';
const outputRoot = path.resolve('artifacts', 'reference-qa', 'first-stage-shells');
const viewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
];
const pages: PageCase[] = [
  { key: 'tonight', route: '/pages/tonight/index', reference: '01_今晚怎么了.png', hero: '.night-hero', main: '.entry-card', primarySelector: '.continue-button', tabbar: true, minSections: 4 },
  { key: 'safety', route: '/pages/safety/index', reference: '33_SafetyFlow_正式版.png', hero: '.safety-hero', main: '.safety-copy', primarySelector: '[data-testid="safety-handoff"]', tabbar: true, minSections: 3 },
  { key: 'handoff', route: '/pages/reality-handoff/index', reference: '16_现实求助卡.png', hero: '.handoff-hero', main: '.handoff-card', primarySelector: '[data-testid="handoff-save"]', tabbar: true, minSections: 3 },
  { key: 'notifications', route: '/pages/notifications/index', reference: '39_提醒与回访.png', hero: '.notification-hero', main: '.notice-list', primarySelector: '.notice-card', tabbar: true, minSections: 2, mainTopAllowance: 130 },
];

function finite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label} is not finite`);
  return Math.round(value * 10) / 10;
}

async function measure(page: Page, item: PageCase, viewport: { width: number; height: number }): Promise<Geometry> {
  const readBox = async (selector: string) => page.locator(selector).first().evaluate(function (element) {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, width: rect.width, height: rect.height };
  });
  const hero = await readBox(item.hero);
  const main = await readBox(item.main);
  const primary = await readBox(item.primarySelector);
  const tabbarLocator = page.locator('.tabbar');
  const tabbar = await tabbarLocator.count() ? await readBox('.tabbar') : null;
  const shell = await page.locator('html').evaluate(function (element) {
    return {
      overflow: element.scrollWidth > window.innerWidth,
      scrollHeight: element.scrollHeight,
      primarySections: document.querySelectorAll('section, article, .safety-actions, .notice-list, .choice-grid').length,
    };
  });
  const geometry = {
    viewport: `${viewport.width}x${viewport.height}`,
    heroHeight: hero.height,
    mainTop: main.top,
    mainWidth: main.width,
    primaryY: primary.top,
    tabbarY: tabbar?.top ?? null,
    scrollHeight: shell.scrollHeight,
    primarySections: shell.primarySections,
    overflow: shell.overflow,
    tabbarHeight: tabbar?.height ?? null,
  };

  if (geometry.overflow) throw new Error(`${item.key} ${geometry.viewport} has horizontal overflow`);
  if (geometry.heroHeight < 120 || geometry.heroHeight > 245) throw new Error(`${item.key} ${geometry.viewport} hero height ${geometry.heroHeight} is outside the mobile scene contract`);
  if (geometry.mainTop > geometry.heroHeight + (item.mainTopAllowance ?? 56)) throw new Error(`${item.key} ${geometry.viewport} main content detached from hero`);
  if (geometry.mainWidth < viewport.width - 48) throw new Error(`${item.key} ${geometry.viewport} main content is unexpectedly narrow`);
  if (geometry.primarySections < item.minSections) throw new Error(`${item.key} ${geometry.viewport} lost primary sections`);
  if (item.tabbar && (geometry.tabbarY == null || geometry.tabbarHeight == null || geometry.tabbarHeight < 62 || geometry.tabbarHeight > 66)) {
    throw new Error(`${item.key} ${geometry.viewport} tabbar contract failed`);
  }
  if (!item.tabbar && geometry.tabbarY != null) throw new Error(`${item.key} ${geometry.viewport} unexpectedly renders the global tabbar`);

  return {
    viewport: geometry.viewport,
    heroHeight: finite(geometry.heroHeight, 'heroHeight'),
    mainTop: finite(geometry.mainTop, 'mainTop'),
    mainWidth: finite(geometry.mainWidth, 'mainWidth'),
    primaryY: finite(geometry.primaryY, 'primaryY'),
    tabbarY: geometry.tabbarY == null ? null : finite(geometry.tabbarY, 'tabbarY'),
    scrollHeight: finite(geometry.scrollHeight, 'scrollHeight'),
    primarySections: geometry.primarySections,
  };
}

async function main() {
  await fs.mkdir(outputRoot, { recursive: true });
  const browser = await chromium.launch();
  const rows: Array<{ page: string; reference: string; rows: Geometry[] }> = [];
  try {
    for (const item of pages) {
      await fs.copyFile(path.join(referenceRoot, item.reference), path.join(outputRoot, `reference-${item.key}.png`));
      const pageRows: Geometry[] = [];
      for (const viewport of viewports) {
        const context = await browser.newContext({ viewport, locale: 'zh-CN' });
        const page = await context.newPage();
        await page.goto(`${front}${item.route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector(item.primarySelector, { state: 'visible', timeout: 15_000 });
        pageRows.push(await measure(page, item, viewport));
        await page.screenshot({ path: path.join(outputRoot, `actual-${item.key}-${viewport.width}x${viewport.height}.png`), fullPage: true });
        await context.close();
      }
      rows.push({ page: item.key, reference: item.reference, rows: pageRows });
    }
  } finally {
    await browser.close();
  }

  const report = [
    '# First-stage shell reference QA',
    '',
    'The reference and actual images are retained at their native dimensions. This audit does not resize actual screenshots or use a pixelmatch-only pass condition.',
    '',
    ...rows.flatMap(({ page, reference, rows: geometryRows }) => [
      `## ${page}`, '', `Reference: ${reference}`, '',
      '| Viewport | Hero height | Main top | Main width | Primary CTA y | Tabbar y | Scroll height | Primary sections |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...geometryRows.map((row) => `| ${row.viewport} | ${row.heroHeight} | ${row.mainTop} | ${row.mainWidth} | ${row.primaryY} | ${row.tabbarY ?? 'N/A'} | ${row.scrollHeight} | ${row.primarySections} |`),
      '',
    ]),
  ].join('\n');
  await fs.writeFile(path.resolve('docs', 'first-stage-shell-reference-qa.md'), `${report}\n`, 'utf8');
}

main().catch((error) => { console.error(error); process.exit(1); });
