import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import { spawnLogged, kill, wait, urls, cleanRuntime } from './real-browser-utils';
import { resetTestDatabase } from './test-database';
import fs from 'node:fs/promises';

async function main() {
  console.log('[walkthrough] Starting full stack...');
  await cleanRuntime();
  const dbUrl = resetTestDatabase('goodnight_treehole_test_r07_r08');
  const env = {
    DATABASE_URL: dbUrl,
    GOODNIGHT_STORE_FILE: 'data/goodnight-store.r07-r08.json',
    VITE_API_BASE_URL: urls.api,
  };
  await fs.rm(env.GOODNIGHT_STORE_FILE, { force: true });
  await fs.rm(`apps/api/${env.GOODNIGHT_STORE_FILE}`, { force: true });

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  // 1. Seed database with test users, privacy, expired memory, and support plan
  const userId = 'user_demo';
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, openid: `openid_${userId}`, anonymousCode: 'anon_demo', nickname: '演示用户' },
    update: {},
  });
  await prisma.privacySetting.upsert({
    where: { userId },
    create: { userId, allowRecoveryData: true, allowLongTermMemory: true, allowAiMemoryUse: true },
    update: { allowRecoveryData: true, allowLongTermMemory: true, allowAiMemoryUse: true },
  });

  const memoryId = 'mem_expired_walkthrough';
  const secretContent = '绝密记忆内容-端到端验证';
  await prisma.memoryItem.upsert({
    where: { id: memoryId },
    create: {
      id: memoryId,
      userId,
      title: '过期记忆',
      category: '用户主动保存',
      content: secretContent,
      scope: 'all_ai',
      status: 'active', // effectively expired because expiresAt is in past
      consentedAt: new Date(Date.now() - 86_400_000 * 60),
      expiresAt: new Date(Date.now() - 5000),
    },
    update: {},
  });

  const planId = 'plan_walkthrough';
  const secretPlanHelp = '紧急时刻拨打求助专线';
  await prisma.personalSupportPlan.upsert({
    where: { id: planId },
    create: {
      id: planId,
      userId,
      title: '端到端支持计划',
      plan: { emergency: secretPlanHelp },
      active: true,
    },
    update: {},
  });

  const procs = [
    spawnLogged('real-cross-api', 'pnpm', ['--dir', 'apps/api', 'start'], env),
    spawnLogged('real-cross-front', 'pnpm', ['--dir', 'apps/mp', 'dev', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], env),
    spawnLogged('real-cross-admin', 'pnpm', ['--dir', 'apps/admin', 'dev', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], env),
  ];

  await wait(`${urls.api}/api/v1/posts`);
  await wait(`${urls.front}/pages/square/index`);
  await wait(`${urls.admin}/login`);
  console.log('[walkthrough] Stack running. Launching browser...');

  const browser = await chromium.launch();

  try {
    // =========================================================================
    // Part 1: Admin UI verification (Task R-07)
    // =========================================================================
    console.log('[walkthrough] Testing Admin TablePage (Task R-07)...');
    const adminPage = await browser.newPage({ viewport: { width: 1448, height: 1086 }, locale: 'zh-CN' });
    await adminPage.goto(`${urls.admin}/login`, { waitUntil: 'domcontentloaded' });
    await adminPage.getByTestId('admin-login-username').fill('admin');
    await adminPage.getByTestId('admin-login-password').fill('admin123');
    await adminPage.getByTestId('admin-login-submit').click();
    await adminPage.waitForURL('**/dashboard', { timeout: 15000 });

    // Navigate to admin memories
    await adminPage.goto(`${urls.admin}/safety/memory`, { waitUntil: 'domcontentloaded' });
    await adminPage.waitForTimeout(1500);

    // Verify list minimal disclosure: secretContent is NOT present in table rows
    const listBodyText = await adminPage.locator('table tbody').innerText();
    if (listBodyText.includes(secretContent)) {
      throw new Error('[R-07 Failure] Admin memory list table leaked private memory content!');
    }
    console.log('[walkthrough] Admin memory list table correctly omits memory content.');

    // Click the row to open the detail drawer
    const memRow = adminPage.locator('table tbody tr').first();
    await memRow.click();
    await adminPage.waitForTimeout(1500);

    const drawer = adminPage.getByTestId('admin-detail-drawer');
    const drawerVisible = await drawer.isVisible();
    if (!drawerVisible) throw new Error('[R-07 Failure] Detail drawer did not open on row click');

    const drawerText = await drawer.innerText();
    if (!drawerText.includes(secretContent)) {
      throw new Error(`[R-07 Failure] Detail drawer did not load content via audited route. Drawer: ${drawerText}`);
    }
    console.log('[walkthrough] Detail drawer loaded memory content from single-record audited route.');

    // Verify AuditLog in PostgreSQL
    const auditMem = await prisma.auditLog.findFirst({
      where: { resourceType: 'MemoryItem', resourceId: memoryId, action: 'MEMORY_READ_FULL' },
    });
    if (!auditMem) throw new Error('[R-07 Failure] AuditLog was NOT committed for memory read');
    console.log('[walkthrough] AuditLog for memory read verified in DB:', auditMem.id);

    // Close drawer
    await adminPage.getByTestId('admin-detail-close').click();

    // Navigate to support plans
    await adminPage.goto(`${urls.admin}/safety/support-plans`, { waitUntil: 'domcontentloaded' });
    await adminPage.waitForTimeout(1500);

    const planListText = await adminPage.locator('table tbody').innerText();
    if (planListText.includes(secretPlanHelp)) {
      throw new Error('[R-07 Failure] Admin support-plan list table leaked private plan text!');
    }
    console.log('[walkthrough] Admin support-plan list table correctly omits plan content.');

    // Click support plan row
    await adminPage.locator('table tbody tr').first().click();
    await adminPage.waitForTimeout(1500);

    const planDrawerText = await adminPage.getByTestId('admin-detail-drawer').innerText();
    if (!planDrawerText.includes(secretPlanHelp)) {
      throw new Error(`[R-07 Failure] Support plan detail drawer did not render plan from single-record route: ${planDrawerText}`);
    }
    console.log('[walkthrough] Support plan drawer rendered plan from single-record audited route.');

    const auditPlan = await prisma.auditLog.findFirst({
      where: { resourceType: 'PersonalSupportPlan', resourceId: planId, action: 'SUPPORT_PLAN_READ_FULL' },
    });
    if (!auditPlan) throw new Error('[R-07 Failure] AuditLog was NOT committed for support plan read');
    console.log('[walkthrough] AuditLog for support plan read verified in DB:', auditPlan.id);

    await adminPage.close();

    // =========================================================================
    // Part 2: Front UI MemoryCenter verification (Task R-08)
    // =========================================================================
    console.log('[walkthrough] Testing Front MemoryCenter (Task R-08)...');
    const frontPage = await browser.newPage({ viewport: { width: 430, height: 764 }, locale: 'zh-CN' });
    await frontPage.setExtraHTTPHeaders({ 'x-goodnight-user-id': userId });
    await frontPage.goto(`${urls.front}/pages/memory/index`, { waitUntil: 'domcontentloaded' });
    await frontPage.waitForTimeout(1500);

    // 1. Initial rendered state for expired memory
    const badgeText = await frontPage.locator('.status-badge').first().innerText();
    if (badgeText !== '已到期') {
      throw new Error(`[R-08 Failure] Expected status badge '已到期', got '${badgeText}'`);
    }

    const editBtnCount = await frontPage.getByTestId('memory-edit-btn').count();
    if (editBtnCount !== 0) {
      throw new Error('[R-08 Failure] Edit button should NOT be rendered for an expired memory');
    }

    const reconsentBtn = frontPage.getByTestId('memory-reconsent');
    if (!(await reconsentBtn.isVisible())) {
      throw new Error('[R-08 Failure] Re-consent button not visible for expired memory');
    }
    console.log('[walkthrough] MemoryCenter correctly shows "已到期", hides edit button, and displays re-consent button.');

    // 2. Click re-consent
    const reactivatePromise = frontPage.waitForResponse(
      (res) => res.url().includes(`/api/v1/me/memories/${memoryId}/reactivate`) && res.request().method() === 'POST',
      { timeout: 10000 },
    );
    await reconsentBtn.click();
    const reactivateRes = await reactivatePromise;
    if (reactivateRes.status() !== 201) {
      throw new Error(`[R-08 Failure] Reactivate request failed with status ${reactivateRes.status()}`);
    }
    await frontPage.waitForTimeout(1500);

    // 3. PostgreSQL verification
    const dbMem = await prisma.memoryItem.findUnique({ where: { id: memoryId } });
    if (dbMem?.status !== 'active' || dbMem.expiresAt.getTime() <= Date.now()) {
      throw new Error(`[R-08 Failure] MemoryItem in DB not active or not future expiresAt: ${JSON.stringify(dbMem)}`);
    }
    console.log('[walkthrough] MemoryItem in PostgreSQL is active with future expiry:', dbMem.expiresAt);

    // 4. Refresh and read rendered state
    await frontPage.reload({ waitUntil: 'domcontentloaded' });
    await frontPage.waitForTimeout(1500);

    const reloadedBadge = await frontPage.locator('.status-badge').first().innerText();
    if (reloadedBadge !== '允许使用') {
      throw new Error(`[R-08 Failure] After refresh, expected status badge '允许使用', got '${reloadedBadge}'`);
    }

    const reloadedEditBtn = await frontPage.getByTestId('memory-edit-btn').count();
    if (reloadedEditBtn === 0) {
      throw new Error('[R-08 Failure] After re-consent, edit button should be visible for active memory');
    }

    const reloadedReconsent = await frontPage.getByTestId('memory-reconsent').count();
    if (reloadedReconsent !== 0) {
      throw new Error('[R-08 Failure] After re-consent, re-consent button should no longer be visible');
    }
    console.log('[walkthrough] After refresh, memory is active with edit button and no re-consent button.');

    // 5. API process restart durability
    console.log('[walkthrough] Restarting API process...');
    kill(procs[0]); // kill API
    procs[0] = spawnLogged('real-cross-api-restarted', 'pnpm', ['--dir', 'apps/api', 'start'], env);
    await wait(`${urls.api}/api/v1/posts`);
    console.log('[walkthrough] API process restarted.');

    await frontPage.reload({ waitUntil: 'domcontentloaded' });
    await frontPage.waitForTimeout(1500);

    const postRestartBadge = await frontPage.locator('.status-badge').first().innerText();
    if (postRestartBadge !== '允许使用') {
      throw new Error(`[R-08 Failure] After API restart, expected '允许使用', got '${postRestartBadge}'`);
    }
    console.log('[walkthrough] State survived API restart: Memory remains "允许使用"');

    // 6. Test server refusal reflection in UI
    console.log('[walkthrough] Testing server refusal reflection in MemoryCenter UI...');
    await frontPage.route('**/api/v1/me/memories/*/reactivate', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: '重新确认被服务端拒绝（模拟拒绝）' }),
      }),
    );
    // Mark memory as expired again in DB so the button appears
    await prisma.memoryItem.update({
      where: { id: memoryId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await frontPage.reload({ waitUntil: 'domcontentloaded' });
    await frontPage.waitForTimeout(1500);
    await frontPage.getByTestId('memory-reconsent').click();
    await frontPage.waitForTimeout(1000);
    const errorMsg = await frontPage.locator('.status-msg.error').innerText();
    if (!errorMsg.includes('重新确认被服务端拒绝')) {
      throw new Error(`[R-08 Failure] Expected refusal to be shown in UI, got: ${errorMsg}`);
    }
    console.log('[walkthrough] Server refusal correctly displayed in UI:', errorMsg);

    await frontPage.close();
    console.log('[walkthrough] All end-to-end walkthrough assertions PASSED!');
  } finally {
    await browser.close();
    await prisma.$disconnect();
    for (const proc of procs) kill(proc);
    await cleanRuntime();
  }
}

main().catch((err) => {
  console.error('[walkthrough] Error:', err);
  process.exit(1);
});
