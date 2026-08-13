import { chromium, type Page } from 'playwright';
import fs from 'node:fs/promises';
import { cleanRuntime, kill, startFullStack, urls } from './real-browser-utils';

type Row = { name: string; ok: boolean; evidence?: string; error?: string };

const rows: Row[] = [];
const screenshotDir = 'artifacts/screenshots/problem02';
const reportPath = 'artifacts/test-report/problem02-ai-dynamic-report.md';

function add(name: string, ok: boolean, evidence?: unknown, error?: unknown) {
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
  const failed = rows.filter((row) => !row.ok);
  await fs.writeFile(
    reportPath,
    [
      '# Problem 02 AI Dynamic Report',
      '',
      `Total: ${rows.length}`,
      `Passed: ${rows.length - failed.length}`,
      `Failed: ${failed.length}`,
      '',
      '| Result | Check | Evidence |',
      '| --- | --- | --- |',
      ...rows.map((row) => `| ${row.ok ? 'PASS' : 'FAIL'} | ${row.name} | ${(row.ok ? row.evidence : row.error)?.replaceAll('|', '\\|') ?? ''} |`),
      '',
      `截图目录：${screenshotDir}`,
      'Trace：artifacts/traces/problem02-ai-dynamic.zip',
      failed.length ? '结论：AI 动态生成仍存在失败项。' : '结论：输入不同、风格不同均得到不同 AI 结果，AI jobs 已写入后台记录。',
      '',
    ].join('\n'),
    'utf8',
  );
}

async function apiJson(path: string, init?: RequestInit) {
  const response = await fetch(`${urls.api}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path} => ${response.status}`);
  return response.json();
}

function containsAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

async function decompose(page: Page, content: string) {
  await page.getByTestId('input-decompose').fill(content);
  const wait = page.waitForResponse((res) => res.url().includes('/api/v1/tools/emotion-decompose') && res.request().method() === 'POST', { timeout: 10000 });
  await page.getByTestId('btn-decompose-run').click();
  const response = await wait;
  await page.getByTestId('decompose-result-card').waitFor({ state: 'visible', timeout: 10000 });
  const text = await page.getByTestId('decompose-result-card').innerText();
  return { status: response.status(), text };
}

async function letterText(page: Page) {
  return page.locator('.letter-content').innerText({ timeout: 10000 });
}

async function main() {
  await fs.mkdir(screenshotDir, { recursive: true });
  await fs.mkdir('artifacts/test-report', { recursive: true });
  await fs.mkdir('artifacts/traces', { recursive: true });
  await cleanRuntime();
  const procs = await startFullStack();
  const browser = await chromium.launch();
  const consoleErrors: string[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 430, height: 764 }, locale: 'zh-CN' });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    const directA = await apiJson('/api/v1/ai/generate', {
      method: 'POST',
      body: JSON.stringify({
        taskType: 'breakdown',
        content: '今天被领导批评了，我明明已经很努力，但还是觉得很委屈。',
        mood: '委屈',
        style: 'rational',
      }),
    });
    const directB = await apiJson('/api/v1/ai/generate', {
      method: 'POST',
      body: JSON.stringify({
        taskType: 'breakdown',
        content: '凌晨两点睡不着，脑子一直转，担心明天状态很差。',
        mood: '失眠',
        style: 'rational',
      }),
    });
    add('POST /api/v1/ai/generate dynamic fallback', directA.result !== directB.result && directA.jobId && directB.jobId, {
      providerA: directA.provider,
      providerB: directB.provider,
      resultA: directA.result,
      resultB: directB.result,
    });

    await page.goto(`${urls.front}/pages/tool/breakdown`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    await screenshot(page, '01-breakdown-before');
    const inputA = '今天被领导批评了，我明明已经很努力，但还是觉得很委屈。';
    const inputB = '凌晨两点睡不着，脑子一直转，担心明天状态很差。';
    const resultA = await decompose(page, inputA);
    await screenshot(page, '02-breakdown-result-a');
    const resultB = await decompose(page, inputB);
    await screenshot(page, '03-breakdown-result-b');
    add('breakdown A/B results are different', resultA.status === 201 && resultB.status === 201 && resultA.text !== resultB.text, {
      a: resultA.text,
      b: resultB.text,
    });
    add('breakdown A keeps criticism/effort/wronged semantics', containsAny(resultA.text, ['批评', '努力', '委屈', '否定', '评价']), resultA.text);
    add('breakdown B keeps insomnia/worry semantics', containsAny(resultB.text, ['睡不着', '失眠', '担心', '凌晨', '明天']), resultB.text);

    await page.goto(`${urls.front}/pages/reply/today`, { waitUntil: 'domcontentloaded' });
    await page.locator('.letter-content').waitFor({ state: 'visible', timeout: 10000 });
    await screenshot(page, '04-letter-before');
    const styleButtons = [
      ['warm', 'btn-letter-warm'],
      ['rational', 'btn-letter-rational'],
      ['light', 'btn-letter-light'],
      ['poetic', 'btn-letter-poetic'],
    ] as const;
    const styleResults: Record<string, string> = {};
    for (const [style, testId] of styleButtons) {
      const wait = page.waitForResponse((res) => res.url().includes('/api/v1/ai/generate') && res.request().method() === 'POST', { timeout: 10000 });
      await page.getByTestId(testId).click();
      const response = await wait;
      await page.waitForTimeout(150);
      styleResults[style] = await letterText(page);
      add(`letter style ${style} uses AI generate`, response.status() === 201 && styleResults[style].length > 10, styleResults[style]);
      await screenshot(page, `05-letter-style-${style}`);
    }
    const unique = new Set(Object.values(styleResults));
    add('four letter styles are different', unique.size === 4, styleResults);

    const savedText = styleResults.poetic;
    const saveWait = page.waitForResponse((res) => res.url().includes('/save-to-diary') && res.request().method() === 'POST', { timeout: 10000 });
    await page.getByTestId('btn-letter-save').click();
    await saveWait;
    await page.goto(`${urls.front}/pages/me/diaries`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await screenshot(page, '06-diary-after-save');
    const diaryBody = await page.locator('body').innerText();
    add('save to diary persists generated letter', diaryBody.includes(savedText.slice(0, 14)), diaryBody.slice(0, 300));

    const jobs = await apiJson('/api/admin/v1/ai/jobs');
    const hasBreakdown = jobs.items.some((item: any) => item.jobType === '情绪拆解' || item.jobType === 'breakdown');
    const hasLetter = jobs.items.some((item: any) => item.jobType === '今日回信' || item.contentType === 'Letter');
    add('admin AI jobs include front generation records', hasBreakdown && hasLetter, {
      count: jobs.items.length,
      latest: jobs.items.slice(0, 6).map((item: any) => ({ id: item.id, jobType: item.jobType, style: item.style, providerId: item.providerId })),
    });
    add('console has no blocking errors', consoleErrors.length === 0, consoleErrors);

    await context.tracing.stop({ path: 'artifacts/traces/problem02-ai-dynamic.zip' });
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
