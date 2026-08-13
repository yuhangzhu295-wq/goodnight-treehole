import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('front phase2 tools artifacts', () => {
  it('has executable real-browser script', () => {
    expect(fs.existsSync('scripts/front-phase2-tools.ts')).toBe(true);
    expect(fs.readFileSync('tests/contracts/front-phase2-phase3-interactions.json', 'utf8')).toContain('tool-decompose');
  });
});
