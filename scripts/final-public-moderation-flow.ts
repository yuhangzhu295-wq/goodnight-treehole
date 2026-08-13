import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';

const frontBase = process.env.FRONT_BASE_URL ?? 'http://127.0.0.1:5173';
const adminBase = process.env.ADMIN_BASE_URL ?? 'http://127.0.0.1:5174';
const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api';
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://goodnight@127.0.0.1:55432/goodnight_treehole?schema=public';
const marker = `TEST_FINAL_PUBLIC_MODERATION_${Date.now()}`;
const reportPath = path.resolve('artifacts/test-report/final-public-moderation-flow.json');
const tracePath = path.resolve('artifacts/traces/final/final-public-moderation-flow.zip');
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${url}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${url} -> ${response.status}: ${JSON.stringify(body)}`);
  return body as T;
}

async function waitForPoeticJob(moodId: string) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const job = await prisma.aIJob.findFirst({
      where: { contentId: moodId, style: 'poetic' },
      select: { id: true, status: true, style: true, modelName: true, durationMs: true, result: true, traceJson: true, completedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    if (job && !['queued', 'running'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error('poetic public-reply job did not reach a terminal state within 180 seconds');
}

function hasLifecycleTrace(value: unknown) {
  if (!Array.isArray(value)) return false;
  const events = value as Array<{ event?: string; status?: string }>;
  return events.some((item) => item.event === 'queued' && item.status === 'queued')
    && events.some((item) => item.event === 'running' && item.status === 'running')
    && events.some((item) => item.event === 'terminal' && ['succeeded', 'fallback', 'failed'].includes(item.status ?? ''));
}

async function main() {
  await Promise.all([fs.mkdir(path.dirname(reportPath), { recursive: true }), fs.mkdir(path.dirname(tracePath), { recursive: true })]);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1448, height: 1086 }, locale: 'zh-CN' });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const front = await context.newPage();
  const admin = await context.newPage();
  const report: Record<string, unknown> = { marker, startedAt: new Date().toISOString() };
  try {
    await front.setViewportSize({ width: 430, height: 932 });
    await front.goto(`${frontBase}/pages/mood/create`, { waitUntil: 'domcontentloaded' });
    await front.getByTestId('input-mood-content').fill(marker);
    await front.getByTestId('mood-visibility-public').click();
    const styleControls = ['warm', 'rational', 'light', 'poetic', 'clear'];
    for (const style of styleControls) {
      const control = front.getByTestId(`mood-style-${style}`);
      if (await control.count() !== 1) throw new Error(`visible AI style control is missing: ${style}`);
      await control.click();
      if (await control.getAttribute('aria-pressed') !== 'true') throw new Error(`AI style control did not select: ${style}`);
    }
    await front.getByTestId('mood-style-poetic').click();
    if (await front.getByTestId('mood-style-poetic').getAttribute('aria-pressed') !== 'true') throw new Error('poetic reply style did not become selected in the visible form');
    const createResponse = front.waitForResponse((response) => response.url().includes('/api/v1/moods') && response.request().method() === 'POST');
    await front.getByTestId('btn-submit-mood').click();
    if ((await createResponse).status() !== 201) throw new Error('public mood publish did not return 201');
    await front.waitForURL('**/pages/post/detail**', { timeout: 10000 });

    const auth = await api<{ token: string }>('/admin/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
    const headers = { authorization: `Bearer ${auth.token}` };
    const created = await api<{ items: Array<{ id: string; moodId: string; reviewStatus: string }> }>(`/admin/v1/posts?q=${encodeURIComponent(marker)}`, { headers });
    const post = created.items.find((item) => item.reviewStatus === 'pending_review');
    if (!post) throw new Error('published public mood was not found as a pending admin post');
    const persistedPending = await prisma.post.findUnique({ where: { id: post.id }, select: { id: true, reviewStatus: true, mood: { select: { content: true, visibility: true } } } });
    if (persistedPending?.reviewStatus !== 'pending_review' || persistedPending.mood.content !== marker || persistedPending.mood.visibility !== 'PUBLIC') throw new Error('PostgreSQL pending-public write is inconsistent');
    const poeticJob = await waitForPoeticJob(post.moodId);
    if (poeticJob.style !== 'poetic' || !poeticJob.modelName || (poeticJob.durationMs ?? 0) <= 0 || !poeticJob.completedAt || !hasLifecycleTrace(poeticJob.traceJson)) {
      throw new Error(`public poetic style did not persist a complete asynchronous AI lifecycle: ${JSON.stringify(poeticJob)}`);
    }

    await admin.goto(`${adminBase}/login`, { waitUntil: 'domcontentloaded' });
    await admin.getByTestId('admin-login-username').fill('admin');
    await admin.getByTestId('admin-login-password').fill('admin123');
    await admin.getByTestId('admin-login-submit').click();
    await admin.waitForURL('**/dashboard', { timeout: 10000 });
    await admin.goto(`${adminBase}/posts`, { waitUntil: 'domcontentloaded' });
    await admin.getByTestId('admin-post-search').fill(marker);
    await admin.getByTestId('posts-row-first').waitFor({ state: 'visible', timeout: 10000 });
    await admin.getByTestId('posts-row-first').click();
    const approveResponse = admin.waitForResponse((response) => response.url().includes(`/api/admin/v1/posts/${post.id}/review`) && response.request().method() === 'PATCH');
    await admin.getByTestId('admin-post-approve').click();
    if (!(await approveResponse).ok()) throw new Error('admin approve request failed');

    await front.goto(`${frontBase}/pages/square/index`, { waitUntil: 'domcontentloaded' });
    await front.getByText(marker, { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
    const published = await api<{ items: Array<{ id: string }> }>('/v1/posts');
    if (!published.items.some((item) => item.id === post.id)) throw new Error('approved post is absent from public API');

    await admin.getByTestId('admin-post-more').click();
    await admin.getByTestId('admin-post-hide').click();
    const hideResponse = admin.waitForResponse((response) => response.url().includes(`/api/admin/v1/posts/${post.id}/review`) && response.request().method() === 'PATCH');
    await admin.getByTestId('admin-confirm-action').click();
    if (!(await hideResponse).ok()) throw new Error('admin hide request failed');
    await front.reload({ waitUntil: 'domcontentloaded' });
    if (await front.getByText(marker, { exact: true }).count()) throw new Error('hidden post is still visible in the public square DOM');
    const hidden = await api<{ items: Array<{ id: string }> }>('/v1/posts');
    if (hidden.items.some((item) => item.id === post.id)) throw new Error('hidden post is still visible in the public API');

    const restoreResponse = admin.waitForResponse((response) => response.url().includes(`/api/admin/v1/posts/${post.id}/review`) && response.request().method() === 'PATCH');
    await admin.getByTestId('admin-post-restore').click();
    if (!(await restoreResponse).ok()) throw new Error('admin restore request failed');
    await front.reload({ waitUntil: 'domcontentloaded' });
    await front.getByText(marker, { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
    const restored = await prisma.post.findUnique({ where: { id: post.id }, select: { reviewStatus: true, publishedAt: true } });
    if (restored?.reviewStatus !== 'published' || !restored.publishedAt) throw new Error('PostgreSQL restore write is inconsistent');
    report.ok = true;
    report.post = { id: post.id, moodId: post.moodId, finalReviewStatus: restored.reviewStatus };
    report.poeticAiJob = { id: poeticJob.id, style: poeticJob.style, status: poeticJob.status, modelName: poeticJob.modelName, durationMs: poeticJob.durationMs, visibleStyleControls: styleControls };
  } catch (error) {
    report.ok = false;
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    report.completedAt = new Date().toISOString();
    await context.tracing.stop({ path: tracePath }).catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
