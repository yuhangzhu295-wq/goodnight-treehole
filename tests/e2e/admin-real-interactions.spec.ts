import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('admin real interaction manifest', () => {
  it('keeps the admin click-all manifest wired to the Playwright runner', () => {
    const manifest = JSON.parse(fs.readFileSync('tests/interaction-manifest.admin.json', 'utf8')) as Array<{ selector: string; expectedApi?: string | null }>;
    expect(fs.existsSync('scripts/test-click-all.ts')).toBe(true);
    expect(manifest.some((item) => item.selector === 'admin-login-submit' && item.expectedApi === 'POST /api/admin/v1/auth/login')).toBe(true);
    expect(manifest.some((item) => item.selector === 'admin-post-approve' && item.expectedApi === 'PATCH /api/admin/v1/posts/:id/review')).toBe(true);
    expect(manifest.some((item) => item.selector === 'admin-route-test-warm' && item.expectedApi === 'POST /api/admin/v1/ai/routes/:style/test')).toBe(true);
  });
});
