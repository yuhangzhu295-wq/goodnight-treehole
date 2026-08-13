import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('real browser admin clicks runner', () => {
  it('is wired as a real-DOM admin browser verification script', () => {
    const script = fs.readFileSync('scripts/real-browser-admin-clicks.ts', 'utf8');
    expect(script).toContain('ensureNoVisibleTestWords');
    expect(script).toContain('getByTestId');
    expect(script).toContain('current-admin-dashboard.png');
    expect(script).toContain('real-user-admin.md');
    expect(script).toContain('/api/admin/v1/system/settings');
  });
});
