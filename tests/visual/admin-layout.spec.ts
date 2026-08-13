import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const adminScreenshots = [
  'login.png',
  'dashboard.png',
  'users.png',
  'posts.png',
  'replies-moderation.png',
  'ai-providers.png',
  'ai-routes.png',
  'ai-jobs.png',
  'ops-feedback.png',
  'ops-config.png',
];

describe('admin visual layout capture', () => {
  it('captures the 10 required admin design pages', () => {
    for (const file of adminScreenshots) {
      const path = `artifacts/screenshots/admin/${file}`;
      expect(fs.existsSync(path), path).toBe(true);
      expect(fs.statSync(path).size, path).toBeGreaterThan(10_000);
    }

    const router = fs.readFileSync('apps/admin/src/router.ts', 'utf8');
    expect(router).toContain('/dashboard');
    expect(router).toContain('/ops/config');
    expect(router).toContain('/ai/jobs');
  });
});
