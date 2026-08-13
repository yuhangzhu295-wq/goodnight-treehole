import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { Page } from 'playwright';

export type FrontRestContract = {
  page: string;
  designRef: string;
  route: string;
  visibleText: string;
  selector: string;
  expectedAction: string;
  expectedUrl: string;
  expectedApi: string;
  expectedDomChange: string;
  expectedStoreChange: string;
  mustBeRealDomControl: boolean;
  forbidOverlayProxy: boolean;
};

export const frontRestRoutes = [
  '/pages/tool/index',
  '/pages/tool/decompose',
  '/pages/tool/run',
  '/pages/me/index',
  '/pages/diary/index',
  '/pages/diary/list',
  '/pages/report/month',
  '/pages/letter/today',
  '/pages/letter/index',
  '/pages/letter/list',
  '/pages/letter/detail',
  '/pages/favorite/index',
  '/pages/favorite/list',
  '/pages/settings/privacy',
  '/pages/settings/data-policy',
  '/pages/help/feedback',
  '/pages/feedback/index',
  '/pages/help/faqs',
];

export const forbiddenFrontRestTerms = [
  'interaction-layer',
  'hotspot',
  'proxy-button',
  'click-layer',
  'test-layer',
  'Rewrite',
  'Rant',
  'Heal',
  'Sleep',
  'Work',
  'Future',
  'Poster',
  'Save',
  'Clear data',
  'Live backend sync ok',
];

export const frontRestArtifacts = {
  runtime: 'artifacts/diagnosis/front-rest-runtime.json',
  overlay: 'artifacts/diagnosis/front-rest-overlay-report.md',
  routes: 'artifacts/diagnosis/front-rest-routes-report.md',
  api: 'artifacts/diagnosis/front-rest-api-report.md',
  clickabilityJson: 'artifacts/diagnosis/front-rest-clickability-report.json',
  clickabilityMd: 'artifacts/diagnosis/front-rest-clickability-report.md',
  diagnosis: 'docs/front-rest-current-diagnosis.md',
};

export async function ensureFrontRestDirs() {
  await Promise.all([
    fs.mkdir('artifacts/diagnosis', { recursive: true }),
    fs.mkdir('artifacts/screenshots/front-rest/before', { recursive: true }),
    fs.mkdir('artifacts/screenshots/front-rest/after', { recursive: true }),
    fs.mkdir('artifacts/traces/front-rest', { recursive: true }),
    fs.mkdir('artifacts/test-report', { recursive: true }),
    fs.mkdir('docs', { recursive: true }),
  ]);
}

export async function readFrontRestContracts() {
  return JSON.parse(await fs.readFile('tests/contracts/front-phase2-phase3-interactions.json', 'utf8')) as FrontRestContract[];
}

export function apiMatcher(expected: string) {
  if (!expected) return undefined;
  const [method, rawPath] = expected.split(' ');
  const [pathOnly, query] = rawPath.split('?');
  const pattern = pathOnly
    .split('/')
    .map((part) => (part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  const queryPattern = query
    ? `\\?${query.split(/(:[A-Za-z][A-Za-z0-9_]*)/).map((part) => part.startsWith(':') ? '[^&/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')}`
    : '(?:\\?.*)?';
  return { method, regex: new RegExp(`^${pattern}${queryPattern}$`) };
}

export async function hashFile(file: string) {
  try {
    const content = await fs.readFile(file);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
}

export function killPorts() {
  const ps = `
    $ports = @(3000,5173,5174)
    foreach ($port in $ports) {
      $ids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
      foreach ($id in $ids) {
        if ($id -and $id -ne $PID) {
          Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
        }
      }
    }
  `;
  spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
}

export async function waitForUrl(url: string, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

export async function inspectElementFromPoint(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  await locator.waitFor({ state: 'visible', timeout: 5000 });
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center' }));
  await page.waitForTimeout(80);
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No bounding box for ${testId}`);
  return page.evaluate(
    ({ x, y, testId: expected }) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const closest = el?.closest('[data-testid]') as HTMLElement | null;
      const className = `${el?.className ?? ''} ${closest?.className ?? ''}`;
      const hitTestId = closest?.getAttribute('data-testid') ?? el?.getAttribute('data-testid') ?? '';
      return {
        tagName: el?.tagName ?? '',
        text: (el?.textContent ?? '').trim().slice(0, 80),
        hitTestId,
        matchesExpected: hitTestId === expected,
        forbiddenLayer: /interaction-layer|hotspot|proxy-button|click-layer|test-layer|ref-shell|ref-content/i.test(className),
      };
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2, testId },
  );
}
