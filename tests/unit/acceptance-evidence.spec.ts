import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ACCEPTANCE_RUN_ID, FlowEvidence } from '../acceptance/helpers/evidence';

/**
 * The acceptance evidence helper is the instrument every flow's verdict rests on, so it gets its own
 * self-test. Two properties matter and neither is visible from a passing flow:
 *
 *  - a mismatched step must reach disk as FAIL *and* abort the flow, otherwise a green suite can
 *    carry a failed flow (this actually happened in the first F05 run: an extra diagnostic key in
 *    `actual` made the comparison fail while every `expect` passed);
 *  - a matching step must not throw, or the guard would be noise.
 *
 * The flow id carries a random suffix so a parallel run cannot delete another run's directory.
 */
describe('acceptance evidence helper', () => {
  const suffix = Math.random().toString(36).slice(2, 8);
  const passingId = `SELFTEST-PASS-${suffix}`;
  const failingId = `SELFTEST-FAIL-${suffix}`;
  const root = path.resolve(process.cwd(), 'artifacts/acceptance', ACCEPTANCE_RUN_ID);

  afterAll(() => {
    for (const id of [passingId, failingId]) {
      fs.rmSync(path.join(root, id), { recursive: true, force: true });
    }
  });

  it('writes PASS and returns the file when every step matched', () => {
    const evidence = new FlowEvidence(passingId);
    expect(
      evidence.check({
        step: 'a matching step',
        layer: 'API_EVIDENCE',
        expected: { status: 200, ok: true },
        actual: { ok: true, status: 200 },
      }),
    ).toBe(true);

    const file = evidence.flush();
    const written = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(written.verdict).toBe('PASS');
    expect(written.steps).toHaveLength(1);
  });

  it('writes FAIL and throws when a step did not match', () => {
    const evidence = new FlowEvidence(failingId);
    expect(
      evidence.check({
        step: 'a step with an extra diagnostic key',
        layer: 'DATABASE_EVIDENCE',
        expected: { status: 201, rowStatus: 'published' },
        actual: { status: 201, rowStatus: 'published', score: 0.67 },
      }),
    ).toBe(false);

    let thrown: Error | undefined;
    try {
      evidence.flush();
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown?.message).toContain('1/1 evidence steps FAILED');
    expect(thrown?.message).toContain('a step with an extra diagnostic key');

    // The file is written before the throw so the failure can be inspected after the run.
    const written = JSON.parse(fs.readFileSync(path.join(root, failingId, 'evidence.json'), 'utf8'));
    expect(written.verdict).toBe('FAIL');
    expect(written.steps[0].verdict).toBe('FAIL');
  });
});
