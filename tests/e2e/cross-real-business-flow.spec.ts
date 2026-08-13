import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('cross real business flow runner', () => {
  it('keeps the cross-terminal Playwright business flow in qa:all', () => {
    const qa = fs.readFileSync('scripts/qa-all.ts', 'utf8');
    expect(fs.existsSync('scripts/test-business-flow.ts')).toBe(true);
    expect(qa).toContain('test:business-flow');
    expect(qa).toContain('test:click-all');
  });
});
