import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';

const frontBase = process.env.FRONT_BASE_URL ?? 'http://127.0.0.1:5173';
const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api';
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://goodnight@127.0.0.1:55432/goodnight_treehole?schema=public';
const marker = `TEST_FINAL_PRIVATE_DIARY_${Date.now()}`;
const imagePath = path.resolve('design_refs/front/09-diary-list.png');
const reportPath = path.resolve('artifacts/test-report/final-private-diary-flow.json');
const tracePath = path.resolve('artifacts/traces/final/final-private-diary-flow.zip');
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

async function api<T>(url: string): Promise<T> {
  const response = await fetch(`${apiBase}${url}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${url} -> ${response.status}: ${JSON.stringify(body)}`);
  return body as T;
}

async function main() {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.mkdir(path.dirname(tracePath), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'zh-CN' });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  const report: Record<string, unknown> = { marker, startedAt: new Date().toISOString() };
  try {
    await page.goto(`${frontBase}/pages/mood/create`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('input-mood-content').fill(marker);
    await page.getByTestId('mood-visibility-private').click();
    const upload = page.waitForResponse((response) => response.url().includes('/api/v1/media/upload') && response.request().method() === 'POST');
    await page.getByTestId('input-mood-images').setInputFiles(imagePath);
    if (!(await upload).ok()) throw new Error('private diary media upload failed');
    await page.getByTestId('mood-image-preview').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('.upload-state').waitFor({ state: 'hidden', timeout: 10000 });
    const imageCount = await page.getByTestId('mood-image-preview').count();
    if (imageCount !== 1) throw new Error(`expected one real image preview, got ${imageCount}`);
    const publish = page.waitForResponse((response) => response.url().includes('/api/v1/moods') && response.request().method() === 'POST');
    await page.getByTestId('btn-submit-mood').click();
    if ((await publish).status() !== 201) throw new Error('private diary publication did not return 201');
    await page.waitForURL('**/pages/diary/index', { timeout: 10000 });
    const diaries = await api<{ items: Array<any> }>('/v1/diaries');
    const diary = diaries.items.find((item) => item.content === marker);
    if (!diary || diary.visibility === 'PUBLIC' || diary.attachments?.length !== 1 || !String(diary.attachments[0]?.url).startsWith('/uploads/')) {
      throw new Error(`private diary persistence failed: ${JSON.stringify(diary)}`);
    }
    const posts = await api<{ items: Array<any> }>('/v1/posts');
    if (posts.items.some((item) => item.content === marker)) throw new Error('private diary leaked into the public square API');
    const [persistedMood, persistedDiary, privatePost, privateJobs, privateLetters, attachedMedia] = await Promise.all([
      prisma.mood.findUnique({ where: { id: diary.moodId }, select: { id: true, content: true, visibility: true } }),
      prisma.diary.findUnique({ where: { id: diary.id }, select: { id: true, moodId: true, attachments: { select: { mediaAssetId: true } } } }),
      prisma.post.findFirst({ where: { moodId: diary.moodId }, select: { id: true } }),
      prisma.aIJob.findMany({ where: { contentId: diary.moodId }, select: { id: true, status: true } }),
      prisma.letter.findMany({ where: { sourceMoodId: diary.moodId }, select: { id: true } }),
      prisma.mediaAsset.findMany({ where: { id: { in: diary.attachments.map((item: { id: string }) => item.id) } }, select: { id: true, status: true, storageKey: true } }),
    ]);
    if (
      persistedMood?.content !== marker
      || persistedMood.visibility !== 'PRIVATE'
      || persistedDiary?.moodId !== diary.moodId
      || persistedDiary?.attachments.length !== 1
      || privatePost
      || privateJobs.length
      || privateLetters.length
      || attachedMedia.length !== 1
      || !attachedMedia[0]?.storageKey
    ) throw new Error(`private diary PostgreSQL isolation is inconsistent: ${JSON.stringify({ persistedMood, persistedDiary, privatePost, privateJobs, privateLetters, attachedMedia })}`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText(marker, { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
    const attachment = page.locator(`img[src="${diary.attachments[0].url}"]`);
    if (await attachment.count() !== 1) throw new Error('real diary attachment did not survive page refresh');
    report.ok = true;
    report.diary = { id: diary.id, moodId: diary.moodId, attachment: diary.attachments[0], postCount: 0, aiJobCount: 0, letterCount: 0 };
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

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
