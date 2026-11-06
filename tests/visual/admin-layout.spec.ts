import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { adminVisualPages } from '../../scripts/visual/admin-pages.ts';

// `capture-admin-pages.ts` writes `<name>-<width>.png` for every page in `adminVisualPages`,
// at both reference widths, and `compare-admin-designs.ts` reads exactly those paths back.
// This spec previously expected bare names (`login.png`, `dashboard.png`, ...) that nothing
// wrote, so it could never pass and said nothing about the real capture set. Asserting against
// the producer's own list keeps the two from drifting apart again.
const viewports = [1366, 1440] as const;
const screenshotDir = 'artifacts/screenshots/admin';

describe('admin visual layout capture', () => {
  it('captures every admin design page at both reference viewports', () => {
    expect(adminVisualPages).toHaveLength(10);

    for (const page of adminVisualPages) {
      for (const width of viewports) {
        const path = `${screenshotDir}/${page.name}-${width}.png`;
        expect(fs.existsSync(path), path).toBe(true);
        expect(fs.statSync(path).size, path).toBeGreaterThan(10_000);
      }
      expect(fs.existsSync(page.design), page.design).toBe(true);
    }

    const router = fs.readFileSync('apps/admin/src/router.ts', 'utf8');
    expect(router).toContain('/dashboard');
    expect(router).toContain('/ops/config');
    expect(router).toContain('/ai/jobs');
  });
});
