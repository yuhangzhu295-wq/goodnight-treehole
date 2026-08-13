import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const frontBase = process.env.FRONT_BASE_URL ?? 'http://127.0.0.1:5173';
const adminBase = process.env.ADMIN_BASE_URL ?? 'http://127.0.0.1:5174';
const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api';
const marker = `TEST_FINAL_FEEDBACK_UPLOAD_${Date.now()}`;
const replyText = `已处理：${marker}`;
const reportPath = path.resolve('artifacts/test-report/final-feedback-upload-flow.json');
const tracePath = path.resolve('artifacts/traces/final/final-feedback-upload-flow.zip');
const imagePath = path.resolve('design_refs/front/14-feedback-help.png');

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${url}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${url} -> ${response.status}: ${JSON.stringify(body)}`);
  return body as T;
}

async function chooseScreenshot(page: import('playwright').Page, testId: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId(testId).click();
  await (await chooser).setFiles(imagePath);
}

async function main() {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.mkdir(path.dirname(tracePath), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'zh-CN' });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const front = await context.newPage();
  const admin = await context.newPage();
  const report: Record<string, unknown> = { marker, startedAt: new Date().toISOString() };
  try {
    await front.goto(`${frontBase}/pages/help/feedback`, { waitUntil: 'domcontentloaded' });
    await front.getByTestId('input-feedback-content').fill(marker);
    await chooseScreenshot(front, 'btn-feedback-upload');
    await front.getByTestId('feedback-upload-preview').getByText('1').waitFor({ state: 'visible', timeout: 10000 });
    await chooseScreenshot(front, 'btn-feedback-upload-2');
    await front.getByTestId('feedback-upload-preview').getByText('2').waitFor({ state: 'visible', timeout: 10000 });
    const submitResponse = front.waitForResponse((response) => response.url().includes('/api/v1/feedback') && response.request().method() === 'POST');
    await front.getByTestId('btn-feedback-submit').click();
    const submitted = await submitResponse;
    if (submitted.status() !== 201) throw new Error(`feedback submission failed with ${submitted.status()}`);

    const login = await api<{ token: string }>('/admin/v1/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    const auth = { authorization: `Bearer ${login.token}` };
    const tickets = await api<{ items: Array<any> }>('/admin/v1/feedback/tickets?page=1&pageSize=100', { headers: auth });
    const ticket = tickets.items.find((item) => item.content === marker);
    if (!ticket || ticket.screenshots?.length !== 2 || !ticket.screenshots.every((item: any) => typeof item.url === 'string' && item.url.startsWith('/uploads/'))) {
      throw new Error(`ticket persistence/readback failed: ${JSON.stringify(ticket)}`);
    }
    const mediaCheck = await fetch(`http://127.0.0.1:3000${ticket.screenshots[0].url}`);
    if (!mediaCheck.ok || !String(mediaCheck.headers.get('content-type')).startsWith('image/')) throw new Error('persisted feedback media is not readable');

    await admin.goto(`${adminBase}/login`, { waitUntil: 'domcontentloaded' });
    await admin.getByTestId('admin-login-username').fill('admin');
    await admin.getByTestId('admin-login-password').fill('admin123');
    await admin.getByTestId('admin-login-submit').click();
    await admin.waitForURL('**/dashboard', { timeout: 10000 });
    await admin.goto(`${adminBase}/ops/feedback`, { waitUntil: 'domcontentloaded' });
    await admin.getByTestId('admin-feedback-search').fill(marker);
    await admin.getByTestId('tickets-row-first').waitFor({ state: 'visible', timeout: 10000 });
    await admin.getByTestId('tickets-row-first').click();
    await admin.getByTestId('admin-detail-drawer').waitFor({ state: 'visible', timeout: 10000 });
    const responseTextarea = admin.locator('[data-testid="admin-detail-drawer"] textarea');
    if (await responseTextarea.count() !== 1) throw new Error('feedback reply editor is not uniquely available');
    await responseTextarea.fill(replyText);
    const replyResponse = admin.waitForResponse((response) => response.url().includes(`/api/admin/v1/feedback/${ticket.id}/reply`) && response.request().method() === 'POST');
    await admin.getByTestId('admin-ticket-reply').click();
    if (!(await replyResponse).ok()) throw new Error('admin reply failed');
    const resolvedResponse = admin.waitForResponse((response) => response.url().includes(`/api/admin/v1/feedback/${ticket.id}/status`) && response.request().method() === 'PATCH');
    await admin.getByTestId('admin-ticket-resolve').click();
    if (!(await resolvedResponse).ok()) throw new Error('admin resolve failed');

    const finalTicket = await api<{ item: any }>(`/admin/v1/feedback/tickets/${ticket.id}`, { headers: auth });
    if (finalTicket.item.status !== 'resolved' || finalTicket.item.reply !== replyText || !finalTicket.item.repliedAt) throw new Error(`ticket lifecycle failed: ${JSON.stringify(finalTicket.item)}`);
    await front.reload({ waitUntil: 'domcontentloaded' });
    const frontTicket = front.getByTestId(`feedback-ticket-${ticket.id}`);
    await frontTicket.waitFor({ state: 'visible', timeout: 10000 });
    const frontText = await frontTicket.innerText();
    if (!frontText.includes(marker) || !frontText.includes(replyText) || !frontText.includes('已解决')) throw new Error(`front ticket readback failed: ${frontText}`);
    report.ticket = { id: ticket.id, screenshots: ticket.screenshots.map((item: any) => ({ id: item.id, url: item.url })), status: finalTicket.item.status, repliedAt: finalTicket.item.repliedAt };
    report.ok = true;
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

main().catch((error) => { console.error(error); process.exitCode = 1; });
