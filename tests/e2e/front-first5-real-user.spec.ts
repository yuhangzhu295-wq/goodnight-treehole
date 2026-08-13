import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('front first5 real user runner', () => {
  it('keeps the first5 real-user command, contract, and reports wired', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    const contract = JSON.parse(fs.readFileSync('tests/contracts/front-first5-interactions.json', 'utf8')) as Array<{ selector: string }>;

    expect(pkg.scripts['test:front-first5-real-user']).toBe('tsx scripts/front-first5-real-user.ts');
    expect(fs.existsSync('scripts/front-first5-real-user.ts')).toBe(true);
    expect(contract).toHaveLength(64);
    expect(contract.some((item) => item.selector === 'btn-write-mood')).toBe(true);
    expect(contract.some((item) => item.selector === 'btn-letter-poster')).toBe(true);
  });
});
