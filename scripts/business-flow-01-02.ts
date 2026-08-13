import { chromium, type Page } from 'playwright';
import fs from 'node:fs/promises';
import { cleanRuntime, kill, startFullStack, urls } from './real-browser-utils';

type Row = { name: string; ok: boolean; evidence?: string; error?: string };

const rows: Row[] = [];
const screenshotDir = 'artifacts/screenshots/problem02';
const reportPath = 'artifacts/test-report/business-flow-01-02-report.md';

function add(name: string, ok: boolean, evidence?: unknown, error?: unknown) {
  rows.push({
    name,
    ok,
    evidence: typeof evidence === 'string' ? evidence : JSON.stringify(evidence),
    error: error instanceof Error ? error.message : error ? String(error) : undefined,
  });
}

async function writeReport() {
  const failed = rows.filter((row) => !row.ok);
  await fs.writeFile(
    reportPath,
    [
      '# Business Flow 01-02 Report',
      '',
      `Total: ${rows.length}`,
      `Passed: ${rows.length - failed.length}`,
      `Failed: ${failed.length}`,
      '',
      '| Result | Flow | Evidence |',
      '| --- | --- | --- |',
      ...rows.map((row) => `| ${row.ok ? 'PASS' : 'FAIL'} | ${row.name} | ${(row.ok ? row.evidence : row.error)?.replaceAll('|', '\\|') ?? ''} |`),
      '',
      `截图目录：${screenshotDir}`,
      'Trace：artifacts/traces/business-flow-01-02.zip',
      failed.length ? '结论：业务闭环仍有失败项。' : '结论：公开树洞、私密日记、反馈工单、AI job 均完成前后台闭环。',
      '',
    ].join('\n'),
    'utf8',
  );
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: true });
}

async function apiJson(path: string, init?: RequestInit) {
  const response = await fetch(`${urls.api}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path} => ${response.status}`);
  return response.json();
}

async function loginAdminApi() {
  const data = await apiJson('/api/admin/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  return data.token as string;
}

async function loginAdminPage(page: Page) {
  await page.goto(`${urls.admin}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('admin-login-username').fill('admin');
  await page.getByTestId('admin-login-password').fill('admin123');
  await page.getByTestId('admin-login-submit').click();
  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

async function submitMood(page: Page, input: { content: string; emotionTestId: string; public: boolean; rational?: boolean }) {
  await page.goto(`${urls.front}/pages/post/create`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('input-mood-content').fill(input.content);
  await page.getByTestId(input.emotionTestId).click();
  if (input.public) await page.getByTestId('mood-visibility-public').click();
  else await page.getByTestId('mood-visibility-private').click();
  if (input.rational) await page.getByTestId('mood-style-rational').click();
  const wait = page.waitForResponse((res) => res.url().includes('/api/v1/moods') && res.request().method() === 'POST', { timeout: 10000 });
  await page.getByTestId('btn-submit-mood').click();
  const response = await wait;
  await page.waitForTimeout(500);
  return response.status();
}

async function main() {
  await fs.mkdir(screenshotDir, { recursive: true });
  await fs.mkdir('artifacts/test-report', { recursive: true });
  await fs.mkdir('artifacts/traces', { recursive: true });
  await cleanRuntime();
  const procs = await startFullStack();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 430, height: 764 }, locale: 'zh-CN' });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const front = await context.newPage();
    const admin = await context.newPage({ viewport: { width: 1440, height: 1000 } });
    const adminToken = await loginAdminApi();
    await loginAdminPage(admin);

    const publicContent = `业务流工作压力 ${Date.now()}：工作消息一直弹出来，领导又催进度，我想先把节奏找回来。`;
    try {
      const status = await submitMood(front, { content: publicContent, emotionTestId: 'mood-emotion-gongzuo', public: true, rational: true });
      await screenshot(front, '07-flow-a-public-submitted');
      const adminPosts = await apiJson('/api/admin/v1/posts');
      const created = adminPosts.items.find((item: any) => item.content === publicContent);
      if (!created) throw new Error('后台树洞内容页 API 未出现公开 post');
      await admin.goto(`${urls.admin}/posts`, { waitUntil: 'domcontentloaded' });
      await screenshot(admin, '08-flow-a-admin-posts-before-approve');
      await apiJson(`/api/admin/v1/posts/${created.id}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      await front.goto(`${urls.front}/pages/square/index`, { waitUntil: 'domcontentloaded' });
      await front.getByTestId('filter-gongzuo').click();
      await front.waitForTimeout(600);
      await screenshot(front, '09-flow-a-square-work-visible');
      const body = await front.locator('body').innerText();
      const replies = await apiJson(`/api/v1/posts/${created.id}/replies`);
      const aiReply = replies.items.find((item: any) => item.type === 'AI');
      const visible = body.includes(publicContent.slice(0, 12));
      const related = aiReply && /工作|领导|节奏|进度|任务/.test(aiReply.content);
      add('Flow A public post -> admin approve -> square/detail AI reply', status === 201 && visible && related, {
        postId: created.id,
        visible,
        reply: aiReply?.content,
      });
    } catch (error) {
      add('Flow A public post -> admin approve -> square/detail AI reply', false, '', error);
    }

    const privateContent = `业务流私密心情 ${Date.now()}：今晚只想把委屈写下来，不想让广场看到。`;
    try {
      const status = await submitMood(front, { content: privateContent, emotionTestId: 'mood-emotion-weiqu', public: false });
      await screenshot(front, '10-flow-b-private-submitted');
      const [posts, diaries] = await Promise.all([apiJson('/api/v1/posts'), apiJson('/api/v1/diaries')]);
      const notPublic = !posts.items.some((item: any) => item.content === privateContent);
      const diary = diaries.items.find((item: any) => item.content === privateContent);
      await front.goto(`${urls.front}/pages/me/diaries`, { waitUntil: 'domcontentloaded' });
      await screenshot(front, '11-flow-b-diary-visible');
      await front.goto(`${urls.front}/pages/reply/today`, { waitUntil: 'domcontentloaded' });
      await front.getByTestId('btn-letter-warm').click();
      await front.waitForTimeout(500);
      const letterText = await front.locator('.letter-content').innerText();
      await screenshot(front, '12-flow-b-letter-from-private');
      add('Flow B private mood -> diary only -> today letter references recent mood', status === 201 && notPublic && !!diary && /委屈|私密|广场|写下来/.test(letterText), {
        diaryId: diary?.id,
        notPublic,
        letterText,
      });
    } catch (error) {
      add('Flow B private mood -> diary only -> today letter references recent mood', false, '', error);
    }

    const feedbackContent = `业务流反馈 ${Date.now()}：希望分类点击后一直保持稳定。`;
    try {
      await front.goto(`${urls.front}/pages/help/feedback`, { waitUntil: 'domcontentloaded' });
      await front.getByTestId('input-feedback-content').fill(feedbackContent);
      const wait = front.waitForResponse((res) => res.url().includes('/api/v1/feedback') && res.request().method() === 'POST', { timeout: 10000 });
      await front.getByTestId('btn-feedback-submit').click();
      const response = await wait;
      await screenshot(front, '13-flow-c-feedback-submitted');
      await admin.goto(`${urls.admin}/ops/feedback`, { waitUntil: 'domcontentloaded' });
      await screenshot(admin, '14-flow-c-admin-feedback');
      const tickets = await apiJson('/api/admin/v1/feedback/tickets');
      const ticket = tickets.items.find((item: any) => item.content === feedbackContent);
      add('Flow C feedback -> admin ticket', response.status() === 201 && !!ticket, { ticketId: ticket?.id, count: tickets.items.length });
    } catch (error) {
      add('Flow C feedback -> admin ticket', false, '', error);
    }

    const jobs = await apiJson('/api/admin/v1/ai/jobs');
    add('backend AI task log visible', jobs.items.length >= 3, jobs.items.slice(0, 8).map((item: any) => ({ id: item.id, jobType: item.jobType, style: item.style })));

    await context.tracing.stop({ path: 'artifacts/traces/business-flow-01-02.zip' });
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
