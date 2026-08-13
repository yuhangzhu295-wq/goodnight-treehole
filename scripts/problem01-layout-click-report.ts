import { chromium, type Page } from 'playwright';
import fs from 'node:fs/promises';
import { cleanRuntime, ensureNoVisibleTestWords, kill, startFullStack, urls } from './real-browser-utils';

type Row = {
  name: string;
  ok: boolean;
  evidence?: string;
  error?: string;
};

const rows: Row[] = [];
const screenshotDir = 'artifacts/screenshots/problem01';
const reportPath = 'artifacts/test-report/problem01-layout-click-report.md';

function add(name: string, ok: boolean, evidence: unknown, error?: unknown) {
  rows.push({
    name,
    ok,
    evidence: typeof evidence === 'string' ? evidence : JSON.stringify(evidence),
    error: error instanceof Error ? error.message : error ? String(error) : undefined,
  });
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: true });
}

async function writeReport() {
  await fs.mkdir('artifacts/test-report', { recursive: true });
  const failed = rows.filter((row) => !row.ok);
  await fs.writeFile(
    reportPath,
    [
      '# Problem 01 Layout Click Report',
      '',
      `Total: ${rows.length}`,
      `Passed: ${rows.length - failed.length}`,
      `Failed: ${failed.length}`,
      '',
      '| Result | Check | Evidence |',
      '| --- | --- | --- |',
      ...rows.map((row) => `| ${row.ok ? 'PASS' : 'FAIL'} | ${row.name} | ${(row.ok ? row.evidence : row.error ?? row.evidence)?.replaceAll('|', '\\|') ?? ''} |`),
      '',
      `截图目录：${screenshotDir}`,
      failed.length
        ? '结论：仍存在阻塞项，需继续自动修复。'
        : '结论：广场分类真实点击后布局稳定，筛选按钮保持横向胶囊，卡片/空状态/悬浮按钮/底部导航未跑版。',
      '',
    ].join('\n'),
    'utf8',
  );
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    };
    const buttons = Array.from(document.querySelectorAll('.square-page .mood-pill')).map((item) => {
      const el = item as HTMLElement;
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const centerX = box.left + box.width / 2;
      const centerY = box.top + box.height / 2;
      const visibleInViewport = centerX >= 0 && centerX <= window.innerWidth && centerY >= 0 && centerY <= window.innerHeight;
      const hit = visibleInViewport ? (document.elementFromPoint(centerX, centerY) as HTMLElement | null) : null;
      const clickable = !visibleInViewport || hit?.closest('button,a') === el;
      return {
        text: el.innerText.replace(/\s+/g, ' ').trim(),
        active: el.classList.contains('active'),
        width: Math.round(box.width),
        height: Math.round(box.height),
        top: Math.round(box.top),
        writingMode: style.writingMode,
        display: style.display,
        outline: style.outline,
        visibleInViewport,
        hitTag: hit?.tagName,
        hitClass: hit?.className?.toString() ?? '',
        clickable,
      };
    });
    const hero = rect('.square-hero');
    const row = rect('.mood-filter-row');
    const card = rect('.treehole-card, .square-empty-card, .empty-card');
    const fab = rect('.write-fab');
    const tabbar = rect('.tabbar');
    const bodyText = document.body.innerText;
    return {
      url: location.pathname + location.search,
      scrollY: Math.round(window.scrollY),
      overflowX: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      hero,
      row,
      card,
      fab,
      tabbar,
      rowGapFromHero: hero && row ? Math.round(row.top - hero.bottom) : null,
      cardGapFromRow: row && card ? Math.round(card.top - row.bottom) : null,
      fabGapFromTabbar: fab && tabbar ? Math.round(tabbar.top - fab.bottom) : null,
      emptyVisible: !!document.querySelector('.square-empty-card, .empty-card'),
      emptyHasWriteButton: !!document.querySelector('[data-testid="btn-empty-write-mood"]'),
      buttons,
      visibleEnglishArtifacts: ['Rewrite', 'Rant', 'Heal', 'Sleep', 'Work', 'Future', 'Poster', 'Save', 'Clear data', 'Live backend sync ok'].filter((word) =>
        bodyText.includes(word),
      ),
      forbiddenLayers: Array.from(document.querySelectorAll('[class*="hotspot"], [class*="proxy"], [class*="test-layer"], [class*="debug-layer"], [class*="ref-shell"], [class*="overlay"]')).map(
        (el) => (el as HTMLElement).className,
      ),
    };
  });
}

function validateLayout(data: Awaited<ReturnType<typeof measure>>) {
  const badButtons = data.buttons.filter((button) => button.height > 52 || button.width > 142 || button.writingMode !== 'horizontal-tb' || !button.clickable);
  const cardReasonable = !!data.card && data.card.top <= 320 && data.card.height >= 120;
  return {
    ok:
      data.overflowX <= 2 &&
      data.visibleEnglishArtifacts.length === 0 &&
      data.forbiddenLayers.length === 0 &&
      !!data.hero &&
      !!data.row &&
      data.row.height <= 68 &&
      (data.rowGapFromHero ?? 999) <= 24 &&
      (data.cardGapFromRow ?? 999) <= 38 &&
      cardReasonable &&
      !!data.fab &&
      !!data.tabbar &&
      (data.fabGapFromTabbar ?? 0) >= 40 &&
      badButtons.length === 0 &&
      (!data.emptyVisible || data.emptyHasWriteButton),
    badButtons,
    cardReasonable,
  };
}

async function clickFilter(page: Page, testId: string) {
  const wait = testId === 'filter-all'
    ? page.waitForResponse((res) => res.url().includes('/api/v1/posts') && res.request().method() === 'GET', { timeout: 10000 })
    : page.waitForResponse((res) => res.url().includes('/api/v1/posts?mood=') && res.request().method() === 'GET', { timeout: 10000 });
  await page.getByTestId(testId).click();
  const response = await wait;
  await page.waitForTimeout(250);
  return response.status();
}

async function main() {
  await fs.mkdir(screenshotDir, { recursive: true });
  await cleanRuntime();
  const procs = await startFullStack();
  const browser = await chromium.launch();
  const consoleErrors: string[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 430, height: 764 }, locale: 'zh-CN' });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    await page.addInitScript('window.__name = (fn) => fn;');
    await page.evaluate('window.__name = (fn) => fn;');
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.goto(`${urls.front}/pages/square/index`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    await ensureNoVisibleTestWords(page);
    await screenshot(page, 'before');
    const before = await measure(page);
    add('before initial layout', validateLayout(before).ok, before);

    const filters = [
      ['全部', 'filter-all'],
      ['委屈', 'filter-weiqu'],
      ['焦虑', 'filter-jiaolv'],
      ['失眠', 'filter-shimian'],
      ['恋爱', 'filter-lianai'],
      ['工作', 'filter-gongzuo'],
      ['全部恢复', 'filter-all'],
    ] as const;
    for (const [label, testId] of filters) {
      try {
        const status = await clickFilter(page, testId);
        await screenshot(page, `filter-${testId}`);
        const data = await measure(page);
        const validation = validateLayout(data);
        add(`click ${label}`, validation.ok && status === 200, { status, ...data, badButtons: validation.badButtons });
      } catch (error) {
        add(`click ${label}`, false, '', error);
      }
    }

    add('console has no blocking errors', consoleErrors.length === 0, consoleErrors);
    await context.tracing.stop({ path: 'artifacts/traces/problem01-layout.zip' });
    await context.close();
  } finally {
    await browser.close();
    for (const proc of procs) kill(proc);
    await writeReport();
  }
  if (rows.some((row) => !row.ok)) process.exit(1);
}

main().catch(async (error) => {
  add('script fatal error', false, '', error);
  await writeReport();
  console.error(error);
  process.exit(1);
});
