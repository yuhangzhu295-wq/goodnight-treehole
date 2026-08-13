/**
 * Live, non-destructive admin CRUD proof.
 *
 * This script deliberately does not import real-browser-utils: it must never
 * clean, start, stop, or otherwise replace the already running services.
 * It talks only to the active admin/API endpoints and verifies their durable
 * relational state through the active PostgreSQL instance.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

type Check = { name: string; ok: boolean; evidence?: string; error?: string };
type ReplyPreset = { id: string; text: string; scene: string; sortOrder: number; enabled: boolean };
type Faq = { id: string; question: string; answer: string; sortOrder: number; enabled: boolean };
type SystemSetting = { key: string; value: unknown; updatedAt?: string };
type ListResponse<T> = { items: T[]; total?: number };
type CreatedResponse<T> = { item: T };

const apiBase = process.env.FINAL_LIVE_API_BASE_URL ?? 'http://127.0.0.1:3000';
const adminBase = process.env.FINAL_LIVE_ADMIN_BASE_URL ?? 'http://127.0.0.1:5174';
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://goodnight@127.0.0.1:55432/goodnight_treehole?schema=public';
const marker = `TEST_FINAL_${new Date().toISOString().replace(/[-:.TZ]/g, '')}_${randomUUID().slice(0, 8)}`;
const startedAt = new Date().toISOString();
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

const checks: Check[] = [];
const cleanupChecks: Check[] = [];
const ids: { presetTarget?: string; presetAnchor?: string; faqTarget?: string; faqAnchor?: string } = {};
let token = '';
let currentItem = 'service-health';
let settingSnapshot: { key: string; value: boolean; expectedCurrentValue: boolean; existed: true } | undefined;
let settingChanged = false;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function safeOrigin(value: string) {
  const url = new URL(value);
  return url.origin;
}

function enforceLocalEndpoint(label: string, value: string, expectedPort: string) {
  const url = new URL(value);
  assert(['127.0.0.1', 'localhost'].includes(url.hostname), `${label} must use localhost, received ${url.hostname}`);
  assert(url.port === expectedPort, `${label} must use port ${expectedPort}, received ${url.port || '(default)'}`);
}

function enforceDatabase() {
  const url = new URL(databaseUrl);
  assert(url.protocol === 'postgresql:', 'DATABASE_URL must use PostgreSQL');
  assert(['127.0.0.1', 'localhost'].includes(url.hostname), `DATABASE_URL must use localhost, received ${url.hostname}`);
  assert(url.port === '55432', `DATABASE_URL must use port 55432, received ${url.port || '(default)'}`);
}

async function responseJson<T>(response: Response, description: string): Promise<T> {
  const raw = await response.text();
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`${description} returned invalid JSON (${response.status})`);
  }
  if (!response.ok) {
    const message = typeof parsed === 'object' && parsed && 'message' in parsed ? String((parsed as { message: unknown }).message) : raw.slice(0, 200);
    throw new Error(`${description} failed with HTTP ${response.status}: ${message}`);
  }
  return parsed as T;
}

async function adminJson<T>(pathName: string, init: RequestInit = {}) {
  assert(token, 'Admin token is unavailable');
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(`${apiBase}${pathName}`, { ...init, headers });
  return responseJson<T>(response, `${init.method ?? 'GET'} ${pathName}`);
}

async function publicJson<T>(pathName: string) {
  const response = await fetch(`${apiBase}${pathName}`);
  return responseJson<T>(response, `GET ${pathName}`);
}

async function step(name: string, action: () => Promise<string>) {
  currentItem = name;
  try {
    const evidence = await action();
    checks.push({ name, ok: true, evidence });
  } catch (error) {
    checks.push({ name, ok: false, error: errorText(error) });
    throw error;
  }
}

async function cleanupStep(name: string, action: () => Promise<string>) {
  try {
    const evidence = await action();
    cleanupChecks.push({ name, ok: true, evidence });
  } catch (error) {
    cleanupChecks.push({ name, ok: false, error: errorText(error) });
  }
}

async function listPresets() {
  return (await adminJson<ListResponse<ReplyPreset>>('/api/admin/v1/reply-presets?page=1&pageSize=100')).items;
}

async function listFaqs() {
  return (await adminJson<ListResponse<Faq>>('/api/admin/v1/faqs?page=1&pageSize=100')).items;
}

async function listSettings() {
  return (await adminJson<ListResponse<SystemSetting>>('/api/admin/v1/system/settings')).items;
}

function itemById<T extends { id: string }>(items: T[], id: string, label: string) {
  const item = items.find((candidate) => candidate.id === id);
  assert(item, `${label} ${id} was not returned by a fresh API read`);
  return item;
}

function hasMarker(value: string) {
  return value.includes(marker) && value.startsWith('TEST_FINAL_');
}

async function assertPresetDatabase(id: string, expected: Partial<ReplyPreset>) {
  const row = await prisma.replyPreset.findUnique({ where: { id } });
  assert(row, `ReplyPreset ${id} is absent from PostgreSQL`);
  for (const [key, value] of Object.entries(expected)) {
    assert(row[key as keyof ReplyPreset] === value, `ReplyPreset ${id} PostgreSQL ${key} did not equal ${String(value)}`);
  }
  return row;
}

async function assertFaqDatabase(id: string, expected: Partial<Faq>) {
  const row = await prisma.faqItem.findUnique({ where: { id } });
  assert(row, `FaqItem ${id} is absent from PostgreSQL`);
  for (const [key, value] of Object.entries(expected)) {
    assert(row[key as keyof Faq] === value, `FaqItem ${id} PostgreSQL ${key} did not equal ${String(value)}`);
  }
  return row;
}

async function deletePresetIfTemporary(id: string | undefined) {
  if (!id) return 'not-created';
  const row = await prisma.replyPreset.findUnique({ where: { id } });
  if (!row) return 'already-absent';
  assert(hasMarker(row.text), `Refusing to delete ReplyPreset ${id}: marker mismatch`);
  await adminJson<{ ok: boolean }>(`/api/admin/v1/reply-presets/${encodeURIComponent(id)}`, { method: 'DELETE' });
  assert(!(await prisma.replyPreset.findUnique({ where: { id } })), `ReplyPreset ${id} survived cleanup in PostgreSQL`);
  assert(!(await listPresets()).some((item) => item.id === id), `ReplyPreset ${id} survived cleanup API readback`);
  return 'deleted-and-reread';
}

async function deleteFaqIfTemporary(id: string | undefined) {
  if (!id) return 'not-created';
  const row = await prisma.faqItem.findUnique({ where: { id } });
  if (!row) return 'already-absent';
  assert(hasMarker(row.question) && hasMarker(row.answer), `Refusing to delete FaqItem ${id}: marker mismatch`);
  await adminJson<{ ok: boolean }>(`/api/admin/v1/faqs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  assert(!(await prisma.faqItem.findUnique({ where: { id } })), `FaqItem ${id} survived cleanup in PostgreSQL`);
  assert(!(await listFaqs()).some((item) => item.id === id), `FaqItem ${id} survived cleanup API readback`);
  return 'deleted-and-reread';
}

async function restoreSystemSetting() {
  if (!settingChanged || !settingSnapshot) return 'not-mutated';
  const currentApiValue = (await listSettings()).find((item) => item.key === settingSnapshot.key)?.value;
  const currentDatabaseRow = await prisma.systemSetting.findUnique({ where: { key: settingSnapshot.key } });
  assert(currentApiValue === settingSnapshot.expectedCurrentValue, `Refusing to overwrite externally changed ${settingSnapshot.key} value during cleanup`);
  assert(currentDatabaseRow?.value === settingSnapshot.expectedCurrentValue, `Refusing to overwrite PostgreSQL ${settingSnapshot.key} value that changed during cleanup`);
  await adminJson<ListResponse<SystemSetting>>('/api/admin/v1/system/settings', {
    method: 'PUT',
    body: JSON.stringify({ [settingSnapshot.key]: settingSnapshot.value }),
  });
  const apiValue = listSettings().then((items) => items.find((item) => item.key === settingSnapshot?.key)?.value);
  const dbRow = await prisma.systemSetting.findUnique({ where: { key: settingSnapshot.key } });
  assert(await apiValue === settingSnapshot.value, `${settingSnapshot.key} did not restore through fresh API readback`);
  assert(dbRow?.value === settingSnapshot.value, `${settingSnapshot.key} did not restore in PostgreSQL`);
  settingChanged = false;
  return `restored ${settingSnapshot.key}=${String(settingSnapshot.value)}`;
}

function markdown() {
  const rows = [...checks, ...cleanupChecks];
  return [
    '# Final live admin CRUD proof',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Run: \`${marker}\``,
    '',
    'This proof never starts, stops, cleans, or reseeds services. It uses the running admin/API services and the active PostgreSQL relation tables. Temporary ReplyPreset and FaqItem rows carry the run marker and are deleted through the live admin API in cleanup. Audit records created by those real administrative actions are intentionally retained.',
    '',
    `Checks: ${checks.length}; cleanup checks: ${cleanupChecks.length}; passed: ${rows.filter((row) => row.ok).length}; failed: ${rows.filter((row) => !row.ok).length}.`,
    '',
    '| Result | Check | Evidence |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| ${row.ok ? 'PASS' : 'FAIL'} | ${row.name} | ${(row.ok ? row.evidence : row.error) ?? ''} |`),
    '',
  ].join('\n');
}

async function writeArtifacts(status: 'PASS' | 'FAIL', failure?: string) {
  const reportDir = path.resolve('artifacts/test-report');
  const traceDir = path.resolve('artifacts/traces/final');
  const result = {
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    currentItem,
    failure,
    runId: marker,
    services: {
      admin: safeOrigin(adminBase),
      api: safeOrigin(apiBase),
      database: { host: new URL(databaseUrl).hostname, port: new URL(databaseUrl).port, database: new URL(databaseUrl).pathname.replace(/^\//, '') },
    },
    temporaryIds: ids,
    setting: settingSnapshot ? { key: settingSnapshot.key, originalValue: settingSnapshot.value, temporaryValue: settingSnapshot.expectedCurrentValue, restored: !settingChanged } : undefined,
    checks,
    cleanupChecks,
  };
  await Promise.all([
    fs.mkdir(reportDir, { recursive: true }),
    fs.mkdir(traceDir, { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(path.join(reportDir, 'final-live-admin-crud-report.md'), markdown(), 'utf8'),
    fs.writeFile(path.join(traceDir, 'final-live-admin-crud.json'), JSON.stringify(result, null, 2), 'utf8'),
  ]);
}

async function login() {
  const username = process.env.FINAL_LIVE_ADMIN_USERNAME ?? 'admin';
  const password = process.env.FINAL_LIVE_ADMIN_PASSWORD ?? 'admin123';
  const response = await fetch(`${apiBase}/api/admin/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await responseJson<{ token?: string }>(response, 'POST /api/admin/v1/auth/login');
  assert(body.token, 'Admin login returned no token');
  token = body.token;
}

async function runReplyPresetFlow() {
  const anchorText = `${marker}:reply-preset:anchor`;
  const initialText = `${marker}:reply-preset:initial`;
  const editedText = `${marker}:reply-preset:edited`;

  const anchor = await adminJson<CreatedResponse<ReplyPreset>>('/api/admin/v1/reply-presets', {
    method: 'POST', body: JSON.stringify({ text: anchorText, scene: 'comfort' }),
  });
  ids.presetAnchor = anchor.item.id;
  const target = await adminJson<CreatedResponse<ReplyPreset>>('/api/admin/v1/reply-presets', {
    method: 'POST', body: JSON.stringify({ text: initialText, scene: 'comfort' }),
  });
  ids.presetTarget = target.item.id;
  assert(hasMarker(anchor.item.text) && hasMarker(target.item.text), 'ReplyPreset test rows are missing TEST_FINAL markers');

  const created = itemById(await listPresets(), target.item.id, 'ReplyPreset');
  await assertPresetDatabase(target.item.id, { text: initialText, scene: 'comfort', enabled: true, sortOrder: created.sortOrder });

  await adminJson<CreatedResponse<ReplyPreset>>(`/api/admin/v1/reply-presets/${encodeURIComponent(target.item.id)}`, {
    method: 'PUT', body: JSON.stringify({ text: editedText, scene: 'support', sortOrder: created.sortOrder }),
  });
  const edited = itemById(await listPresets(), target.item.id, 'Edited ReplyPreset');
  assert(edited.text === editedText && edited.scene === 'support', 'ReplyPreset edit did not survive fresh API readback');
  await assertPresetDatabase(target.item.id, { text: editedText, scene: 'support' });

  const freshAnchor = itemById(await listPresets(), anchor.item.id, 'ReplyPreset sort companion');
  const targetSort = edited.sortOrder;
  await adminJson<CreatedResponse<ReplyPreset>>(`/api/admin/v1/reply-presets/${encodeURIComponent(freshAnchor.id)}`, {
    method: 'PATCH', body: JSON.stringify({ sortOrder: targetSort }),
  });
  await adminJson<CreatedResponse<ReplyPreset>>(`/api/admin/v1/reply-presets/${encodeURIComponent(edited.id)}`, {
    method: 'PATCH', body: JSON.stringify({ sortOrder: freshAnchor.sortOrder }),
  });
  const sortedTarget = itemById(await listPresets(), target.item.id, 'Sorted ReplyPreset');
  const sortedAnchor = itemById(await listPresets(), anchor.item.id, 'Sorted ReplyPreset companion');
  assert(sortedTarget.sortOrder < sortedAnchor.sortOrder, 'ReplyPreset temporary pair did not swap sort order');
  await assertPresetDatabase(target.item.id, { sortOrder: sortedTarget.sortOrder });

  await adminJson<CreatedResponse<ReplyPreset>>(`/api/admin/v1/reply-presets/${encodeURIComponent(target.item.id)}`, {
    method: 'PATCH', body: JSON.stringify({ enabled: false }),
  });
  const disabled = itemById(await listPresets(), target.item.id, 'Disabled ReplyPreset');
  assert(disabled.enabled === false, 'ReplyPreset disable did not survive fresh API readback');
  await assertPresetDatabase(target.item.id, { enabled: false });

  await adminJson<{ ok: boolean }>(`/api/admin/v1/reply-presets/${encodeURIComponent(target.item.id)}`, { method: 'DELETE' });
  assert(!(await listPresets()).some((item) => item.id === target.item.id), 'Deleted ReplyPreset survived API refresh');
  assert(!(await prisma.replyPreset.findUnique({ where: { id: target.item.id } })), 'Deleted ReplyPreset survived PostgreSQL refresh');
  return `created=${target.item.id}; edited; sorted ${targetSort}->${sortedTarget.sortOrder}; disabled; deleted with fresh API and PostgreSQL readback`;
}

async function runFaqFlow() {
  const anchorQuestion = `${marker}:faq:anchor`;
  const initialQuestion = `${marker}:faq:initial`;
  const initialAnswer = `${marker}:faq:initial-answer`;
  const editedQuestion = `${marker}:faq:edited`;
  const editedAnswer = `${marker}:faq:edited-answer`;

  const anchor = await adminJson<CreatedResponse<Faq>>('/api/admin/v1/faqs', {
    method: 'POST', body: JSON.stringify({ question: anchorQuestion, answer: `${marker}:faq:anchor-answer` }),
  });
  ids.faqAnchor = anchor.item.id;
  const target = await adminJson<CreatedResponse<Faq>>('/api/admin/v1/faqs', {
    method: 'POST', body: JSON.stringify({ question: initialQuestion, answer: initialAnswer }),
  });
  ids.faqTarget = target.item.id;
  assert(hasMarker(anchor.item.question) && hasMarker(target.item.question) && hasMarker(target.item.answer), 'FAQ test rows are missing TEST_FINAL markers');

  const created = itemById(await listFaqs(), target.item.id, 'FAQ');
  await assertFaqDatabase(target.item.id, { question: initialQuestion, answer: initialAnswer, enabled: true, sortOrder: created.sortOrder });

  await adminJson<CreatedResponse<Faq>>(`/api/admin/v1/faqs/${encodeURIComponent(target.item.id)}`, {
    method: 'PUT', body: JSON.stringify({ question: editedQuestion, answer: editedAnswer, sortOrder: created.sortOrder }),
  });
  const edited = itemById(await listFaqs(), target.item.id, 'Edited FAQ');
  assert(edited.question === editedQuestion && edited.answer === editedAnswer, 'FAQ edit did not survive fresh API readback');
  await assertFaqDatabase(target.item.id, { question: editedQuestion, answer: editedAnswer });

  const freshAnchor = itemById(await listFaqs(), anchor.item.id, 'FAQ sort companion');
  const targetSort = edited.sortOrder;
  await adminJson<CreatedResponse<Faq>>(`/api/admin/v1/faqs/${encodeURIComponent(freshAnchor.id)}`, {
    method: 'PATCH', body: JSON.stringify({ sortOrder: targetSort }),
  });
  await adminJson<CreatedResponse<Faq>>(`/api/admin/v1/faqs/${encodeURIComponent(edited.id)}`, {
    method: 'PATCH', body: JSON.stringify({ sortOrder: freshAnchor.sortOrder }),
  });
  const sortedTarget = itemById(await listFaqs(), target.item.id, 'Sorted FAQ');
  const sortedAnchor = itemById(await listFaqs(), anchor.item.id, 'Sorted FAQ companion');
  assert(sortedTarget.sortOrder < sortedAnchor.sortOrder, 'FAQ temporary pair did not swap sort order');
  await assertFaqDatabase(target.item.id, { sortOrder: sortedTarget.sortOrder });

  await adminJson<CreatedResponse<Faq>>(`/api/admin/v1/faqs/${encodeURIComponent(target.item.id)}`, {
    method: 'PATCH', body: JSON.stringify({ enabled: false }),
  });
  const disabled = itemById(await listFaqs(), target.item.id, 'Disabled FAQ');
  assert(disabled.enabled === false, 'FAQ disable did not survive fresh API readback');
  await assertFaqDatabase(target.item.id, { enabled: false });
  const publicFaqs = await publicJson<ListResponse<Pick<Faq, 'question'>>>('/api/v1/feedback/faqs');
  assert(!publicFaqs.items.some((item) => item.question === editedQuestion), 'Disabled FAQ still appears in the public FAQ API');

  await adminJson<{ ok: boolean }>(`/api/admin/v1/faqs/${encodeURIComponent(target.item.id)}`, { method: 'DELETE' });
  assert(!(await listFaqs()).some((item) => item.id === target.item.id), 'Deleted FAQ survived API refresh');
  assert(!(await prisma.faqItem.findUnique({ where: { id: target.item.id } })), 'Deleted FAQ survived PostgreSQL refresh');
  return `created=${target.item.id}; edited; sorted ${targetSort}->${sortedTarget.sortOrder}; disabled; deleted with fresh API and PostgreSQL readback`;
}

async function runSystemSettingFlow() {
  const settingKey = 'dailyDigestEnabled';
  const before = await prisma.systemSetting.findUnique({ where: { key: settingKey } });
  assert(before, `Refusing to create missing ${settingKey} setting in a live environment`);
  assert(typeof before.value === 'boolean', `${settingKey} must be boolean for the safe toggle proof`);
  const settings = await listSettings();
  const apiBefore = settings.find((item) => item.key === settingKey);
  assert(apiBefore?.value === before.value, `${settingKey} API/DB values disagree before mutation`);
  settingSnapshot = { key: settingKey, value: before.value, expectedCurrentValue: !before.value, existed: true };

  const nextValue = !before.value;
  await adminJson<ListResponse<SystemSetting>>('/api/admin/v1/system/settings', {
    method: 'PUT', body: JSON.stringify({ [settingKey]: nextValue }),
  });
  settingChanged = true;

  const apiAfter = (await listSettings()).find((item) => item.key === settingKey);
  const dbAfter = await prisma.systemSetting.findUnique({ where: { key: settingKey } });
  assert(apiAfter?.value === nextValue, `${settingKey} did not survive API refresh after save`);
  assert(dbAfter?.value === nextValue, `${settingKey} did not persist to PostgreSQL after save`);
  return `${settingKey}: ${String(before.value)}->${String(nextValue)}; fresh API and PostgreSQL readback succeeded`;
}

async function main() {
  let failure: string | undefined;
  try {
    enforceLocalEndpoint('FINAL_LIVE_API_BASE_URL', apiBase, '3000');
    enforceLocalEndpoint('FINAL_LIVE_ADMIN_BASE_URL', adminBase, '5174');
    enforceDatabase();

    await step('Live API and admin endpoints are reachable without service lifecycle changes', async () => {
      const [health, admin] = await Promise.all([
        fetch(`${apiBase}/api/health`),
        fetch(`${adminBase}/ops/config`),
      ]);
      assert(health.ok, `API health returned ${health.status}`);
      assert(admin.ok, `Admin document returned ${admin.status}`);
      const databaseProbe = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
      assert(databaseProbe.length === 1, 'PostgreSQL SELECT 1 did not return a row');
      return `admin=${safeOrigin(adminBase)}; api=${safeOrigin(apiBase)}; PostgreSQL=127.0.0.1:55432`;
    });

    await step('Admin authentication uses the active API', async () => {
      await login();
      return 'POST /api/admin/v1/auth/login returned an in-memory token (not written to trace)';
    });

    await step('Reply preset create, edit, sort, disable, delete, and refresh readback', runReplyPresetFlow);
    await step('FAQ create, edit, sort, disable, delete, and refresh readback', runFaqFlow);
    await step('System setting save, PostgreSQL persistence, and refresh readback', runSystemSettingFlow);
  } catch (error) {
    failure = errorText(error);
  } finally {
    currentItem = 'cleanup';
    await cleanupStep('Restore original system setting value', restoreSystemSetting);
    await cleanupStep('Delete TEST_FINAL reply preset sort companion', () => deletePresetIfTemporary(ids.presetAnchor));
    await cleanupStep('Delete TEST_FINAL reply preset target if still present', () => deletePresetIfTemporary(ids.presetTarget));
    await cleanupStep('Delete TEST_FINAL FAQ sort companion', () => deleteFaqIfTemporary(ids.faqAnchor));
    await cleanupStep('Delete TEST_FINAL FAQ target if still present', () => deleteFaqIfTemporary(ids.faqTarget));
    const failed = Boolean(failure) || checks.some((item) => !item.ok) || cleanupChecks.some((item) => !item.ok);
    await writeArtifacts(failed ? 'FAIL' : 'PASS', failure);
    await prisma.$disconnect();
  }
  if (failure || checks.some((item) => !item.ok) || cleanupChecks.some((item) => !item.ok)) {
    throw new Error(failure ?? 'Live admin CRUD proof did not complete cleanly');
  }
}

main().catch((error) => {
  console.error(errorText(error));
  process.exitCode = 1;
});
