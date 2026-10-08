import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ActualFailure {
  file: string;
  title: string;
  fullName?: string;
}

export interface BaselineFailureEntry {
  file: string;
  title: string;
}

export interface BaselineDiffResult {
  isRegression: boolean;
  previousRunFailureCount?: number | null;
  newSinceLastRun?: ActualFailure[];
  totalActualFailures: number;
  knownFailuresCount: number;
  newRegressionsCount: number;
  knownFailures: ActualFailure[];
  newRegressions: ActualFailure[];
  unmatchedBaseline: BaselineFailureEntry[];
}

export function parseBaselineFailures(markdownContent: string): BaselineFailureEntry[] {
  const headingIdx = markdownContent.indexOf('## The baseline failing set');
  if (headingIdx === -1) {
    throw new Error('Could not find "The baseline failing set" heading in baseline markdown document');
  }

  const afterHeading = markdownContent.slice(headingIdx);
  const firstTick = afterHeading.indexOf('```');
  if (firstTick === -1) {
    throw new Error('Could not find code block start after "The baseline failing set" heading');
  }

  const firstNewline = afterHeading.indexOf('\n', firstTick);
  if (firstNewline === -1) {
    throw new Error('Could not find newline after code block opening ticks');
  }

  const closingTicks = afterHeading.indexOf('```', firstNewline);
  if (closingTicks === -1) {
    throw new Error('Could not find closing code block ticks');
  }

  const codeContent = afterHeading.slice(firstNewline + 1, closingTicks);
  const lines = codeContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const entries: BaselineFailureEntry[] = [];
  for (const line of lines) {
    const fileMatch = /^(\S+\.spec\.ts)\s+(.*)$/.exec(line);
    if (fileMatch) {
      entries.push({
        file: fileMatch[1].trim(),
        title: fileMatch[2].trim(),
      });
    } else {
      const parts = line.split(/\s{2,}/);
      if (parts.length >= 2) {
        entries.push({
          file: parts[0].trim(),
          title: parts.slice(1).join(' ').trim(),
        });
      }
    }
  }

  return entries;
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function matchesBaseline(actual: ActualFailure, baseline: BaselineFailureEntry): boolean {
  const actualFileName = path.basename(actual.file);
  const baselineFileName = path.basename(baseline.file);
  if (actualFileName !== baselineFileName) return false;

  const baseTitleNorm = normalizeTitle(baseline.title);
  const actTitleNorm = normalizeTitle(actual.title);
  const actFullNorm = normalizeTitle(actual.fullName || actual.title);

  if (actTitleNorm === baseTitleNorm) return true;
  if (actFullNorm === baseTitleNorm) return true;
  if (actFullNorm.includes(baseTitleNorm)) return true;
  if (actTitleNorm.includes(baseTitleNorm) || baseTitleNorm.includes(actTitleNorm)) return true;

  return false;
}

export function compareFailuresAgainstBaseline(
  actualFailures: ActualFailure[],
  baselineEntries: BaselineFailureEntry[],
): BaselineDiffResult {
  const knownFailures: ActualFailure[] = [];
  const newRegressions: ActualFailure[] = [];

  for (const actual of actualFailures) {
    const matched = baselineEntries.find((base) => matchesBaseline(actual, base));
    if (matched) {
      knownFailures.push(actual);
    } else {
      newRegressions.push(actual);
    }
  }

  const unmatchedBaseline = baselineEntries.filter(
    (base) => !actualFailures.some((actual) => matchesBaseline(actual, base)),
  );

  return {
    isRegression: newRegressions.length > 0,
    totalActualFailures: actualFailures.length,
    knownFailuresCount: knownFailures.length,
    newRegressionsCount: newRegressions.length,
    knownFailures,
    newRegressions,
    unmatchedBaseline,
  };
}

export function checkBaselineDiff(customReportPath?: string, customBaselinePath?: string): BaselineDiffResult {
  const repoRoot = path.resolve(__dirname, '..');
  const reportPath = customReportPath || path.resolve(repoRoot, 'artifacts', 'runtime', 'suite-report.json');
  const baselinePath =
    customBaselinePath || path.resolve(repoRoot, 'docs', 'architecture', 'TEST_BASELINE_FAILURES.md');

  if (!fs.existsSync(reportPath)) {
    throw new Error(
      `Suite report not found at "${reportPath}". Please run the test suite via "pnpm exec tsx scripts/test-runner.ts" first.`,
    );
  }

  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Baseline failure document not found at "${baselinePath}".`);
  }

  const reportRaw = fs.readFileSync(reportPath, 'utf8');
  const reportData = JSON.parse(reportRaw);

  const actualFailures: ActualFailure[] = Array.isArray(reportData.failures)
    ? reportData.failures.map((f: any) => ({
        file: f.file || f.relPath,
        title: f.title || f.test || 'Unknown test',
        fullName: f.fullName || f.title || f.test,
      }))
    : [];

  const baselineMarkdown = fs.readFileSync(baselinePath, 'utf8');
  const baselineEntries = parseBaselineFailures(baselineMarkdown);

  const result = compareFailuresAgainstBaseline(actualFailures, baselineEntries);
  const { previousCount, newSinceLastRun } = compareWithPreviousRun(actualFailures);

  return {
    ...result,
    previousRunFailureCount: previousCount,
    newSinceLastRun,
    // A failure that was passing in the previous run is a regression whatever the original set says,
    // so the verdict is the union of the two comparisons.
    isRegression: result.isRegression || newSinceLastRun.length > 0,
  };
}

/**
 * Compare this run's failures against the **previous run's** failures.
 *
 * The original-set comparison alone has a blind spot that hid a real regression: the baseline is a
 * *set* of twelve test names from before Batch 1, so a test that had been passing for several batches
 * and then broke again is "known" — the gate reported 0 new regressions while the failure count grew
 * from 8 to 10. Membership in the original set is not evidence that a test is *still* supposed to
 * fail.
 *
 * This records the failing set on disk after each check, so the next run can tell "the same failures
 * as last time" from "a test that was passing last time and is not now". A failure that was passing
 * in the previous run is a regression whatever the original baseline says.
 */
const LAST_RUN_PATH = () => path.resolve(path.resolve(__dirname, '..'), 'artifacts', 'runtime', 'last-run-failures.json');

function failureKey(file: string, title: string): string {
  return `${path.basename(file)}::${normalizeTitle(title)}`;
}

export function compareWithPreviousRun(actualFailures: ActualFailure[]): {
  previousCount: number | null;
  newSinceLastRun: ActualFailure[];
} {
  const lastRunPath = LAST_RUN_PATH();
  let previousKeys: string[] | null = null;
  let previousCount: number | null = null;
  if (fs.existsSync(lastRunPath)) {
    try {
      const previous = JSON.parse(fs.readFileSync(lastRunPath, 'utf8'));
      if (Array.isArray(previous.keys)) previousKeys = previous.keys as string[];
      if (typeof previous.count === 'number') previousCount = previous.count;
    } catch {
      previousKeys = null;
    }
  }

  const currentKeys = actualFailures.map((f) => failureKey(f.file, f.title));
  const newSinceLastRun =
    previousKeys === null
      ? []
      : actualFailures.filter((f) => !previousKeys!.includes(failureKey(f.file, f.title)));

  fs.mkdirSync(path.dirname(lastRunPath), { recursive: true });
  fs.writeFileSync(
    lastRunPath,
    JSON.stringify({ count: actualFailures.length, keys: currentKeys, recordedAt: new Date().toISOString() }, null, 2),
  );

  return { previousCount, newSinceLastRun };
}

// CLI execution entry point
function runCli() {
  const args = process.argv.slice(2);
  let reportPathArg: string | undefined;
  let baselinePathArg: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--report' && args[i + 1]) {
      reportPathArg = args[i + 1];
      i++;
    } else if (args[i] === '--baseline' && args[i + 1]) {
      baselinePathArg = args[i + 1];
      i++;
    }
  }

  try {
    const result = checkBaselineDiff(reportPathArg, baselinePathArg);

    console.log('\n================================================================================');
    console.log('[baseline-diff] MACHINE-CHECKED TEST BASELINE COMPARISON');
    console.log('================================================================================');
    console.log(`Total Failures in Suite Run: ${result.totalActualFailures}`);
    console.log(`Known Baseline Failures:     ${result.knownFailuresCount}`);
    console.log(`New Regressions:             ${result.newRegressionsCount}`);
    console.log(`Previous Run Failures:       ${result.previousRunFailureCount ?? "(no record)"}`);
    console.log(`New Since Previous Run:      ${result.newSinceLastRun?.length ?? 0}`);
    console.log('--------------------------------------------------------------------------------');

    if (result.knownFailures.length > 0) {
      console.log(`\nVerified Known Baseline Failures (${result.knownFailures.length}):`);
      for (const k of result.knownFailures) {
        console.log(`  ✓ [KNOWN] ${k.file} -> ${k.title}`);
      }
    }

    if (result.unmatchedBaseline.length > 0) {
      console.log(`\nBaseline Tests Currently Passing (${result.unmatchedBaseline.length}):`);
      for (const u of result.unmatchedBaseline) {
        console.log(`  + [RESOLVED/PASSING] ${u.file} -> ${u.title}`);
      }
    }

    const newSince = result.newSinceLastRun ?? [];
    if (newSince.length > 0) {
      console.error(`
[baseline-diff] REGRESSION DETECTED: ${newSince.length} test(s) were PASSING in the previous run and are failing now.`);
      for (const reg of newSince) {
        console.error(`  × [REGRESSED SINCE LAST RUN] ${reg.file} -> ${reg.title}`);
      }
      process.exit(1);
    }

    if (result.newRegressions.length > 0) {
      console.log(`\n================================================================================`);
      console.error(`[baseline-diff] REGRESSION DETECTED: ${result.newRegressions.length} NEW FAILURE(S)!`);
      console.log('================================================================================');
      for (const reg of result.newRegressions) {
        console.error(`  × [NEW REGRESSION] ${reg.file} -> ${reg.title}`);
      }
      console.log('================================================================================\n');
      process.exit(1);
    }

    console.log('\n================================================================================');
    console.log('[baseline-diff] SUCCESS: All suite failures belong to the known baseline.');
    console.log('================================================================================\n');
    process.exit(0);
  } catch (err: any) {
    console.error(`[baseline-diff] Execution Error:`, err?.message ?? err);
    process.exit(2);
  }
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedFile === currentFile || invokedFile.endsWith('check-baseline-failures.ts')) {
  runCli();
}
