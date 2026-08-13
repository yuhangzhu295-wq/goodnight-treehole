import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('front real interaction manifest', () => {
  it('keeps the front click-all manifest wired to the Playwright runner', () => {
    const manifest = JSON.parse(fs.readFileSync('tests/interaction-manifest.front.json', 'utf8')) as Array<{ selector: string; expectedApi?: string | null }>;
    expect(fs.existsSync('scripts/test-click-all.ts')).toBe(true);
    expect(manifest.some((item) => item.selector === 'btn-submit-mood' && item.expectedApi === 'POST /api/v1/moods')).toBe(true);
    expect(manifest.some((item) => item.selector === 'btn-submit-reply' && item.expectedApi === 'POST /api/v1/posts/:id/replies')).toBe(true);
    expect(manifest.some((item) => item.selector === 'btn-feedback-submit' && item.expectedApi === 'POST /api/v1/feedback')).toBe(true);
  });
});
