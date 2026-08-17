import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const front = 'http://127.0.0.1:5173';
const admin = 'http://127.0.0.1:5174';
const outDir = 'docs/evidence/goodnight-2.0-phase2';

async function settle(page: import('playwright').Page) {
  await new Promise((resolve) => setTimeout(resolve, 700));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const journeyResponse = await fetch('http://127.0.0.1:3000/api/v1/journeys');
  const journeys = await journeyResponse.json() as { items: Array<{ journey: { id: string } }> };
  const journeyId = journeys.items[0]?.journey.id;
  if (!journeyId) throw new Error('没有可供截图的真实 journey');

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
  const page = await context.newPage();
  const report: Array<Record<string, unknown>> = [];
  const captures: Array<[string, string]> = [
    ['01-tonight.png', '/pages/tonight/index'],
    ['02-journey.png', `/pages/journey/detail?id=${journeyId}`],
    ['03-need-routing.png', `/pages/journey/detail?id=${journeyId}`],
    ['04-fingerprint.png', `/pages/journey/detail?id=${journeyId}`],
    ['05-action.png', '/pages/action/index'],
    ['06-action-missed-state.png', '/pages/action/index'],
    ['07-peer-match.png', '/pages/peers/index'],
    ['08-peer-requests.png', '/pages/peer/requests'],
    ['09-peer-detail.png', '/pages/peer/detail'],
    ['10-peer-conversation.png', '/pages/peer/conversation?matchId=unavailable'],
    ['11-journey-timeline.png', `/pages/journey/detail?id=${journeyId}`],
    ['12-decision-vault.png', '/pages/action/index'],
    ['13-cooldown.png', '/pages/action/index'],
    ['14-reality-handoff.png', '/pages/reality-handoff/index'],
    ['15-future-self.png', '/pages/future-self/index'],
    ['16-support-plan.png', '/pages/action/index'],
    ['17-recovery.png', '/pages/recovery/index'],
    ['18-me.png', '/pages/me/index'],
    ['19-report.png', '/pages/report/month'],
    ['20-privacy.png', '/pages/settings/privacy'],
  ];

  try {
    for (const [name, path] of captures) {
      await page.goto(`${front}${path}`, { waitUntil: 'domcontentloaded' });
      await settle(page);
      const file = `${outDir}/${name}`;
      await page.screenshot({ path: file, fullPage: true });
      const bytes = await fs.readFile(file);
      const metrics = await page.evaluate(() => ({ url: location.href, width: document.documentElement.scrollWidth, viewport: window.innerWidth, text: document.body.innerText.slice(0, 140) }));
      report.push({ name, file: `${process.cwd()}\\${file}`, url: metrics.url, viewport: `${metrics.viewport}x844`, horizontalOverflow: metrics.width > metrics.viewport, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), sample: metrics.text });
    }

    const adminPage = await context.newPage();
    await adminPage.setViewportSize({ width: 1448, height: 1086 });
    await adminPage.goto(`${admin}/login`, { waitUntil: 'domcontentloaded' });
    await adminPage.getByTestId('admin-login-username').fill('admin');
    await adminPage.getByTestId('admin-login-password').fill('admin123');
    await adminPage.getByTestId('admin-login-submit').click();
    await adminPage.waitForURL('**/dashboard');
    for (const [name, path] of [['21-admin-dashboard.png', '/dashboard'], ['22-admin-peer-experiences.png', '/experience/peers'], ['23-admin-follow-ups.png', '/experience/follow-ups']] as const) {
      await adminPage.goto(`${admin}${path}`, { waitUntil: 'domcontentloaded' });
      await settle(adminPage);
      const file = `${outDir}/${name}`;
      await adminPage.screenshot({ path: file, fullPage: true });
      const bytes = await fs.readFile(file);
      const metrics = await adminPage.evaluate(() => ({ url: location.href, width: document.documentElement.scrollWidth, viewport: window.innerWidth, text: document.body.innerText.slice(0, 140) }));
      report.push({ name, file: `${process.cwd()}\\${file}`, url: metrics.url, viewport: `${metrics.viewport}x1086`, horizontalOverflow: metrics.width > metrics.viewport, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), sample: metrics.text });
    }
    await fs.writeFile(`${outDir}/capture-report.json`, JSON.stringify({ generatedAt: new Date().toISOString(), captures: report }, null, 2));
    console.log(`captured=${report.length} overflow=${report.filter((item) => item.horizontalOverflow).length}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
