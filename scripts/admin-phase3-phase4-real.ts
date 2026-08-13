import { chromium, type Page } from 'playwright';
import fs from 'node:fs/promises';
import { cleanRuntime, kill, markdown, startFullStack, urls } from './real-browser-utils';

type Row = { name: string; ok: boolean; evidence?: string; error?: string };
let token = '';

async function adminJson(path: string, init: RequestInit = {}) {
  const response = await fetch(`${urls.api}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} => ${response.status}`);
  return response.json();
}

async function publicJson(path: string) {
  const response = await fetch(`${urls.api}${path}`);
  if (!response.ok) throw new Error(`GET ${path} => ${response.status}`);
  return response.json();
}

async function expectResponse(page: Page, method: string, path: string, action: () => Promise<void>) {
  const pending = page.waitForResponse((response) => response.url().includes(path) && response.request().method() === method, { timeout: 15_000 });
  await action();
  const response = await pending;
  if (!response.ok()) throw new Error(`${method} ${path} => ${response.status()}`);
  return response.status();
}

async function waitEnabled(locator: { isEnabled(): Promise<boolean> }) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (await locator.isEnabled()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('control stayed disabled after the page data load');
}

async function login(page: Page) {
  await page.goto(`${urls.admin}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('admin-login-username').fill('admin');
  await page.getByTestId('admin-login-password').fill('admin123');
  await expectResponse(page, 'POST', '/api/admin/v1/auth/login', () => page.getByTestId('admin-login-submit').click());
  await page.waitForURL('**/dashboard', { timeout: 10_000 });
}

async function check(rows: Row[], name: string, action: () => Promise<string>) {
  try { rows.push({ name, ok: true, evidence: await action() }); }
  catch (error: any) { rows.push({ name, ok: false, error: error?.message ?? String(error) }); }
  await fs.writeFile('artifacts/test-report/admin-phase3-phase4-real.md', markdown('Admin Phase 3 / Phase 4 real-browser checks', rows));
}

async function removeTemporaryRow(page: Page, row: ReturnType<Page['getByRole']>, buttonName: string, confirmTestId: string) {
  const remove = row.getByRole('button', { name: buttonName });
  if (await remove.count() !== 1) throw new Error(`delete control ${buttonName} is not unique`);
  await remove.click();
  const confirm = page.getByTestId(confirmTestId);
  if (await confirm.count() !== 1) throw new Error(`${confirmTestId} confirmation is not unique`);
  await confirm.click();
}

async function main() {
  await fs.mkdir('artifacts/test-report', { recursive: true });
  await fs.mkdir('artifacts/screenshots/admin', { recursive: true });
  await fs.mkdir('artifacts/traces/admin', { recursive: true });
  await cleanRuntime();
  const procs = await startFullStack();
  const browser = await chromium.launch();
  const rows: Row[] = [];

  try {
    token = (await adminJson('/api/admin/v1/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin123' }) })).token;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    await login(page);

    await check(rows, 'AI 配置：刷新 DAPI、真实连接测试、启停并恢复', async () => {
      await page.goto(`${urls.admin}/ai/providers`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('admin-provider-refresh').click();
      const providers = (await adminJson('/api/admin/v1/ai/providers?page=1&pageSize=100')).items;
      const provider = providers.find((item: any) => item.enabled && item.id === 'provider_dapi_deepseek');
      if (!provider) throw new Error('configured DAPI provider is unavailable');
      await expectResponse(page, 'POST', `/api/admin/v1/ai/providers/${provider.id}/test`, () => page.getByTestId(`admin-provider-test-${provider.id}`).click());
      const card = page.locator('.provider-card').filter({ hasText: provider.modelName });
      const stop = card.getByRole('button', { name: '停用' });
      if (await stop.count() !== 1) throw new Error('provider stop action is not unique');
      await expectResponse(page, 'PATCH', `/api/admin/v1/ai/providers/${provider.id}`, () => stop.click());
      const start = card.getByRole('button', { name: '启用' });
      if (await start.count() !== 1) throw new Error('provider start action is not unique');
      await expectResponse(page, 'PATCH', `/api/admin/v1/ai/providers/${provider.id}`, () => start.click());
      const reread = (await adminJson('/api/admin/v1/ai/providers?page=1&pageSize=100')).items.find((item: any) => item.id === provider.id);
      if (!reread?.enabled) throw new Error('provider did not persist its restored enabled state');
      return `provider=${provider.modelName}; restored=${reread.enabled}`;
    });

    await check(rows, '风格路由保存回读，并让真实测试任务进入任务详情六标签', async () => {
      await page.goto(`${urls.admin}/ai/routes`, { waitUntil: 'domcontentloaded' });
      const route = page.getByTestId('admin-route-card-warm');
      if (await route.count() !== 1) throw new Error('warm route card is not unique');
      await route.click();
      await expectResponse(page, 'PATCH', '/api/admin/v1/ai/routes/warm', () => page.getByTestId('admin-route-save').click());
      await expectResponse(page, 'POST', '/api/admin/v1/ai/routes/warm/test', () => page.getByTestId('admin-route-test').click());
      const warm = (await adminJson('/api/admin/v1/ai/routes?page=1&pageSize=100')).items.find((item: any) => item.style === 'warm');
      if (!warm?.primaryProviderId) throw new Error('warm route did not persist a primary provider');
      await page.goto(`${urls.admin}/ai/jobs`, { waitUntil: 'domcontentloaded' });
      const firstRow = page.getByRole('row').nth(1);
      if (await firstRow.count() !== 1) throw new Error('AI job row is missing');
      await firstRow.click();
      const labels = ['任务概览', '输入摘要', '生成结果', '模型调用', '错误和重试', '原始数据'];
      for (const label of labels) {
        const tab = page.getByRole('button', { name: label });
        if (await tab.count() !== 1) throw new Error(`missing AI job detail tab: ${label}`);
      }
      const raw = page.getByRole('button', { name: '原始数据' });
      await raw.click();
      if (await page.locator('[role="dialog"] pre').count() < 1) throw new Error('raw JSON is not contained in the detail drawer');
      return `routeVersion=${warm.promptVersion}; tabs=${labels.length}`;
    });

    await check(rows, '回复预设：新增、编辑、排序、启停、确认删除并回读', async () => {
      const name = `阶段验收预设-${Date.now()}`;
      await page.goto(`${urls.admin}/ops/reply-presets`, { waitUntil: 'domcontentloaded' });
      const input = page.getByRole('textbox', { name: '预设内容' });
      if (await input.count() !== 1) throw new Error('reply preset input is not unique');
      await input.fill(name);
      const add = page.getByTestId('admin-preset-add');
      await waitEnabled(add);
      await add.click();
      await page.waitForTimeout(500);
      const created = (await adminJson('/api/admin/v1/reply-presets?page=1&pageSize=100')).items.find((item: any) => item.text === name);
      if (!created) throw new Error('new reply preset is absent from the authoritative API');
      await page.reload({ waitUntil: 'domcontentloaded' });
      const row = page.locator('tbody tr').filter({ hasText: name });
      if (await row.count() !== 1) throw new Error('new reply preset is absent after UI refresh');
      await row.getByRole('button', { name: '编辑' }).click();
      const edit = page.getByRole('dialog', { name: '编辑回复预设' }).getByRole('textbox', { name: '预设内容' });
      await edit.fill(`${name}-已编辑`);
      await page.getByTestId('admin-preset-save').click();
      await page.waitForTimeout(500);
      const edited = page.locator('tbody tr').filter({ hasText: `${name}-已编辑` });
      const beforeMove = (await adminJson('/api/admin/v1/reply-presets?page=1&pageSize=100')).items.find((item: any) => item.text === `${name}-已编辑`);
      await edited.getByRole('button', { name: '上移' }).click();
      await page.waitForTimeout(500);
      const moved = (await adminJson('/api/admin/v1/reply-presets?page=1&pageSize=100')).items.find((item: any) => item.text === `${name}-已编辑`);
      if (!moved || moved.sortOrder >= beforeMove.sortOrder) throw new Error('reply preset sorting did not persist through the UI');
      await edited.getByRole('button', { name: '停用' }).click();
      await page.waitForTimeout(500);
      const disabled = (await adminJson('/api/admin/v1/reply-presets?page=1&pageSize=100')).items.find((item: any) => item.text === `${name}-已编辑`);
      if (disabled?.enabled !== false) throw new Error('reply preset disable did not persist through the UI');
      await edited.getByRole('button', { name: '启用' }).click();
      await page.waitForTimeout(500);
      const enabled = (await adminJson('/api/admin/v1/reply-presets?page=1&pageSize=100')).items.find((item: any) => item.text === `${name}-已编辑`);
      if (enabled?.enabled !== true) throw new Error('reply preset enable did not persist through the UI');
      await removeTemporaryRow(page, edited, '删除', 'admin-preset-delete-confirm');
      await page.reload({ waitUntil: 'domcontentloaded' });
      if (await page.getByText(`${name}-已编辑`, { exact: true }).count()) throw new Error('deleted preset survived refresh');
      return 'create/edit/sort/toggle/delete persisted';
    });

    await check(rows, 'FAQ：搜索、新增、编辑、排序、启停、确认删除并同步前台', async () => {
      const question = `阶段验收 FAQ ${Date.now()}`;
      const editedQuestion = `${question}（已编辑）`;
      await page.goto(`${urls.admin}/ops/faqs`, { waitUntil: 'domcontentloaded' });
      const boxes = page.getByRole('textbox');
      if (await boxes.count() < 3) throw new Error('FAQ fields are incomplete');
      // The first input is the FAQ search box; create fields follow it.
      await boxes.nth(1).fill(question);
      await boxes.nth(2).fill('这是由真实管理端写入并回读的答案。');
      const add = page.getByTestId('admin-faq-add');
      await waitEnabled(add);
      await add.click();
      await page.waitForTimeout(500);
      const created = (await adminJson('/api/admin/v1/faqs?page=1&pageSize=100')).items.find((item: any) => item.question === question);
      if (!created) throw new Error('new FAQ is absent from the authoritative API');
      await page.reload({ waitUntil: 'domcontentloaded' });
      const row = page.locator('tbody tr').filter({ hasText: question });
      if (await row.count() !== 1) throw new Error('new FAQ row is absent after UI refresh');
      await row.getByRole('button', { name: '编辑' }).click();
      await page.getByRole('dialog', { name: '编辑 FAQ' }).getByRole('textbox', { name: '问题' }).fill(editedQuestion);
      await page.getByTestId('admin-faq-save').click();
      await page.waitForTimeout(500);
      const edited = page.locator('tbody tr').filter({ hasText: editedQuestion });
      const beforeMove = (await adminJson('/api/admin/v1/faqs?page=1&pageSize=100')).items.find((item: any) => item.question === editedQuestion);
      const moveUp = edited.getByRole('button', { name: '上移' });
      await waitEnabled(moveUp);
      await moveUp.click();
      await page.waitForTimeout(700);
      const moved = (await adminJson('/api/admin/v1/faqs?page=1&pageSize=100')).items.find((item: any) => item.question === editedQuestion);
      if (!moved || moved.sortOrder >= beforeMove.sortOrder) throw new Error('FAQ sorting did not persist through the UI');
      await edited.getByRole('button', { name: '停用' }).click();
      await page.waitForTimeout(700);
      const disabled = (await adminJson('/api/admin/v1/faqs?page=1&pageSize=100')).items.find((item: any) => item.question === editedQuestion);
      if (disabled?.enabled !== false) throw new Error('FAQ disable did not persist through the UI');
      await edited.getByRole('button', { name: '启用' }).click();
      await page.waitForTimeout(700);
      const enabled = (await adminJson('/api/admin/v1/faqs?page=1&pageSize=100')).items.find((item: any) => item.question === editedQuestion);
      if (enabled?.enabled !== true) throw new Error('FAQ enable did not persist through the UI');
      const beforeDelete = await publicJson('/api/v1/feedback/faqs');
      if (!beforeDelete.items.some((item: any) => item.question === editedQuestion)) throw new Error('enabled FAQ did not reach front API');
      await removeTemporaryRow(page, edited, '删除', 'admin-faq-delete-confirm');
      return 'create/edit/sort/toggle/delete; front API read verified';
    });

    await check(rows, '反馈分类：新增、编辑、启停、排序、前台同步和确认删除', async () => {
      const name = `阶段验收分类-${Date.now()}`;
      const editedName = `${name}-已编辑`;
      await page.goto(`${urls.admin}/ops/feedback-categories`, { waitUntil: 'domcontentloaded' });
      const input = page.getByRole('textbox', { name: '分类名称' });
      if (await input.count() !== 1) throw new Error('category input is not unique');
      await input.fill(name);
      const add = page.getByTestId('admin-category-add');
      await waitEnabled(add);
      await expectResponse(page, 'POST', '/api/admin/v1/feedback-categories', () => add.click());
      const row = page.getByRole('row', { name: new RegExp(name) });
      if (await row.count() !== 1) throw new Error('new category row is absent');
      await row.getByRole('button', { name: '编辑' }).click();
      await page.getByRole('textbox', { name: '分类名称' }).last().fill(editedName);
      await expectResponse(page, 'PUT', '/api/admin/v1/feedback-categories/', () => page.getByTestId('admin-category-save').click());
      await page.waitForTimeout(500);
      const edited = page.getByRole('row', { name: new RegExp(editedName) });
      const beforeMove = (await adminJson('/api/admin/v1/feedback-categories?page=1&pageSize=100')).items.find((item: any) => item.name === editedName);
      const moveUp = edited.getByRole('button', { name: '上移' });
      await waitEnabled(moveUp);
      await moveUp.click();
      await page.waitForTimeout(700);
      const moved = (await adminJson('/api/admin/v1/feedback-categories?page=1&pageSize=100')).items.find((item: any) => item.name === editedName);
      if (!moved || moved.sortOrder >= beforeMove.sortOrder) throw new Error('feedback category sorting did not persist through the UI');
      await edited.getByRole('button', { name: '停用' }).click();
      await page.waitForTimeout(700);
      const disabled = (await adminJson('/api/admin/v1/feedback-categories?page=1&pageSize=100')).items.find((item: any) => item.name === editedName);
      if (disabled?.enabled !== false) throw new Error('feedback category disable did not persist through the UI');
      await edited.getByRole('button', { name: '启用' }).click();
      await page.waitForTimeout(700);
      const enabled = (await adminJson('/api/admin/v1/feedback-categories?page=1&pageSize=100')).items.find((item: any) => item.name === editedName);
      if (enabled?.enabled !== true) throw new Error('feedback category enable did not persist through the UI');
      const frontCategories = await publicJson('/api/v1/feedback/categories');
      if (!frontCategories.items.some((item: any) => item.name === editedName)) throw new Error('enabled feedback category did not reach front API');
      await removeTemporaryRow(page, edited, '删除', 'admin-category-delete-confirm');
      return 'create/edit/sort/toggle/delete; front category API read verified';
    });

    await check(rows, '系统设置保存、刷新回读和审计详情 before/after', async () => {
      await page.goto(`${urls.admin}/ops/config`, { waitUntil: 'domcontentloaded' });
      const toggle = page.locator('label').filter({ hasText: '异常通知' }).locator('input[type="checkbox"]');
      if (await toggle.count() !== 1) throw new Error('system setting toggle is not unique');
      const before = await toggle.isChecked();
      await toggle.setChecked(!before);
      await expectResponse(page, 'PUT', '/api/admin/v1/system/settings', () => page.getByTestId('admin-config-save').click());
      await page.reload({ waitUntil: 'domcontentloaded' });
      if ((await toggle.isChecked()) !== !before) throw new Error('system setting did not survive refresh');
      await toggle.setChecked(before);
      await expectResponse(page, 'PUT', '/api/admin/v1/system/settings', () => page.getByTestId('admin-config-save').click());
      await page.goto(`${urls.admin}/audit-logs`, { waitUntil: 'domcontentloaded' });
      const auditRow = page.getByRole('row').nth(1);
      if (await auditRow.count() !== 1) throw new Error('audit log row is absent');
      await auditRow.click();
      const drawer = page.getByRole('dialog', { name: '审计日志详情' });
      if (await drawer.count() !== 1) throw new Error('audit detail drawer did not open');
      for (const label of ['变更前摘要', '变更后摘要']) if (await drawer.getByText(label, { exact: true }).count() !== 1) throw new Error(`missing ${label}`);
      return `setting restored=${before}; audit drawer includes before/after`;
    });

    await page.screenshot({ path: 'artifacts/screenshots/admin/phase3-phase4-real.png', fullPage: true });
    await context.tracing.stop({ path: 'artifacts/traces/admin/phase3-phase4-real.zip' });
    await context.close();
    if (rows.some((row) => !row.ok)) process.exitCode = 1;
  } finally {
    await browser.close();
    for (const process of procs) kill(process);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
