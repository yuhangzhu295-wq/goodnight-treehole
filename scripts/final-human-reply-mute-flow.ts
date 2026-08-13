import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright';

type PrivacySetting = {
  defaultVisibility: 'PRIVATE' | 'PUBLIC';
  allowAnonymousPublic: boolean;
  allowHumanReplies: boolean;
  allowMonthlyReportShare: boolean;
};

type DemoUser = {
  id: string;
  nickname: string;
  status: 'normal' | 'limited' | 'banned';
};

type CreatedMood = {
  mood?: { id?: string };
  post?: { id?: string; moodId?: string; reviewStatus?: string };
  jobs?: Array<{ id?: string; status?: string }>;
};

type CreatedReply = { item?: { id?: string; status?: string } };

type Step = {
  name: string;
  ok: boolean;
  startedAt: string;
  completedAt: string;
  evidence?: string;
  error?: string;
};

type FlowReport = {
  marker: string;
  startedAt: string;
  completedAt?: string;
  ok?: boolean;
  error?: string;
  cleanupCommand: string;
  tracePath: string;
  steps: Step[];
  evidence: Record<string, unknown>;
  restoration?: { privacy?: string; userStatus?: string; errors: string[] };
};

const frontBase = process.env.FRONT_BASE_URL ?? 'http://127.0.0.1:5173';
const adminBase = process.env.ADMIN_BASE_URL ?? 'http://127.0.0.1:5174';
const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api';
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://goodnight@127.0.0.1:55432/goodnight_treehole?schema=public';
const marker = `TEST_FINAL_HUMAN_REPLY_MUTE_${Date.now()}`;
const reportPath = path.resolve('artifacts/test-report/final-human-reply-mute-flow.json');
const markdownPath = path.resolve('artifacts/test-report/final-human-reply-mute-flow.md');
const tracePath = path.resolve('artifacts/traces/final/final-human-reply-mute-flow.zip');
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asMessage(value: unknown) {
  if (value && typeof value === 'object' && 'message' in value) return String(value.message);
  return JSON.stringify(value);
}

function samePrivacy(left: PrivacySetting, right: PrivacySetting) {
  return left.defaultVisibility === right.defaultVisibility
    && left.allowAnonymousPublic === right.allowAnonymousPublic
    && left.allowHumanReplies === right.allowHumanReplies
    && left.allowMonthlyReportShare === right.allowMonthlyReportShare;
}

async function rawApi<T>(route: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${apiBase}${route}`, { ...init, headers });
  const body = await response.json().catch(() => ({})) as T;
  return { response, body };
}

async function api<T>(route: string, init: RequestInit = {}) {
  const result = await rawApi<T>(route, init);
  if (!result.response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${route} -> ${result.response.status}: ${asMessage(result.body)}`);
  }
  return result.body;
}

async function poll<T>(name: string, read: () => Promise<T>, accept: (value: T) => boolean, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await read();
    if (accept(last)) return last;
    await sleep(100);
  }
  throw new Error(`${name} did not reach the expected state: ${JSON.stringify(last)}`);
}

function markdown(report: FlowReport) {
  const escapeCell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
  const lines = [
    '# Final human reply and mute flow',
    '',
    `Marker: \`${report.marker}\``,
    `Result: ${report.ok ? 'PASS' : 'FAIL'}`,
    `Trace: \`${report.tracePath}\``,
    `Cleanup: \`${report.cleanupCommand}\``,
    '',
    '| Result | Check | Evidence |',
    '| --- | --- | --- |',
    ...report.steps.map((step) => `| ${step.ok ? 'PASS' : 'FAIL'} | ${escapeCell(step.name)} | ${escapeCell(step.evidence ?? step.error ?? '')} |`),
    '',
  ];
  if (report.error) lines.push(`Failure: ${report.error}`, '');
  if (report.restoration?.errors.length) lines.push(`Restoration warnings: ${report.restoration.errors.join('; ')}`, '');
  return lines.join('\n');
}

async function writeReport(report: FlowReport) {
  await Promise.all([
    fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8'),
    fs.writeFile(markdownPath, markdown(report), 'utf8'),
  ]);
}

async function loginAdmin(page: Page) {
  await page.goto(`${adminBase}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('admin-login-username').fill('admin');
  await page.getByTestId('admin-login-password').fill('admin123');
  await page.getByTestId('admin-login-submit').click();
  await page.waitForURL('**/dashboard', { timeout: 10_000 });
}

async function currentPrivacy() {
  return (await api<{ item: PrivacySetting }>('/v1/settings/privacy')).item;
}

async function setPrivacyThroughFront(page: Page, userId: string, expected: boolean) {
  await page.goto(`${frontBase}/pages/settings/privacy`, { waitUntil: 'domcontentloaded' });
  const toggle = page.getByTestId('toggle-privacy-human');
  await toggle.waitFor({ state: 'visible', timeout: 10_000 });
  const before = await toggle.getAttribute('aria-pressed');
  if (before !== String(expected)) {
    const response = page.waitForResponse((candidate) => candidate.url().includes('/api/v1/settings/privacy') && candidate.request().method() === 'PUT');
    await toggle.click();
    const written = await response;
    if (!written.ok()) throw new Error(`privacy UI save failed with ${written.status()}`);
  }
  const privacy = await poll('privacy API', currentPrivacy, (item) => item.allowHumanReplies === expected);
  const persisted = await prisma.privacySetting.findUnique({ where: { userId }, select: { allowHumanReplies: true } });
  if (persisted?.allowHumanReplies !== expected) throw new Error(`privacy PostgreSQL readback expected ${expected}, got ${persisted?.allowHumanReplies}`);
  return { changed: before !== String(expected), privacy };
}

async function setUserStatusThroughAdmin(page: Page, userId: string, status: 'limited' | 'normal') {
  await page.goto(`${adminBase}/users`, { waitUntil: 'domcontentloaded' });
  const search = page.getByTestId('admin-user-search');
  await search.fill(userId);
  const row = page.getByTestId('users-row-first');
  await row.waitFor({ state: 'visible', timeout: 10_000 });
  if (!(await row.innerText()).includes(userId)) throw new Error(`admin user search did not return ${userId}`);
  await row.click();
  await page.getByTestId('admin-detail-drawer').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByTestId('admin-user-more').click();
  const endpoint = `/api/admin/v1/users/${userId}/status`;
  const response = page.waitForResponse((candidate) => candidate.url().includes(endpoint) && candidate.request().method() === 'PATCH');
  await page.getByTestId(status === 'limited' ? 'admin-user-mute' : 'admin-user-restore').click();
  const written = await response;
  if (!written.ok()) throw new Error(`admin user ${status} request failed with ${written.status()}`);
  return await poll(
    `user ${status} PostgreSQL readback`,
    () => prisma.user.findUnique({ where: { id: userId }, select: { status: true } }),
    (item) => item?.status === status,
  );
}

async function publishPublicMood(page: Page, content: string) {
  await page.goto(`${frontBase}/pages/mood/create`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('input-mood-content').fill(content);
  await page.getByTestId('mood-visibility-public').click();
  const response = page.waitForResponse((candidate) => candidate.url().includes('/api/v1/moods') && candidate.request().method() === 'POST');
  await page.getByTestId('btn-submit-mood').click();
  const createdResponse = await response;
  if (createdResponse.status() !== 201) throw new Error(`front public mood did not return 201: ${createdResponse.status()}`);
  const created = await createdResponse.json() as CreatedMood;
  const postId = created.post?.id;
  const moodId = created.mood?.id ?? created.post?.moodId;
  if (!postId || !moodId) throw new Error(`public mood response did not include durable post and mood IDs: ${JSON.stringify(created)}`);
  await page.waitForURL('**/pages/post/detail**', { timeout: 10_000 });
  const persisted = await poll(
    'public mood PostgreSQL write',
    () => prisma.post.findUnique({ where: { id: postId }, select: { id: true, moodId: true, reviewStatus: true, content: true, visibility: true } }),
    (item) => item?.moodId === moodId && item.content === content && item.reviewStatus === 'pending_review' && item.visibility === 'PUBLIC',
  );
  return { postId, moodId, jobIds: (created.jobs ?? []).flatMap((job) => job.id ? [job.id] : []), persisted };
}

async function attemptPublicMood(page: Page, content: string): Promise<Response> {
  await page.goto(`${frontBase}/pages/mood/create`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('input-mood-content').fill(content);
  await page.getByTestId('mood-visibility-public').click();
  const response = page.waitForResponse((candidate) => candidate.url().includes('/api/v1/moods') && candidate.request().method() === 'POST');
  await page.getByTestId('btn-submit-mood').click();
  return await response;
}

async function approvePostThroughAdmin(page: Page, postId: string, content: string) {
  await page.goto(`${adminBase}/posts`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('admin-post-search').fill(content);
  await page.getByTestId('posts-row-first').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByTestId('posts-row-first').click();
  const response = page.waitForResponse((candidate) => candidate.url().includes(`/api/admin/v1/posts/${postId}/review`) && candidate.request().method() === 'PATCH');
  await page.getByTestId('admin-post-approve').click();
  const written = await response;
  if (!written.ok()) throw new Error(`admin post approval failed with ${written.status()}`);
  return await poll(
    'post approval PostgreSQL readback',
    () => prisma.post.findUnique({ where: { id: postId }, select: { reviewStatus: true, publishedAt: true } }),
    (item) => item?.reviewStatus === 'published' && Boolean(item.publishedAt),
  );
}

async function submitHumanReply(page: Page, postId: string, content: string) {
  await page.goto(`${frontBase}/pages/post/detail?id=${encodeURIComponent(postId)}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('reply-entry').click();
  const input = page.getByTestId('input-reply-content');
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill(content);
  const response = page.waitForResponse((candidate) => candidate.url().includes(`/api/v1/posts/${postId}/replies`) && candidate.request().method() === 'POST');
  await page.getByTestId('btn-submit-reply').click();
  return await response;
}

async function approveReplyThroughAdmin(page: Page, replyId: string, content: string) {
  await page.goto(`${adminBase}/replies/moderation`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('admin-reply-search').fill(content);
  await page.getByTestId('replies-row-first').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByTestId('replies-row-first').click();
  const response = page.waitForResponse((candidate) => candidate.url().includes(`/api/admin/v1/replies/${replyId}/review`) && candidate.request().method() === 'PATCH');
  await page.getByTestId('admin-reply-approve').click();
  const written = await response;
  if (!written.ok()) throw new Error(`admin reply approval failed with ${written.status()}`);
  return await poll(
    'reply approval PostgreSQL readback',
    () => prisma.reply.findUnique({ where: { id: replyId }, select: { status: true, type: true, content: true, postId: true } }),
    (item) => item?.status === 'published' && item.type === 'USER' && item.content === content,
  );
}

async function waitForTerminalAiJobs(jobIds: string[]) {
  if (!jobIds.length) throw new Error('public mood creation returned no asynchronous AI job ID');
  return await poll(
    'test-created AI jobs to reach terminal state',
    () => prisma.aIJob.findMany({ where: { id: { in: jobIds } }, select: { id: true, status: true, modelName: true, durationMs: true, completedAt: true } }),
    (items) => items.length === jobIds.length && items.every((item) => !['queued', 'running'].includes(item.status)),
    180_000,
  );
}

async function main() {
  await Promise.all([fs.mkdir(path.dirname(reportPath), { recursive: true }), fs.mkdir(path.dirname(tracePath), { recursive: true })]);
  const report: FlowReport = {
    marker,
    startedAt: new Date().toISOString(),
    cleanupCommand: 'pnpm tsx scripts/cleanup-visual-test-data.ts',
    tracePath: path.relative(process.cwd(), tracePath).replaceAll('\\', '/'),
    steps: [],
    evidence: {},
  };
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let front: Page | undefined;
  let admin: Page | undefined;
  let initialPrivacy: PrivacySetting | undefined;
  let initialUser: DemoUser | undefined;
  let adminToken = '';
  let userStatusTouched = false;
  let primaryError: unknown;

  const step = async <T>(name: string, work: () => Promise<{ value: T; evidence: string }>) => {
    const startedAt = new Date().toISOString();
    try {
      const result = await work();
      report.steps.push({ name, ok: true, startedAt, completedAt: new Date().toISOString(), evidence: result.evidence });
      await writeReport(report);
      return result.value;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.steps.push({ name, ok: false, startedAt, completedAt: new Date().toISOString(), error: message });
      await writeReport(report);
      throw error;
    }
  };

  try {
    await step('preflight: live API, PostgreSQL, and reply configuration', async () => {
      const [config, privacy, profile] = await Promise.all([
        api<{ item: { allowHumanRepliesDefault?: boolean } }>('/v1/config'),
        currentPrivacy(),
        api<{ item: DemoUser }>('/v1/me/profile'),
      ]);
      const persisted = await prisma.user.findUnique({ where: { id: profile.item.id }, select: { id: true, status: true } });
      if (config.item.allowHumanRepliesDefault === false) throw new Error('system-level human replies are currently disabled; refusing to change global settings in a final live flow');
      if (!persisted || persisted.status !== 'normal' || profile.item.status !== 'normal') {
        throw new Error(`demo user must be normal before this flow; API=${profile.item.status}, PostgreSQL=${persisted?.status ?? 'missing'}`);
      }
      initialPrivacy = privacy;
      initialUser = profile.item;
      const login = await api<{ token: string }>('/admin/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'admin', password: 'admin123' }),
      });
      adminToken = login.token;
      report.evidence.preflight = { userId: profile.item.id, privacy: { allowHumanReplies: privacy.allowHumanReplies }, userStatus: persisted.status };
      return { value: undefined, evidence: `user=${profile.item.id}; privacy=${privacy.allowHumanReplies}; PostgreSQL=${persisted.status}` };
    });

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 430, height: 932 } });
    await context.tracing.start({ screenshots: true, snapshots: true });
    front = await context.newPage();
    admin = await context.newPage();
    await admin.setViewportSize({ width: 1440, height: 900 });
    await loginAdmin(admin);

    await step('allow human replies and persist the owner preference', async () => {
      if (!initialUser) throw new Error('missing preflight user');
      const result = await setPrivacyThroughFront(front!, initialUser.id, true);
      report.evidence.allowHumanReplies = { allowHumanReplies: result.privacy.allowHumanReplies, changedFromInitial: result.changed };
      return { value: undefined, evidence: `allowHumanReplies=${result.privacy.allowHumanReplies}; changed=${result.changed}` };
    });

    const publicPost = await step('front public mood -> admin approval -> front square visibility', async () => {
      const content = `${marker} 真人回应审核链路`;
      const created = await publishPublicMood(front!, content);
      const approved = await approvePostThroughAdmin(admin!, created.postId, content);
      await front!.goto(`${frontBase}/pages/square/index`, { waitUntil: 'domcontentloaded' });
      await front!.getByText(content, { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
      const publicPosts = await api<{ items: Array<{ id: string }> }>('/v1/posts');
      if (!publicPosts.items.some((item) => item.id === created.postId)) throw new Error('approved post is absent from the public posts API');
      report.evidence.publicPost = { id: created.postId, moodId: created.moodId, reviewStatus: approved?.reviewStatus, jobIds: created.jobIds };
      return { value: created, evidence: `post=${created.postId}; mood=${created.moodId}; published=${approved?.publishedAt?.toISOString() ?? 'yes'}` };
    });

    await step('human replies allowed -> front submit -> admin approve -> front visible', async () => {
      const content = `${marker} 首次真人回应`;
      const response = await submitHumanReply(front!, publicPost.postId, content);
      if (response.status() !== 201) throw new Error(`allowed human reply did not return 201: ${response.status()}`);
      const created = await response.json() as CreatedReply;
      const replyId = created.item?.id;
      if (!replyId) throw new Error(`allowed human reply did not return a reply ID: ${JSON.stringify(created)}`);
      const pending = await poll(
        'pending human reply PostgreSQL write',
        () => prisma.reply.findUnique({ where: { id: replyId }, select: { status: true, type: true, content: true, postId: true } }),
        (item) => item?.status === 'pending_review' && item.type === 'USER' && item.content === content && item.postId === publicPost.postId,
      );
      await approveReplyThroughAdmin(admin!, replyId, content);
      await front!.goto(`${frontBase}/pages/post/detail?id=${encodeURIComponent(publicPost.postId)}`, { waitUntil: 'domcontentloaded' });
      await front!.getByText(content, { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
      const visibleReplies = await api<{ items: Array<{ id: string }> }>(`/v1/posts/${publicPost.postId}/replies`);
      if (!visibleReplies.items.some((item) => item.id === replyId)) throw new Error('approved human reply is absent from the front replies API');
      report.evidence.firstReply = { id: replyId, pendingStatus: pending?.status, visibleAfterApproval: true };
      return { value: undefined, evidence: `reply=${replyId}; pending->published; front-visible=true` };
    });

    await step('close human replies -> UI attempt receives a server 403 without a persisted reply', async () => {
      if (!initialUser) throw new Error('missing preflight user');
      const result = await setPrivacyThroughFront(front!, initialUser.id, false);
      const content = `${marker} 关闭后必须拒绝`;
      const response = await submitHumanReply(front!, publicPost.postId, content);
      const body = await response.json().catch(() => ({}));
      if (response.status() !== 403) throw new Error(`closed human reply expected 403, got ${response.status()}: ${asMessage(body)}`);
      const persisted = await prisma.reply.findFirst({ where: { content }, select: { id: true } });
      if (persisted) throw new Error(`forbidden human reply was persisted as ${persisted.id}`);
      report.evidence.forbiddenReply = { status: response.status(), message: asMessage(body), persisted: false, preference: result.privacy.allowHumanReplies };
      return { value: undefined, evidence: `HTTP=${response.status()}; PostgreSQL reply=false` };
    });

    await step('restore human replies -> a second front submission succeeds', async () => {
      if (!initialUser) throw new Error('missing preflight user');
      const result = await setPrivacyThroughFront(front!, initialUser.id, true);
      const content = `${marker} 恢复后的真人回应`;
      const response = await submitHumanReply(front!, publicPost.postId, content);
      if (response.status() !== 201) throw new Error(`restored human reply did not return 201: ${response.status()}`);
      const created = await response.json() as CreatedReply;
      const replyId = created.item?.id;
      if (!replyId) throw new Error(`restored human reply did not return an ID: ${JSON.stringify(created)}`);
      const persisted = await poll(
        'restored human reply PostgreSQL write',
        () => prisma.reply.findUnique({ where: { id: replyId }, select: { status: true, type: true, content: true } }),
        (item) => item?.status === 'pending_review' && item.type === 'USER' && item.content === content,
      );
      report.evidence.restoredReply = { id: replyId, status: persisted?.status, preference: result.privacy.allowHumanReplies };
      return { value: undefined, evidence: `reply=${replyId}; HTTP=201; PostgreSQL=${persisted?.status}` };
    });

    const recoveryPost = await step('admin mute -> front publication gets a server 403 -> admin restore -> front publication succeeds', async () => {
      if (!initialUser) throw new Error('missing preflight user');
      await setUserStatusThroughAdmin(admin!, initialUser.id, 'limited');
      userStatusTouched = true;
      const rejectedContent = `${marker} 禁言后必须拒绝发布`;
      const rejected = await attemptPublicMood(front!, rejectedContent);
      const rejectedBody = await rejected.json().catch(() => ({}));
      if (rejected.status() !== 403) throw new Error(`muted publication expected 403, got ${rejected.status()}: ${asMessage(rejectedBody)}`);
      await front!.locator('.error-text').waitFor({ state: 'visible', timeout: 10_000 });
      const rejectedMood = await prisma.mood.findFirst({ where: { content: rejectedContent }, select: { id: true } });
      if (rejectedMood) throw new Error(`muted publication was persisted as mood ${rejectedMood.id}`);
      await setUserStatusThroughAdmin(admin!, initialUser.id, 'normal');
      const recoveredContent = `${marker} 恢复禁言后重新发布`;
      const recovered = await publishPublicMood(front!, recoveredContent);
      const persistedUser = await prisma.user.findUnique({ where: { id: initialUser.id }, select: { status: true } });
      if (persistedUser?.status !== 'normal') throw new Error(`user restore did not persist normal status: ${persistedUser?.status}`);
      report.evidence.mute = { rejectedStatus: rejected.status(), rejectedPersisted: false, restoredStatus: persistedUser.status, recoveryPostId: recovered.postId, recoveryMoodId: recovered.moodId };
      return { value: recovered, evidence: `muted=403; rejectedPost=false; restored=normal; recoveryPost=${recovered.postId}` };
    });

    await step('all public-flow AI jobs reach a terminal state so cleanup is race-free', async () => {
      const jobs = await waitForTerminalAiJobs([...publicPost.jobIds, ...recoveryPost.jobIds]);
      report.evidence.terminalJobs = jobs;
      return { value: undefined, evidence: `jobs=${jobs.map((job) => `${job.id}:${job.status}`).join(', ')}` };
    });

    report.ok = true;
  } catch (error) {
    primaryError = error;
    report.ok = false;
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    const restorationErrors: string[] = [];
    const restoration: FlowReport['restoration'] = { errors: restorationErrors };
    if (initialPrivacy) {
      try {
        const current = await currentPrivacy();
        if (!samePrivacy(current, initialPrivacy)) {
          await api<{ item: PrivacySetting }>('/v1/settings/privacy', { method: 'PUT', body: JSON.stringify(initialPrivacy) });
        }
        const persisted = await poll('privacy restoration PostgreSQL readback', currentPrivacy, (item) => samePrivacy(item, initialPrivacy));
        restoration.privacy = `restored allowHumanReplies=${persisted.allowHumanReplies}`;
      } catch (error) {
        restorationErrors.push(`privacy: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (initialUser && adminToken && userStatusTouched) {
      try {
        const current = await prisma.user.findUnique({ where: { id: initialUser.id }, select: { status: true } });
        if (current?.status !== initialUser.status) {
          await api(`/admin/v1/users/${initialUser.id}/status`, {
            method: 'PATCH',
            headers: { authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ status: initialUser.status }),
          });
        }
        const persisted = await poll(
          'user-status restoration PostgreSQL readback',
          () => prisma.user.findUnique({ where: { id: initialUser.id }, select: { status: true } }),
          (item) => item?.status === initialUser.status,
        );
        restoration.userStatus = `restored status=${persisted?.status}`;
      } catch (error) {
        restorationErrors.push(`user status: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    report.restoration = restoration;
    if (restorationErrors.length) {
      report.ok = false;
      report.error = [report.error, `restoration failed: ${restorationErrors.join('; ')}`].filter(Boolean).join(' | ');
    }
    report.completedAt = new Date().toISOString();
    if (context) await context.tracing.stop({ path: tracePath }).catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await writeReport(report);
  }

  if (primaryError) throw primaryError;
  if (report.restoration?.errors.length) throw new Error(report.restoration.errors.join('; '));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
