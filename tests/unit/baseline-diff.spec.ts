import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  parseBaselineFailures,
  compareFailuresAgainstBaseline,
  compareWithPreviousRun,
  parseScopeFileCount,
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

describe('Previous-run record (compareWithPreviousRun)', () => {
  // The record holds the failure set of the last comparable run so that a test which was passing
  // and broke again stays visible even though it belongs to the original baseline name set.
  let recordPath: string;
  let savedEnv: string | undefined;

  const failure = (file: string, title: string): ActualFailure => ({ file, title });

  function writeRecord(scope: string, failures: ActualFailure[]) {
    fs.writeFileSync(
      recordPath,
      JSON.stringify({
        scope,
        count: failures.length,
        keys: failures.map((f) => `${path.basename(f.file)}::${f.title}`),
        recordedAt: new Date().toISOString(),
      }),
    );
  }

  function readRecord() {
    return JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  }

  beforeEach(() => {
    savedEnv = process.env.BASELINE_LAST_RUN_PATH;
    recordPath = path.join(os.tmpdir(), `baseline-last-run-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    process.env.BASELINE_LAST_RUN_PATH = recordPath;
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env.BASELINE_LAST_RUN_PATH;
    else process.env.BASELINE_LAST_RUN_PATH = savedEnv;
    if (fs.existsSync(recordPath)) fs.unlinkSync(recordPath);
  });

  it('reads the file count back out of a recorded scope string', () => {
    expect(parseScopeFileCount('files:37')).toBe(37);
    expect(parseScopeFileCount('files:1')).toBe(1);
    expect(parseScopeFileCount('files:0')).toBe(-1);
    expect(parseScopeFileCount('not-a-scope')).toBe(-1);
    expect(parseScopeFileCount(null)).toBe(-1);
  });

  it('reports a failure that is new since the last comparable run', () => {
    writeRecord('files:37', [failure('front-me.spec.ts', 'loads profile')]);
    const actual = [failure('front-me.spec.ts', 'loads profile'), failure('front-me.spec.ts', 'brand new breakage')];

    const result = compareWithPreviousRun(actual, 'files:37');

    expect(result.scopeMatches).toBe(true);
    expect(result.newSinceLastRun.map((f) => f.title)).toEqual(['brand new breakage']);
  });

  it('reports nothing new when the same failures recur, so each regression is announced once', () => {
    const same = [failure('front-me.spec.ts', 'loads profile')];
    writeRecord('files:37', same);

    const result = compareWithPreviousRun(same, 'files:37');

    expect(result.scopeMatches).toBe(true);
    expect(result.newSinceLastRun).toEqual([]);
  });

  it('refuses to compare across different run scopes', () => {
    writeRecord('files:37', [failure('front-me.spec.ts', 'loads profile')]);

    const result = compareWithPreviousRun([failure('front-tools.spec.ts', 'runs tools')], 'files:3');

    expect(result.scopeMatches).toBe(false);
    expect(result.newSinceLastRun).toEqual([]);
  });

  it('writes the record on a full run so the next full run can compare against it', () => {
    const actual = [failure('front-me.spec.ts', 'loads profile')];

    compareWithPreviousRun(actual, 'files:37');

    expect(readRecord().scope).toBe('files:37');
    expect(readRecord().count).toBe(1);
  });

  it('does not let a selected-spec run overwrite a full run record', () => {
    writeRecord('files:37', [failure('front-me.spec.ts', 'loads profile')]);

    compareWithPreviousRun([], 'files:1');

    expect(readRecord().scope).toBe('files:37');
    expect(readRecord().count).toBe(1);
  });

  it('lets a full run replace an earlier full run record', () => {
    writeRecord('files:37', [failure('front-me.spec.ts', 'loads profile')]);
    const actual = [failure('front-me.spec.ts', 'loads profile'), failure('front-me.spec.ts', 'new breakage')];

    compareWithPreviousRun(actual, 'files:37');

    expect(readRecord().count).toBe(2);
  });

  it('seeds the record when none exists yet', () => {
    expect(fs.existsSync(recordPath)).toBe(false);

    const result = compareWithPreviousRun([failure('front-me.spec.ts', 'loads profile')], 'files:37');

    expect(result.previousScope).toBeNull();
    expect(result.newSinceLastRun).toEqual([]);
    expect(readRecord().scope).toBe('files:37');
  });

  it('treats an unreadable record as absent rather than as an empty previous run', () => {
    fs.writeFileSync(recordPath, '{ this is not json');

    const result = compareWithPreviousRun([failure('front-me.spec.ts', 'loads profile')], 'files:37');

    expect(result.previousCount).toBeNull();
    expect(result.newSinceLastRun).toEqual([]);
    expect(readRecord().scope).toBe('files:37');
  });
});
