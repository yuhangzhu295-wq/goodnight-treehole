import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('front overflow diagnosis', () => {
  it('records no blocking horizontal overflow and keeps the base page guard', () => {
    const reportPath = 'artifacts/layout/front-horizontal-overflow.md';
    expect(fs.existsSync(reportPath)).toBe(true);
    const report = fs.readFileSync(reportPath, 'utf8');
    expect(report).toContain('No horizontal overflow over 2px.');

    const theme = fs.readFileSync('apps/mp/src/styles/goodnight-theme.scss', 'utf8');
    expect(theme).toContain('.goodnight-page');
    expect(theme).toContain('overflow-x: hidden');
  });
});
