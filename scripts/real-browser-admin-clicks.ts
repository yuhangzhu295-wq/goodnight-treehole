import { chromium, type Page } from 'playwright';
import fs from 'node:fs/promises';
import { cleanRuntime, ensureNoVisibleTestWords, kill, markdown, startAdminStack, urls } from './real-browser-utils';

async function expectApi(page: Page, method: string, pathPart: string, action: () => Promise<void>) {
  const responsePromise = page.waitForResponse((res) => res.url().includes(pathPart) && res.request().method() === method, { timeout: 10000 });
  await action();
  const response = await responsePromise;
  return response.status();
}

async function closeDetailDrawer(page: Page) {
  const close = page.getByTestId('admin-detail-close');
  if (await close.isVisible().catch(() => false)) await close.click();
}

async function main() {
  await fs.mkdir('artifacts/test-report', { recursive: true });
  await fs.mkdir('artifacts/debug', { recursive: true });
  await fs.mkdir('artifacts/screenshots/real-user/admin', { recursive: true });
  await fs.mkdir('artifacts/traces', { recursive: true });
  await cleanRuntime();
  const procs = await startAdminStack();
  const rows: Array<{ name: string; ok: boolean; evidence?: string; error?: string }> = [];
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext({ viewport: { width: 1448, height: 1086 }, locale: 'zh-CN' });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();

    async function check(name: string, fn: () => Promise<string>) {
      try {
        rows.push({ name, ok: true, evidence: await fn() });
      } catch (error: any) {
        rows.push({ name, ok: false, error: error?.message ?? String(error) });
      }
      const report = markdown('Real Browser Admin Clicks', rows);
      await fs.writeFile('artifacts/test-report/real-browser-admin-clicks.md', report);
      await fs.writeFile('artifacts/test-report/real-user-admin.md', report);
    }

    await check('后台真实表单登录', async () => {
      await page.goto(`${urls.admin}/login`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('admin-login-username').fill('admin');
      await page.getByTestId('admin-login-password').fill('admin123');
      const status = await expectApi(page, 'POST', '/api/admin/v1/auth/login', () => page.getByTestId('admin-login-submit').click());
      await page.waitForURL('**/dashboard', { timeout: 10000 });
      await ensureNoVisibleTestWords(page);
      await page.screenshot({ path: 'artifacts/debug/current-admin-dashboard.png', fullPage: true });
      await page.screenshot({ path: 'artifacts/screenshots/real-user/admin/02-dashboard.png', fullPage: true });
      return `login=${status}; ${page.url()}`;
    });

    await check('侧边栏进入树洞内容页', async () => {
      await page.getByTestId('admin-nav-posts').click();
      await page.waitForURL('**/posts', { timeout: 10000 });
      return page.url();
    });

    await check('审核通过按钮调用内容审核 API', async () => {
      await page.getByTestId('posts-row-first').click();
      const status = await expectApi(page, 'PATCH', '/api/admin/v1/posts/', () => page.getByTestId('admin-post-approve').click());
      await closeDetailDrawer(page);
      return `PATCH moderation => ${status}`;
    });

    await check('AI 供应商页测试连接调用 API', async () => {
      await page.getByTestId('admin-nav-providers').click();
      await page.waitForURL('**/ai/providers', { timeout: 10000 });
      const dapiTest = page.getByTestId('admin-provider-test-provider_dapi_deepseek');
      await dapiTest.waitFor({ state: 'visible', timeout: 10000 });
      const status = await expectApi(page, 'POST', '/api/admin/v1/ai/providers/provider_dapi_deepseek/test', () => dapiTest.click());
      return `POST DAPI provider test => ${status}`;
    });

    await check('反馈工单真实回复后标记已解决', async () => {
      await page.getByTestId('admin-nav-feedback').click();
      await page.waitForURL('**/ops/feedback', { timeout: 10000 });
      await page.getByTestId('tickets-row-first').click();
      await page.getByPlaceholder('请输入回复内容...').fill('已收到你的反馈，我们已经完成核查并处理。');
      const replyStatus = await expectApi(page, 'POST', '/api/admin/v1/feedback/', () => page.getByTestId('admin-ticket-reply').click());
      const resolveStatus = await expectApi(page, 'PATCH', '/api/admin/v1/feedback/', () => page.getByTestId('admin-ticket-resolve').click());
      await closeDetailDrawer(page);
      return `POST ticket reply => ${replyStatus}; PATCH ticket status => ${resolveStatus}`;
    });

    await check('系统设置页保存配置调用 API', async () => {
      await page.getByTestId('admin-nav-config').click();
      await page.waitForURL('**/ops/config', { timeout: 10000 });
      const toggle = page.getByTestId('admin-config-field-allowHumanRepliesDefault');
      const original = await toggle.isChecked();
      await toggle.setChecked(!original);
      const status = await expectApi(page, 'PUT', '/api/admin/v1/system/settings', () => page.getByTestId('admin-config-save').click());
      await toggle.setChecked(original);
      const restoreStatus = await expectApi(page, 'PUT', '/api/admin/v1/system/settings', () => page.getByTestId('admin-config-save').click());
      return `PUT system settings => ${status}; restore => ${restoreStatus}`;
    });

    await context.tracing.stop({ path: 'artifacts/traces/real-user-admin-trace.zip' });
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
