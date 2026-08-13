import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('real browser front clicks runner', () => {
  it('is wired as a real-DOM browser verification script', () => {
    const script = fs.readFileSync('scripts/real-browser-front-clicks.ts', 'utf8');
    expect(script).toContain('assertNoProxyLayers');
    expect(script).toContain('ensureNoVisibleTestWords');
    expect(script).toContain('getByTestId');
    expect(script).toContain('current-front-square.png');
    expect(script).toContain('current-front-tool.png');
    expect(script).toContain('current-front-me.png');
    expect(script).toContain('real-user-front.md');
    // ToolRun creates an asynchronous AI job; the legacy /tools/run endpoint
    // remains available for API compatibility but is not the front-end action.
    expect(script).toContain('/api/v1/ai/tasks');
  });
});
