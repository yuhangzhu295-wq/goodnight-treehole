import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('clickability contracts', () => {
  it('keeps all documented buttons mapped to real test ids and expected APIs', () => {
    const front = JSON.parse(fs.readFileSync('tests/interaction-manifest.front.json', 'utf8')) as Array<{ selector: string; expectedApi?: string | null }>;
    const admin = JSON.parse(fs.readFileSync('tests/interaction-manifest.admin.json', 'utf8')) as Array<{ selector: string; expectedApi?: string | null }>;
    const selectors = [...front, ...admin].map((item) => item.selector);

    expect(selectors).toContain('btn-submit-mood');
    expect(selectors).toContain('btn-submit-reply');
    expect(selectors).toContain('admin-post-approve');
    expect(selectors).toContain('admin-route-test');
    expect(front.some((item) => item.selector === 'filter-jiaolv' && item.expectedApi === 'GET /api/v1/posts?mood=anxious')).toBe(true);
    expect(admin.some((item) => item.selector === 'admin-ticket-reply' && item.expectedApi === 'POST /api/admin/v1/feedback/tickets/:id/reply')).toBe(true);
  });

  it('does not depend on transparent proxy layers or English debug buttons', () => {
    const source = [
      fs.readFileSync('apps/mp/src/styles.scss', 'utf8'),
      fs.readFileSync('apps/mp/src/App.vue', 'utf8'),
      fs.readFileSync('tests/interaction-manifest.front.json', 'utf8'),
    ].join('\n');

    expect(source).not.toMatch(/transparent\s+hotspot|proxy-button|debug-button/i);
    expect(source).not.toMatch(/Rewrite|Rant|Heal|Sleep|Work|Future|Poster|Clear data|Live backend sync ok/);
  });
});
