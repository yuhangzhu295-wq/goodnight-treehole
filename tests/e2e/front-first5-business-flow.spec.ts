import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('front first5 business flow runner', () => {
  it('keeps the first5 business command and qa chain wired', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    const script = fs.readFileSync('scripts/front-first5-business-flow.ts', 'utf8');
    const qa = fs.readFileSync('scripts/qa-first5.ts', 'utf8');

    expect(pkg.scripts['test:front-first5-business-flow']).toBe('tsx scripts/front-first5-business-flow.ts');
    expect(pkg.scripts['qa:first5']).toBe('tsx scripts/qa-first5.ts');
    expect(script).toContain('/api/v1/moods');
    expect(script).toContain('/api/v1/posts/post_1/replies');
    expect(script).toContain('/api/v1/diaries');
    expect(qa).toContain('diagnose:first5');
    expect(qa).toContain('test:front-first5-real-user');
    expect(qa).toContain('test:front-first5-business-flow');
  });
});
