import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('front rest cross-flow artifacts', () => {
  it('has executable cross-flow script', () => {
    expect(fs.existsSync('scripts/front-rest-cross-flow.ts')).toBe(true);
    expect(fs.readFileSync('scripts/qa-front-rest.ts', 'utf8')).toContain('diagnose:front-rest');
  });
});
