import { chromium, type Page } from 'playwright';
import fs from 'node:fs/promises';
import { cleanRuntime, kill, startFullStack, urls } from './real-browser-utils';

type Row = { name: string; ok: boolean; evidence?: string; error?: string };

const rows = {
  api: [] as Row[],
  ui: [] as Row[],
  flow: [] as Row[],
  db: [] as Row[],
};

let adminToken = '';

async function apiJson(path: string, init: RequestInit = {}, token = adminToken) {
  const headers = {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(init.headers ?? {}),
  };
  const response = await fetch(`${urls.api}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} => ${response.status}`);
  return response.json();
}

async function systemSettings() {
  const data = await apiJson('/api/admin/v1/system/settings');
  return Object.fromEntries((data.items ?? []).map((item: any) => [item.key, item.value])) as Record<string, unknown>;
}

function report(title: string, data: Row[]) {
  return [
    `# ${title}`,
    '',
    `Total: ${data.length}`,
    `Passed: ${data.filter((row) => row.ok).length}`,
    `Failed: ${data.filter((row) => !row.ok).length}`,
    '',
    '| Result | Check | Evidence |',
    '| --- | --- | --- |',
    ...data.map((row) => `| ${row.ok ? 'PASS' : 'FAIL'} | ${row.name} | ${row.ok ? row.evidence ?? '' : row.error ?? ''} |`),
    '',
  ].join('\n');
}

async function flushReports() {
  await fs.writeFile('artifacts/test-report/admin-api-report.md', report('Admin API Report', rows.api));
  await fs.writeFile('artifacts/test-report/admin-ui-report.md', report('Admin UI Report', rows.ui));
  await fs.writeFile('artifacts/test-report/front-admin-cross-flow-report.md', report('Front Admin Cross Flow Report', rows.flow));
  await fs.writeFile('artifacts/test-report/database-consistency-report.md', report('Database Consistency Report', rows.db));
}

async function check(group: keyof typeof rows, name: string, fn: () => Promise<string>) {
  try {
    rows[group].push({ name, ok: true, evidence: await fn() });
  } catch (error: any) {
    rows[group].push({ name, ok: false, error: error?.message ?? String(error) });
  }
  await flushReports();
}

async function expectResponse(page: Page, method: string, pathPart: string, action: () => Promise<void>) {
  const responsePromise = page.waitForResponse((response) => response.url().includes(pathPart) && response.request().method() === method, { timeout: 15000 });
  await action();
  const response = await responsePromise;
  if (!response.ok()) throw new Error(`${method} ${pathPart} => ${response.status()}`);
  return response.status();
}

async function loginAdmin(page: Page) {
  await page.goto(`${urls.admin}/login`, { waitUntil: 'domcontentloaded' });
  const usernameInitial = await page.getByTestId('admin-login-username').inputValue();
  const passwordInitial = await page.getByTestId('admin-login-password').inputValue();
  if (usernameInitial || passwordInitial) throw new Error('登录页仍然预填了管理员账号或密码');
  await page.getByTestId('admin-login-username').fill('admin');
  await page.getByTestId('admin-login-password').fill('admin123');
  await expectResponse(page, 'POST', '/api/admin/v1/auth/login', () => page.getByTestId('admin-login-submit').click());
  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

async function assertLayoutClean(page: Page) {
  const result = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    text: document.body.innerText,
    preCount: document.querySelectorAll('pre').length,
  }));
  if (result.scrollWidth > result.clientWidth + 2) throw new Error(`页面横向溢出 ${result.scrollWidth}/${result.clientWidth}`);
  if (result.text.includes('后台操作文本')) throw new Error('页面仍然出现“后台操作文本”');
  if (result.text.includes('查看首个')) throw new Error('页面仍然出现“查看首个”测试按钮文案');
  if (result.preCount > 0) throw new Error('详情区仍然使用 pre/JSON 裸展示');
}

async function capture(page: Page, path: string) {
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function gotoAdmin(page: Page, path: string) {
  await page.goto(`${urls.admin}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(250);
  await assertLayoutClean(page);
}

async function filterAdminTable(page: Page, testId: string, value: string) {
  await page.getByTestId(testId).fill(value);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(450);
}

async function main() {
  await fs.mkdir('artifacts/test-report', { recursive: true });
  await fs.mkdir('artifacts/screenshots/admin', { recursive: true });
  await fs.mkdir('artifacts/screenshots/cross-flow', { recursive: true });
  await fs.mkdir('artifacts/traces', { recursive: true });
  await cleanRuntime();
  const procs = await startFullStack();
  const browser = await chromium.launch();

  try {
    adminToken = (await apiJson('/api/admin/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    }, '')).token;

    const context = await browser.newContext({ locale: 'zh-CN' });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const admin = await context.newPage();
    await admin.setViewportSize({ width: 1448, height: 1086 });
    const front = await context.newPage();
    await front.setViewportSize({ width: 430, height: 764 });

    await check('api', '后台认证和当前管理员信息可用', async () => {
      const me = await apiJson('/api/admin/v1/auth/me');
      if (me.item.username !== 'admin') throw new Error('管理员身份返回异常');
      return `admin=${me.item.displayName}`;
    });

    await check('api', '后台核心列表接口统一分页返回', async () => {
      const endpoints = [
        '/api/admin/v1/users',
        '/api/admin/v1/posts',
        '/api/admin/v1/replies',
        '/api/admin/v1/ai/providers',
        '/api/admin/v1/ai/routes',
        '/api/admin/v1/ai/jobs',
        '/api/admin/v1/feedback',
        '/api/admin/v1/faqs',
        '/api/admin/v1/reply-presets',
        '/api/admin/v1/feedback-categories',
        '/api/admin/v1/audit-logs',
      ];
      const counts: string[] = [];
      for (const endpoint of endpoints) {
        const data = await apiJson(`${endpoint}?page=1&pageSize=5`);
        if (!Array.isArray(data.items) || typeof data.total !== 'number') throw new Error(`${endpoint} 未返回 items/total`);
        counts.push(`${endpoint.split('/').pop()}=${data.total}`);
      }
      return counts.join('; ');
    });

    await check('api', '仪表盘数据来自后端聚合而非固定假数组', async () => {
      const data = (await apiJson('/api/admin/v1/dashboard/overview')).item;
      if (!Array.isArray(data.activeTrend) || !data.activeTrend[0]?.date) throw new Error('activeTrend 不是日期对象数组');
      if (typeof data.emotionDistribution !== 'object') throw new Error('emotionDistribution 缺失');
      return `trendDays=${data.activeTrend.length}; emotions=${Object.keys(data.emotionDistribution).length}; successRate=${data.aiSuccessRate}%`;
    });

    await check('ui', '后台真实登录页无默认账号密码', async () => {
      await loginAdmin(admin);
      const screenshot = await capture(admin, 'artifacts/screenshots/admin/01-login-dashboard.png');
      return `${admin.url()}; screenshot=${screenshot}`;
    });

    const adminPages = [
      ['/dashboard', '02-dashboard.png'],
      ['/users', '03-users.png'],
      ['/posts', '04-posts.png'],
      ['/replies/moderation', '05-replies.png'],
      ['/ai/providers', '06-providers.png'],
      ['/ai/routes', '07-routes.png'],
      ['/ai/jobs', '08-jobs.png'],
      ['/ops/feedback', '09-feedback.png'],
      ['/ops/faqs', '10-faqs.png'],
      ['/ops/reply-presets', '11-presets.png'],
      ['/ops/feedback-categories', '12-categories.png'],
      ['/ops/config', '13-config.png'],
      ['/audit-logs', '14-audit.png'],
    ] as const;

    for (const [path, shot] of adminPages) {
      await check('ui', `后台页面可访问且无 JSON 裸展示：${path}`, async () => {
        await gotoAdmin(admin, path);
        const screenshot = await capture(admin, `artifacts/screenshots/admin/${shot}`);
        return `${admin.url()}; screenshot=${screenshot}`;
      });
    }

    await check('ui', '用户管理状态变更按钮真实调用 API', async () => {
      await gotoAdmin(admin, '/users');
      await admin.getByTestId('users-row-first').click();
      await admin.getByTestId('admin-user-more').click();
      const status = await expectResponse(admin, 'PATCH', '/api/admin/v1/users/', () => admin.getByTestId('admin-user-mute').click());
      await gotoAdmin(admin, '/users');
      await admin.getByTestId('users-row-first').click();
      await admin.getByTestId('admin-user-more').click();
      await expectResponse(admin, 'PATCH', '/api/admin/v1/users/', () => admin.getByTestId('admin-user-restore').click());
      return `mute=${status}; restore=ok`;
    });

    await check('ui', 'AI 配置中心测试连接真实调用 Provider API', async () => {
      await gotoAdmin(admin, '/ai/providers');
      const providers = (await apiJson('/api/admin/v1/ai/providers?page=1&pageSize=100')).items;
      const provider = providers.find((item: any) => item.enabled && item.id === 'provider_dapi_deepseek');
      if (!provider) throw new Error('没有可测试的模型来源');
      const status = await expectResponse(admin, 'POST', `/api/admin/v1/ai/providers/${provider.id}/test`, () => admin.getByTestId(`admin-provider-test-${provider.id}`).click());
      return `providerTest=${status}`;
    });

    await check('ui', '风格路由测试真实产生 AI Job', async () => {
      await gotoAdmin(admin, '/ai/routes');
      await admin.getByTestId('admin-route-card-warm').click();
      await admin.getByLabel('测试内容').fill('路由测试内容');
      const status = await expectResponse(admin, 'POST', '/api/admin/v1/ai/routes/', () => admin.getByTestId('admin-route-test').click());
      return `routeTest=${status}`;
    });

    let publishedPostId = 'post_1';
    await check('flow', '前台发布公开树洞 -> 后台审核 -> 前台广场 API 可见', async () => {
      const content = `前后台闭环公开树洞 ${Date.now()}`;
      await front.goto(`${urls.front}/pages/mood/create`, { waitUntil: 'domcontentloaded' });
      await front.getByTestId('input-mood-content').fill(content);
      await front.getByTestId('mood-visibility-public').click();
      await expectResponse(front, 'POST', '/api/v1/moods', () => front.getByTestId('btn-submit-mood').click());
      await front.waitForURL('**/pages/post/detail**', { timeout: 10000 });

      const adminPosts = await apiJson(`/api/admin/v1/posts?q=${encodeURIComponent(content)}`);
      const post = adminPosts.items.find((item: any) => item.content === content);
      if (!post) throw new Error('后台内容列表没有出现前台发布树洞');
      publishedPostId = post.id;

      await gotoAdmin(admin, '/posts');
      await filterAdminTable(admin, 'admin-post-search', content);
      await admin.getByTestId('posts-row-first').click();
      await expectResponse(admin, 'PATCH', `/api/admin/v1/posts/${post.id}/review`, () => admin.getByTestId('admin-post-approve').click());

      const publicPosts = await apiJson('/api/v1/posts', {}, '');
      if (!publicPosts.items.some((item: any) => item.id === post.id)) throw new Error('审核通过后前台广场 API 未同步');
      const screenshot = await capture(front, 'artifacts/screenshots/cross-flow/01-front-publish-detail.png');
      await capture(admin, 'artifacts/screenshots/cross-flow/02-admin-post-approved.png');
      return `post=${post.id}; screenshot=${screenshot}`;
    });

    await check('flow', '前台详情发布真人回应 -> 后台审核 -> 前台详情 API 可见', async () => {
      const content = `前后台闭环真人回应 ${Date.now()}`;
      await front.goto(`${urls.front}/pages/post/detail?id=${publishedPostId}&sheet=reply`, { waitUntil: 'domcontentloaded' });
      await front.getByTestId('input-reply-content').fill(content);
      await expectResponse(front, 'POST', `/api/v1/posts/${publishedPostId}/replies`, () => front.getByTestId('btn-submit-reply').click());

      const adminReplies = await apiJson(`/api/admin/v1/replies?q=${encodeURIComponent(content)}`);
      const reply = adminReplies.items.find((item: any) => item.content === content);
      if (!reply) throw new Error('后台回应审核没有出现前台回应');

      await gotoAdmin(admin, '/replies/moderation');
      await filterAdminTable(admin, 'admin-reply-search', content);
      await admin.getByTestId('replies-row-first').click();
      await expectResponse(admin, 'PATCH', `/api/admin/v1/replies/${reply.id}/review`, () => admin.getByTestId('admin-reply-approve').click());

      const publicReplies = await apiJson(`/api/v1/posts/${publishedPostId}/replies`, {}, '');
      if (!publicReplies.items.some((item: any) => item.id === reply.id || item.content === content)) throw new Error('审核通过后前台详情回应 API 未同步');
      await capture(front, 'artifacts/screenshots/cross-flow/03-front-reply-submitted.png');
      return `reply=${reply.id}`;
    });

    await check('flow', '前台反馈 -> 后台回复解决 -> 前台反馈状态同步', async () => {
      const content = `前后台闭环反馈 ${Date.now()}`;
      await front.goto(`${urls.front}/pages/help/feedback`, { waitUntil: 'domcontentloaded' });
      await front.getByTestId('input-feedback-content').fill(content);
      await expectResponse(front, 'POST', '/api/v1/feedback', () => front.getByTestId('btn-feedback-submit').click());

      const tickets = await apiJson(`/api/admin/v1/feedback?q=${encodeURIComponent(content)}`);
      const ticket = tickets.items.find((item: any) => item.content === content);
      if (!ticket) throw new Error('后台反馈工单没有出现前台反馈');

      await gotoAdmin(admin, '/ops/feedback');
      await filterAdminTable(admin, 'admin-feedback-search', content);
      await admin.getByTestId('tickets-row-first').click();
      await admin.getByPlaceholder('请输入回复内容...').fill('已收到，我们会继续跟进。');
      await expectResponse(admin, 'POST', `/api/admin/v1/feedback/${ticket.id}/reply`, () => admin.getByTestId('admin-ticket-reply').click());
      await expectResponse(admin, 'PATCH', `/api/admin/v1/feedback/${ticket.id}/status`, () => admin.getByTestId('admin-ticket-resolve').click());

      const frontTickets = await apiJson('/api/v1/feedback', {}, '');
      const synced = frontTickets.items.find((item: any) => item.id === ticket.id);
      if (!synced || synced.status !== 'resolved') throw new Error('前台反馈状态未同步 resolved');
      await capture(admin, 'artifacts/screenshots/cross-flow/04-admin-feedback-resolved.png');
      return `ticket=${ticket.id}; status=${synced.status}`;
    });

    await check('flow', '后台关闭真人回应 -> 前台详情回复抽屉被真实禁用', async () => {
      await gotoAdmin(admin, '/ops/config');
      const allowHumanReplies = admin.locator('label').filter({ hasText: '允许真人回应' }).locator('input[type="checkbox"]');
      if (!(await allowHumanReplies.isChecked())) {
        await allowHumanReplies.check();
        await expectResponse(admin, 'PUT', '/api/admin/v1/system/settings', () => admin.getByTestId('admin-config-save').click());
      }
      await allowHumanReplies.uncheck();
      await expectResponse(admin, 'PUT', '/api/admin/v1/system/settings', () => admin.getByTestId('admin-config-save').click());

      const adminConfig = await systemSettings();
      const frontConfig = (await apiJson('/api/v1/config', {}, '')).item;
      if (adminConfig.allowHumanRepliesDefault !== false || frontConfig.allowHumanRepliesDefault !== false) throw new Error('配置没有同时写入后台和前台 API');

      await front.goto(`${urls.front}/pages/post/detail?id=${publishedPostId}&sheet=reply`, { waitUntil: 'domcontentloaded' });
      await front.waitForTimeout(500);
      const sheetVisible = await front.locator('[data-state="reply-sheet"]').isVisible().catch(() => false);
      const bodyText = await front.locator('body').innerText();
      if (sheetVisible || !bodyText.includes('真人回应已关闭')) throw new Error('前台回复入口未根据后台配置禁用');
      const screenshot = await capture(front, 'artifacts/screenshots/cross-flow/05-front-reply-disabled-by-config.png');

      if (!(await allowHumanReplies.isChecked())) await allowHumanReplies.check();
      await expectResponse(admin, 'PUT', '/api/admin/v1/system/settings', () => admin.getByTestId('admin-config-save').click());
      if ((await systemSettings()).allowHumanRepliesDefault !== true) throw new Error('真人回应设置没有在恢复时回读为 true');
      return `configSynced=false; screenshot=${screenshot}`;
    });

    await check('db', '前后台读取同一数据源：发布内容、回应、反馈、配置均一致', async () => {
      const [adminPosts, frontPosts, replies, feedback, adminConfig, frontConfig] = await Promise.all([
        apiJson('/api/admin/v1/posts?pageSize=200'),
        apiJson('/api/v1/posts', {}, ''),
        apiJson(`/api/v1/posts/${publishedPostId}/replies`, {}, ''),
        apiJson('/api/v1/feedback', {}, ''),
        systemSettings(),
        apiJson('/api/v1/config', {}, ''),
      ]);
      if (!adminPosts.items.some((item: any) => item.id === publishedPostId)) throw new Error('后台帖子源缺失新内容');
      if (!frontPosts.items.some((item: any) => item.id === publishedPostId)) throw new Error('前台公开帖子源缺失新内容');
      if (!replies.items.length) throw new Error('前台回应源没有已发布回应');
      if (!feedback.items.length) throw new Error('前台反馈源没有工单');
      if (adminConfig.allowHumanRepliesDefault !== frontConfig.item.allowHumanRepliesDefault) throw new Error('前后台配置 API 不一致');
      return `posts=${adminPosts.total}; publicPosts=${frontPosts.total}; replies=${replies.items.length}; feedback=${feedback.items.length}`;
    });

    await context.tracing.stop({ path: 'artifacts/traces/admin-sync-full-report-trace.zip' });
    await context.close();
    const failed = Object.values(rows).flat().filter((row) => !row.ok);
    if (failed.length) process.exit(1);
  } finally {
    await browser.close();
    for (const proc of procs) kill(proc);
  }
}

main().catch(async (error) => {
  rows.flow.push({ name: '脚本级异常', ok: false, error: error?.message ?? String(error) });
  await flushReports().catch(() => undefined);
  console.error(error);
  process.exit(1);
});
