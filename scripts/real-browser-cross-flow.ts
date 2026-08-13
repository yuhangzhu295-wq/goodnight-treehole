import { chromium, type Page } from 'playwright';
import fs from 'node:fs/promises';
import { cleanRuntime, kill, markdown, startFullStack, urls } from './real-browser-utils';

async function apiJson(path: string, init?: RequestInit) {
  const res = await fetch(`${urls.api}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} => ${res.status}`);
  return res.json();
}

async function loginAdmin(page: Page) {
  await page.goto(`${urls.admin}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('admin-login-username').fill('admin');
  await page.getByTestId('admin-login-password').fill('admin123');
  await page.getByTestId('admin-login-submit').click();
  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

async function main() {
  await fs.mkdir('artifacts/test-report', { recursive: true });
  await fs.mkdir('artifacts/screenshots/real-user/front', { recursive: true });
  await fs.mkdir('artifacts/screenshots/real-user/admin', { recursive: true });
  await fs.mkdir('artifacts/traces', { recursive: true });
  await cleanRuntime();
  const procs = await startFullStack();
  const rows: Array<{ name: string; ok: boolean; evidence?: string; error?: string }> = [];
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext({ locale: 'zh-CN' });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const front = await context.newPage();
    await front.setViewportSize({ width: 430, height: 764 });
    const admin = await context.newPage();
    await admin.setViewportSize({ width: 1448, height: 1086 });
    await loginAdmin(admin);

    async function check(name: string, fn: () => Promise<string>) {
      try {
        rows.push({ name, ok: true, evidence: await fn() });
      } catch (error: any) {
        rows.push({ name, ok: false, error: error?.message ?? String(error) });
      }
      const report = markdown('Real Browser Cross Flow', rows);
      await fs.writeFile('artifacts/test-report/real-browser-cross-flow.md', report);
      await fs.writeFile('artifacts/test-report/real-user-cross-flow.md', report);
    }

    await check('公开树洞发布 -> 后台审核 -> 前台广场可见', async () => {
      const content = `跨端公开树洞 ${Date.now()}`;
      await front.goto(`${urls.front}/pages/mood/create`, { waitUntil: 'domcontentloaded' });
      await front.getByTestId('input-mood-content').fill(content);
      await front.getByTestId('mood-visibility-public').click();
      await front.getByTestId('btn-submit-mood').click();
      await front.waitForURL('**/pages/post/detail**', { timeout: 10000 });
      const adminPosts = await apiJson('/api/admin/v1/posts');
      const post = adminPosts.items.find((item: any) => item.content === content);
      if (!post) throw new Error('后台没有看到前台发布的树洞');
      await admin.goto(`${urls.admin}/posts`, { waitUntil: 'domcontentloaded' });
      await admin.getByTestId('admin-post-search').fill(content);
      await admin.getByTestId('posts-row-first').waitFor({ state: 'visible', timeout: 10000 });
      await admin.getByTestId('posts-row-first').click();
      await admin.getByTestId('admin-post-approve').click();
      const publicPosts = await apiJson('/api/v1/posts');
      if (!publicPosts.items.some((item: any) => item.id === post.id || item.content === content)) throw new Error('审核后前台广场 API 不可见');
      await front.goto(`${urls.front}/pages/square/index`, { waitUntil: 'domcontentloaded' });
      await front.screenshot({ path: 'artifacts/screenshots/real-user/front/cross-square.png', fullPage: true });
      await admin.screenshot({ path: 'artifacts/screenshots/real-user/admin/cross-posts.png', fullPage: true });
      return `post=${post.id}`;
    });

    await check('详情回应发布 -> 后台审核 -> 前台详情回应可见', async () => {
      const content = `跨端回应 ${Date.now()}`;
      await front.goto(`${urls.front}/pages/post/detail?id=post_1&sheet=reply`, { waitUntil: 'domcontentloaded' });
      await front.getByTestId('input-reply-content').fill(content);
      await front.getByTestId('btn-submit-reply').click();
      const adminReplies = await apiJson('/api/admin/v1/replies');
      const reply = adminReplies.items.find((item: any) => item.content === content);
      if (!reply) throw new Error('后台没有看到前台回应');
      await admin.goto(`${urls.admin}/replies/moderation`, { waitUntil: 'domcontentloaded' });
      await admin.getByTestId('admin-reply-search').fill(content);
      await admin.getByTestId('replies-row-first').waitFor({ state: 'visible', timeout: 10000 });
      await admin.getByTestId('replies-row-first').click();
      await admin.getByTestId('admin-reply-approve').click();
      const publicReplies = await apiJson('/api/v1/posts/post_1/replies');
      if (!publicReplies.items.some((item: any) => item.id === reply.id || item.content === content)) throw new Error('审核后前台详情回应不可见');
      return `reply=${reply.id}`;
    });

    await check('前台反馈 -> 后台解决 -> 前台反馈状态 API 可见', async () => {
      const content = `跨端反馈 ${Date.now()}`;
      await front.goto(`${urls.front}/pages/help/feedback`, { waitUntil: 'domcontentloaded' });
      await front.getByTestId('input-feedback-content').fill(content);
      await front.getByTestId('btn-feedback-submit').click();
      const tickets = await apiJson('/api/admin/v1/feedback/tickets');
      const ticket = tickets.items.find((item: any) => item.content === content);
      if (!ticket) throw new Error('后台没有看到前台反馈');
      await admin.goto(`${urls.admin}/ops/feedback`, { waitUntil: 'domcontentloaded' });
      await admin.getByTestId('admin-feedback-search').fill(content);
      await admin.getByTestId('tickets-row-first').waitFor({ state: 'visible', timeout: 10000 });
      await admin.getByTestId('tickets-row-first').click();
      await admin.getByPlaceholder('请输入回复内容...').fill('已收到这条反馈，我们已经完成核查。');
      const replyResponse = admin.waitForResponse((response) => response.url().includes(`/api/admin/v1/feedback/${ticket.id}/reply`) && response.request().method() === 'POST');
      await admin.getByTestId('admin-ticket-reply').click();
      if (!(await replyResponse).ok()) throw new Error('后台回复反馈接口失败');
      const resolveResponse = admin.waitForResponse((response) => response.url().includes(`/api/admin/v1/feedback/${ticket.id}/status`) && response.request().method() === 'PATCH');
      await admin.getByTestId('admin-ticket-resolve').click();
      if (!(await resolveResponse).ok()) throw new Error('后台解决反馈接口失败');
      const frontTickets = await apiJson('/api/v1/feedback');
      const synced = frontTickets.items.find((item: any) => item.id === ticket.id);
      if (!synced || synced.status !== 'resolved') throw new Error('前台反馈状态 API 未同步 resolved');
      return `ticket=${ticket.id};status=${synced.status}`;
    });

    await context.tracing.stop({ path: 'artifacts/traces/real-user-cross-flow-trace.zip' });
    await context.close();
    const failed = rows.filter((row) => !row.ok);
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
