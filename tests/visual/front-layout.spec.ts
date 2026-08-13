import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const frontScreenshots = [
  '01-square.png',
  '02-mood-create.png',
  '03-post-detail.png',
  '04-post-detail-reply-sheet.png',
  '05-letter-today.png',
  '06-tool-index.png',
  '07-tool-decompose.png',
  '08-me.png',
  '09-diary-list.png',
  '10-report-month.png',
  '11-letter-list.png',
  '12-favorite-list.png',
  '13-privacy-settings.png',
  '14-feedback-help.png',
];

describe('front visual layout capture', () => {
  it('captures all 14 front design pages and keeps page guards active', () => {
    for (const file of frontScreenshots) {
      const path = `artifacts/screenshots/front/${file}`;
      expect(fs.existsSync(path), path).toBe(true);
      expect(fs.statSync(path).size, path).toBeGreaterThan(10_000);
    }

    const routes = fs.readFileSync('apps/mp/src/router.ts', 'utf8');
    expect(routes).toContain('/pages/post/create');
    expect(routes).toContain('/pages/help/feedback');

    const styles = fs.readFileSync('apps/mp/src/styles/goodnight-theme.scss', 'utf8');
    expect(styles).toContain('--gn-bg');
    expect(styles).toContain('padding-bottom: calc(130px + env(safe-area-inset-bottom))');
  });
});
