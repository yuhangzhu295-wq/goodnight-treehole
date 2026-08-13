import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('real browser cross flow runner', () => {
  it('is wired to verify front-admin data flow with real URLs', () => {
    const script = fs.readFileSync('scripts/real-browser-cross-flow.ts', 'utf8');
    expect(script).toContain('/api/admin/v1/posts');
    expect(script).toContain('/api/v1/feedback');
    expect(script).toContain('real-browser-cross-flow.md');
  });
});
