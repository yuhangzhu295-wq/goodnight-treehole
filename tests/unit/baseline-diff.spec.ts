import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseBaselineFailures,
  compareFailuresAgainstBaseline,
  type ActualFailure,
  type BaselineFailureEntry,
} from '../../scripts/check-baseline-failures';

describe('Baseline Failure Diff Comparator', () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const baselineDocPath = path.join(repoRoot, 'docs/architecture/TEST_BASELINE_FAILURES.md');

  it('parses the recorded baseline failures from TEST_BASELINE_FAILURES.md', () => {
    expect(fs.existsSync(baselineDocPath)).toBe(true);
    const content = fs.readFileSync(baselineDocPath, 'utf8');
    const entries = parseBaselineFailures(content);

    // Exactly 12 baseline failures are documented
    expect(entries.length).toBe(12);

    const files = entries.map((e) => e.file);
    expect(files).toContain('front-me.spec.ts');
    expect(files).toContain('front-publish-private.spec.ts');
    expect(files).toContain('front-publish-public.spec.ts');
    expect(files).toContain('front-tools.spec.ts');
    expect(files).toContain('goodnight-2-incremental.spec.ts');
    expect(files).toContain('third-stage-memory-independent.spec.ts');
    expect(files).toContain('third-stage-monthly-report.spec.ts');

    const frontMe = entries.find((e) => e.file === 'front-me.spec.ts');
    expect(frontMe?.title).toBe('loads profile, stats, report, and persists privacy settings');
  });

  it('reports pass when actual failures are a strict subset of known baseline failures', () => {
    const baseline: BaselineFailureEntry[] = [
      { file: 'front-me.spec.ts', title: 'loads profile, stats, report, and persists privacy settings' },
      { file: 'front-tools.spec.ts', title: 'runs decompose and generic tools, then saves a real diary record' },
    ];

    const actual: ActualFailure[] = [
      {
        file: 'tests/business/front-me.spec.ts',
        title: 'loads profile, stats, report, and persists privacy settings',
        fullName: 'Front Me loads profile, stats, report, and persists privacy settings',
      },
    ];

    const diff = compareFailuresAgainstBaseline(actual, baseline);

    expect(diff.isRegression).toBe(false);
    expect(diff.newRegressionsCount).toBe(0);
    expect(diff.knownFailuresCount).toBe(1);
    expect(diff.knownFailures[0].file).toBe('tests/business/front-me.spec.ts');
    expect(diff.unmatchedBaseline.length).toBe(1);
    expect(diff.unmatchedBaseline[0].file).toBe('front-tools.spec.ts');
  });

  it('reports regression when a synthetic new failure is introduced', () => {
    const baseline: BaselineFailureEntry[] = [
      { file: 'front-me.spec.ts', title: 'loads profile, stats, report, and persists privacy settings' },
    ];

    const actualWithRegression: ActualFailure[] = [
      {
        file: 'tests/business/front-me.spec.ts',
        title: 'loads profile, stats, report, and persists privacy settings',
      },
      // Synthetic unexpected regression:
      {
        file: 'tests/business/batch1-journey.spec.ts',
        title: 'concurrent patch lost updates',
        fullName: 'Batch 1 Journey concurrent patch lost updates',
      },
    ];

    const diff = compareFailuresAgainstBaseline(actualWithRegression, baseline);

    expect(diff.isRegression).toBe(true);
    expect(diff.newRegressionsCount).toBe(1);
    expect(diff.newRegressions[0].file).toBe('tests/business/batch1-journey.spec.ts');
    expect(diff.newRegressions[0].title).toBe('concurrent patch lost updates');
    expect(diff.knownFailuresCount).toBe(1);
  });

  it('reports regression when an existing file fails a different, non-baseline test', () => {
    const baseline: BaselineFailureEntry[] = [
      { file: 'front-me.spec.ts', title: 'loads profile, stats, report, and persists privacy settings' },
    ];

    const actualWithDifferentTest: ActualFailure[] = [
      {
        file: 'tests/business/front-me.spec.ts',
        title: 'unexpected brand new test failure in profile',
      },
    ];

    const diff = compareFailuresAgainstBaseline(actualWithDifferentTest, baseline);

    expect(diff.isRegression).toBe(true);
    expect(diff.newRegressionsCount).toBe(1);
    expect(diff.newRegressions[0].title).toBe('unexpected brand new test failure in profile');
  });

  it('reports pass with 0 regressions when all suite tests pass', () => {
    const baseline: BaselineFailureEntry[] = [
      { file: 'front-me.spec.ts', title: 'loads profile, stats, report, and persists privacy settings' },
    ];

    const actualEmpty: ActualFailure[] = [];

    const diff = compareFailuresAgainstBaseline(actualEmpty, baseline);

    expect(diff.isRegression).toBe(false);
    expect(diff.newRegressionsCount).toBe(0);
    expect(diff.knownFailuresCount).toBe(0);
    expect(diff.unmatchedBaseline.length).toBe(1);
  });
});
