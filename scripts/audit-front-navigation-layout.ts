import { chromium, type Page } from 'playwright';
import fs from 'node:fs/promises';
import { cleanRuntime, kill, startFrontStack, urls } from './real-browser-utils';

type Row = {
  page: string;
  action: string;
  route: string;
  result: 'PASS' | 'FAIL';
  evidence: string;
};

const rows: Row[] = [];

async function screenshot(page: Page, name: string) {
  await fs.mkdir('artifacts/screenshots/navigation-audit', { recursive: true });
  await page.screenshot({ path: `artifacts/screenshots/navigation-audit/${name}.png`, fullPage: true });
}

function add(page: string, action: string, route: string, ok: boolean, evidence: string) {
  rows.push({ page, action, route, result: ok ? 'PASS' : 'FAIL', evidence });
}

async function pageHealth(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector('.phone-shell') as HTMLElement | null;
    const tabbar = document.querySelector('.tabbar') as HTMLElement | null;
    const pageRoot = document.querySelector('.goodnight-page') as HTMLElement | null;
    const shellRect = shell?.getBoundingClientRect();
    const tabRect = tabbar?.getBoundingClientRect();
    const paddingBottom = pageRoot ? parseFloat(getComputedStyle(pageRoot).paddingBottom) : 0;
    return {
      url: location.pathname + location.search,
      hasError: document.body.innerText.includes('ERR_CONNECTION_REFUSED') || document.body.innerText.includes('无法访问此站点'),
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      shellWidth: shellRect ? Math.round(shellRect.width) : 0,
      tabbarTop: tabRect ? Math.round(tabRect.top) : null,
      paddingBottom,
      visibleEnglishArtifacts: ['Rewrite', 'Rant', 'Heal', 'Sleep', 'Work', 'Future', 'Poster', 'Save', 'Clear data'].filter((word) =>
        document.body.innerText.includes(word),
      ),
    };
  });
}

async function auditCurrent(page: Page, label: string, expectedRoute: string, shot: string) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(350);
  const health = await pageHealth(page);
  await screenshot(page, shot);
  const ok =
    !health.hasError &&
    health.overflow <= 2 &&
    health.shellWidth > 0 &&
    health.visibleEnglishArtifacts.length === 0 &&
    (!documentHasTabbar(expectedRoute) || health.paddingBottom >= 120);
  add(label, '页面健康检查', health.url, ok, JSON.stringify(health));
}

function documentHasTabbar(route: string) {
  return [
    '/pages/square/index',
    '/pages/letter/index',
    '/pages/letter/today',
    '/pages/reply/today',
    '/pages/tool/index',
    '/pages/me/index',
    '/pages/diary/index',
    '/pages/me/diaries',
    '/pages/report/month',
    '/pages/me/month-report',
    '/pages/letter/list',
    '/pages/favorite/index',
    '/pages/settings/privacy',
    '/pages/help/feedback',
  ].some((item) => route.startsWith(item));
}

async function auditSquareFilterRegression(page: Page, viewportName: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(`${urls.front}/pages/square/index`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  const filterIds = ['filter-weiqu', 'filter-jiaolv', 'filter-shimian', 'filter-lianai', 'filter-gongzuo', 'filter-all'];
  for (const id of filterIds) {
    const responsePromise = id === 'filter-all'
      ? page.waitForResponse((res) => res.url().includes('/api/v1/posts') && !res.url().includes('mood='), { timeout: 8000 }).catch(() => null)
      : page.waitForResponse((res) => res.url().includes('/api/v1/posts?mood='), { timeout: 8000 }).catch(() => null);
    await page.getByTestId(id).click();
    await responsePromise;
    await page.waitForTimeout(250);
  }

  await page.getByTestId('filter-gongzuo').click();
  await page.waitForTimeout(500);
  const data = await page.evaluate(() => {
    const row = document.querySelector('.square-page .mood-filter-row') as HTMLElement | null;
    const rowRect = row?.getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll('.square-page .mood-pill')).map((item) => {
      const el = item as HTMLElement;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        text: el.innerText.replace(/\s+/g, ' ').trim(),
        active: el.classList.contains('active'),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        minHeight: style.minHeight,
        maxHeight: style.maxHeight,
        alignSelf: style.alignSelf,
        writingMode: style.writingMode,
      };
    });
    return {
      row: rowRect ? { width: Math.round(rowRect.width), height: Math.round(rowRect.height) } : null,
      buttons,
      emptyVisible: !!document.querySelector('.empty-card'),
      hasWorkCard: document.body.innerText.includes('工作消息一直弹出来') || document.body.innerText.includes('工作'),
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    };
  });

  const badButtons = data.buttons.filter((button) => button.height > 52 || button.width > 140 || button.writingMode !== 'horizontal-tb');
  const ok = !!data.row && data.row.height <= 68 && badButtons.length === 0 && !data.emptyVisible && data.overflow <= 2;
  await screenshot(page, `square-filter-${viewportName}`);
  add('01-广场', `分类按钮尺寸回归 ${viewportName}`, '/pages/square/index', ok, JSON.stringify(data));
}

async function clickAndAudit(page: Page, from: string, testId: string, expectedUrlPart: string, label: string, shot: string) {
  await page.goto(`${urls.front}${from}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await page.getByTestId(testId).click();
  await page.waitForTimeout(500);
  const okUrl = page.url().includes(expectedUrlPart);
  const health = await pageHealth(page);
  await screenshot(page, shot);
  add(label, `点击 ${testId}`, health.url, okUrl && !health.hasError && health.overflow <= 2, JSON.stringify({ expectedUrlPart, okUrl, health }));
}

async function directAudit(page: Page, route: string, label: string, shot: string) {
  await page.goto(`${urls.front}${route}`, { waitUntil: 'domcontentloaded' });
  await auditCurrent(page, label, route, shot);
}

async function main() {
  await cleanRuntime();
  const procs = await startFrontStack();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 764 }, locale: 'zh-CN' });

  try {
    await auditSquareFilterRegression(page, '430', 430, 764);
    await auditSquareFilterRegression(page, '710', 710, 1400);

    await clickAndAudit(page, '/pages/square/index', 'tab-letter', '/pages/letter/index', '05-今日回信', 'jump-letter');
    await clickAndAudit(page, '/pages/square/index', 'tab-tool', '/pages/tool/index', '06-情绪工具', 'jump-tool');
    await clickAndAudit(page, '/pages/square/index', 'tab-me', '/pages/me/index', '08-我的', 'jump-me');
    await clickAndAudit(page, '/pages/square/index', 'btn-write-mood', '/pages/post/create', '02-写下心情', 'jump-mood-create');
    await clickAndAudit(page, '/pages/square/index', 'post-card-first', '/pages/post/detail', '03-树洞详情', 'jump-post-detail');
    await clickAndAudit(page, '/pages/post/detail?id=post_1', 'btn-open-reply', 'sheet=reply', '04-回复抽屉', 'jump-reply-sheet');

    await clickAndAudit(page, '/pages/tool/index', 'tool-decompose', '/pages/tool/breakdown', '07-情绪拆解', 'jump-tool-decompose');
    await clickAndAudit(page, '/pages/tool/index', 'tool-rewrite', '/pages/tool/rewrite', '工具-负面改写', 'jump-tool-run');
    await clickAndAudit(page, '/pages/tool/index', 'tool-report', '/pages/me/month-report', '10-情绪月报', 'jump-report-from-tool');

    await clickAndAudit(page, '/pages/me/index', 'entry-diary', '/pages/diary/index', '09-我的日记', 'jump-diary');
    await clickAndAudit(page, '/pages/me/index', 'entry-letter-list', '/pages/letter/list', '11-我的回信', 'jump-letter-list');
    await clickAndAudit(page, '/pages/me/index', 'entry-favorite', '/pages/favorite/index', '12-我的收藏', 'jump-favorite');
    await clickAndAudit(page, '/pages/me/index', 'entry-report', '/pages/me/month-report', '10-情绪月报', 'jump-report-from-me');
    await clickAndAudit(page, '/pages/me/index', 'entry-privacy', '/pages/settings/privacy', '13-隐私设置', 'jump-privacy');
    await clickAndAudit(page, '/pages/me/index', 'entry-feedback', '/pages/help/feedback', '14-帮助与反馈', 'jump-feedback');

    await directAudit(page, '/pages/letter/index', '05-今日回信', 'direct-letter');
    await directAudit(page, '/pages/tool/index', '06-情绪工具', 'direct-tool');
    await directAudit(page, '/pages/me/index', '08-我的', 'direct-me');

    const failed = rows.filter((row) => row.result === 'FAIL');
    await fs.mkdir('docs', { recursive: true });
    await fs.writeFile(
      'docs/front-navigation-layout-audit-2026-07-09.md',
      [
        '# 前台跳转页面与布局审查报告',
        '',
        `总数：${rows.length}`,
        `通过：${rows.length - failed.length}`,
        `失败：${failed.length}`,
        '',
        '| Result | Page | Action | Route | Evidence |',
        '| --- | --- | --- | --- | --- |',
        ...rows.map((row) => `| ${row.result} | ${row.page} | ${row.action} | ${row.route} | ${row.evidence.replaceAll('|', '\\|')} |`),
        '',
        failed.length
          ? `不合理处：${failed.map((row) => `${row.page}/${row.action}`).join('；')}`
          : '不合理处：本轮自动审查未发现阻塞项；分类按钮未再出现竖向放大，跳转页无横向溢出或错误页。',
        '',
        '截图目录：`artifacts/screenshots/navigation-audit/`',
        '',
      ].join('\n'),
      'utf8',
    );

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
